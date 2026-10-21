import type { ReactNode } from "react";

/**
 * A button slot in a message/comment box that folds away when not needed.
 *
 * Every Zero Club composer follows one rule: while empty it shows its tools
 * (options, voice note); once there is something to send, the tools fold
 * away and only Send shows, so the text gets the room. The slot collapses
 * its width instead of unmounting, so hidden file inputs and an open menu
 * inside it stay alive, and the change glides rather than jumps.
 */
export function ComposerSlot({ show, children, className = "" }: { show: boolean; children: ReactNode; className?: string }) {
  // Clipped only while folded, so an open slot never cuts its button's shadow.
  return (
    <div
      aria-hidden={!show}
      inert={!show ? true : undefined}
      className={`flex shrink-0 items-center transition-[max-width,opacity,transform] duration-200 ease-out ${
        show ? "max-w-[160px] scale-100 overflow-visible opacity-100" : "pointer-events-none max-w-0 scale-90 overflow-hidden opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
