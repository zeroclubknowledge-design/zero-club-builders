import { useCallback, useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Back, meaning back — not "back to the feed".
 *
 * Every back button in the app navigated to a fixed destination, usually /app.
 * So opening a project from ZeroHub and pressing back landed you on the feed,
 * having lost your place in the list you were reading. The button was named
 * after an arrow and behaved like a home link.
 *
 * The fix has to know whether there is anywhere to go back to. `history.length`
 * cannot answer that — it counts the whole tab, including the pages visited
 * before Zero Club was opened, and going back into those means leaving the app
 * entirely. So the app counts its own navigations instead: if we have moved at
 * least once since this document loaded, `history.back()` lands somewhere we
 * came from. If we have not — a link opened cold from WhatsApp, a refresh on a
 * detail page — there is genuinely nowhere behind us, and the fallback is the
 * right answer rather than a guess.
 */

let internalNavigations = 0;

/** Installed once, from the app shell. Safe to call more than once. */
export function trackNavigationDepth(router: ReturnType<typeof useRouter>) {
  if (typeof window === "undefined") return () => {};
  return router.subscribe("onResolved", ({ fromLocation, toLocation }) => {
    // A replace or a redirect to the same place is not somewhere to go back to.
    if (fromLocation?.href && fromLocation.href !== toLocation.href) {
      internalNavigations += 1;
    }
  });
}

export function useGoBack(fallback: string = "/app") {
  const router = useRouter();

  return useCallback(() => {
    if (internalNavigations > 0) {
      internalNavigations -= 1;
      router.history.back();
      return;
    }
    router.navigate({ to: fallback });
  }, [router, fallback]);
}

/**
 * For the app shell: keeps the counter fed for the life of the document.
 */
export function useTrackNavigationDepth() {
  const router = useRouter();
  useEffect(() => trackNavigationDepth(router), [router]);
}
