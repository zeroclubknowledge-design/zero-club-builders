import { toast } from "sonner";

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
  const { exportSocialVideo } = await import("./videoExport");
  return exportSocialVideo(blob, onProgress, signal);
}

async function fetchMedia(url: string, options: DownloadMediaOptions, signal: AbortSignal) {
  const response = await fetch(url, { mode: "cors", signal });
  if (!response.ok)
    throw new Error("This file could not be downloaded. Check your connection and try again.");
  const blob = await response.blob();
  const type = (response.headers.get("content-type") || blob.type || "").toLowerCase();
  if (!blob.size || /text\/html|application\/json/.test(type))
    throw new Error(
      "This media file is unavailable. Please try again or ask the sender to upload it again.",
    );
  const detected = type.startsWith("audio/") ? null : await mediaContainer(blob);
  const isVideo = options.isVideo || !!detected || isVideoResource(url, type);
  const source = detected ? new Blob([blob], { type: detected }) : blob;
  return { source, isVideo: !!isVideo };
}

/** Downloads and native sharing use exactly the same real MP4 bytes. */
async function exportMedia(
  url: string,
  options: DownloadMediaOptions,
  share: boolean,
): Promise<void> {
  if (!url) {
    toast.error("No media URL to download");
    return;
  }
  const controller = new AbortController();
  const id = toast.loading("Preparing download…", {
    action: { label: "Cancel", onClick: () => controller.abort() },
  });
  let source: Blob | undefined;
  let isVideo = !!options.isVideo;
  const progress = (status: string) => {
    options.onProgress?.(status);
    toast.loading(status, { id, action: { label: "Cancel", onClick: () => controller.abort() } });
  };
  try {
    ({ source, isVideo } = await fetchMedia(url, options, controller.signal));
    const result = isVideo
      ? await prepareVideoDownload(source, progress, controller.signal)
      : source;
    controller.signal.throwIfAborted();
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
        // Some phones lose share activation during conversion; save the prepared file once.
      }
    }
    saveMediaBlob(result, filename);
    toast.success(
      isVideo ? "MP4 download started. Ready to share when it finishes." : "Download started",
      { id },
    );
  } catch (error) {
    if (controller.signal.aborted) {
      toast.dismiss(id);
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
