import { supabase } from './supabase';
import { compressImage } from './imageCompression';

/**
 * A year, not an hour.
 *
 * Every upload gets a random path and is never rewritten, so the file at a
 * given URL cannot change. Telling browsers to check back after an hour meant
 * every avatar and every post image was re-downloaded hourly for no reason —
 * paying full price, repeatedly, for bytes that were already on the device.
 */
const IMMUTABLE_CACHE = '31536000';

export async function uploadFile(bucket: string, file: File, path: string) {
  try {
    // Shrunk here rather than at each call site, so no upload path can be
    // added later that quietly forgets to do it.
    const payload = await compressImage(file);

    // Compression may change the extension, and a .jpg path holding a WebP
    // confuses anything that trusts the suffix.
    const finalPath = payload === file
      ? path
      : path.replace(/\.[^./]+$/, '') + '.' + (payload.type === 'image/webp' ? 'webp' : 'jpg');

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(finalPath, payload, {
        cacheControl: IMMUTABLE_CACHE,
        upsert: true,
        contentType: payload.type || undefined,
      });

    if (error) {
      if (error.message.includes('bucket not found')) {
        throw new Error(`Storage bucket "${bucket}" not found. Please create it in your Supabase dashboard.`);
      }
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (err) {
    console.error(`Error uploading to ${bucket}:`, err);
    throw err;
  }
}


export async function uploadMedia(files: File[], userId: string) {
  const uploadPromises = Array.from(files).map((file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;
    return uploadFile('post-media', file, filePath);
  });

  return Promise.all(uploadPromises);
}

export async function uploadNoteMedia(files: File[], userId: string) {
  const uploadPromises = Array.from(files).map((file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;
    return uploadFile('post-media', file, filePath);
  });

  return Promise.all(uploadPromises);
}
