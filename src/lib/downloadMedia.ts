import { toast } from "sonner";
import { isShareableMp4 } from "./mp4Compatibility";

export interface DownloadMediaOptions {
  fileName?: string;
  isVideo?: boolean;
  onProgress?: (status: string) => void;
}

export function isVideoResource(url: string, mimeType?: string): boolean {
  return (
    !!mimeType?.toLowerCase().startsWith("video/") ||
    /\.(mp4|webm|mov|m4v|ogv|mkv|avi|3gp|flv|ts)([?#]|$)/i.test(url) ||
    /\/videos?\//i.test(url)
  );
}

/** Inspect bytes: old uploads may have incorrect extensions and MIME types. */
export async function mediaContainer(blob: Blob): Promise<string | null> {
  const b = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  const text = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return text(0, b.length).includes("matroska") ? "video/x-matroska" : "video/webm";
  if (text(4, 8) === "ftyp") return text(8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  if (text(0, 4) === "RIFF" && text(8, 12) === "AVI ") return "video/x-msvideo";
  if (text(0, 3) === "FLV") return "video/x-flv";
  return null;
}

const extensions: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
  "video/ogg": "ogv",
  "video/3gpp": "3gp",
  "video/x-flv": "flv",
  "video/mp2t": "ts",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};

export function buildDownloadFilename(
  url: string,
  isVideo: boolean,
  customName?: string,
  blobType?: string,
): string {
  let raw = customName?.trim() || url.split(/[?#]/)[0].split("/").pop() || "zero-club-media";
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* Malformed escapes must not block saving. */
  }
  const originalExtension = raw.match(/\.([a-z0-9]{1,8})$/i)?.[1].toLowerCase();
  const ext =
    extensions[blobType?.split(";")[0].trim().toLowerCase() || ""] ||
    originalExtension ||
    (isVideo ? "mp4" : "jpg");
  const base =
    raw
      .replace(/\.[a-z0-9]{1,8}$/i, "")
      .replace(/[^a-zA-Z0-9_\-\s]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 100) || `ZeroClub-${isVideo ? "video" : "media"}`;
  return `${base}.${ext}`;
}

/** Android can consume a download well after the click returns. */
export function saveMediaBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 120000);
}

export async function prepareVideoDownload(
  blob: Blob,
  onProgress?: (status: string) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted();
  if (await isShareableMp4(blob, signal)) {
    onProgress?.("Video is ready to download…");
    return blob.type === "video/mp4" ? blob : new Blob([blob], { type: "video/mp4" });
  }
  const { exportSocialVideo } = await import("./videoExport");
  return exportSocialVideo(blob, onProgress, signal);
}

// Short-lived, bounded memory cache; never persist private media on disk.
const preparedVideos = new Map<string, { blob: Blob; expires: number }>();
const CACHE_BYTES = 64 * 1024 * 1024;
function cachedVideo(url: string) {
  const item = preparedVideos.get(url);
  if (!item) return undefined;
  if (item.expires <= Date.now()) {
    preparedVideos.delete(url);
    return undefined;
  }
  preparedVideos.delete(url);
  preparedVideos.set(url, item);
  return item.blob;
}
function rememberVideo(url: string, blob: Blob) {
  if (blob.size > CACHE_BYTES) return;
  for (const [key, item] of preparedVideos)
    if (item.expires <= Date.now() || key === url) preparedVideos.delete(key);
  let bytes = [...preparedVideos.values()].reduce((sum, item) => sum + item.blob.size, 0);
  for (const [key, item] of preparedVideos) {
    if (bytes + blob.size <= CACHE_BYTES && preparedVideos.size < 4) break;
    preparedVideos.delete(key);
    bytes -= item.blob.size;
  }
  const expires = Date.now() + 5 * 60 * 1000;
  preparedVideos.set(url, { blob, expires });
  setTimeout(
    () => {
      if (preparedVideos.get(url)?.expires === expires) preparedVideos.delete(url);
    },
    5 * 60 * 1000,
  );
}

/**
 * Supabase public files can be served as a real download (?download=name sets
 * Content-Disposition: attachment). The browser then streams the file straight
 * to disk at full speed, shows it in its own downloads list, and its own
 * cancel works. Nothing is held in page memory and nothing is converted.
 */
function nativeDownloadUrl(url: string, filename: string): string | null {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.href : undefined);
    if (!/\/storage\/v1\/object\/public\//.test(u.pathname)) return null;
    u.searchParams.set("download", filename);
    return u.toString();
  } catch {
    return null;
  }
}

function startNativeDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => link.remove(), 1000);
}

/** Fetch with real progress and an immediate stop when cancelled. */
async function fetchWithProgress(url: string, signal: AbortSignal, onProgress: (status: string) => void, label: string) {
  const response = await fetch(url, { mode: "cors", signal });
  if (!response.ok)
    throw new Error("This file could not be downloaded. Check your connection and try again.");
  const total = Number(response.headers.get("content-length")) || 0;
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (!response.body) return { blob: await response.blob(), type };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  signal.addEventListener("abort", () => { void reader.cancel().catch(() => undefined); }, { once: true });
  for (;;) {
    const { done, value } = await reader.read();
    signal.throwIfAborted();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const mb = (received / 1048576).toFixed(1);
    onProgress(total ? `${label}… ${Math.min(99, Math.round((received / total) * 100))}%` : `${label}… ${mb} MB`);
  }
  return { blob: new Blob(chunks as BlobPart[], { type: type || undefined }), type };
}

async function fetchMedia(url: string, options: DownloadMediaOptions, signal: AbortSignal, onProgress: (status: string) => void) {
  const label = options.isVideo || isVideoResource(url) ? "Downloading video" : "Downloading";
  const { blob, type: headerType } = await fetchWithProgress(url, signal, onProgress, label);
  const type = (headerType || blob.type || "").toLowerCase();
  if (!blob.size || /text\/html|application\/json/.test(type))
    throw new Error(
      "This media file is unavailable. Please try again or ask the sender to upload it again.",
    );
  const detected = type.startsWith("audio/") ? null : await mediaContainer(blob);
  const isVideo = options.isVideo || !!detected || isVideoResource(url, type);
  const source = detected ? new Blob([blob], { type: detected }) : blob;
  return { source, isVideo: !!isVideo };
}

/**
 * Save: the original file, handed straight to the browser's downloader when
 * possible (instant, full speed, cancellable in the downloads list).
 * Share: the file is needed in the page, so it is fetched with progress;
 * MP4s are shared as they are, and only other containers (.mov, .webm…) are
 * converted to a shareable MP4.
 */
async function exportMedia(
  url: string,
  options: DownloadMediaOptions,
  share: boolean,
): Promise<void> {
  if (!url) {
    toast.error("No media URL to download");
    return;
  }

  if (!share) {
    const filename = buildDownloadFilename(url, !!options.isVideo || isVideoResource(url), options.fileName);
    const href = nativeDownloadUrl(url, filename);
    if (href) {
      startNativeDownload(href, filename);
      toast.success("Download started", {
        description: "It's saving to your downloads. You can follow or cancel it there.",
      });
      return;
    }
  }

  const controller = new AbortController();
  // One stable action and throttled updates: re-creating the toast many times a
  // second meant the Cancel button was redrawn under the finger and taps were lost.
  const action = { label: "Cancel", onClick: () => controller.abort() };
  const id = toast.loading("Preparing…", { action, duration: Infinity });
  let shown = "";
  let lastAt = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const progress = (status: string) => {
    options.onProgress?.(status);
    if (controller.signal.aborted || status === shown) return;
    const show = () => {
      if (controller.signal.aborted) return;
      shown = status;
      lastAt = Date.now();
      toast.loading(status, { id, action, duration: Infinity });
    };
    clearTimeout(pending);
    if (Date.now() - lastAt >= 400) show();
    else pending = setTimeout(show, 400 - (Date.now() - lastAt));
  };
  const finish = () => clearTimeout(pending);
  let source: Blob | undefined;
  let isVideo = !!options.isVideo;
  try {
    let result = cachedVideo(url);
    if (result) {
      source = result;
      isVideo = true;
    } else {
      ({ source, isVideo } = await fetchMedia(url, options, controller.signal, progress));
      if (isVideo) {
        const container = source.type || (await mediaContainer(source)) || "";
        // MP4 is shared as-is (fast); only other containers are converted.
        result = container === "video/mp4" || /\.(mp4|m4v)([?#]|$)/i.test(url)
          ? (source.type === "video/mp4" ? source : new Blob([source], { type: "video/mp4" }))
          : await prepareVideoDownload(source, progress, controller.signal);
        rememberVideo(url, result);
      } else {
        result = source;
      }
    }
    controller.signal.throwIfAborted();
    finish();
    const filename = buildDownloadFilename(url, isVideo, options.fileName, result.type);
    const file = new File([result], filename, { type: result.type || "application/octet-stream" });
    if (share && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        toast.dismiss(id);
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          toast.dismiss(id);
          return;
        }
        // Some phones lose share activation during a long fetch; save the file once instead.
      }
    }
    saveMediaBlob(result, filename);
    toast.success(isVideo ? "Video saved" : "Download started", { id, duration: 4000 });
  } catch (error) {
    finish();
    if (controller.signal.aborted) {
      toast.message("Cancelled", { id, duration: 2000 });
      return;
    }
    toast.error(
      error instanceof Error ? error.message : "Could not prepare this file. Please try again.",
      {
        id,
        duration: 15000,
        // Failed conversion must never produce a mislabeled or partial MP4.
        ...(source && isVideo
          ? {
              action: {
                label: "Save original",
                onClick: () =>
                  saveMediaBlob(
                    source!,
                    buildDownloadFilename(url, true, options.fileName, source!.type),
                  ),
              },
            }
          : {}),
      },
    );
  }
}

export const downloadMedia = (url: string, options: DownloadMediaOptions = {}) =>
  exportMedia(url, options, false);
export const shareMediaFile = (url: string, options: DownloadMediaOptions = {}) =>
  exportMedia(url, options, true);
