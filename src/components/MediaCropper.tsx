import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Cropper from "react-easy-crop";
import { RotateCw, X, Check, Loader2, RefreshCw } from "@/components/icons/solar";
import { getCroppedImg } from "@/lib/cropImage";

/**
 * The framing editor, for pictures and for video.
 *
 * The old one was a 500px dialog with a 300px stage: a photo was shown smaller
 * than the buttons underneath it, so people were choosing a crop they could not
 * actually see. It also offered exactly one aspect ratio — whatever the caller
 * asked for — with no way to tell what shape you were cutting to, and its
 * "fine rotation" slider ran 0–360°, which is a rotation control wearing a
 * straightening control's label.
 *
 * This one gives the media the whole screen, because the picture is the thing
 * being edited and everything else is chrome. Shape presets are visible and
 * switchable, the grid appears while you are moving something and gets out of
 * the way when you stop, and straightening is ±15° where straightening
 * actually happens.
 *
 * On video it frames rather than re-encodes. Re-encoding in the browser means
 * decoding every frame to a canvas and recording it back — minutes of work on
 * a mid-range phone, a quality loss, and a much larger file. Framing stores the
 * chosen rectangle and applies it on playback, which is instant, lossless, and
 * reversible later.
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

type Preset = { id: string; label: string; value: number | null };

const PRESETS: Preset[] = [
  { id: "original", label: "Original", value: null },
  { id: "square", label: "1:1", value: 1 },
  { id: "portrait", label: "4:5", value: 4 / 5 },
  { id: "wide", label: "16:9", value: 16 / 9 },
  { id: "story", label: "9:16", value: 9 / 16 },
];

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
  /** Fixed shape. When set, the presets are hidden — the caller needs this one. */
  aspect?: number;
  cropShape?: "rect" | "round";
  title?: string;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [straighten, setStraighten] = useState(0);
  const [preset, setPreset] = useState<Preset>(
    aspect ? { id: "fixed", label: "", value: aspect } : PRESETS[0],
  );
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const [areaPixels, setAreaPixels] = useState<any>(null);
  const [interacting, setInteracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The source's own shape, so "Original" is a real option rather than a guess.
  useEffect(() => {
    let cancelled = false;
    if (kind === "video") {
      const probe = document.createElement("video");
      probe.onloadedmetadata = () => {
        if (!cancelled && probe.videoWidth) setNaturalAspect(probe.videoWidth / probe.videoHeight);
      };
      probe.src = src;
      return () => { cancelled = true; };
    }
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth) setNaturalAspect(probe.naturalWidth / probe.naturalHeight);
    };
    probe.src = src;
    return () => { cancelled = true; };
  }, [src, kind]);

  const activeAspect = aspect ?? preset.value ?? naturalAspect ?? 1;
  const totalRotation = rotation + straighten;

  // The grid is guidance while you are moving something and clutter when you
  // are not, so it fades out shortly after you stop.
  const touch = useCallback(() => {
    setInteracting(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setInteracting(false), 900);
  }, []);

  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setStraighten(0);
    if (!aspect) setPreset(PRESETS[0]);
  };

  const dirty = zoom !== 1 || rotation !== 0 || straighten !== 0 || crop.x !== 0 || crop.y !== 0;

  const handleDone = async () => {
    if (!areaPixels || saving) return;
    setSaving(true);
    try {
      if (kind === "video") {
        /* Fractions rather than pixels: the same framing then applies to a
           thumbnail, a feed card and a full-screen player without recomputing
           anything. */
        const probe = document.createElement("video");
        await new Promise<void>((resolve) => {
          probe.onloadedmetadata = () => resolve();
          probe.onerror = () => resolve();
          probe.src = src;
        });
        const w = probe.videoWidth || areaPixels.width;
        const h = probe.videoHeight || areaPixels.height;
        onDone({
          kind: "video",
          framing: {
            x: areaPixels.x / w,
            y: areaPixels.y / h,
            width: areaPixels.width / w,
            height: areaPixels.height / h,
            aspect: activeAspect,
          },
        });
        return;
      }

      const blob = await getCroppedImg(src, areaPixels, totalRotation);
      if (blob) onDone({ kind: "image", blob });
    } catch (error) {
      console.error("Crop failed:", error);
    } finally {
      setSaving(false);
    }
  };

  const presets = useMemo(
    () => (aspect ? [] : PRESETS),
    [aspect],
  );

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0b0a0d] text-white">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button
          onClick={onCancel}
          aria-label="Cancel"
          className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="text-[14px] font-semibold tracking-tight">{title}</p>

        <button
          onClick={handleDone}
          disabled={!areaPixels || saving}
          aria-label="Apply"
          className="grid h-10 w-10 place-items-center rounded-full bg-[#cc208f] text-white transition active:scale-95 disabled:opacity-45"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
        </button>
      </header>

      {/* ── Stage ───────────────────────────────────────────────
          flex-1 and min-h-0: the media takes every pixel the controls do
          not need, on any screen, rather than a fixed 300px box. */}
      <div className="relative min-h-0 flex-1">
        <Cropper
          image={kind === "image" ? src : undefined}
          video={kind === "video" ? src : undefined}
          crop={crop}
          zoom={zoom}
          rotation={totalRotation}
          aspect={activeAspect}
          cropShape={cropShape}
          showGrid={interacting}
          objectFit="contain"
          minZoom={1}
          maxZoom={5}
          zoomSpeed={0.25}
          restrictPosition
          onCropChange={(next) => { setCrop(next); touch(); }}
          onZoomChange={(next) => { setZoom(next); touch(); }}
          onRotationChange={setRotation}
          onCropComplete={(_area, pixels) => setAreaPixels(pixels)}
          onInteractionStart={touch}
          onInteractionEnd={touch}
          classes={{ containerClassName: "bg-[#0b0a0d]" }}
          style={{
            cropAreaStyle: {
              border: "1px solid rgba(255,255,255,0.9)",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
            },
          }}
        />
      </div>

      {/* ── Controls ────────────────────────────────────────────── */}
      <div className="shrink-0 space-y-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
        {presets.length > 0 && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {presets.map((entry) => {
              const active = preset.id === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => { setPreset(entry); setCrop({ x: 0, y: 0 }); }}
                  className={`h-9 shrink-0 rounded-full px-3.5 text-[12px] font-semibold transition ${
                    active ? "bg-white text-black" : "bg-white/[0.08] text-white/70 hover:text-white"
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}
          </div>
        )}

        <Dial
          label="Zoom"
          value={zoom}
          display={`${Math.round(zoom * 100)}%`}
          min={1}
          max={5}
          step={0.01}
          onChange={(v) => { setZoom(v); touch(); }}
        />

        {/* ±15°, because this is straightening a horizon, not turning a page.
            Whole quarter-turns are the button beside it. */}
        <Dial
          label="Straighten"
          value={straighten}
          display={`${straighten > 0 ? "+" : ""}${straighten.toFixed(0)}°`}
          min={-15}
          max={15}
          step={1}
          onChange={(v) => { setStraighten(v); touch(); }}
        />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
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

        {kind === "video" && (
          <p className="text-center text-[11px] leading-relaxed text-white/45">
            Framing is applied on playback, so the original video is kept at full quality.
          </p>
        )}
      </div>
    </div>
  );
}

/** A labelled slider with its value shown — used for zoom and straighten. */
function Dial({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-white/50">{label}</span>
        <span className="text-[11px] font-semibold tabular-nums text-white/80">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="zc-crop-range w-full"
        aria-label={label}
      />
    </div>
  );
}

/**
 * Turns a stored framing into CSS. A framed video is shown with the chosen
 * rectangle filling the slot, which is what a crop looks like without one
 * frame being re-encoded.
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
