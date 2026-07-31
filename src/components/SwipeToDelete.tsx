import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

/**
 * Swipe a card left or right to reveal a Delete action.
 *
 * Deleting takes two steps on purpose: the swipe reveals the button, and the
 * button performs the delete — so a stray swipe never destroys anything.
 * Desktop users get the same button on hover.
 */
export function SwipeToDelete({
  onDelete,
  children,
  disabled,
}: {
  onDelete: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const decided = useRef<"none" | "horizontal" | "vertical">("none");

  const REVEAL = 88;
  const THRESHOLD = 46;

  const onTouchStart = (event: React.TouchEvent) => {
    if (disabled || removing) return;
    const touch = event.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    dragging.current = true;
    decided.current = "none";
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (!dragging.current) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    // Let vertical scrolling win unless the gesture is clearly sideways.
    if (decided.current === "none") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      decided.current = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    }
    if (decided.current !== "horizontal") return;

    const base = open ? (offset < 0 ? -REVEAL : REVEAL) : 0;
    const next = base + dx;
    // Resist past the reveal width so the card feels anchored.
    const clamped = Math.max(-REVEAL * 1.25, Math.min(REVEAL * 1.25, next));
    setOffset(clamped);
  };

  const settle = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (decided.current !== "horizontal") return;

    if (Math.abs(offset) >= THRESHOLD) {
      setOffset(offset < 0 ? -REVEAL : REVEAL);
      setOpen(true);
    } else {
      setOffset(0);
      setOpen(false);
    }
  };

  const close = () => {
    setOffset(0);
    setOpen(false);
  };

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (removing) return;
    setRemoving(true);
    try {
      await onDelete();
    } finally {
      setRemoving(false);
      close();
    }
  };

  return (
    <div className="group/swipe relative overflow-hidden rounded-lg">
      {/* Delete layer sits behind the card on both sides. */}
      <div className="absolute inset-0 flex items-center justify-between rounded-lg bg-destructive/10 px-4">
        <button
          onClick={handleDelete}
          aria-label="Delete notification"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold text-destructive transition-opacity ${offset > 8 ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
        <button
          onClick={handleDelete}
          aria-label="Delete notification"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold text-destructive transition-opacity ${offset < -8 ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          Delete <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={settle}
        onTouchCancel={settle}
        onClickCapture={(event) => {
          // A tap while the delete action is showing just closes it.
          if (open) {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
        style={{ transform: `translateX(${offset}px)` }}
        className={`relative ${dragging.current ? "" : "transition-transform duration-200 ease-out"} ${removing ? "opacity-50" : ""}`}
      >
        {children}
      </div>

      {/* Desktop affordance — no swipe needed with a mouse. */}
      <button
        onClick={handleDelete}
        aria-label="Delete notification"
        className="absolute right-2 top-2 hidden h-8 w-8 place-items-center rounded-lg border border-border bg-background text-muted-foreground opacity-0 transition hover:text-destructive group-hover/swipe:opacity-100 md:grid"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
