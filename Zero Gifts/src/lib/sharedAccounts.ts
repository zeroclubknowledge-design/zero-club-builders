import { config } from "./config";
import { supabase } from "./supabase";
import { turnSharedSignInOn } from "./sso";

export type SharedAccount = { id: string; username: string; full_name: string; avatar_url: string | null };
const bridgeOrigin = new URL(config.zeroClubUrl).origin;
const allowed = ["https://form.zeroclubs.xyz", "https://gifts.zeroclubs.xyz"];

function bridgeRequest(action: "accounts" | "switch", accountId?: string): Promise<any> {
  if (!allowed.includes(window.location.origin)) return Promise.reject(new Error("Open Zero Club in this browser to manage your added accounts."));
  return new Promise((resolve,reject) => {
    const frame = document.createElement("iframe");
    const requestId = crypto.randomUUID();
    frame.title = "Zero Club accounts";
    frame.setAttribute("aria-hidden","true"); frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";
    let settled = false;
    const finish = (error: Error | null, value?: unknown) => {
      if (settled) return; settled = true;
      clearTimeout(timer);window.removeEventListener("message",receive);frame.remove();
      if (error) reject(error); else resolve(value);
    };
    const receive = (event: MessageEvent) => {
      if (settled || event.origin !== bridgeOrigin || event.source !== frame.contentWindow || event.data?.request_id !== requestId || event.data?.type !== (action === "accounts" ? "zc-accounts" : "zc-account-switch")) return;
      if (event.data.status !== "ok") return finish(new Error(event.data.status === "expired" ? "This saved login has expired. Sign in to that account in Zero Club, then try again." : "Open Zero Club and sign in there to access your added accounts."));
      finish(null,event.data);
    };
    const timer = setTimeout(()=>finish(new Error("Could not reach your Zero Club accounts. Open Zero Club and try again.")),20000);
    window.addEventListener("message",receive);
    frame.onerror = ()=>finish(new Error("Could not load your Zero Club accounts."));
    const query = new URLSearchParams({origin:window.location.origin,action,request_id:requestId});
    if (accountId) query.set("account_id",accountId);
    frame.src = `${bridgeOrigin}/sso-bridge.html?${query}`;
    try { document.body.appendChild(frame); } catch { finish(new Error("Could not open account switching.")); }
  });
}

export async function getSharedAccounts(): Promise<SharedAccount[]> {
  const data = await bridgeRequest("accounts");
  if (!Array.isArray(data.accounts)) throw new Error("Update Zero Club to enable account switching.");
  return data.accounts.filter((row: any)=>typeof row?.id === "string").map((row: any)=>({id:row.id,username:String(row.username || ""),full_name:String(row.full_name || ""),avatar_url:typeof row.avatar_url === "string" ? row.avatar_url : null}));
}

export async function switchSharedAccount(accountId: string) {
  const handoff = await bridgeRequest("switch",accountId);
  if (handoff.user_id !== accountId || typeof handoff.token_hash !== "string" || !handoff.token_hash) throw new Error("The selected account could not be verified.");
  const {data,error} = await supabase.auth.verifyOtp({token_hash:handoff.token_hash,type:"magiclink"});
  if (error) throw new Error("Could not sign in to this account. Open Zero Club and try again.");
  if (data.user?.id !== accountId || !data.session) {
    await supabase.auth.signOut({scope:"local"});
    throw new Error("The selected account could not be verified.");
  }
  turnSharedSignInOn();
}
