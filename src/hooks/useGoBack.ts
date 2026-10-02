import { useCallback, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Back means "the page that brought me here" — not "my last step".
 *
 * A plain history.back() undoes one step at a time. Inside one page that is
 * rarely what anyone wants: switching a club room, a tab, a filter or a quiz
 * step all add history entries, so the back arrow walked through those steps
 * instead of leaving the page. Worse, buttons that "returned" to a page by
 * navigating to it pushed a fresh copy, so back from that copy went forward
 * into the screen you had just left (tournament → game → tournament → back →
 * game again).
 *
 * So the app keeps its own map of which page sits at each position in the
 * browser history (TanStack stores that position in history.state, so it
 * survives refreshes). Going back finds the FIRST time the current page
 * appears in the unbroken run behind you and jumps to whatever was before
 * it, skipping every step taken on this page — and any detour that came back
 * to it — in one move. That lands on the exact page, scroll position and all,
 * that you originally came from.
 *
 * When there is nothing of ours behind the page — a link opened cold from
 * WhatsApp, a refresh with no earlier visit — the page's own parent (the
 * fallback each screen passes in) is the answer instead of leaving the app.
 */

const INDEX_KEY = "__TSR_index";
/** Position in the browser history → the page (pathname) shown there. */
const pages: (string | undefined)[] = [];
let currentIndex = -1;

const indexOf = (state: unknown) => {
  const value = (state as Record<string, unknown> | null)?.[INDEX_KEY];
  return typeof value === "number" ? value : -1;
};

/*
 * What counts as "the same page". The path, plus the few search values that
 * name WHICH thing is open — a club, a tournament — so club A → club B is two
 * pages, while switching rooms, tabs or steps inside one club is not.
 */
const IDENTITY_PARAMS = ["clubId", "club", "id", "t"];
function pageKey(pathname: string, searchStr: string) {
  const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
  const identity = IDENTITY_PARAMS.filter((key) => params.get(key)).map((key) => `${key}=${params.get(key)}`).join("&");
  return identity ? `${pathname.replace(/\/$/, "")}?${identity}` : pathname;
}

const samePage = (a: string | undefined, b: string | undefined) => !!a && !!b && a.replace(/\/$/, "") === b.replace(/\/$/, "");

/** Installed once, from the app shell. Safe to call more than once. */
export function trackNavigationDepth(router: ReturnType<typeof useRouter>) {
  if (typeof window === "undefined") return () => {};
  const record = (pathname: string, state: unknown, searchStr: string) => {
    const index = indexOf(state);
    if (index < 0) return;
    pages[index] = pageKey(pathname, searchStr);
    // Anything after this position is a forward branch that no longer exists.
    pages.length = index + 1;
    currentIndex = index;
  };
  record(router.history.location.pathname, router.history.location.state, router.history.location.search);
  return router.subscribe("onResolved", ({ toLocation }) => {
    record(toLocation.pathname, (toLocation as { state?: unknown }).state, (toLocation as { searchStr?: string }).searchStr || "");
  });
}

/** How many steps back the page that brought us here is, or 0 if unknown. */
function stepsToPreviousPage(): number {
  if (currentIndex <= 0) return 0;
  const here = pages[currentIndex];
  // Walk back over every entry that is this same page (room/tab/step changes).
  let i = currentIndex - 1;
  while (i >= 0 && samePage(pages[i], here)) i -= 1;
  if (i < 0 || pages[i] === undefined) return 0;
  // Then: if this page was opened earlier and we wandered off and came back,
  // go to what was before its FIRST appearance in this chain, not the detour.
  let target = i;
  for (let j = i - 1; j >= 0; j -= 1) {
    if (pages[j] === undefined) break;
    if (samePage(pages[j], here)) {
      let k = j - 1;
      while (k >= 0 && samePage(pages[k], here)) k -= 1;
      if (k >= 0 && pages[k] !== undefined) target = k;
      // This page was where the trail began: nothing of ours is behind it,
      // so its parent page is the honest answer rather than the detour.
      else return 0;
    }
  }
  return currentIndex - target;
}

export function useGoBack(fallback: string = "/app") {
  const router = useRouter();

  return useCallback(() => {
    const steps = stepsToPreviousPage();
    if (steps > 0) {
      router.history.go(-steps);
      return;
    }
    // Nothing of ours behind this page: go to its parent, replacing this
    // entry so the system back button does not bounce back into it.
    router.navigate({ href: fallback, replace: true } as never);
  }, [router, fallback]);
}

/**
 * For the app shell: keeps the map fed for the life of the document.
 */
export function useTrackNavigationDepth() {
  const router = useRouter();
  useEffect(() => trackNavigationDepth(router), [router]);
}
