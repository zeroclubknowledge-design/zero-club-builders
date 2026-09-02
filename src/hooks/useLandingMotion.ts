import { useEffect } from "react";

/**
 * The two behaviours that make the landing page feel responsive rather than
 * merely decorated.
 *
 * Both are written as single delegated listeners on the document rather than
 * per-component handlers. A landing page has dozens of cards; giving each one
 * its own React state and mousemove handler would re-render a component tree
 * on every pixel of pointer movement. These write CSS custom properties
 * instead, so the browser composites the change and React never hears about it.
 */

/**
 * Pointer-following glow.
 *
 * `.zc-glow-card::after` is a radial gradient positioned at var(--mx, --my).
 * This sets those two variables to the pointer's position within whichever
 * card it is over. The effect is that the light appears to come from where the
 * person is pointing, which is the difference between a card that has a glow
 * and a card that responds to you.
 *
 * Skipped entirely on touch devices: there is no hover there, and the listener
 * would fire on every scroll-drag for no visible result.
 */
export function usePointerGlow() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let pending: { card: HTMLElement; x: number; y: number } | null = null;

    const apply = () => {
      frame = 0;
      if (!pending) return;
      const { card, x, y } = pending;
      card.style.setProperty("--mx", `${x}%`);
      card.style.setProperty("--my", `${y}%`);
      pending = null;
    };

    const onMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const card = target?.closest?.(".zc-glow-card") as HTMLElement | null;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      pending = {
        card,
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
      };

      // One write per frame at most. Mousemove fires far faster than the
      // screen refreshes, and every extra write is work thrown away.
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      document.removeEventListener("mousemove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}

/**
 * Scroll-linked drift.
 *
 * Elements marked `data-parallax="0.15"` move at a fraction of the scroll
 * distance while they are on screen, so a section's visual and its text
 * separate slightly as you pass — depth, rather than a flat plane sliding by.
 *
 * The value is written to --py and consumed by `.zc-parallax`. Elements are
 * measured once per scroll frame and only while they are actually visible,
 * because reading getBoundingClientRect for something two screens away is a
 * layout calculation spent on nothing.
 */
export function useParallax() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let elements: HTMLElement[] = [];

    const collect = () => {
      elements = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    };

    const update = () => {
      frame = 0;
      const viewport = window.innerHeight;

      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        // Off screen: leave whatever it had. Writing 0 would snap it.
        if (rect.bottom < -200 || rect.top > viewport + 200) continue;

        const strength = parseFloat(el.dataset.parallax || "0.12");
        // -1 above the fold, 0 centred, +1 below. Centring on the element's
        // own middle keeps the drift symmetrical about the moment you read it.
        const progress = (rect.top + rect.height / 2 - viewport / 2) / viewport;
        el.style.setProperty("--py", `${(progress * strength * -100).toFixed(2)}px`);
      }
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    collect();
    update();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // Sections further down render after their data arrives, so the list has
    // to be rebuilt rather than captured once on mount.
    const mutations = new MutationObserver(() => { collect(); onScroll(); });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      mutations.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}
