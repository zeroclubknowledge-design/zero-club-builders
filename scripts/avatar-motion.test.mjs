import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/* Loads a dependency-free TypeScript module into a sandbox. */
function load(path) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, Date, Uint8Array, String, Number, Math, JSON, URL });
  return exports;
}
const L = load("../supabase/functions/avatar-motion/logic.ts");
const M = load("../src/features/profile/avatarMotion.ts");

const png = (w, h) => {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  b.set([w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255], 16);
  return b;
};
const jpeg = (w, h) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0, 0, 0]);
const webpX = (w, h) => {
  const b = new Uint8Array(40);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
  const W = w - 1, H = h - 1;
  b.set([W & 255, (W >> 8) & 255, (W >> 16) & 255, H & 255, (H >> 8) & 255, (H >> 16) & 255], 24);
  return b;
};
const SUPA = "https://abc.supabase.co";
const UID = "11111111-2222-3333-4444-555555555555";

test("reads real image type and size from the bytes", () => {
  assert.deepEqual({ ...L.parseImageInfo(png(800, 600)) }, { mime: "image/png", width: 800, height: 600 });
  assert.deepEqual({ ...L.parseImageInfo(jpeg(1024, 1024)) }, { mime: "image/jpeg", width: 1024, height: 1024 });
  assert.deepEqual({ ...L.parseImageInfo(webpX(512, 640)) }, { mime: "image/webp", width: 512, height: 640 });
  assert.equal(L.parseImageInfo(new TextEncoder().encode("<html>not an image</html>")), null);
  assert.equal(L.parseImageInfo(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), null, "GIF is not sent for animation");
});

test("invalid, mismatched, tiny, huge and oversized files are rejected", () => {
  assert.equal(L.checkSourceImage(png(800, 800), "image/png").ok, true);
  assert.equal(L.checkSourceImage(png(800, 800), "image/jpeg").reason, "type_mismatch");
  assert.equal(L.checkSourceImage(png(100, 100), "image/png").reason, "too_small");
  assert.equal(L.checkSourceImage(png(9000, 9000), "image/png").reason, "too_big_dimensions");
  assert.equal(L.checkSourceImage(png(2000, 400), "image/png").reason, "bad_aspect_ratio");
  assert.equal(L.checkSourceImage(new Uint8Array(0), null).reason, "empty_file");
  const big = new Uint8Array(L.MAX_SOURCE_BYTES + 1); big.set(png(800, 800));
  assert.equal(L.checkSourceImage(big, "image/png").reason, "too_large");
  assert.equal(L.checkSourceImage(new TextEncoder().encode("garbage bytes here....................."), "image/png").reason, "not_a_supported_image");
});

test("only the member's own stored photo can be sent to the provider", () => {
  const own = `${SUPA}/storage/v1/object/public/profiles/${UID}/avatar-${UID}-1.webp`;
  assert.equal(L.isOwnStoredAvatar(own, SUPA, UID), true);
  assert.equal(L.isOwnStoredAvatar(own, SUPA, "99999999-2222-3333-4444-555555555555"), false, "another member's photo");
  assert.equal(L.isOwnStoredAvatar("https://lh3.googleusercontent.com/a/photo.jpg", SUPA, UID), false, "external URL");
  assert.equal(L.isOwnStoredAvatar(`${SUPA}/storage/v1/object/public/profiles/${UID}/a.gif`, SUPA, UID), false, "GIF");
  assert.equal(L.isOwnStoredAvatar(`${SUPA}/storage/v1/object/public/profiles/${UID}/../x/a.jpg`, SUPA, UID), false, "path traversal");
  assert.equal(L.isOwnStoredAvatar(`${SUPA}/storage/v1/object/public/profiles/${UID}/motion/a.jpg`, SUPA, UID), false);
  assert.equal(L.isOwnStoredAvatar(null, SUPA, UID), false);
});

test("generated output must be a real MP4 of sane size", () => {
  const mp4 = new Uint8Array(L.MIN_OUTPUT_BYTES + 10); mp4.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
  assert.equal(L.checkOutputVideo(mp4).ok, true);
  assert.equal(L.checkOutputVideo(new Uint8Array(100)).reason, "output_too_small");
  const html = new Uint8Array(L.MIN_OUTPUT_BYTES + 10); html.set(new TextEncoder().encode("<html>"));
  assert.equal(L.checkOutputVideo(html).reason, "output_not_mp4");
});

const now = new Date("2026-10-08T12:00:00Z");
const ago = (h) => new Date(now.getTime() - h * 3600000).toISOString();
const base = { enabled: true, sourceUrl: "A", now, todayPlatformCount: 0, dailyCap: 300 };

test("a new photo creates one job; duplicates and repeats are prevented", () => {
  assert.equal(L.decideRequest({ ...base, kind: "auto", history: [] }).allow, true);
  assert.equal(L.decideRequest({ ...base, kind: "auto", history: [{ kind: "auto", status: "processing", source_url: "A", requested_at: ago(0.1) }] }).reason, "already_running");
  assert.equal(L.decideRequest({ ...base, kind: "auto", history: [{ kind: "auto", status: "succeeded", source_url: "A", requested_at: ago(1) }] }).reason, "already_done");
  assert.equal(L.decideRequest({ ...base, kind: "auto", history: [{ kind: "auto", status: "succeeded", source_url: "OLD", requested_at: ago(1) }] }).allow, true, "a different photo is a new job");
  assert.equal(L.decideRequest({ ...base, kind: "auto", enabled: false, history: [] }).reason, "disabled");
  assert.equal(L.decideRequest({ ...base, kind: "auto", history: [], todayPlatformCount: 300 }).reason, "platform_busy");
  const many = Array.from({ length: 5 }, (_, i) => ({ kind: "auto", status: "succeeded", source_url: `P${i}`, requested_at: ago(24 * i) }));
  assert.equal(L.decideRequest({ ...base, kind: "auto", history: many }).reason, "monthly_limit");
});

test("regenerating has a cooldown and a monthly limit", () => {
  const done = { kind: "auto", status: "succeeded", source_url: "A", requested_at: ago(48) };
  assert.equal(L.decideRequest({ ...base, kind: "regenerate", history: [] }).reason, "not_ready");
  assert.equal(L.decideRequest({ ...base, kind: "regenerate", history: [done] }).allow, true);
  const recent = { kind: "regenerate", status: "succeeded", source_url: "A", requested_at: ago(2) };
  const cooled = L.decideRequest({ ...base, kind: "regenerate", history: [recent, done] });
  assert.equal(cooled.reason, "cooldown");
  assert.ok(cooled.retryAfter);
  const three = [ago(30), ago(100), ago(200)].map((t) => ({ kind: "regenerate", status: "succeeded", source_url: "A", requested_at: t }));
  assert.equal(L.decideRequest({ ...base, kind: "regenerate", history: [...three, done] }).reason, "monthly_limit");
});

test("provider input loops on the same photo and never asks for speech", () => {
  const k = L.providerInput("fal-ai/kling-video/v2.5-turbo/pro/image-to-video", "https://x/a.jpg");
  assert.equal(k.image_url, k.tail_image_url);
  assert.equal(k.duration, "5");
  assert.match(k.negative_prompt, /talking/);
  assert.match(k.negative_prompt, /lip sync/);
  const w = L.providerInput("fal-ai/wan-flf2v", "https://x/a.jpg");
  assert.equal(w.first_frame_url, w.last_frame_url);
  assert.equal(L.extractVideoUrl({ video: { url: "https://v.fal.media/x.mp4" } }), "https://v.fal.media/x.mp4");
  assert.equal(L.extractVideoUrl({ video: { url: "javascript:alert(1)" } }), null);
});

/* ── Display rules (frontend) ── */
const p = (over = {}) => ({ avatar_url: "A", avatar_motion_url: "https://x/m.mp4", avatar_motion_source: "A", avatar_motion_status: "ready", avatar_motion_enabled: true, ...over });
const env = { reducedMotion: false, saveData: false, viewerPref: null };

test("animation shows only when ready, enabled, and made from the current photo", () => {
  assert.equal(M.motionSourceFor(p(), env), "https://x/m.mp4");
  assert.equal(M.motionSourceFor(p({ avatar_motion_source: "OLD" }), env), null, "old animation never shows on a new photo");
  assert.equal(M.motionSourceFor(p({ avatar_motion_enabled: false }), env), null, "disabled shows the photo");
  assert.equal(M.motionSourceFor(p({ avatar_motion_status: "processing" }), env), null);
  assert.equal(M.motionSourceFor(p({ avatar_motion_status: "failed" }), env), null);
  assert.equal(M.motionSourceFor(p({ avatar_motion_url: null }), env), null);
  assert.equal(M.motionSourceFor(null, env), null);
});

test("reduced motion, data saver and the viewer's own choice are respected", () => {
  assert.equal(M.motionSourceFor(p(), { ...env, reducedMotion: true }), null);
  assert.equal(M.motionSourceFor(p(), { ...env, reducedMotion: true, viewerPref: "on" }), "https://x/m.mp4", "explicit choice wins");
  assert.equal(M.motionSourceFor(p(), { ...env, viewerPref: "off" }), null);
  assert.equal(M.motionSourceFor(p(), { ...env, saveData: true }), null, "mobile data saver");
});
