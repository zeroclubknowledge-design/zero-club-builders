import { supabase } from "./supabase";
import { config } from "./config";

const OPT_OUT = `${config.productKey}-sso-off`;
const bridgeOrigin = new URL(config.zeroClubUrl).origin;
const appOrigins = ["https://start.zeroclubs.xyz", "https://zerostart.zeroclubs.xyz"];

export function sharedSignInOff() {
  try { return localStorage.getItem(OPT_OUT) === "1"; } catch { return false; }
}
export function turnSharedSignInOff() {
  try { localStorage.setItem(OPT_OUT, "1"); } catch { /* Storage may be disabled. */ }
}
export function turnSharedSignInOn() {
  try { localStorage.removeItem(OPT_OUT); } catch { /* Storage may be disabled. */ }
}

let running: Promise<boolean> | null = null;

/** Exchange a one-time code from the trusted bridge; never copy refresh tokens. */
export function trySharedSignIn(timeoutMs = 7000): Promise<boolean> {
  if (!appOrigins.includes(window.location.origin) || sharedSignInOff()) return Promise.resolve(false);
  if (running) return running;
  running = new Promise<boolean>((resolve) => {
    const frame = document.createElement("iframe");
    frame.title = "Zero Club sign-in";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";
    let settled = false;
    let exchanging = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      frame.remove();
      resolve(ok);
    };
    const onMessage = async (event: MessageEvent) => {
      if (settled || exchanging || event.origin !== bridgeOrigin || event.source !== frame.contentWindow || event.data?.type !== "zc-sso") return;
      if (event.data.status !== "ok" || typeof event.data.token_hash !== "string" || !event.data.token_hash || sharedSignInOff()) return done(false);
      exchanging = true;
      try {
        const { error } = await supabase.auth.verifyOtp({ token_hash: event.data.token_hash, type: "magiclink" });
        done(!error);
      } catch { done(false); }
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    frame.onerror = () => done(false);
    window.addEventListener("message", onMessage);
    frame.src = `${bridgeOrigin}/sso-bridge.html?origin=${encodeURIComponent(window.location.origin)}`;
    try { document.body.appendChild(frame); } catch { done(false); }
  }).finally(() => { running = null; });
  return running;
}
