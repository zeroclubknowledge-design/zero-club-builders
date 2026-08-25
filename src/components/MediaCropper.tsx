import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { RotateCw, X, Check, Loader2, RefreshCw } from "@/components/icons/solar";
import { getCroppedImg } from "@/lib/cropImage";

/**
 * The framing editor, for pictures and for video.
 *
 * Written by hand rather than with react-easy-crop, because that library has
 * one interaction: you drag the *media* underneath a crop window whose shape
 * the developer chose. There is no way to grab an edge and pull. That is fine
 * for an avatar and useless for "keep this part of the screenshot", which is
 * most of what people actually crop.
 *
 * So the crop box is the thing you manipulate. Drag inside it to move it, drag
 * any edge or corner to resize it to whatever width and height you want. The
 * ratio presets are still there and still lock the shape when you pick one,
 * but Free is the default, because the common case is a rectangle only the
 * person cropping can choose.
 *
 * There is deliberately no zoom. Zoom exists in the drag-the-image model as a
 * workaround for not being able to resize the window; once the window resizes,
 * it is a second control doing the same job in a more confusing way.
 *
 * On video it frames rather than re-encodes. Re-encoding in the browser means
 * decoding every frame to a canvas and recording it back — slow on a phone,
 * lossy, and it drops the audio. Framing stores the chosen rectangle and
 * applies it on playback: instant, lossless, and reversible later.
 */

export type VideoFraming = {
  /** Fractions of the source, 0–1, so the framing survives any resolution. */
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: number;
};

export type CropResult =
  | { kind: "image"; blob: Blob }
  | { kind: "video"; framing: VideoFraming };

/** The crop rectangle, in fractions of the media. Resolution-independent. */
type Box = { x: number; y: number; w: number; h: number };

type Preset = { id: string; label: string; value: number | null };

const PRESETS: Preset[] = [
  { id: "free", label: "Free", value: null },
  { id: "square", label: "1:1", value: 1 },
  { id: "portrait", label: "4:5", value: 4 / 5 },
  { id: "wide", label: "16:9", value: 16 / 9 },
  { id: "story", label: "9:16", value: 9 / 16 },
];

/** Corner and edge grips, plus the body. */
type Grip = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

const FULL: Box = { x: 0, y: 0, w: 1, h: 1 };
/** Never let the box collapse to something that cannot be grabbed again. */
const MIN = 0.08;

export function MediaCropper({
  src,
  kind = "image",
  onDone,
  onCancel,
  aspect,
  cropShape = "rect",
  title = "Crop",
}: {
  src: string;
  kind?: "image" | "video";
  onDone: (result: CropResult) => void;
  onCancel: () => void;
  /** A suggested starting shape. The person can still switch to Free. */
  aspect?: number;
  cropShape?: "rect" | "round";
  title?: string;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [box, setBox] = useState<Box>(FULL);
  const [preset, setPreset] = useState<Preset>(
    aspect ? { id: "fixed", label: "Fixed", value: aspect } : PRESETS[0],
  );
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const gripRef = useRef<Grip | null>(null);
  const originRef = useRef<{ px: number; py: number; box: Box } | null>(null);

  /* ── Source dimensions ─────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    if (kind === "video") {
      const probe = document.createElement("video");
      probe.onloadedmetadata = () => {
        if (!cancelled && probe.videoWidth) setNatural({ w: probe.videoWidth, h: probe.videoHeight });
      };
      probe.src = src;
      return () => { cancelled = true; };
    }
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth) setNatural({ w: probe.naturalWidth, h: probe.naturalHeight });
    };
    probe.src = src;
    return () => { cancelled = true; };
  }, [src, kind]);

  /* ── Stage size, so pointer maths can work in fractions ────────── */
  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => setStage({ w: element.clientWidth, h: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A quarter turn swaps the shape the crop box lives inside.
  const rotated = natural
    ? (rotation % 180 === 0 ? natural : { w: natural.h, h: natural.w })
    : null;

  /* Where the media actually sits on the stage, letterboxed. Everything the
     pointer does is measured against this rather than the stage, or the box
     could be dragged into the black bars beside the picture. */
  const frame = (() => {
    if (!rotated || !stage.w || !stage.h) return { x: 0, y: 0, w: 0, h: 0 };
    const scale = Math.min(stage.w / rotated.w, stage.h / rotated.h);
    const w = rotated.w * scale;
    const h = rotated.h * scale;
    return { x: (stage.w - w) / 2, y: (stage.h - h) / 2, w, h };
  })();

  /* ── Fitting the box to a locked ratio ─────────────────────────── */
  const fitToAspect = useCallback((ratio: number | null, previous: Box): Box => {
    if (!ratio || !frame.w || !frame.h) return previous;
    // The ratio is of the output picture, so it has to be expressed relative
    // to the media's own shape before it means anything in fractions.
    const mediaRatio = frame.w / frame.h;
    let w = 1;
    let h = mediaRatio / ratio;
    if (h > 1) {
      h = 1;
      w = ratio / mediaRatio;
    }
    return {
      w,
      h,
      x: Math.min(Math.max(previous.x + previous.w / 2 - w / 2, 0), 1 - w),
      y: Math.min(Math.max(previous.y + previous.h / 2 - h / 2, 0), 1 - h),
    };
  }, [frame.w, frame.h]);

  // Apply the caller's suggested shape once the media has been measured.
  useEffect(() => {
    if (!rotated || !frame.w) return;
    setBox((current) => (preset.value ? fitToAspect(preset.value, current) : current));
    // Only when the source or the locked ratio changes — not on every drag.
  }, [rotated?.w, rotated?.h, preset.id, fitToAspect]);

  /* ── Dragging ──────────────────────────────────────────────────── */
  const onPointerDown = (grip: Grip) => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    gripRef.current = grip;
    originRef.current = { px: event.clientX, py: event.clientY, box };
    setDragging(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const grip = gripRef.current;
    const origin = originRef.current;
    if (!grip || !origin || !frame.w || !frame.h) return;

    const dx = (event.clientX - origin.px) / frame.w;
    const dy = (event.clientY - origin.py) / frame.h;
    const start = origin.box;
    const ratio = preset.value;

    if (grip === "move") {
      setBox({
        ...start,
        x: Math.min(Math.max(start.x + dx, 0), 1 - start.w),
        y: Math.min(Math.max(start.y + dy, 0), 1 - start.h),
      });
      return;
    }

    // Work in edges, which is the only way resizing from any corner stays
    // readable: each grip moves the edges it touches and leaves the rest.
    let left = start.x;
    let top = start.y;
    let right = start.x + start.w;
    let bottom = start.y + start.h;

    if (grip.includes("w")) left = Math.min(Math.max(start.x + dx, 0), right - MIN);
    if (grip.includes("e")) right = Math.max(Math.min(start.x + start.w + dx, 1), left + MIN);
    if (grip.includes("n")) top = Math.min(Math.max(start.y + dy, 0), bottom - MIN);
    if (grip.includes("s")) bottom = Math.max(Math.min(start.y + start.h + dy, 1), top + MIN);

    let next: Box = { x: left, y: top, w: right - left, h: bottom - top };

    if (ratio && frame.w && frame.h) {
      // Keep the locked shape by adjusting the free axis, anchored to whichever
      // edges this grip is not holding.
      const mediaRatio = frame.w / frame.h;
      const target = ratio / mediaRatio; // width / height, in fractions
      if (grip === "n" || grip === "s") {
        const w = Math.min(next.h * target, 1);
        next = { ...next, w, x: Math.min(Math.max(next.x + next.w / 2 - w / 2, 0), 1 - w) };
      } else {
        const h = Math.min(next.w / target, 1);
        const anchorTop = grip.includes("n") ? next.y + next.h - h : next.y;
        next = { ...next, h, y: Math.min(Math.max(anchorTop, 0), 1 - h) };
      }
    }

    setBox(next);
  };

  const endDrag = (event: React.PointerEvent) => {
    gripRef.current = null;
    originRef.current = null;
    setDragging(false);
    try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

  /* ── Output ────────────────────────────────────────────────────── */
  const reset = () => {
    setRotation(0);
    setBox(preset.value ? fitToAspect(preset.value, FULL) : FULL);
  };

  const dirty = rotation !== 0 || box.x !== 0 || box.y !== 0 || box.w !== 1 || box.h !== 1;

  const handleDone = async () => {
    if (!rotated || saving) return;
    setSaving(true);
    try {
      if (kind === "video") {
        onDone({
          kind: "video",
          framing: {
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            aspect: (box.w * rotated.w) / (box.h * rotated.h),
          },
        });
        return;
      }

      // getCroppedImg draws the rotated source onto a canvas of the rotated
      // bounding box, then cuts from it — so the rectangle has to be in that
      // same rotated space, which is exactly what `rotated` describes.
      const blob = await getCroppedImg(
        src,
        {
          x: Math.round(box.x * rotated.w),
          y: Math.round(box.y * rotated.h),
          width: Math.round(box.w * rotated.w),
          height: Math.round(box.h * rotated.h),
        },
        rotation,
      );
      if (blob) onDone({ kind: "image", blob });
    } catch (error) {
      console.error("Crop failed:", error);
    } finally {
      setSaving(false);
    }
  };

  /* ── Geometry for rendering ────────────────────────────────────── */
  const boxStyle: CSSProperties = {
    left: frame.x + box.x * frame.w,
    top: frame.y + box.y * frame.h,
    width: box.w * frame.w,
    height: box.h * frame.h,
  };

  const mediaStyle: CSSProperties = {
    left: frame.x,
    top: frame.y,
    width: frame.w,
    height: frame.h,
  };

  const HANDLES: { grip: Grip; className: string }[] = [
    { grip: "nw", className: "-left-1 -top-1 cursor-nwse-resize" },
    { grip: "ne", className: "-right-1 -top-1 cursor-nesw-resize" },
    { grip: "sw", className: "-bottom-1 -left-1 cursor-nesw-resize" },
    { grip: "se", className: "-bottom-1 -right-1 cursor-nwse-resize" },
  ];

  const EDGES: { grip: Grip; className: string }[] = [
    { grip: "n", className: "left-5 right-5 -top-2 h-4 cursor-ns-resize" },
    { grip: "s", className: "left-5 right-5 -bottom-2 h-4 cursor-ns-resize" },
    { grip: "w", className: "top-5 bottom-5 -left-2 w-4 cursor-ew-resize" },
    { grip: "e", className: "top-5 bottom-5 -right-2 w-4 cursor-ew-resize" },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0b0a0d] text-white">
      <header className="flex shrink-0 items-center justify-between px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button onClick={onCancel} aria-label="Cancel" className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
        <p className="text-[14px] font-semibold tracking-tight">{title}</p>
        <button
          onClick={handleDone}
          disabled={!rotated || saving}
          aria-label="Apply"
          className="grid h-10 w-10 place-items-center rounded-full bg-[#cc208f] text-white transition active:scale-95 disabled:opacity-45"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
        </button>
      </header>

      {/* ── Stage ───────────────────────────────────────────────── */}
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {kind === "video" ? (
          <video
            src={src}
            style={mediaStyle}
            className="pointer-events-none absolute"
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <img
            src={src}
            alt=""
            style={mediaStyle}
            className="pointer-events-none absolute"
            decoding="async"
          />
        )}

        {/* Everything outside the box, dimmed. Four panels rather than a giant
            box-shadow, so the round shape can be cut out cleanly. */}
        {rotated && (
          <>
            {/* Four panels around the box rather than one shape with a hole
                cut in it. A clip-path polygon that doubles back on itself
                depends on fill rules that browsers disagree about, and the
                failure — a fully dimmed picture — is one you only see at
                runtime. Four rectangles cannot be ambiguous. */}
            {[
              { top: 0, left: 0, right: 0, height: Number(boxStyle.top) },
              { top: Number(boxStyle.top) + Number(boxStyle.height), left: 0, right: 0, bottom: 0 },
              { top: Number(boxStyle.top), left: 0, width: Number(boxStyle.left), height: Number(boxStyle.height) },
              { top: Number(boxStyle.top), left: Number(boxStyle.left) + Number(boxStyle.width), right: 0, height: Number(boxStyle.height) },
            ].map((panel, index) => (
              <div key={index} className="pointer-events-none absolute bg-black/55" style={panel} />
            ))}

            <div
              className={`absolute ${cropShape === "round" ? "rounded-full" : ""} ring-1 ring-white/90`}
              style={boxStyle}
              onPointerDown={onPointerDown("move")}
            >
              {/* Thirds, while you are moving something. */}
              {dragging && (
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
                  <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
                  <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
                  <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
                </div>
              )}

              {EDGES.map(({ grip, className }) => (
                <div key={grip} onPointerDown={onPointerDown(grip)} className={`absolute ${className}`} />
              ))}

              {HANDLES.map(({ grip, className }) => (
                <div key={grip} onPointerDown={onPointerDown(grip)} className={`absolute ${className}`}>
                  {/* 32px of touch target under an 14px visual corner: these
                      get grabbed with a thumb. */}
                  <span className="absolute -inset-3.5" />
                  <span className="block h-3.5 w-3.5 rounded-[2px] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.6)]" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Controls ────────────────────────────────────────────── */}
      <div className="shrink-0 space-y-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {PRESETS.map((entry) => {
            const active = preset.value === entry.value;
            return (
              <button
                key={entry.id}
                onClick={() => {
                  setPreset(entry);
                  setBox((current) => (entry.value ? fitToAspect(entry.value, current) : current));
                }}
                className={`h-9 shrink-0 rounded-full px-3.5 text-[12px] font-semibold transition ${
                  active ? "bg-white text-black" : "bg-white/[0.08] text-white/70 hover:text-white"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRotation((r) => (r + 90) % 360); setBox(FULL); }}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-white/[0.08] text-[12.5px] font-semibold text-white transition hover:bg-white/[0.14] active:scale-[0.98]"
          >
            <RotateCw className="h-4 w-4" /> Rotate
          </button>
          <button
            onClick={reset}
            disabled={!dirty}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-white/[0.08] text-[12.5px] font-semibold text-white transition hover:bg-white/[0.14] active:scale-[0.98] disabled:opacity-40"
          >
            <RefreshCw className="h-4 w-4" /> Reset
          </button>
        </div>

        <p className="text-center text-[11px] leading-relaxed text-white/45">
          {kind === "video"
            ? "Drag the corners to resize. Framing is applied on playback, so the video keeps its quality."
            : "Drag inside to move, or pull any corner or edge to the size you want."}
        </p>
      </div>
    </div>
  );
}

/**
 * Turns a stored framing into CSS, so a framed video plays cropped without a
 * single frame being re-encoded.
 */
export function framingStyle(framing?: VideoFraming | null): CSSProperties {
  if (!framing) return {};
  const x = framing.width >= 1 ? 50 : (framing.x / (1 - framing.width)) * 100;
  const y = framing.height >= 1 ? 50 : (framing.y / (1 - framing.height)) * 100;
  return {
    objectFit: "cover",
    objectPosition: `${clamp(x)}% ${clamp(y)}%`,
    aspectRatio: String(framing.aspect),
  };
}

const clamp = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 50));
