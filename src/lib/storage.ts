import { supabase } from "./supabase";
import { compressImage } from "./imageCompression";

/**
 * A year, not an hour.
 *
 * Every upload gets a random path and is never rewritten, so the file at a
 * given URL cannot change. Telling browsers to check back after an hour meant
 * every avatar and every post image was re-downloaded hourly for no reason —
 * paying full price, repeatedly, for bytes that were already on the device.
 */
const IMMUTABLE_CACHE = "31536000";

/**
 * The project's per-file upload limit, in MB. Supabase's default is 50 MB;
 * raise it in the Supabase dashboard (Storage > Settings > Upload file size
 * limit) and update this number to match.
 */
export const UPLOAD_LIMIT_MB = 50;

/** A plain-language reason instead of "The object exceeded the maximum allowed size". */
export function tooLargeMessage(file: File) {
  const mb = (file.size / (1024 * 1024)).toFixed(file.size > 100 * 1024 * 1024 ? 0 : 1);
  const kind = file.type.startsWith("video/") ? "This video" : "This file";
  return `${kind} is ${mb} MB. Uploads can be up to ${UPLOAD_LIMIT_MB} MB. ${
    file.type.startsWith("video/")
      ? "Trim it or record at a lower quality, then try again."
      : "Try a smaller file."
  }`;
}

export async function uploadFile(bucket: string, file: File, path: string) {
  // Say so before spending minutes uploading something that will be refused.
  if (file.size > UPLOAD_LIMIT_MB * 1024 * 1024 && !file.type.startsWith("image/")) {
    throw new Error(tooLargeMessage(file));
  }
  try {
    // Shrunk here rather than at each call site, so no upload path can be
    // added later that quietly forgets to do it.
    const payload = await compressImage(file);

    // Compression may change the extension, and a .jpg path holding a WebP
    // confuses anything that trusts the suffix.
    const finalPath =
      payload === file
        ? path
        : path.replace(/\.[^./]+$/, "") + "." + (payload.type === "image/webp" ? "webp" : "jpg");

    const { data, error } = await supabase.storage.from(bucket).upload(finalPath, payload, {
      cacheControl: IMMUTABLE_CACHE,
      upsert: true,
      contentType: payload.type || undefined,
    });

    if (error) {
      if (/maximum allowed size|too large|413/i.test(error.message)) {
        throw new Error(tooLargeMessage(file));
      }
      if (error.message.includes("bucket not found")) {
        throw new Error(
          `Storage bucket "${bucket}" not found. Please create it in your Supabase dashboard.`,
        );
      }
      throw error;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(data.path);

    return publicUrl;
  } catch (err) {
    console.error(`Error uploading to ${bucket}:`, err);
    throw err;
  }
}

export async function uploadMedia(files: File[], userId: string) {
  const uploadPromises = Array.from(files).map((file) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;
    return uploadFile("post-media", file, filePath);
  });

  return Promise.all(uploadPromises);
}

export async function uploadNoteMedia(files: File[], userId: string) {
  const uploadPromises = Array.from(files).map((file) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;
    return uploadFile("post-media", file, filePath);
  });

  return Promise.all(uploadPromises);
}
