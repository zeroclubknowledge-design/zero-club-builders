// Read-only check of the public app and its public RPCs. Never prints API keys.
import fs from 'node:fs';

const origin = 'https://gifts.zeroclubs.xyz';
const project = fs.readFileSync(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8').trim();
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
const htmlResponse = await request(origin);
if (!htmlResponse.ok) throw new Error(`Gift app returned HTTP ${htmlResponse.status}`);
const html = await htmlResponse.text();
const entry = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/g)]
  .map(match => new URL(match[1], origin)).find(url => url.origin === origin);
if (!entry) throw new Error('Could not find the public gift app JavaScript entry.');
const asset = await request(entry);
if (!asset.ok) throw new Error(`Gift app asset returned HTTP ${asset.status}`);
const source = await asset.text();
const backend = `https://${project}.supabase.co`;
if (!source.includes(backend)) throw new Error('The public gift app does not reference the linked Supabase project.');
let publicKey = source.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
if (!publicKey) {
  publicKey = [...source.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)]
    .map(match => match[0]).find(token => {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return payload.role === 'anon' && payload.ref === project;
      } catch { return false; }
    });
}
if (!publicKey) throw new Error('Could not identify the app’s public Supabase key.');
console.log('Shared Supabase project: verified');
console.log('Frontend uses new campaign Browse:', source.includes('browse_zero_gift_campaigns'));
for (const name of ['browse_gift_cards', 'browse_zero_gift_campaigns']) {
  const response = await request(`${backend}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_service: null, p_search: null, p_limit: 100 }),
  });
  const payload = await response.json();
  console.log(name, response.ok
    ? { status: response.status, openCampaigns: Array.isArray(payload) ? payload.length : 'unexpected response shape' }
    : { status: response.status, code: payload.code, message: payload.message });
}
