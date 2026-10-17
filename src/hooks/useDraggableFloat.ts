import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Lets a floating button or bubble be dragged anywhere on screen (mouse, pen
 * or finger), and remembers where each one was left.
 *
 * The element keeps its normal CSS position (e.g. bottom-4 right-4); the hook
 * only adds a translate() offset on top. A press that moves less than a few
 * pixels is still a normal tap/click; a real drag swallows the click that
 * follows it, so letting go never presses a button by accident.
 *
 *   const drag = useDraggableFloat("group-call-bubble", { snap: true });
 *   <div ref={drag.ref} style={drag.style} {...drag.handlers}>…</div>
 */
type Offset = { x: number; y: number };
type Options = {
  /** After letting go, slide to the nearest left or right edge. */
  snap?: boolean;
  /** Keep inside the positioned parent instead of the whole window. */
  bounds?: "viewport" | "parent";
  /** Gap kept from the edges, in px. */
  margin?: number;
};

const STORE = "zc-float:";
const THRESHOLD = 6;

const read = (key: string): Offset => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE + key) || "null");
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return { x: v.x, y: v.y };
  } catch { /* storage unavailable */ }
  return { x: 0, y: 0 };
};
const write = (key: string, o: Offset) => {
  try { localStorage.setItem(STORE + key, JSON.stringify(o)); } catch { /* storage unavailable */ }
};

export function useDraggableFloat<T extends HTMLElement = HTMLElement>(key: string, { snap = false, bounds = "viewport", margin = 8 }: Options = {}) {
  const ref = useRef<T | null>(null);
  const [offset, setOffset] = useState<Offset>(() => (typeof window === "undefined" ? { x: 0, y: 0 } : read(key)));
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const live = useRef(offset);
  live.current = offset;
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean; box: DOMRect; area: { l: number; t: number; r: number; b: number } } | null>(null);
  const swallowClick = useRef(false);

  const area = useCallback(() => {
    const el = ref.current;
    const parent = bounds === "parent" ? (el?.offsetParent as HTMLElement | null) : null;
    if (parent) {
      const r = parent.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
    const vv = window.visualViewport;
    return { l: 0, t: 0, r: vv?.width ?? window.innerWidth, b: vv?.height ?? window.innerHeight };
  }, [bounds]);

  /* Keep the element on screen: offset is clamped against where it sits with no offset. */
  const clamp = useCallback((o: Offset, box: DOMRect, cur: Offset, a: { l: number; t: number; r: number; b: number }): Offset => {
    const baseL = box.left - cur.x;
    const baseT = box.top - cur.y;
    const minX = a.l + margin - baseL, maxX = a.r - margin - box.width - baseL;
    const minY = a.t + margin - baseT, maxY = a.b - margin - box.height - baseT;
    return {
      x: maxX < minX ? 0 : Math.min(maxX, Math.max(minX, o.x)),
      y: maxY < minY ? 0 : Math.min(maxY, Math.max(minY, o.y)),
    };
  }, [margin]);

  /* After a resize, rotation or keyboard, pull a saved position back on screen. */
  const refit = useCallback(() => {
    const el = ref.current;
    if (!el || drag.current) return;
    const next = clamp(live.current, el.getBoundingClientRect(), live.current, area());
    if (next.x !== live.current.x || next.y !== live.current.y) { setOffset(next); write(key, next); }
  }, [area, clamp, key]);
  // Every render: the element may only just have appeared (e.g. on minimise).
  useLayoutEffect(() => { refit(); });
  useEffect(() => {
    window.addEventListener("resize", refit);
    window.visualViewport?.addEventListener("resize", refit);
    return () => { window.removeEventListener("resize", refit); window.visualViewport?.removeEventListener("resize", refit); };
  }, [refit]);

  const onPointerDown = (e: ReactPointerEvent<T>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = ref.current;
    if (!el) return;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: live.current.x, oy: live.current.y, moved: false, box: el.getBoundingClientRect(), area: area() };
  };
  const onPointerMove = (e: ReactPointerEvent<T>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      d.moved = true;
      setDragging(true);
      setSettling(false);
      try { ref.current?.setPointerCapture(e.pointerId); } catch { /* already released */ }
    }
    e.preventDefault();
    setOffset(clamp({ x: d.ox + dx, y: d.oy + dy }, d.box, { x: d.ox, y: d.oy }, d.area));
  };
  const finish = (e: ReactPointerEvent<T>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    swallowClick.current = true;
    window.setTimeout(() => { swallowClick.current = false; }, 0);
    setDragging(false);
    let next = live.current;
    if (snap) {
      const box = ref.current?.getBoundingClientRect();
      if (box) {
        const a = d.area;
        const toLeft = box.left + box.width / 2 < (a.l + a.r) / 2;
        const baseL = box.left - next.x;
        next = { x: toLeft ? a.l + margin - baseL : a.r - margin - box.width - baseL, y: next.y };
        setSettling(true);
        window.setTimeout(() => setSettling(false), 260);
      }
    }
    setOffset(next);
    write(key, next);
  };
  /* A drag ends with a click on whatever was under the finger; drop it. */
  const onClickCapture = (e: React.MouseEvent<T>) => {
    if (swallowClick.current) { e.preventDefault(); e.stopPropagation(); swallowClick.current = false; }
  };

  const style: CSSProperties = {
    transform: offset.x || offset.y ? `translate3d(${Math.round(offset.x)}px, ${Math.round(offset.y)}px, 0)` : undefined,
    transition: settling ? "transform 240ms cubic-bezier(.2,.8,.2,1)" : undefined,
    touchAction: "none",
    cursor: dragging ? "grabbing" : undefined,
    willChange: dragging ? "transform" : undefined,
  };

  return {
    ref,
    style,
    dragging,
    reset: () => { setOffset({ x: 0, y: 0 }); write(key, { x: 0, y: 0 }); },
    handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onClickCapture },
  };
}
