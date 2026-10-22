import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "@/components/icons/glyphs";
import { AuthPanel } from "./AuthPanel";

/** AuthPanel in a bottom sheet (phones) / centred card (desktop), so sign-up never leaves the page. */
export function AuthSheet({
  open,
  onClose,
  onDone,
  ...panel
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
} & Omit<Parameters<typeof AuthPanel>[0], "onDone" | "compact">) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" className="relative max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-foreground shadow-2xl sm:max-w-[460px] sm:rounded-[28px] sm:p-7">
        <div className="mb-2 flex items-center justify-between">
          <span className="mx-auto h-1 w-10 rounded-full bg-foreground/15 sm:hidden" />
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-foreground/[0.06] text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <AuthPanel {...panel} compact onDone={() => { onDone?.(); onClose(); }} />
      </div>
    </div>,
    document.body,
  );
}
