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

  const open = useCallback(
    (raw: string) => {
      const url = zeroClubLink(raw);
      if (!url) {
        setRefused(raw.length > 80 ? `${raw.slice(0, 77)}…` : raw);
        return false;
      }
      setStatus("opening");
      if (navigator.vibrate) navigator.vibrate(40);
      const sameApp = url.host === window.location.host || /^(www\.)?zeroclubs\.xyz$/i.test(url.hostname);
      if (sameApp) {
        onClose();
        router.history.push(`${url.pathname}${url.search}${url.hash}`);
      } else {
        window.location.assign(url.toString());
      }
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
          {status === "scanning" && (
            <span className="zs-scanline absolute inset-x-4 h-0.5 rounded-full bg-[#cc208f] shadow-[0_0_12px_#cc208f]" />
          )}
          {(status === "starting" || status === "opening") && (
            <span className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-7 w-7 animate-spin" />
            </span>
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
      <style>{`
        @keyframes zs-scan { 0% { top: 12px } 50% { top: calc(100% - 14px) } 100% { top: 12px } }
        .zs-scanline { animation: zs-scan 2.4s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .zs-scanline { animation: none; top: 50% } }
      `}</style>
    </div>
  );
}

/** The header button's icon: a scan frame with a line through it. */
export function ScanIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className={className} aria-hidden>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </svg>
  );
}
