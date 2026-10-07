/*
 * Pure logic for animated profile pictures — no network, no Deno APIs — so it
 * can be unit-tested with Node (scripts/avatar-motion.test.mjs).
 */

export const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MIN_SOURCE_SIDE = 256;
export const MAX_SOURCE_SIDE = 8000;
export const MAX_OUTPUT_BYTES = 40 * 1024 * 1024; // 40 MB
export const MIN_OUTPUT_BYTES = 20 * 1024; // anything smaller is not a real clip

export const LIMITS = {
  autoPer30Days: 5, // new photos animated automatically per member per 30 days
  regeneratePerDay: 1,
  regeneratePer30Days: 3,
  defaultDailyCap: 300, // whole platform, per UTC day
};

/* What we ask the model for: the photo coming to life, not a talking avatar. */
export const MOTION_PROMPT =
  "A living portrait photograph. The same person looks at the camera with a calm, natural expression. " +
  "Their eyes shift very slightly, they blink once naturally, a small gentle smile appears and softly fades, " +
  "with a tiny natural movement of the head, then they settle back into exactly the starting pose. " +
  "Static camera, no zoom, no pan. Identical face, identity, hairstyle, skin, clothing, lighting and background. Photorealistic, subtle, calm.";

export const MOTION_NEGATIVE_PROMPT =
  "talking, speaking, open mouth, lip sync, singing, exaggerated expression, big smile, laughing, teeth, " +
  "head turn, nodding, body movement, hand movement, gestures, camera movement, zoom, pan, shake, " +
  "morphing, face distortion, warping, different person, changing clothes, changing hairstyle, " +
  "background change, extra people, cartoon, anime, painting, blur, flicker, low quality";

export type ImageInfo = { mime: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number };

/** Reads the real type and size from the file's own bytes (never trusts the extension or header). */
export function parseImageInfo(bytes: Uint8Array): ImageInfo | null {
  const b = bytes;
  // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR width/height at 16..24
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52) {
    const width = (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0;
    const height = (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0;
    return { mime: "image/png", width, height };
  }
  // JPEG: FF D8, then walk segments to a start-of-frame marker
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const length = (b[i + 2] << 8) | b[i + 3];
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = (b[i + 5] << 8) | b[i + 6];
        const width = (b[i + 7] << 8) | b[i + 8];
        return { mime: "image/jpeg", width, height };
      }
      if (length < 2) return null;
      i += 2 + length;
    }
    return null;
  }
  // WebP: RIFF....WEBP then VP8 / VP8L / VP8X
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === "VP8 ") {
      const width = ((b[27] << 8) | b[26]) & 0x3fff;
      const height = ((b[29] << 8) | b[28]) & 0x3fff;
      return { mime: "image/webp", width, height };
    }
    if (chunk === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
      const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
      return { mime: "image/webp", width, height };
    }
  }
  return null;
}

/** Only the member's own photo, in Zero Club's own storage, can be sent to the provider. */
export function isOwnStoredAvatar(url: string | null | undefined, supabaseUrl: string, profileId: string): boolean {
  if (!url || !supabaseUrl || !profileId) return false;
  const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/profiles/${profileId}/`;
  if (!url.startsWith(prefix)) return false;
  const rest = url.slice(prefix.length).split("?")[0];
  return rest.length > 0 && !rest.includes("..") && !rest.startsWith("motion/") && /\.(jpe?g|png|webp)$/i.test(rest);
}

export type SourceCheck = { ok: true; info: ImageInfo } | { ok: false; reason: string };

export function checkSourceImage(bytes: Uint8Array, declaredType: string | null): SourceCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty_file" };
  if (bytes.length > MAX_SOURCE_BYTES) return { ok: false, reason: "too_large" };
  const info = parseImageInfo(bytes);
  if (!info) return { ok: false, reason: "not_a_supported_image" };
  if (declaredType && !declaredType.toLowerCase().startsWith(info.mime)) return { ok: false, reason: "type_mismatch" };
  if (info.width < MIN_SOURCE_SIDE || info.height < MIN_SOURCE_SIDE) return { ok: false, reason: "too_small" };
  if (info.width > MAX_SOURCE_SIDE || info.height > MAX_SOURCE_SIDE) return { ok: false, reason: "too_big_dimensions" };
  const ratio = info.width / info.height;
  if (ratio < 0.5 || ratio > 2) return { ok: false, reason: "bad_aspect_ratio" };
  return { ok: true, info };
}

/** MP4 files carry an "ftyp" box at byte 4. */
export function isMp4(bytes: Uint8Array): boolean {
  return bytes.length > 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

export function checkOutputVideo(bytes: Uint8Array): { ok: true } | { ok: false; reason: string } {
  if (bytes.length < MIN_OUTPUT_BYTES) return { ok: false, reason: "output_too_small" };
  if (bytes.length > MAX_OUTPUT_BYTES) return { ok: false, reason: "output_too_large" };
  if (!isMp4(bytes)) return { ok: false, reason: "output_not_mp4" };
  return { ok: true };
}

export type JobRow = { kind: "auto" | "regenerate"; status: string; source_url: string; requested_at: string };

export type Decision =
  | { allow: true }
  | { allow: false; reason: "disabled" | "already_running" | "already_done" | "cooldown" | "monthly_limit" | "platform_busy" | "not_ready"; retryAfter?: string };

/**
 * Whether a new generation may start. `history` is this member's jobs, newest first.
 * Auto: once per photo. Regenerate: only for the current photo, after the last job
 * finished, at most once a day and three times in 30 days.
 */
export function decideRequest(opts: {
  kind: "auto" | "regenerate";
  enabled: boolean;
  sourceUrl: string;
  history: JobRow[];
  now: Date;
  todayPlatformCount: number;
  dailyCap: number;
}): Decision {
  const { kind, enabled, sourceUrl, history, now } = opts;
  if (!enabled) return { allow: false, reason: "disabled" };
  if (opts.todayPlatformCount >= opts.dailyCap) return { allow: false, reason: "platform_busy" };
  const forThisPhoto = history.filter((j) => j.source_url === sourceUrl);
  if (forThisPhoto.some((j) => j.status === "queued" || j.status === "processing")) return { allow: false, reason: "already_running" };
  const since = (days: number) => now.getTime() - days * 86400000;
  if (kind === "auto") {
    if (forThisPhoto.some((j) => j.status === "succeeded" || j.status === "failed")) return { allow: false, reason: "already_done" };
    const autos = history.filter((j) => j.kind === "auto" && new Date(j.requested_at).getTime() > since(30));
    if (autos.length >= LIMITS.autoPer30Days) return { allow: false, reason: "monthly_limit" };
    return { allow: true };
  }
  if (forThisPhoto.length === 0) return { allow: false, reason: "not_ready" };
  const regens = history.filter((j) => j.kind === "regenerate");
  const lastDay = regens.filter((j) => new Date(j.requested_at).getTime() > since(1));
  if (lastDay.length >= LIMITS.regeneratePerDay) {
    const next = new Date(new Date(lastDay[0].requested_at).getTime() + 86400000);
    return { allow: false, reason: "cooldown", retryAfter: next.toISOString() };
  }
  if (regens.filter((j) => new Date(j.requested_at).getTime() > since(30)).length >= LIMITS.regeneratePer30Days) {
    return { allow: false, reason: "monthly_limit" };
  }
  return { allow: true };
}

/** Request body for the configured model. Same photo first and last, so the clip loops cleanly. */
export function providerInput(model: string, imageUrl: string): Record<string, unknown> {
  if (/wan-flf2v/.test(model)) {
    return { first_frame_url: imageUrl, last_frame_url: imageUrl, prompt: MOTION_PROMPT, negative_prompt: MOTION_NEGATIVE_PROMPT, resolution: "480p" };
  }
  if (/kling/.test(model)) {
    return { image_url: imageUrl, tail_image_url: imageUrl, prompt: MOTION_PROMPT, negative_prompt: MOTION_NEGATIVE_PROMPT, duration: "5", cfg_scale: 0.5 };
  }
  return { image_url: imageUrl, prompt: MOTION_PROMPT, negative_prompt: MOTION_NEGATIVE_PROMPT };
}

/** Rough cost per clip for the dashboard (USD). */
export function estimatedCost(model: string): number {
  if (/wan-flf2v/.test(model)) return 0.2;
  if (/kling.*v2\.5-turbo/.test(model)) return 0.35;
  if (/kling/.test(model)) return 0.35;
  return 0.4;
}

/** Find the video URL in a provider result, whatever the model's response shape. */
export function extractVideoUrl(result: any): string | null {
  const candidates = [result?.video?.url, result?.video_url, result?.output?.video?.url, Array.isArray(result?.videos) ? result.videos[0]?.url : null];
  const url = candidates.find((value) => typeof value === "string" && /^https:\/\//.test(value));
  return url || null;
}
