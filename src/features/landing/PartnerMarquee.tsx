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

/*
 * Both versions of each logo are in the page from the first paint, and the
 * theme class shows one. Picking the file in JavaScript meant the server sent
 * the light logos, then the page noticed dark mode after loading and swapped
 * every src, so in dark mode the row appeared late. The files are small
 * (15-25 KB each), so showing the right one immediately is worth it.
 */
export function PartnerMarquee() {
  const items = ORDER.map((slug) => ({ slug, ...PARTNERS[slug] }));

  return (
    /* Even rhythm: a smaller step down from the line above, a larger one
       between the label and the row it introduces.

       Plain block comment — this sits between `return (` and the root element,
       which is expression position. A braced one here is a second expression. */
    <div className="w-full">
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
                  {(["", "-dark"] as const).map((variant) => (
                  <img
                    key={variant || "light"}
                    src={`/partners/${item.slug}${variant}.png`}
                    alt={variant ? "" : item.name}
                    width={item.w}
                    height={item.h}
                    fetchPriority={copy === 0 ? "high" : "auto"}
                    /* Not lazy. These sit in the hero, so deferring them means
                       deferring something already on screen — and on a slow
                       connection lazy loading in a moving track is the other
                       reason logos arrived late or not at all. */
                    decoding="async"
                    className={`h-6 w-auto max-w-[122px] object-contain opacity-85 transition-opacity duration-300 hover:opacity-100 sm:h-7 sm:max-w-[138px] ${variant ? "hidden dark:block" : "dark:hidden"}`}
                  />
                  ))}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
