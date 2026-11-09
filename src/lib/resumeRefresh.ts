import type { QueryClient } from "@tanstack/react-query";

/** Refresh stale, visible data without clearing it or navigating the page. */
export function installResumeRefresh(client: QueryClient) {
  let busy = false;
  let lastRefresh = -Infinity;
  const refresh = () => {
    if (document.hidden || !navigator.onLine || busy || Date.now() - lastRefresh < 30_000) return;
    busy = true;
    lastRefresh = Date.now();
    void client.refetchQueries({ type: "active", stale: true }).catch(() => undefined).finally(() => { busy = false; });
  };
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("online", refresh);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("online", refresh);
    window.removeEventListener("pageshow", onPageShow);
  };
}
