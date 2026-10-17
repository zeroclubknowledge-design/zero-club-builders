import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Lets a floating button or bubble be dragged anywhere on screen (mouse, pen
 * or finger), and remembers where each one was left.
 *
 * The element keeps its normal CSS position (e.g. bottom-4 right-4); the hook
 * adds a translate() offset on top. A press that moves less than a few pixels
 * is still a normal tap; a real drag swallows the click that follows it.
 *
 * Safety rules (an earlier version crashed the page on phones):
 *  - the "keep it on screen" check never runs during render or layout, only
 *    when the element appears, on window resize and when a drag ends;
 *  - positions are whole pixels and only change by more than 1px, so the
 *    check can never feed itself in a loop;
 *  - the element's resting place is measured from the transform it actually
 *    has on screen (animations and transitions included), not from state.
 *
 *   const drag = useDraggableFloat<HTMLDivElement>("group-call-bubble", { snap: true });
 *   <div ref={drag.ref} style={drag.style} {...drag.handlers}>…</div>
 */
type Offset = { x: number; y: number };
type Area = { l: number; t: number; r: number; b: number };
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
const ZERO: Offset = { x: 0, y: 0 };

const read = (key: string): Offset => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE + key) || "null");
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return { x: Math.round(v.x), y: Math.round(v.y) };
  } catch { /* storage unavailable */ }
  return ZERO;
};
const write = (key: string, o: Offset) => {
  try { localStorage.setItem(STORE + key, JSON.stringify(o)); } catch { /* storage unavailable */ }
};

/** Where the element would sit with no offset, from what is really on screen. */
function restingBox(el: HTMLElement) {
  const box = el.getBoundingClientRect();
  let tx = 0, ty = 0;
  try {
    const t = getComputedStyle(el).transform;
    if (t && t !== "none") { const m = new DOMMatrixReadOnly(t); tx = m.m41; ty = m.m42; }
  } catch { /* old browser: assume no transform */ }
  return { left: box.left - tx, top: box.top - ty, width: box.width, height: box.height };
}

export function useDraggableFloat<T extends HTMLElement = HTMLElement>(key: string, { snap = false, bounds = "viewport", margin = 8 }: Options = {}) {
  const [offset, setOffsetState] = useState<Offset>(() => (typeof window === "undefined" ? ZERO : read(key)));
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const live = useRef(offset);
  const node = useRef<T | null>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean; base: ReturnType<typeof restingBox>; area: Area } | null>(null);
  const swallowClick = useRef(false);

  const setOffset = useCallback((o: Offset, save = false) => {
    const next = { x: Math.round(o.x), y: Math.round(o.y) };
    const cur = live.current;
    if (Math.abs(next.x - cur.x) < 1 && Math.abs(next.y - cur.y) < 1) return;
    live.current = next;
    setOffsetState(next);
    if (save) write(key, next);
  }, [key]);

  const area = useCallback((el: HTMLElement): Area => {
    const parent = bounds === "parent" ? (el.offsetParent as HTMLElement | null) : null;
    if (parent) { const r = parent.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    return { l: 0, t: 0, r: vv?.width ?? window.innerWidth, b: vv?.height ?? window.innerHeight };
  }, [bounds]);

  const clamp = useCallback((o: Offset, base: ReturnType<typeof restingBox>, a: Area): Offset => {
    const minX = a.l + margin - base.left, maxX = a.r - margin - base.width - base.left;
    const minY = a.t + margin - base.top, maxY = a.b - margin - base.height - base.top;
    return {
      x: maxX < minX ? 0 : Math.min(maxX, Math.max(minX, o.x)),
      y: maxY < minY ? 0 : Math.min(maxY, Math.max(minY, o.y)),
    };
  }, [margin]);

  /* Pull a saved position back on screen (after it appears, a resize or rotation). */
  const refit = useCallback(() => {
    const el = node.current;
    if (!el || drag.current) return;
    try { setOffset(clamp(live.current, restingBox(el), area(el)), true); } catch { /* never break the page over a position */ }
  }, [area, clamp, setOffset]);

  // Measure once the element is on screen, after any entry animation has had a frame.
  const ref = useCallback((el: T | null) => {
    node.current = el;
    if (el) requestAnimationFrame(() => requestAnimationFrame(refit));
  }, [refit]);

  useEffect(() => {
    let timer = 0;
    const onResize = () => { window.clearTimeout(timer); timer = window.setTimeout(refit, 120); };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => { window.clearTimeout(timer); window.removeEventListener("resize", onResize); window.visualViewport?.removeEventListener("resize", onResize); };
  }, [refit]);

  const onPointerDown = (e: ReactPointerEvent<T>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = node.current;
    if (!el) return;
    try {
      drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: live.current.x, oy: live.current.y, moved: false, base: restingBox(el), area: area(el) };
    } catch { drag.current = null; }
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
      try { node.current?.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    }
    setOffset(clamp({ x: d.ox + dx, y: d.oy + dy }, d.base, d.area));
  };
  const finish = (e: ReactPointerEvent<T>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    try { node.current?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    swallowClick.current = true;
    window.setTimeout(() => { swallowClick.current = false; }, 50);
    setDragging(false);
    let next = live.current;
    if (snap) {
      const centre = d.base.left + next.x + d.base.width / 2;
      const toLeft = centre < (d.area.l + d.area.r) / 2;
      next = { x: toLeft ? d.area.l + margin - d.base.left : d.area.r - margin - d.base.width - d.base.left, y: next.y };
      setSettling(true);
      window.setTimeout(() => setSettling(false), 260);
    }
    setOffset(clamp(next, d.base, d.area));
    write(key, live.current);
  };
  /* A drag ends with a click on whatever was under the finger; drop it. */
  const onClickCapture = (e: ReactMouseEvent<T>) => {
    if (swallowClick.current) { e.preventDefault(); e.stopPropagation(); swallowClick.current = false; }
  };

  const moved = offset.x !== 0 || offset.y !== 0;
  const style: CSSProperties = {
    transform: moved ? `translate3d(${offset.x}px, ${offset.y}px, 0)` : undefined,
    transition: settling ? "transform 240ms cubic-bezier(.2,.8,.2,1)" : undefined,
    touchAction: "none",
    cursor: dragging ? "grabbing" : undefined,
  };

  return {
    ref,
    style,
    dragging,
    moved,
    reset: () => { live.current = ZERO; setOffsetState(ZERO); write(key, ZERO); },
    handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onClickCapture },
  };
}
