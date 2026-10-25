import { supabase } from "./supabase";
import { config } from "./config";

/**
 * Signed in to Zero Club = signed in here.
 *
 * With no session, this app opens www.zeroclubs.xyz/sso-bridge.html in a
 * hidden iframe. The bridge sees the Zero Club sign-in in this browser and
 * sends back a one-time sign-in code (never a password or refresh token),
 * which becomes this app's own session via verifyOtp. Signing out here turns
 * it off until you sign in here again, so it doesn't sign you straight back in.
 */
const OPT_OUT = `${config.productKey}-sso-off`;
const bridgeOrigin = (() => { try { return new URL(config.zeroClubUrl).origin; } catch { return ""; } })();

export function sharedSignInAvailable() {
  if (typeof window === "undefined" || !bridgeOrigin) return false;
  const host = window.location.hostname;
  return window.location.protocol === "https:" && host.endsWith(".zeroclubs.xyz") && host !== new URL(bridgeOrigin).hostname;
}

export function sharedSignInOff() {
  try { return localStorage.getItem(OPT_OUT) === "1"; } catch { return false; }
}
export function turnSharedSignInOff() { try { localStorage.setItem(OPT_OUT, "1"); } catch { /* blocked */ } }
export function turnSharedSignInOn() { try { localStorage.removeItem(OPT_OUT); } catch { /* blocked */ } }

let running: Promise<boolean> | null = null;

/** Resolves true if this app is now signed in with the Zero Club account. */
export function trySharedSignIn(timeoutMs = 7000): Promise<boolean> {
  if (!sharedSignInAvailable() || sharedSignInOff()) return Promise.resolve(false);
  if (running) return running;
  running = new Promise<boolean>((resolve) => {
    const frame = document.createElement("iframe");
    frame.title = "Zero Club sign-in";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      frame.remove();
      running = null;
      resolve(ok);
    };
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== bridgeOrigin || event.source !== frame.contentWindow || event.data?.type !== "zc-sso") return;
      if (event.data.status !== "ok" || !event.data.token_hash) return done(false);
      const { error } = await supabase.auth.verifyOtp({ token_hash: String(event.data.token_hash), type: "magiclink" });
      done(!error);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    window.addEventListener("message", onMessage);
    frame.src = `${bridgeOrigin}/sso-bridge.html?origin=${encodeURIComponent(window.location.origin)}`;
    document.body.appendChild(frame);
  });
  return running;
}
