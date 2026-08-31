import { useEffect } from "react";

/**
 * Content that arrives, rather than being already there.
 *
 * The landing page rendered every section in its final state, so scrolling it
 * felt like moving a window over a poster — nothing responded to being
 * reached. This watches for elements marked `data-reveal` and adds `is-in`
 * the first time each one enters the viewport; the CSS does the rest.
 *
 * Deliberately once-only. A section that re-animates every time it scrolls
 * back into view stops reading as arrival and starts reading as a page that
 * cannot settle.
 *
 * Elements are observed as they appear, not just on mount, because sections
 * further down render their contents after their own data has loaded.
 */
export function useReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced) {
      // Show everything immediately and never observe anything.
      document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-in"));
      return;
    }

    const seen = new WeakSet<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      // A little before the edge, so the movement finishes as the section
      // settles rather than starting once it is already being read.
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
    );

    const observeAll = () => {
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        observer.observe(el);
      });
    };

    observeAll();

    // Sections that render late — anything waiting on a query — still get
    // picked up without each one having to remember to ask.
    const mutations = new MutationObserver(observeAll);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);
}
