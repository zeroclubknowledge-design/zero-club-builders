/**
 * Brand logos arrive in every shape: square app icons, long wordmarks, and
 * files with wide transparent or white margins that make the mark look tiny.
 * These helpers trim the empty margin and pick a display size from the
 * logo's proportions, so every logo reads well in a 64px header.
 */

/**
 * `tone` is the colour of a logo drawn on a transparent background: "light"
 * marks vanish on light pages and "dark" ones on dark pages, so the page
 * gives those a contrasting plate. `boxed` logos carry their own background.
 */
export type LogoTone = "light" | "dark" | "mixed";
export type LogoFit = { src: string; aspect: number; tone?: LogoTone; boxed?: boolean };
export type LogoScan = { canvas: HTMLCanvasElement | null; tone: LogoTone; boxed: boolean };

/** Header box the logo must sit inside (the bar itself is 64px tall). */
const NAV = { maxH: 46, minH: 28, maxW: 210, area: 4400 };

/**
 * Width and height for a logo of this aspect (width / height). Square marks
 * get the full height; long wordmarks get width instead, so both carry the
 * same visual weight. `scale` enlarges the result (e.g. for the footer).
 */
export function logoSize(aspect: number, scale = 1) {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  let h = Math.sqrt(NAV.area / a);
  h = Math.min(NAV.maxH, Math.max(NAV.minH, h));
  let w = h * a;
  if (w > NAV.maxW) {
    w = NAV.maxW;
    h = w / a;
  }
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

const near = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number, tol: number) =>
  Math.abs(d[i] - r) <= tol && Math.abs(d[i + 1] - g) <= tol && Math.abs(d[i + 2] - b) <= tol;

/**
 * Crops away transparent or flat-colour margins. Returns null when there is
 * nothing worth trimming (or the image can't be read), so callers keep the
 * original file.
 */
export function scanLogo(
  img: CanvasImageSource,
  width: number,
  height: number,
  maxEdge = 900,
): LogoScan | null {
  if (!width || !height || typeof document === "undefined") return null;
  // Scan a downscaled copy: fast, and accurate enough for a bounding box.
  const k = Math.min(1, 512 / Math.max(width, height));
  const sw = Math.max(1, Math.round(width * k));
  const sh = Math.max(1, Math.round(height * k));
  const scan = document.createElement("canvas");
  scan.width = sw;
  scan.height = sh;
  const sctx = scan.getContext("2d", { willReadFrequently: true });
  if (!sctx) return null;
  sctx.drawImage(img, 0, 0, sw, sh);
  let data: Uint8ClampedArray;
  try {
    data = sctx.getImageData(0, 0, sw, sh).data;
  } catch {
    return null; // cross-origin image without CORS: can't read pixels
  }

  const corners = [0, (sw - 1) * 4, (sh - 1) * sw * 4, ((sh - 1) * sw + sw - 1) * 4];
  const transparent = corners.every((i) => data[i + 3] < 24);
  const [r, g, b] = [data[0], data[1], data[2]];
  const flat =
    !transparent &&
    corners.every((i) => data[i + 3] > 230 && near(data, i, r, g, b, 18));
  if (!transparent && !flat) return { canvas: null, tone: "mixed", boxed: true };

  const isBg = (i: number) =>
    data[i + 3] < 24 || (flat && near(data, i, r, g, b, 26));
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  let lum = 0, count = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      if (isBg(i)) continue;
      lum += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null; // blank image
  const avg = lum / count;
  const tone: LogoTone = flat ? "mixed" : avg > 0.82 ? "light" : avg < 0.2 ? "dark" : "mixed";
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  // Already tight: nothing to crop.
  if (bw * bh > sw * sh * 0.9) return { canvas: null, tone, boxed: flat };

  // A logo on a coloured block keeps a little of its block around it.
  const pad = Math.round(Math.max(bw, bh) * (flat ? 0.1 : 0.02));
  const cx = Math.max(0, x0 - pad);
  const cy = Math.max(0, y0 - pad);
  const cw = Math.min(sw, x1 + 1 + pad) - cx;
  const ch = Math.min(sh, y1 + 1 + pad) - cy;

  // Back to source pixels, then cap the output size.
  const src = { x: cx / k, y: cy / k, w: cw / k, h: ch / k };
  const out = Math.min(1, maxEdge / Math.max(src.w, src.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(src.w * out));
  canvas.height = Math.max(1, Math.round(src.h * out));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, canvas.width, canvas.height);
  return { canvas, tone, boxed: flat };
}

/** Trims an uploaded logo file before it's stored. SVGs pass through untouched. */
export async function prepareLogoFile(file: File): Promise<File> {
  if (file.type === "image/svg+xml" || typeof document === "undefined") return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = scanLogo(img, img.naturalWidth, img.naturalHeight)?.canvas;
    if (!canvas) return file;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "logo";
    return new File([blob], `${base}.png`, { type: "image/png", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const cache = new Map<string, Promise<LogoFit>>();

/**
 * The logo as it should be shown: trimmed when its margins can be read
 * (logos uploaded before trimming existed), with its proportions. Falls back
 * to the original URL; `aspect` 0 means "measure it when it loads".
 */
export function fitLogo(url: string): Promise<LogoFit> {
  const hit = cache.get(url);
  if (hit) return hit;
  const job = new Promise<LogoFit>((resolve) => {
    if (typeof Image === "undefined") return resolve({ src: url, aspect: 0 });
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const svg = /\.svg(\?|$)/i.test(url);
      const scan = scanLogo(img, w, h);
      const extra = scan ? { tone: scan.tone, boxed: scan.boxed } : {};
      // SVGs stay vector: only their colours are read, never re-drawn.
      if (scan?.canvas && !svg) {
        try {
          return resolve({ src: scan.canvas.toDataURL("image/png"), aspect: scan.canvas.width / scan.canvas.height, ...extra });
        } catch {
          /* fall through */
        }
      }
      resolve({ src: url, aspect: w && h ? w / h : 0, ...extra });
    };
    img.onerror = () => resolve({ src: url, aspect: 0 });
    img.src = url;
  });
  cache.set(url, job);
  return job;
}
