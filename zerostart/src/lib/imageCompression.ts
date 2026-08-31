/**
 * Shrink a photo before it ever leaves the phone.
 *
 * A modern phone camera produces something around 4000×3000 and three to five
 * megabytes. Nothing in ZeroStart ever displays an image at that size — the
 * widest slot in the app is a post on a desktop screen, well under 1600px —
 * so every one of those megabytes was uploaded once and then downloaded again
 * by every single person who scrolled past it. On mobile data that is the
 * difference between a feed that appears and a feed that arrives.
 *
 * The work happens in the browser, on a canvas, before the upload starts. It
 * costs the person posting a few hundred milliseconds once, and saves everyone
 * who reads the post the rest of their lives.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

/** Below this there is nothing worth saving, and re-encoding can even grow it. */
const SKIP_BELOW_BYTES = 120 * 1024;

/**
 * Formats that must survive untouched.
 *
 * GIFs are animated and a canvas would flatten them to a single frame — a
 * silently broken image is far worse than a large one. SVGs are already tiny
 * and rasterising them throws away the thing that makes them good.
 */
const PASS_THROUGH = /^image\/(gif|svg\+xml|avif)$/;

function canEncodeWebp(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap decodes off the main thread where it exists, so the UI
  // does not freeze while a large photo is being read.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    image.src = url;
  });
}

/**
 * Returns a smaller file, or the original when shrinking would not help.
 *
 * It never throws. A photo that cannot be processed — an exotic format, a
 * canvas the browser refuses, storage pressure — is uploaded exactly as it
 * arrived. Failing to compress is a missed optimisation; failing to post is a
 * bug, and the person losing their photo would never know why.
 */
export async function compressImage(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (PASS_THROUGH.test(file.type)) return file;
  if (file.size < SKIP_BELOW_BYTES) return file;

  try {
    const source = await loadBitmap(file);
    const width = "width" in source ? source.width : 0;
    const height = "height" in source ? source.height : 0;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) return file;

    // Better downscaling than the default, which visibly aliases when an image
    // is reduced by more than about half — exactly our case.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source as CanvasImageSource, 0, 0, targetWidth, targetHeight);

    if ("close" in source && typeof source.close === "function") source.close();

    const type = canEncodeWebp() ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, QUALITY),
    );

    // Re-encoding an already-optimised image can make it bigger. If it did,
    // the original was the better file and it wins.
    if (!blob || blob.size >= file.size) return file;

    const extension = type === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "") || "image";

    return new File([blob], `${base}.${extension}`, {
      type,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("Image compression skipped:", error);
    return file;
  }
}

/** The same, for a batch. Each file is independent, so one failure is local. */
export async function compressImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map((file) => compressImage(file)));
}
