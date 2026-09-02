/**
 * The tools row under the hero.
 *
 * Rendered as wordmarks in the site's own display face rather than as logo
 * images, because the logo files for these companies are not in the project
 * and their marks are theirs — a hand-drawn approximation of someone else's
 * logo is worse than no logo. Drop real files into /public/partners and swap
 * `label` for an `src` here when you have them; the layout does not change.
 *
 * Paystack is the one mark that does exist in /public/partners, but a row of
 * five wordmarks and one image reads as broken, so it is set the same way as
 * the rest until the others arrive.
 */

const PARTNERS = [
  "Google",
  "Claude",
  "Paystack",
  "Canva",
  "Lovable AI",
  "CapCut",
];

export function PartnerMarquee() {
  return (
    <div className="mt-8 w-full animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.52s_both]">
      <p className="text-center text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#8b8f96] dark:text-white/35">
        Built with the tools you already use
      </p>

      <div className="zc-marquee-wrap mt-3.5 overflow-hidden">
        {/*
          The list is rendered twice. The track slides exactly one copy's width,
          so at the end of the cycle it is pixel-identical to the start and the
          loop cannot be seen. The second copy is aria-hidden — a screen reader
          should hear six names, not twelve.
        */}
        <div className="zc-marquee">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1}
              className="flex shrink-0 items-center gap-8 pr-8 sm:gap-12 sm:pr-12"
            >
              {PARTNERS.map((name) => (
                <li
                  key={name}
                  className="whitespace-nowrap font-display text-[17px] font-semibold tracking-tight text-[#171717]/45 transition-colors duration-300 hover:text-[#171717]/80 dark:text-white/40 dark:hover:text-white/75 sm:text-[20px]"
                >
                  {name}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
