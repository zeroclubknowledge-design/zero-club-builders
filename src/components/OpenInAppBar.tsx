import { useEffect, useState } from "react";
import { ZERO_MARK_PATH } from "@/components/ZeroLoader";

/**
 * "Open in the Zero Club app" for people who already have the Android app.
 *
 * The app already claims every www.zeroclubs.xyz link (the TWA's verified App
 * Link plus /.well-known/assetlinks.json). That covers links tapped in most
 * apps, but not LinkedIn and similar apps: they open links inside their own
 * built-in browser, which never hands a link to another app. So on Android,
 * outside the app, this bar offers a one-tap jump into the app at the same
 * page. In Chrome, when the browser confirms the app is installed, it makes
 * the jump straight away. If the app isn't installed, the same page simply
 * stays open here, and the usual install option still applies.
 */

const PACKAGE = "xyz.zeroclubs.app";
const DISMISSED_KEY = "zc-open-in-app-dismissed";
const TRIED_KEY = "zc-open-in-app-tried";

/** The app itself: a Trusted Web Activity, or the installed web app. */
function insideTheApp() {
  return (
    document.referrer.startsWith(`android-app://${PACKAGE}`) ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches
  );
}

/** LinkedIn, Facebook, Instagram, X and similar in-app browsers, and plain WebViews. */
function inAnInAppBrowser(ua: string) {
  return /LinkedInApp|FBAN|FBAV|Instagram|Twitter|Line\/|Snapchat|; wv\)/i.test(ua);
}

export function appIntentUrl(href: string = window.location.href) {
  const url = new URL(href);
  url.searchParams.delete("zc_web");
  const fallback = new URL(url.toString());
  fallback.searchParams.set("zc_web", "1");
  return (
    `intent://${url.host}${url.pathname}${url.search}${url.hash}` +
    `#Intent;scheme=https;package=${PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(fallback.toString())};end`
  );
}

type RelatedApp = { platform: string; id?: string };

export function OpenInAppBar() {
  const [mode, setMode] = useState<"hidden" | "installed" | "maybe">("hidden");

  useEffect(() => {
    const ua = navigator.userAgent;
    if (!/Android/i.test(ua) || insideTheApp()) return;
    // Coming back from a failed jump (app not installed): stay on the web.
    if (new URL(window.location.href).searchParams.get("zc_web") === "1") return;
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      /* storage blocked: show the bar */
    }
    if (dismissed) return;

    // In-app browsers can't tell us whether the app is installed. Offer it.
    if (inAnInAppBrowser(ua)) {
      setMode("maybe");
      return;
    }

    // Chrome can: it checks the app the web manifest lists as related.
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<RelatedApp[]> };
    if (typeof nav.getInstalledRelatedApps !== "function") return;
    nav
      .getInstalledRelatedApps()
      .then((apps) => {
        if (!apps.some((app) => app.id === PACKAGE)) return;
        setMode("installed");
        // Jump straight in, once per visit. Chrome may ask for a tap first;
        // the bar stays as the fallback either way.
        let tried = false;
        try {
          tried = sessionStorage.getItem(TRIED_KEY) === "1";
          sessionStorage.setItem(TRIED_KEY, "1");
        } catch {
          /* fine */
        }
        if (!tried) window.location.href = appIntentUrl();
      })
      .catch(() => {});
  }, []);

  if (mode === "hidden") return null;

  const dismiss = () => {
    setMode("hidden");
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* fine */
    }
  };

  return (
    <div
      role="region"
      aria-label="Open in the Zero Club app"
      className="fixed inset-x-0 top-0 z-[120] flex items-center gap-3 border-b border-white/10 bg-[#141014]/95 px-3 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] text-white shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)] backdrop-blur-md"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#cc208f]">
        <svg viewBox="0 0 100 100" className="h-5 w-5 text-white" aria-hidden="true">
          <path d={ZERO_MARK_PATH} fillRule="evenodd" fill="currentColor" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[14px] font-semibold">Zero Club</span>
        <span className="block truncate text-[12px] text-white/65">
          {mode === "installed" ? "Continue in the app" : "Have the app? Open this there"}
        </span>
      </span>
      <a
        href={appIntentUrl()}
        onClick={dismiss}
        className="flex h-9 shrink-0 items-center rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#141014] active:scale-95"
      >
        Open app
      </a>
      <button type="button" onClick={dismiss} aria-label="Stay in the browser" className="grid h-9 w-8 shrink-0 place-items-center text-[20px] leading-none text-white/60">
        ×
      </button>
    </div>
  );
}
