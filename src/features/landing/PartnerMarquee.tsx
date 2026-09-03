import { useCallback, useEffect, useState } from "react";

/**
 * The tools row under the hero.
 *
 * Each brand ships as two prepared files: `<name>.png` for the light theme and
 * `<name>-dark.png` for the dark one. The difference between them is only the
 * wordmark — the coloured mark is byte-identical in both, because that is the
 * part that belongs to the brand and should never be repainted.
 *
 * This is done with two files rather than a CSS filter on purpose. A filter
 * cannot tell a logo's symbol from its lettering: `invert` would turn Claude's
 * coral sunburst cyan, and `grayscale` would throw away the thing that makes
 * these marks recognisable. Deciding per pixel — is this ink, or is this
 * colour — can only happen when the asset is made.
 *
 * A missing file falls back to the next extension, then to the light file,
 * then to a plain wordmark, so the row is never broken while assets change.
 */

interface Partner {
  /** Shown when no file is found, and used as the accessible name either way. */
  name: string;
  /** The filename stem in /public/partners. Any supported extension works. */
  file: string;
}

/**
 * Extensions tried in order, so the file you happen to have is the file that
 * works. SVG first because it stays sharp at any size and is usually the
 * smallest, then the raster formats.
 */
const EXTENSIONS = ["svg", "png", "webp", "jpg"] as const;

const PARTNERS: Partner[] = [
  { name: "Google", file: "google" },
  { name: "Claude", file: "claude" },
  { name: "Paystack", file: "paystack" },
  { name: "Canva", file: "canva" },
  { name: "Lovable", file: "lovable" },
  { name: "CapCut", file: "capcut" },
];

/**
 * One logo, in whichever form is available.
 *
 * `variant` is "" for the light-theme file and "-dark" for the light-text
 * version used on the dark theme. Both walk the extension list independently,
 * and the dark one falls back to the light file if no dark version exists —
 * so a brand whose lockup has no text (a plain coloured mark) needs only one
 * file and still works in both themes.
 */
function LogoImage({
  partner,
  variant,
  className,
  onExhausted,
}: {
  partner: Partner;
  variant: "" | "-dark";
  className: string;
  onExhausted: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  // After the variant's own extensions run out, try the plain file, then give
  // up so the wordmark can take over.
  const candidates = [
    ...EXTENSIONS.map((ext) => `/partners/${partner.file}${variant}.${ext}`),
    ...(variant ? EXTENSIONS.map((ext) => `/partners/${partner.file}.${ext}`) : []),
  ];

  /*
   * Reported here rather than caught on an ancestor. An error event fires for
   * every extension that is missing, so a parent listening for errors would
   * conclude the logo had failed the moment the .svg 404'd — even when the
   * .png right behind it loads perfectly. Only running out of candidates means
   * failure.
   */
  useEffect(() => {
    if (attempt >= candidates.length) onExhausted();
  }, [attempt, candidates.length, onExhausted]);

  if (attempt >= candidates.length) return null;

  return (
    <img
      key={candidates[attempt]}
      src={candidates[attempt]}
      alt={partner.name}
      loading="lazy"
      decoding="async"
      onError={() => setAttempt((n) => n + 1)}
      className={className}
    />
  );
}

function PartnerItem({ partner }: { partner: Partner }) {
  /*
   * The wordmark is the floor, not the plan. It shows only when no image of
   * any kind resolves, and is hidden the moment one does — tracked here rather
   * than guessed, because a missing file is the normal state until every asset
   * is in and a broken-image icon in a logo strip looks worse than a name.
   */
  const [lightFailed, setLightFailed] = useState(false);
  const [darkFailed, setDarkFailed] = useState(false);

  // Stable identities, so the effect inside LogoImage does not re-run on every
  // parent render and re-report an exhaustion it has already reported.
  const onLightExhausted = useCallback(() => setLightFailed(true), []);
  const onDarkExhausted = useCallback(() => setDarkFailed(true), []);

  /*
    Uniform height, natural width — logos have wildly different aspect ratios,
    and forcing a box on them is what makes a strip look cheap. The max-width
    is what keeps a long lockup like Lovable from dwarfing a compact one like
    Paystack: past that width it scales down instead of running away.
  */
  const imgClass =
    "h-6 w-auto max-w-[122px] object-contain opacity-85 transition-opacity duration-300 hover:opacity-100 sm:h-7 sm:max-w-[138px]";

  return (
    <li className="flex shrink-0 items-center">
      {/* One file per theme, swapped in CSS rather than in JS, so the right one
          is correct on the very first paint and nothing has to know the theme. */}
      <span className="dark:hidden">
        <LogoImage
          partner={partner}
          variant=""
          className={imgClass}
          onExhausted={onLightExhausted}
        />
      </span>
      <span className="hidden dark:block">
        <LogoImage
          partner={partner}
          variant="-dark"
          className={imgClass}
          onExhausted={onDarkExhausted}
        />
      </span>

      {lightFailed && darkFailed && (
        <span className="whitespace-nowrap font-display text-[17px] font-semibold tracking-tight text-[#171717]/45 transition-colors duration-300 hover:text-[#171717]/80 dark:text-white/40 dark:hover:text-white/75 sm:text-[20px]">
          {partner.name}
        </span>
      )}
    </li>
  );
}

export function PartnerMarquee() {
  return (
    /* Even rhythm.
       A smaller step down from the line above, a larger one between the label
       and the row it introduces.

       Plain block comment: this is expression position, between `return (` and
       the root element. A braced one here is a second expression. */
    <div className="mt-7 w-full animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.52s_both]">
      <p className="text-center text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#8b8f96] dark:text-white/35">
        Built with the tools you already use
      </p>

      <div className="zc-marquee-wrap mt-5 overflow-hidden py-1">
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
              className="flex shrink-0 items-center gap-10 pr-10 sm:gap-14 sm:pr-14"
            >
              {PARTNERS.map((partner) => (
                <PartnerItem key={partner.name} partner={partner} />
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
