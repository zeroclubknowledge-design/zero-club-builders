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
 * the way off the bottom edge. So the strip is opaque enough to stop them:
 *
 *   - `blurClassName` covers the full width from the top of the pill down past
 *     the safe area, blurring and tinting whatever passes behind it.
 *   - a short gradient sits above that, so content fades out as it arrives
 *     instead of meeting a hard horizontal line.
 *
 * There is deliberately no border and no solid bar. The edge of the effect is
 * the fade itself, which is what makes it read as an overlay rather than a
 * footer.
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
      {/* The fade. Tall enough to be a transition rather than a smudge, and it
          ends on the same 90% the strip below starts at, so the two meet
          without a seam. */}
      <div
        aria-hidden
        className="h-10 bg-gradient-to-t from-background/90 via-background/70 to-transparent backdrop-blur-sm"
      />

      {/* The blur. Content that reaches this is no longer readable, which is
          the whole point — it stops the thread trailing off under the pill. */}
      <div className="bg-background/90 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-2xl">
        <div
          className={`mx-auto w-full px-2.5 sm:px-4 ${maxWidthClassName}`}
          style={{ pointerEvents: "auto" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
