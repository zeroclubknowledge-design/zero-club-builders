// Isolated RTC signaling check: no existing room, microphone or camera is used.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const bridge = await fs.readFile(path.join(projectRoot, 'public/sso-bridge.html'), 'utf8');
const key = bridge.match(/const ANON_KEY = "([^"]+)"/)[1];
const base = bridge.match(/const SUPABASE_URL = "([^"]+)"/)[1];
const channel = `zero-live-audit-${randomUUID()}`;
const productionOrigin = process.argv.includes('--production-origin');
const sdk = await fs.readFile(path.join(projectRoot, 'node_modules/agora-rtc-sdk-ng/AgoraRTC_N-production.js'));
const response = await fetch(`${base}/functions/v1/agora-token`, {
  method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ channelName: channel, uid: 0 }), signal: AbortSignal.timeout(15000),
});
const credentials = await response.json();
if (!response.ok || !credentials.token) throw Error(`Token endpoint failed (${response.status})`);
const html = `<!doctype html><script src="/sdk.js"></script><script>
window.output={events:[],done:false};
(async()=>{
 const client=AgoraRTC.createClient({mode:'rtc',codec:'vp8'});
 AgoraRTC.setLogLevel(4);
 client.on('connection-state-change',(state,previous,reason)=>output.events.push({state,previous,reason}));
 try {
  await Promise.all([client.setRemoteDefaultVideoStreamType(1),client.enableDualStream()]);
  await Promise.race([client.join('bfd9392ddcbc425e8946e8011ac2820b',${JSON.stringify(channel)},${JSON.stringify(credentials.token)},null),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Audit join timed out after 35 seconds')),35000))]);
  output.connected=client.connectionState==='CONNECTED';
 } catch(e) {output.connected=false;output.error={code:e.code,message:String(e.message||e).replace(/00[67][A-Za-z0-9+/=]{50,}/g,'[redacted]').slice(0,700)};}
 finally {try{await client.leave();}catch{} output.done=true;}
})();</script>`;
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', req.url === '/sdk.js' ? 'application/javascript' : 'text/html');
  res.end(req.url === '/sdk.js' ? sdk : html);
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'zc-live-audit-'));
const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(100); }
  }
  if (!port) throw Error('Isolated Chrome did not start');
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl); await once(socket, 'open');
  let id = 0; const pending = new Map();
  const requests = new Map(), network = [], responseChecks = [];
  socket.addEventListener('message', ({data}) => {
    const result = JSON.parse(data);
    if (result.id) { pending.get(result.id)?.(result); pending.delete(result.id); return; }
    const p = result.params;
    if (result.method === 'Network.requestWillBeSent') {
      const url = new URL(p.request.url);
      if (url.hostname !== '127.0.0.1') requests.set(p.requestId, {endpoint:url.origin+url.pathname});
    }
    if (result.method === 'Network.responseReceived' && requests.has(p.requestId)) {
      Object.assign(requests.get(p.requestId), {status:p.response.status});
    }
    if (result.method === 'Network.loadingFailed' && requests.has(p.requestId)) {
      network.push({...requests.get(p.requestId),error:p.errorText});
    }
    if (result.method === 'Network.loadingFinished' && requests.has(p.requestId)) {
      const row = requests.get(p.requestId); network.push(row);
      responseChecks.push(send('Network.getResponseBody', {requestId:p.requestId}).then(result=>{
        try {
          const body = JSON.parse(result.result.body);
          row.responseFields = Object.keys(body);
          row.errors = Object.fromEntries(['code','msg','message','error','flag','reason','err_code','err_msg'].filter(k=>['string','number'].includes(typeof body[k])).map(k=>[k,String(body[k]).replace(/00[67][A-Za-z0-9+/=]{50,}/g,'[redacted]').slice(0,350)]));
          const summarize = (raw, depth = 0) => {
            if (depth > 3) return '[omitted]';
            let value = raw;
            if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return {text:value.replace(/00[67][A-Za-z0-9+/=]{50,}/g,'[redacted]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[address]').slice(0,250)}; } }
            if (!value || typeof value !== 'object') return value;
            if (Array.isArray(value)) return value.slice(0,3).map(v=>summarize(v,depth+1));
            return {fields:Object.keys(value), ...Object.fromEntries(Object.keys(value).filter(k=>/^\d+$/.test(k)||['code','msg','message','error','flag','reason','desc','retry','err_code','err_msg'].includes(k)).map(k=>[k,summarize(value[k],depth+1)]))};
          };
          row.gateway = summarize(body.response_body);
          row.detail = summarize(body.detail);
          if (Array.isArray(body.response_body)) row.gatewayPayloads = body.response_body.map(item=>{
            const data = item.buffer;
            const bytes = typeof data === 'string' ? Buffer.from(data,'base64') : Array.isArray(data) ? Buffer.from(data) : null;
            const ascii = bytes?.toString('latin1').match(/[\x20-\x7e]{5,}/g) || [];
            return {type:typeof data,length:data?.length,errorText:ascii.filter(s=>/error|invalid|expire|denied|disabled|quota|limit|active|fail|token|certificate|vendor|balance|refund|payment/i.test(s)).map(s=>s.replace(/00[67][A-Za-z0-9+/=]{50,}/g,'[redacted]').slice(0,200))};
          });
        } catch {}
      }));
    }
  });
  const send = (method, params) => new Promise(resolve => { const requestId = ++id; pending.set(requestId, resolve); socket.send(JSON.stringify({id:requestId,method,params})); });
  await send('Network.enable', {});
  await send('Page.navigate', {url:productionOrigin ? 'https://www.zeroclubs.xyz/sso-bridge.html' : `http://127.0.0.1:${server.address().port}`});
  if (productionOrigin) {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      const state = await send('Runtime.evaluate', {expression:"location.hostname==='www.zeroclubs.xyz' && document.readyState==='complete'",returnByValue:true});
      if (state.result?.result?.value) { ready = true; break; }
      await pause(250);
    }
    if (!ready) throw Error('Production-origin diagnostic page did not load');
    await send('Runtime.evaluate', {expression:sdk.toString('utf8')});
    await send('Runtime.evaluate', {expression:html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'))});
  }
  for (let i = 0; i < 95; i++) {
    const result = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.output||null)', returnByValue: true });
    const output = JSON.parse(result.result?.result?.value || 'null');
    if (output?.done) { await Promise.allSettled(responseChecks); console.log(JSON.stringify({check:'isolated-agora-join',productionOrigin,...output,network:network.filter(row=>row.endpoint.includes('/webrtc'))},null,2)); break; }
    if (i === 94) throw Error('Audit browser did not finish in time');
    await pause(500);
  }
} finally {
  socket?.close(); chrome.kill(); server.close();
  await pause(1000);
  // Only remove the temporary profile created by this script.
  if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('zc-live-audit-')) {
    await fs.rm(profile, {recursive:true,force:true,maxRetries:3,retryDelay:500}).catch(()=>{});
  }
}
