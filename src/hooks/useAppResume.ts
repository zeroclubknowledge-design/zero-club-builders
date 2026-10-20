import { useEffect, useRef } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { draftKey, readDraft, writeDraft } from "@/lib/draftStorage";

function resumeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/app") || value.startsWith("//")) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !/^\/app(?:\/|$)/.test(url.pathname)) return null;
    // Reopen the room, leaving camera/microphone access to an explicit Join.
    if (url.pathname.startsWith("/app/live/")) return `/app/clubs/chat?clubId=${encodeURIComponent(url.pathname.split("/").pop() || "")}`;
    if (/\/wallet\/(?:callback|verify|payment)/.test(url.pathname)) return "/app/wallet";
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

/** The Home tab opens the feed at the top (the newest post), not where it was left. */
export function forgetFeedScroll(userId: string | undefined | null) {
  for (const url of ["/app", "/app/"]) writeDraft(draftKey(userId, "screen-scroll", url), 0);
}

/** Installed once in the app shell. Explicit links take priority; launching
 * the app at its home URL resumes the last screen for this signed-in account. */
export function useAppResume(userId: string | undefined) {
  const router = useRouter();
  const location = useLocation();
  const initialPath = useRef(location.pathname);
  const initialized = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const key = draftKey(userId, "last-screen");
    if (initialized.current !== userId) {
      initialized.current = userId;
      // "Return to feed" on the error screen asks for the feed itself. Resuming
      // here would reopen the very screen that just crashed, in a loop.
      let skipResume = false;
      try {
        skipResume = new URLSearchParams(window.location.search).has("fresh") || sessionStorage.getItem("zc:no-resume") === "1";
        sessionStorage.removeItem("zc:no-resume");
      } catch { /* storage unavailable */ }
      if (skipResume) {
        writeDraft(key, "/app");
        if (window.location.search.includes("fresh")) void router.navigate({ to: "/app" as any, replace: true });
        return;
      }
      if (/^\/app\/?$/.test(initialPath.current) && /^\/app\/?$/.test(location.pathname)) {
        const previous = resumeUrl(readDraft(key, ""));
        if (previous && previous !== location.href) {
          void router.navigate({ to: previous as any, replace: true });
          return;
        }
      }
    }
    const url = resumeUrl(location.href);
    if (!url) return;
    writeDraft(key, url);
    const scrollKey = draftKey(userId, "screen-scroll", url);
    const savedY = readDraft(scrollKey, 0);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let restoring = savedY > 0;
    let attempts = 0;
    let latestY = window.scrollY;
    const restore = () => {
      timer = null;
      if (!restoring) return;
      window.scrollTo(0, savedY);
      if (Math.abs(window.scrollY - savedY) < 2 || ++attempts >= 20) restoring = false;
      else timer = setTimeout(restore, 250);
    };
    if (restoring) timer = setTimeout(restore, 100);
    const save = () => {
      if (!restoring) writeDraft(scrollKey, latestY);
    };
    const stopRestoring = () => { restoring = false; };
    const onScroll = () => {
      if (restoring) return;
      latestY = window.scrollY;
      if (timer) return;
      timer = setTimeout(() => { timer = null; save(); }, 250);
    };
    const onHidden = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", stopRestoring, { passive: true });
    window.addEventListener("wheel", stopRestoring, { passive: true });
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      save();
      if (timer) clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", stopRestoring);
      window.removeEventListener("wheel", stopRestoring);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [userId, location.href, router]);
}
