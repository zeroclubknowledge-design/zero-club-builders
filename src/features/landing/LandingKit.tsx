import type { CSSProperties, ReactNode } from "react";

/**
 * The pieces every landing section is built from.
 *
 * These exist so the page has one definition of what a section heading looks
 * like, one definition of a card, one definition of a bloom. Before this, each
 * section carried its own copy of the same twelve Tailwind classes, which is
 * how a page ends up with four slightly different cards nobody meant to design.
 */

/**
 * The chip above a section heading.
 *
 * Named for the section, not the content — "Why Us?", "Process", "Pricing". It
 * lets someone scrolling fast know what they are passing without reading the
 * headline, which is most of what makes the reference page navigable.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="zc-eyebrow">{children}</span>;
}

/**
 * A section's heading block: eyebrow, title, and an optional line under it.
 *
 * Centred by default because that is the reference's rhythm — every section
 * announces itself the same way, and the variation comes from what sits below.
 */
export function SectionHead({
  eyebrow,
  title,
  body,
  align = "center",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  const centred = align === "center";
  return (
    <div
      data-reveal
      className={`${centred ? "mx-auto max-w-[680px] text-center" : "max-w-[620px]"} ${className}`}
    >
      {eyebrow && (
        <div className={centred ? "flex justify-center" : ""}>
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
      )}
      <h2 className="mt-4 font-display text-[clamp(26px,4.2vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em] text-[#171717] dark:text-white">
        {title}
      </h2>
      {body && (
        <p
          className={`mt-3 text-[14px] leading-6 text-[#5c6068] dark:text-white/55 ${
            centred ? "mx-auto max-w-[560px]" : ""
          }`}
        >
          {body}
        </p>
      )}
    </div>
  );
}

/**
 * The card.
 *
 * `zc-glow-card` supplies the lit edge and the pointer bloom; everything here
 * is layout. `featured` is for the one card in a row that is the point — the
 * middle tier, the recommended plan — and should be used at most once per row
 * or it stops meaning anything.
 */
export function GlowCard({
  children,
  className = "",
  featured = false,
  reveal = true,
  delay,
}: {
  children: ReactNode;
  className?: string;
  featured?: boolean;
  reveal?: boolean;
  delay?: number;
}) {
  // Fill and radius are utilities rather than CSS, so they compose with
  // anything a caller passes instead of racing it in the cascade.
  return (
    <div
      {...(reveal ? { "data-reveal": "" } : {})}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
      className={`zc-glow-card ${featured ? "is-featured" : ""} overflow-hidden rounded-[20px] bg-white dark:bg-[#141118] ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A wash of brand light behind a section.
 *
 * Position and size are the caller's business — a bloom is only ever right in
 * relation to what it is lighting — but the colour and blur live in CSS so
 * every one of them agrees.
 */
export function Bloom({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`zc-bloom ${className}`} />;
}

/** The cone of light falling from the top edge of a band. */
export function Spotlight() {
  return <div aria-hidden className="zc-spotlight" />;
}

/** A hairline that fades at both ends, for the seam between two sections. */
export function Seam({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`zc-seam ${className}`} />;
}
