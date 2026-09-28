import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A bottom sheet on phones, a centred dialog on larger screens.
 * The scrim closes it, Escape closes it, and the page behind stops scrolling.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button aria-label="Close" onClick={onClose} className="zs-fade absolute inset-0 bg-ink/45 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        className={`zs-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[26px] bg-surface shadow-2xl sm:rounded-[26px] ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
          <span className="mx-auto h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
        </div>
        {title && (
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 sm:px-6">
            <h2 className="text-[19px] font-bold leading-tight text-ink">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/[0.05] text-ink-muted transition hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-6">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-line bg-surface px-5 pt-3 sm:px-6" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
