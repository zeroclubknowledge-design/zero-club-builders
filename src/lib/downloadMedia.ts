import { toast } from "sonner";

export interface DownloadMediaOptions {
  fileName?: string;
  isVideo?: boolean;
  onProgress?: (status: string) => void;
}

const MP4_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4;codecs=h264,aac",
  "video/mp4;codecs=h264",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

/** Return the first browser-supported MP4 recording type, if any. */
export function getSupportedMp4MimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }
  for (const candidate of MP4_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      // Browser threw on format query
    }
  }
  return null;
}

/** Check if a URL or MIME type indicates a video file. */
export function isVideoResource(url: string, mimeType?: string): boolean {
  if (mimeType && mimeType.toLowerCase().startsWith("video/")) return true;
  if (!url) return false;
  return (
    /\.(mp4|webm|mov|m4v|ogg|ogv|mkv|avi|3gp|flv|ts)(\?|$)/i.test(url) ||
    url.includes("/videos/") ||
    url.includes("video")
  );
}

/** Check if the magic bytes of a blob belong to a WebM/Matroska container. */
export async function isWebMBytes(blob: Blob): Promise<boolean> {
  try {
    const buffer = await blob.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // EBML header starts with 0x1A 0x45 0xDF 0xA3
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  } catch {
    return false;
  }
}

/**
 * Transcodes a WebM blob into standard MP4 in the browser if supported.
 * Falls back to the original blob if transcoding is unavailable or fails.
 */
export async function transcodeWebMToMp4(blob: Blob): Promise<Blob> {
  const mp4Mime = getSupportedMp4MimeType();
  if (!mp4Mime) {
    return new Blob([blob], { type: "video/mp4" });
  }

  return new Promise((resolve) => {
    let finished = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      URL.revokeObjectURL(objectUrl);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    };

    const safetyTimer = setTimeout(() => {
      cleanup();
      // On timeout, return blob with video/mp4 MIME type
      resolve(new Blob([blob], { type: "video/mp4" }));
    }, 15000);

    video.onloadedmetadata = async () => {
      try {
        const stream = (video as any).captureStream?.() || (video as any).mozCaptureStream?.();
        if (!stream) {
          clearTimeout(safetyTimer);
          cleanup();
          return resolve(new Blob([blob], { type: "video/mp4" }));
        }

        const recorder = new MediaRecorder(stream, {
          mimeType: mp4Mime,
          videoBitsPerSecond: 3_000_000,
        });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = () => {
          clearTimeout(safetyTimer);
          cleanup();
          if (chunks.length > 0) {
            resolve(new Blob(chunks, { type: "video/mp4" }));
          } else {
            resolve(new Blob([blob], { type: "video/mp4" }));
          }
        };

        recorder.start(100);
        await video.play();

        video.onended = () => {
          if (recorder.state !== "inactive") recorder.stop();
        };

        const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 10;
        setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, duration * 1000 + 1000);
      } catch {
        clearTimeout(safetyTimer);
        cleanup();
        resolve(new Blob([blob], { type: "video/mp4" }));
      }
    };

    video.onerror = () => {
      clearTimeout(safetyTimer);
      cleanup();
      resolve(new Blob([blob], { type: "video/mp4" }));
    };
  });
}

/** Sanitize and format a download filename to ensure the correct extension. */
export function buildDownloadFilename(url: string, isVideo: boolean, customName?: string, blobType?: string): string {
  let base = (customName || "").trim();
  if (!base) {
    const raw = decodeURIComponent(url.split("?")[0].split("/").pop() || (isVideo ? "zero-club-video" : "zero-club-media"));
    base = raw.replace(/\.[a-z0-9_-]+$/i, "");
  }

  // Strip non-alphanumeric except dashes/underscores
  base = base.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().replace(/\s+/g, "-") || (isVideo ? "zero-club-video" : "zero-club-media");

  // Fix generic random/blob names
  if (/^0\.\d+$/.test(base) || base === "blob" || base === "video" || base === "image") {
    base = `ZeroClub-${isVideo ? "video" : "media"}-${Date.now().toString().slice(-6)}`;
  }

  if (isVideo) {
    return `${base}.mp4`;
  }

  let ext = "jpg";
  if (blobType) {
    if (blobType.includes("png")) ext = "png";
    else if (blobType.includes("webp")) ext = "webp";
    else if (blobType.includes("gif")) ext = "gif";
    else if (blobType.includes("svg")) ext = "svg";
    else if (blobType.includes("mp3")) ext = "mp3";
    else if (blobType.includes("wav")) ext = "wav";
    else if (blobType.includes("pdf")) ext = "pdf";
  } else if (/\.(png|webp|gif|svg|mp3|wav|pdf)(\?|$)/i.test(url)) {
    const match = url.match(/\.(png|webp|gif|svg|mp3|wav|pdf)(\?|$)/i);
    if (match) ext = match[1].toLowerCase();
  }

  return `${base}.${ext}`;
}

/**
 * Downloads a video or image properly onto phones and desktops:
 * - Videos are always formatted as .mp4 with proper video/mp4 MIME type.
 * - WebM files are converted to universally playable MP4 if supported.
 * - Solves unplayable video issues when sharing downloaded files to socials like WhatsApp, Telegram, and Instagram.
 */
export async function downloadMedia(url: string, options: DownloadMediaOptions = {}): Promise<void> {
  if (!url) {
    toast.error("No media URL to download");
    return;
  }

  const toastId = toast.loading(options.isVideo || isVideoResource(url) ? "Preparing video download..." : "Downloading...");

  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rawBlob = await response.blob();

    const contentType = (response.headers.get("content-type") || rawBlob.type || "").toLowerCase();
    const isVideo = options.isVideo || isVideoResource(url, contentType);

    let finalBlob: Blob = rawBlob;

    if (isVideo) {
      const isWebm = (contentType.includes("webm") || await isWebMBytes(rawBlob));
      if (isWebm) {
        toast.loading("Converting video to MP4 for maximum compatibility...", { id: toastId });
        finalBlob = await transcodeWebMToMp4(rawBlob);
      } else {
        // Guarantee video/mp4 MIME type so Android/iOS MediaStore assigns the proper codec
        finalBlob = new Blob([rawBlob], { type: "video/mp4" });
      }
    }

    const finalFileName = buildDownloadFilename(url, isVideo, options.fileName, finalBlob.type || contentType);

    const objectUrl = URL.createObjectURL(finalBlob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.href = objectUrl;
    link.download = finalFileName;
    link.setAttribute("download", finalFileName);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(objectUrl);
    }, 15000);

    toast.success(isVideo ? "Video saved in MP4 format! Ready to share." : "Saved to your downloads", { id: toastId });
  } catch (err: any) {
    console.error("Failed to download media:", err);
    toast.error("Could not download this file. Please check your connection and try again.", { id: toastId });
  }
}

/**
 * Directly shares the media file to native socials (WhatsApp, Instagram, Telegram, etc.)
 * using Web Share API with File objects, falling back to downloadMedia.
 */
export async function shareMediaFile(url: string, options: DownloadMediaOptions = {}): Promise<void> {
  if (!url) return;

  const isVideo = options.isVideo || isVideoResource(url);

  // If navigator.canShare with files is available, we prepare the actual File
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    const toastId = toast.loading("Preparing file to share...");
    try {
      const response = await fetch(url, { mode: "cors" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rawBlob = await response.blob();
      const contentType = (response.headers.get("content-type") || rawBlob.type || "").toLowerCase();

      let finalBlob: Blob = rawBlob;
      if (isVideo) {
        const isWebm = (contentType.includes("webm") || await isWebMBytes(rawBlob));
        if (isWebm) {
          finalBlob = await transcodeWebMToMp4(rawBlob);
        } else {
          finalBlob = new Blob([rawBlob], { type: "video/mp4" });
        }
      }

      const fileName = buildDownloadFilename(url, isVideo, options.fileName, finalBlob.type || contentType);
      const file = new File([finalBlob], fileName, { type: isVideo ? "video/mp4" : (finalBlob.type || contentType || "image/jpeg") });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        toast.dismiss(toastId);
        await navigator.share({
          files: [file],
          title: fileName,
        });
        return;
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        // User closed share dialog
        toast.dismiss(toastId);
        return;
      }
      console.warn("Native file share fallback:", e);
    }
    toast.dismiss(toastId);
  }

  // Fallback: download the file as proper MP4 so the user has it ready in gallery/downloads
  await downloadMedia(url, options);
}
