import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Image as ImageIcon, Loader2, ShieldCheck, X } from "@/components/icons/glyphs";

/**
 * Zero Scanner: points the camera at a QR code or barcode and opens it —
 * but only if it is a Zero Club link (zeroclubs.xyz or one of its
 * subdomains, e.g. ZeroStart). Anything else is shown and refused, so a
 * printed code can never send someone to a look-alike site.
 *
 * Uses the browser's own BarcodeDetector (Android Chrome and the Zero Club
 * app); where that is missing (iPhone Safari) it falls back to jsQR, loaded
 * only when the scanner opens.
 */

const ZERO_HOST = /(^|\.)zeroclubs\.xyz$/i;

export function zeroClubLink(raw: string): URL | null {
  const text = (raw || "").trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!ZERO_HOST.test(url.hostname)) return null;
  url.protocol = "https:";
  return url;
}

type Detector = (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<string | null>;

async function makeDetector(): Promise<Detector> {
  const BD = (globalThis as any).BarcodeDetector;
  if (BD) {
    let formats: string[] = ["qr_code"];
    try {
      const supported: string[] = await BD.getSupportedFormats();
      if (supported?.length) formats = supported;
    } catch {
      /* keep qr_code */
    }
    const detector = new BD({ formats });
    return async (source) => {
      const codes = await detector.detect(source);
      return codes?.[0]?.rawValue ?? null;
    };
  }
  // Fallback: jsQR (QR codes only), fetched on demand.
  const source = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm";
  const mod: any = await import(/* @vite-ignore */ source);
  const jsQR = mod.default || mod;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return async (source) => {
    const w = (source as HTMLVideoElement).videoWidth || (source as any).width;
    const h = (source as HTMLVideoElement).videoHeight || (source as any).height;
    if (!w || !h) return null;
    const scale = Math.min(1, 720 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height)?.data ?? null;
  };
}

export function ZeroScanner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<Detector | null>(null);
  const busy = useRef(false);
  const [status, setStatus] = useState<"starting" | "scanning" | "opening" | "nocamera">("starting");
  const [refused, setRefused] = useState<string | null>(null);
  /* The smiley's mood: looking while scanning, a big smile when a Zero Club code is found, a frown for anything else. */
  const [mood, setMood] = useState<"look" | "smile" | "sad">("look");
  const sadTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(sadTimer.current), []);

  const open = useCallback(
    (raw: string) => {
      const url = zeroClubLink(raw);
      if (!url) {
        setRefused(raw.length > 80 ? `${raw.slice(0, 77)}…` : raw);
        setMood("sad");
        window.clearTimeout(sadTimer.current);
        sadTimer.current = window.setTimeout(() => setMood("look"), 1600);
        return false;
      }
      setStatus("opening");
      setMood("smile");
      if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
      const sameApp = url.host === window.location.host || /^(www\.)?zeroclubs\.xyz$/i.test(url.hostname);
      // A beat to see the smile, then go.
      window.setTimeout(() => {
        if (sameApp) {
          onClose();
          router.history.push(`${url.pathname}${url.search}${url.hash}`);
        } else {
          window.location.assign(url.toString());
        }
      }, 650);
      return true;
    },
    [onClose, router],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let alive = true;
    let last = 0;

    (async () => {
      try {
        detectorRef.current = await makeDetector();
      } catch {
        detectorRef.current = null;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch {
        if (alive) setStatus("nocamera");
        return;
      }
      const video = videoRef.current;
      if (!alive || !video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setStatus("scanning");

      const tick = async (t: number) => {
        if (!alive) return;
        raf = requestAnimationFrame(tick);
        if (busy.current || t - last < 220 || !detectorRef.current || video.readyState < 2) return;
        last = t;
        busy.current = true;
        try {
          const value = await detectorRef.current(video);
          if (value && open(value)) alive = false;
        } catch {
          /* keep scanning */
        } finally {
          busy.current = false;
        }
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fromPhoto = async (file?: File | null) => {
    if (!file) return;
    try {
      const detector = detectorRef.current || (await makeDetector());
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      const value = await detector(canvas);
      if (!value) setRefused("No code found in that photo");
      else open(value);
    } catch {
      setRefused("Could not read that photo");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Scan a Zero Club code">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_150px,rgba(0,0,0,0.6)_151px)]" />

      <div className="relative z-10 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        <p className="text-[16px] font-semibold">Scan a Zero Club code</p>
        <button type="button" onClick={onClose} aria-label="Close scanner" className="grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center">
        <div className="relative h-[260px] w-[260px]">
          {[
            "left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl",
            "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl",
            "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl",
            "right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl",
          ].map((c) => (
            <span key={c} className={`absolute h-10 w-10 border-[#cc208f] ${c}`} />
          ))}
          {status === "starting" ? (
            <span className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-7 w-7 animate-spin" />
            </span>
          ) : (
            <ScanSmiley mood={mood} />
          )}
        </div>
      </div>

      <div className="relative z-10 space-y-3 px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] text-center">
        {status === "nocamera" ? (
          <p className="text-[14px] text-white/85">Camera access is off. Allow the camera for Zero Club, or scan from a photo.</p>
        ) : refused ? (
          <p role="alert" className="rounded-xl bg-red-500/20 px-3 py-2 text-[13px] text-white">
            Not opened — only Zero Club links can be opened here.
            <span className="mt-0.5 block truncate text-white/60">{refused}</span>
          </p>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-[13px] text-white/75">
            <ShieldCheck className="h-4 w-4" /> Only Zero Club links will open
          </p>
        )}
        <label className="mx-auto flex h-11 w-fit cursor-pointer items-center gap-2 rounded-full bg-white/15 px-5 text-[14px] font-semibold backdrop-blur">
          <ImageIcon className="h-4 w-4" /> Scan from a photo
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { setRefused(null); void fromPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      <style>{SMILEY_CSS}</style>
    </div>
  );
}

/** The header button's icon: a scan frame with a smiley inside. */
export function ScanIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M9.2 9.6v.6M14.8 9.6v.6" strokeWidth="2.3" />
      <path d="M8.6 13.6c1.9 2 4.9 2 6.8 0" />
    </svg>
  );
}

/**
 * The face inside the scan brackets. While scanning it looks around and
 * blinks; when a Zero Club code is found its eyes close into happy arcs and
 * the mouth grows into a big smile (cheeks glow, a little bounce). A code that
 * isn't Zero Club gets a short frown.
 */
function ScanSmiley({ mood }: { mood: "look" | "smile" | "sad" }) {
  const happy = mood === "smile";
  return (
    <svg viewBox="0 0 260 260" className={`zsm absolute inset-0 h-full w-full ${happy ? "zsm-happy" : mood === "sad" ? "zsm-sad" : ""}`} aria-hidden>
      <defs>
        <filter id="zsm-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g className="zsm-face" filter="url(#zsm-glow)" stroke="#ff4fc3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Cheeks */}
        <circle className="zsm-cheek" cx="70" cy="150" r="14" fill="#ff4fc3" stroke="none" />
        <circle className="zsm-cheek" cx="190" cy="150" r="14" fill="#ff4fc3" stroke="none" />
        {/* Open eyes (look around + blink) */}
        <g className="zsm-eyes-open">
          <g className="zsm-glance">
            <ellipse className="zsm-eye" cx="95" cy="108" rx="11" ry="15" fill="#ff4fc3" stroke="none" />
            <ellipse className="zsm-eye" cx="165" cy="108" rx="11" ry="15" fill="#ff4fc3" stroke="none" />
          </g>
        </g>
        {/* Happy eyes: ^ ^ */}
        <g className="zsm-eyes-happy" strokeWidth="9">
          <path d="M80 114 Q95 92 110 114" />
          <path d="M150 114 Q165 92 180 114" />
        </g>
        {/* Mouths */}
        <path className="zsm-mouth zsm-mouth-look" d="M96 166 Q130 184 164 166" strokeWidth="9" />
        <path className="zsm-mouth zsm-mouth-smile" d="M78 150 Q130 222 182 150" strokeWidth="10" pathLength={1} />
        <path className="zsm-mouth zsm-mouth-sad" d="M100 182 Q130 160 160 182" strokeWidth="9" />
      </g>
    </svg>
  );
}

const SMILEY_CSS = `
.zsm-face { transform-origin: 130px 140px; animation: zsm-float 3.2s ease-in-out infinite; }
@keyframes zsm-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
.zsm-glance { animation: zsm-glance 4.8s ease-in-out infinite; }
@keyframes zsm-glance { 0%,18% { transform: translateX(0) } 26%,44% { transform: translateX(-9px) } 52%,70% { transform: translateX(9px) } 78%,100% { transform: translateX(0) } }
.zsm-eye { transform-box: fill-box; transform-origin: center; animation: zsm-blink 3.6s infinite; }
@keyframes zsm-blink { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(0.12) } }
.zsm-eyes-open, .zsm-mouth-look { transition: opacity .18s ease; }
.zsm-mouth-look { animation: zsm-breathe 2.4s ease-in-out infinite; transform-origin: 130px 172px; }
@keyframes zsm-breathe { 0%,100% { transform: scaleX(1) } 50% { transform: scaleX(1.08) } }
.zsm-eyes-happy, .zsm-mouth-smile, .zsm-mouth-sad, .zsm-cheek { opacity: 0; transition: opacity .2s ease; }
.zsm-mouth-smile { stroke-dasharray: 1; stroke-dashoffset: 1; }

.zsm-happy .zsm-eyes-open, .zsm-happy .zsm-mouth-look { opacity: 0; }
.zsm-happy .zsm-eyes-happy { opacity: 1; animation: zsm-pop .35s cubic-bezier(.2,1.6,.4,1) both; transform-origin: 130px 105px; }
.zsm-happy .zsm-mouth-smile { opacity: 1; animation: zsm-draw .45s cubic-bezier(.2,.8,.2,1) forwards; }
.zsm-happy .zsm-cheek { opacity: .35; transition-delay: .15s; }
.zsm-happy .zsm-face { animation: zsm-bounce .6s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes zsm-draw { to { stroke-dashoffset: 0 } }
@keyframes zsm-pop { from { transform: scale(.6) } to { transform: scale(1) } }
@keyframes zsm-bounce { 0% { transform: scale(1) } 40% { transform: scale(1.12) } 70% { transform: scale(.97) } 100% { transform: scale(1.04) } }

.zsm-sad .zsm-mouth-look { opacity: 0; }
.zsm-sad .zsm-mouth-sad { opacity: 1; }
.zsm-sad .zsm-glance { animation: none; transform: translateY(4px); }
.zsm-sad .zsm-face { animation: zsm-shake .4s ease-in-out; }
@keyframes zsm-shake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-6px) } 75% { transform: translateX(6px) } }

@media (prefers-reduced-motion: reduce) {
  .zsm-face, .zsm-glance, .zsm-eye, .zsm-mouth-look { animation: none !important; }
  .zsm-happy .zsm-mouth-smile { stroke-dashoffset: 0; animation: none; }
}
`;
