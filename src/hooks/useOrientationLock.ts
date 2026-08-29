import { useEffect } from "react";

/**
 * Portrait everywhere, except where landscape is the point.
 *
 * The manifest used to pin the installed app to portrait, which is a hard lock
 * the page cannot override — so turning the phone sideways during a live class
 * did nothing at all for anyone who had installed Zero Club, while working
 * normally for anyone still in a browser tab. That is the "works for some
 * users" in the report.
 *
 * The manifest now allows rotation, which moves the decision here: the app
 * shell asks for portrait, and the live room releases it. That keeps every
 * ordinary screen behaving as designed — the layout is built for one column —
 * while letting a class fill the screen the way video should.
 *
 * Everything is wrapped, because the Screen Orientation API is unevenly
 * supported and *throws* rather than resolving false on desktop Safari and in
 * some in-app browsers. A failed lock is not worth an error; it just means the
 * device decides, which was the old behaviour anyway.
 */

type Orientation = "portrait" | "landscape" | "free";

function apply(mode: Orientation) {
  if (typeof window === "undefined") return;
  const orientation = (window.screen as any)?.orientation;
  if (!orientation) return;

  try {
    if (mode === "free") {
      orientation.unlock?.();
      return;
    }
    // Returns a promise on the browsers that have it; the catch covers both
    // a rejection and a synchronous throw.
    const result = orientation.lock?.(mode === "portrait" ? "portrait" : "landscape");
    if (result && typeof result.catch === "function") result.catch(() => undefined);
  } catch {
    /* Unsupported, or refused because the page is not fullscreen. */
  }
}

export function useOrientationLock(mode: Orientation) {
  useEffect(() => {
    apply(mode);
    // Deliberately no cleanup that re-locks: whichever component mounts next
    // sets what it needs, and a cleanup racing the next mount is how you end
    // up briefly locked to the wrong thing mid-navigation.
  }, [mode]);
}
