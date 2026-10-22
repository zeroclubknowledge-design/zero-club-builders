import { useId, type CSSProperties } from "react";

/**
 * The Zero Club mark as a vector: eight blocks in a ring (outer outline minus
 * the star-shaped centre). Traced from /logo.png and made exactly symmetric,
 * on a 100×100 box centred at 50,50.
 */
export const ZERO_MARK_PATH =
  "M41.02 1.32 L21.91 9.27 L30.27 30.27 L9.27 21.91 L1.32 41.02 L22.07 50.00 L1.32 58.98 L9.27 78.09 L30.27 69.72 L21.91 90.72 L41.02 98.68 L50.00 77.92 L58.98 98.68 L78.09 90.72 L69.72 69.72 L90.72 78.09 L98.68 58.98 L77.92 50.00 L98.68 41.02 L90.72 21.91 L69.72 30.27 L78.09 9.27 L58.98 1.32 L50.00 22.07Z M43.81 16.82 L50.00 30.82 L56.19 16.82 L69.16 22.21 L63.54 36.46 L77.79 30.84 L83.18 43.81 L69.17 50.00 L83.18 56.19 L77.79 69.16 L63.54 63.54 L69.16 77.79 L56.19 83.18 L50.00 69.17 L43.81 83.18 L30.84 77.79 L36.46 63.54 L22.21 69.16 L16.82 56.19 L30.82 50.00 L16.82 43.81 L22.21 30.84 L36.46 36.46 L30.84 22.21Z";

const WEDGES = Array.from({ length: 8 }, (_, i) => {
  const a0 = ((-90 + 45 * i) * Math.PI) / 180;
  const a1 = ((-45 + 45 * i) * Math.PI) / 180;
  const r = 80;
  const p = (a: number) => `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  return `50,50 ${p(a0)} ${p(a1)}`;
});

/** The Zero Club mark, still. */
export function ZeroMark({ size = 24, className = "", style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <path d={ZERO_MARK_PATH} fillRule="evenodd" fill="currentColor" />
    </svg>
  );
}

/**
 * The app's loading indicator: the Zero Club mark with its eight blocks
 * lighting up one after another, clockwise, each fading as the next takes
 * over — like a comet running round the ring.
 */
export function ZeroLoader({
  size = 44,
  label,
  className = "",
  tone = "brand",
}: {
  size?: number;
  /** Optional line under the mark, e.g. "Preparing your classroom". */
  label?: string;
  className?: string;
  /** brand = Zero pink; current = inherits the text colour (for dark or coloured surfaces). */
  tone?: "brand" | "current";
}) {
  const id = `zl${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div role="status" aria-live="polite" className={`inline-flex flex-col items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="zc-loader"
        style={{ color: tone === "brand" ? "#cc208f" : "currentColor" }}
        aria-hidden="true"
      >
        <defs>
          {WEDGES.map((points, i) => (
            <clipPath key={i} id={`${id}-${i}`}>
              <polygon points={points} />
            </clipPath>
          ))}
        </defs>
        {WEDGES.map((_, i) => (
          <path
            key={i}
            d={ZERO_MARK_PATH}
            fillRule="evenodd"
            fill="currentColor"
            clipPath={`url(#${id}-${i})`}
            className="zc-loader-seg"
            style={{ animationDelay: `${(-(8 - i) * 0.12).toFixed(2)}s` }}
          />
        ))}
      </svg>
      {label ? <span className="text-[13px] font-medium text-muted-foreground">{label}</span> : <span className="sr-only">Loading</span>}
    </div>
  );
}

/** A full-screen centred loader for pages that are still getting ready. */
export function ZeroPageLoader({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex min-h-[60vh] w-full flex-1 items-center justify-center ${className}`}>
      <ZeroLoader label={label} />
    </div>
  );
}
