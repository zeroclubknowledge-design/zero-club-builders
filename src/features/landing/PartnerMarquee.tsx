import { useEffect, useState } from "react";

/**
 * The tools row under the hero.
 *
 * Every brand ships as two prepared files — `<name>.png` for the light theme
 * and `<name>-dark.png` for the dark one. The only difference between them is
 * the wordmark; the coloured mark is identical in both, because that part
 * belongs to the brand and should never be repainted. A CSS filter cannot make
 * that distinction: `invert` would turn Claude's coral sunburst cyan.
 *
 * Paths are written out rather than probed. An earlier version tried `.svg`
 * then `.png` then `.webp` then `.jpg` so any file you dropped in would work —
 * useful while the assets were arriving, and pure cost once they had. Every
 * logo is a .png, so that guesswork was twelve 404s on every page load, and on
 * a slow connection a request that is merely slow gets treated as a failure
 * and the real file is skipped. That is why logos went missing on low network.
 */

interface Partner {
  name: string;
  /** Natural size, used to reserve space so nothing shifts as they load. */
  w: number;
  h: number;
}

const PARTNERS: Record<string, Partner> = {
  google: { name: "Google", w: 317, h: 96 },
  claude: { name: "Claude", w: 447, h: 96 },
  paystack: { name: "Paystack", w: 545, h: 96 },
  canva: { name: "Canva", w: 298, h: 96 },
  lovable: { name: "Lovable", w: 562, h: 96 },
  capcut: { name: "CapCut", w: 354, h: 96 },
};

const ORDER = ["google", "claude", "paystack", "canva", "lovable", "capcut"];

/**
 * Whether the dark theme is on, read from the class the pre-paint script sets.
 *
 * Used so only ONE file per logo is requested. Rendering both and hiding one
 * in CSS is simpler, but it makes the browser fetch twelve images to show six
 * — which is exactly the wrong trade on the connection this is meant to fix.
 */
function useIsDark() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

export function PartnerMarquee() {
  const dark = useIsDark();

  const items = ORDER.map((slug) => {
    const p = PARTNERS[slug];
    return {
      slug,
      ...p,
      src: `/partners/${slug}${dark ? "-dark" : ""}.png`,
    };
  });

  return (
    /* Even rhythm: a smaller step down from the line above, a larger one
       between the label and the row it introduces.

       Plain block comment — this sits between `return (` and the root element,
       which is expression position. A braced one here is a second expression. */
    <div className="mt-7 w-full animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.52s_both]">
      <p className="text-center text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#8b8f96] dark:text-white/35">
        Partnering Tools at Zero Club
      </p>

      <div className="zc-marquee-wrap mt-5 overflow-hidden py-1">
        {/*
          The list is rendered twice and the track slides exactly one copy's
          width, so at the end of the cycle it is pixel-identical to the start
          and the loop cannot be seen. The second copy is aria-hidden — a
          screen reader should hear six names, not twelve.
        */}
        <div className="zc-marquee">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1}
              className="flex shrink-0 items-center gap-10 pr-10 sm:gap-14 sm:pr-14"
            >
              {items.map((item) => (
                <li key={item.slug} className="flex shrink-0 items-center">
                  <img
                    src={item.src}
                    alt={item.name}
                    width={item.w}
                    height={item.h}
                    /* Not lazy. These sit in the hero, so deferring them means
                       deferring something already on screen — and on a slow
                       connection lazy loading in a moving track is the other
                       reason logos arrived late or not at all. */
                    decoding="async"
                    className="h-6 w-auto max-w-[122px] object-contain opacity-85 transition-opacity duration-300 hover:opacity-100 sm:h-7 sm:max-w-[138px]"
                  />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
