import { supabase } from './supabase';

export async function uploadFile(bucket: string, file: File, path: string) {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
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
