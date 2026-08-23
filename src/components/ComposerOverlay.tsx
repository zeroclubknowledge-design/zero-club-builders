import type { ReactNode } from "react";

/**
 * The strip a composer floats in.
 *
 * A composer that sits in a bordered footer takes a fixed slice of the screen
 * and draws a line across it — on a phone that is a permanent bar between the
 * person and the conversation. Floating it over the thread gives the messages
 * the whole screen and lets the composer be what it is: a control resting on
 * top of the content.
 *
 * The problem with floating it is what happens behind. Messages scrolled up
 * past a transparent composer and stayed visible under it, half-legible, all
 * the way off the bottom edge.
 *
 * The fix belongs below the composer, not above it. Content stays completely
 * sharp as it scrolls down towards the composer and passes its top edge — a
 * blur placed above would hide a message while it is still perfectly readable,
 * which is a worse bug than the one being fixed. Only once content carries on
 * past the composer, into the strip it rests on, does it go soft.
 *
 * There is deliberately no border and no solid bar: the pill and the blur
 * under it are the whole effect, which is what makes it read as an overlay
 * rather than a footer.
 */

type ComposerOverlayProps = {
  children: ReactNode;
  /**
   * `fixed` pins it to the viewport, for a page whose scroll container is the
   * page itself. `absolute` keeps it inside the nearest positioned ancestor,
   * which is what a drawer or a panel needs.
   */
  position?: "fixed" | "absolute";
  /** Width constraint for the pill. Matches the reading column above it. */
  maxWidthClassName?: string;
  className?: string;
};

export function ComposerOverlay({
  children,
  position = "fixed",
  maxWidthClassName = "max-w-[760px]",
  className,
}: ComposerOverlayProps) {
  return (
    <div
      className={`${position} inset-x-0 bottom-0 z-50 ${className || ""}`}
      // The strip itself must not swallow taps meant for the message above it;
      // only the pill inside is interactive.
      style={{ pointerEvents: "none" }}
    >
      {/* The composer, sharp and opaque, sitting on top of the strip below. */}
      <div
        className={`relative z-10 mx-auto w-full px-2.5 sm:px-4 ${maxWidthClassName}`}
        style={{ pointerEvents: "auto" }}
      >
        {children}
      </div>

      {/* The blur, underneath the composer rather than above it.
          A message scrolling down stays perfectly readable right up to the top
          edge of the composer — nothing is hidden before its time. It is only
          once it carries on past that edge, into the strip the composer sits
          on, that it goes soft, so the thread never trails off legibly into
          the bottom of the screen. */}
      <div
        aria-hidden
        className="-mt-3 h-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.625rem))] bg-background/85 backdrop-blur-2xl"
      />
    </div>
  );
}
