import { useEffect, useState } from "react";

/**
 * How many pixels at the bottom of the window are covered by the on-screen
 * keyboard.
 *
 * A `position: fixed; bottom: 0` element is pinned to the bottom of the
 * *layout* viewport, and the keyboard does not change that — it slides over the
 * top. So a toolbar meant to sit above the keyboard ends up underneath it, and
 * `sticky` is no better, since it is measured against the same viewport.
 *
 * VisualViewport describes what is actually on screen. The gap between the
 * bottom of the layout viewport and the bottom of the visual viewport is the
 * keyboard, and offsetting by that amount puts the toolbar exactly on top of it.
 *
 * This is also correct on Android where the browser resizes the layout viewport
 * instead of overlaying: the two viewports agree, the gap is zero, and
 * `bottom: 0` was already right.
 *
 * Returns 0 when there is no keyboard, so it can be used unconditionally.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    if (!viewport) return;

    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      // Read on the next frame: during the keyboard animation the two
      // viewports disagree mid-transition and produce jitter.
      frame = requestAnimationFrame(() => {
        const overlap = window.innerHeight - (viewport.height + viewport.offsetTop);
        // A threshold, because address-bar collapse and rubber-band scrolling
        // both produce small deltas that are not a keyboard.
        setInset(overlap > 80 ? Math.round(overlap) : 0);
      });
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);

    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
