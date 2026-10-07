import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  checkOutputVideo, checkSourceImage, decideRequest, estimatedCost, extractVideoUrl,
  isOwnStoredAvatar, LIMITS, MAX_OUTPUT_BYTES, MAX_SOURCE_BYTES, providerInput, type JobRow,
} from "./logic.ts";

/*
 * Animated profile pictures — the whole server side.
 *
 *   POST { action: "request", kind: "auto" | "regenerate" }   (member's session)
 *     Validates the member's current photo and limits, records a job, queues it
 *     at the provider and returns at once. The upload never waits on the AI.
 *   POST { action: "status" }                                  (member's session)
 *     The member's animation state. If the provider's callback is late, this
 *     also checks the provider directly and finishes the job (backup path).
 *   POST ?job=<id>&token=<uuid>                                (provider callback)
 *     The provider says a job is done. The result is then fetched from the
 *     provider with our key — the callback body itself is never trusted.
 *
 * Secrets stay here: FAL_KEY (required to generate), SUPABASE_SERVICE_ROLE_KEY.
 * Optional: AVATAR_MOTION_MODEL, AVATAR_MOTION_DAILY_CAP.
 * Logs are structured one-liners ("avatar_motion" events) with ids, timings and
 * sizes only — never image data or keys.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const log = (event: string, data: Record<string, unknown>) =>
  console.log(JSON.stringify({ scope: "avatar_motion", event, ...data }));

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FAL_KEY = Deno.env.get("FAL_KEY") || "";
const MODEL = Deno.env.get("AVATAR_MOTION_MODEL") || "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";
const DAILY_CAP = Number(Deno.env.get("AVATAR_MOTION_DAILY_CAP") || LIMITS.defaultDailyCap);
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function readLimited(response: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared && declared > max) return null;
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

async function setProfileStatus(profileId: string, sourceUrl: string, status: string, extra: Record<string, unknown> = {}) {
  // Only touch the profile if this photo is still the member's current photo.
  await admin.from("profiles")
    .update({ avatar_motion_status: status, avatar_motion_updated_at: new Date().toISOString(), ...extra })
    .eq("id", profileId).eq("avatar_url", sourceUrl);
}

async function failJob(job: any, reason: string) {
  const duration = job.started_at ? Date.now() - new Date(job.started_at).getTime() : null;
  await admin.from("avatar_motion_jobs").update({ status: "failed", error: reason.slice(0, 500), completed_at: new Date().toISOString(), duration_ms: duration }).eq("id", job.id);
  await setProfileStatus(job.profile_id, job.source_url, "failed");
  log("failed", { job: job.id, profile: job.profile_id, model: job.model, reason: reason.slice(0, 200), duration_ms: duration });
}

/** Fetch the finished clip from the provider, validate it, store it, attach it. */
async function completeJob(job: any): Promise<"done" | "pending" | "failed"> {
  if (!job.provider_response_url || !FAL_KEY) return "pending";
  const status = await fetch(job.provider_status_url, { headers: { Authorization: `Key ${FAL_KEY}` } });
  const statusBody = await status.json().catch(() => ({}));
  if (statusBody?.status && statusBody.status !== "COMPLETED") return "pending";

  const resultResponse = await fetch(job.provider_response_url, { headers: { Authorization: `Key ${FAL_KEY}` } });
  const result = await resultResponse.json().catch(() => null);
  if (!resultResponse.ok) { await failJob(job, `provider_error: ${JSON.stringify(result?.detail || result).slice(0, 300)}`); return "failed"; }
  const videoUrl = extractVideoUrl(result);
  if (!videoUrl) { await failJob(job, "provider_returned_no_video"); return "failed"; }

  const download = await fetch(videoUrl);
  const bytes = download.ok ? await readLimited(download, MAX_OUTPUT_BYTES) : null;
  if (!bytes) { await failJob(job, "output_download_failed_or_too_large"); return "failed"; }
  const check = checkOutputVideo(bytes);
  if (!check.ok) { await failJob(job, check.reason); return "failed"; }

  // The member may have changed photo while this was being made.
  const { data: profile } = await admin.from("profiles").select("avatar_url").eq("id", job.profile_id).maybeSingle();
  if (!profile || profile.avatar_url !== job.source_url) {
    await admin.from("avatar_motion_jobs").update({ status: "superseded", completed_at: new Date().toISOString() }).eq("id", job.id);
    log("superseded", { job: job.id, profile: job.profile_id });
    return "done";
  }

  const path = `${job.profile_id}/motion/${job.id}.mp4`;
  const upload = await admin.storage.from("profiles").upload(path, bytes, { contentType: "video/mp4", cacheControl: "31536000", upsert: true });
  if (upload.error) { await failJob(job, `storage_upload_failed: ${upload.error.message}`); return "failed"; }
  const publicUrl = admin.storage.from("profiles").getPublicUrl(path).data.publicUrl;

  const duration = job.started_at ? Date.now() - new Date(job.started_at).getTime() : null;
  await admin.from("avatar_motion_jobs").update({
    status: "succeeded", output_url: publicUrl, output_bytes: bytes.length, duration_ms: duration, completed_at: new Date().toISOString(),
  }).eq("id", job.id);
  await setProfileStatus(job.profile_id, job.source_url, "ready", { avatar_motion_url: publicUrl, avatar_motion_source: job.source_url });
  log("completed", { job: job.id, profile: job.profile_id, model: job.model, duration_ms: duration, output_bytes: bytes.length });

  // Storage lifecycle: older clips for this member are no longer used.
  const { data: files } = await admin.storage.from("profiles").list(`${job.profile_id}/motion`, { limit: 100 });
  const stale = (files || []).map((f) => `${job.profile_id}/motion/${f.name}`).filter((p) => p !== path);
  if (stale.length) await admin.storage.from("profiles").remove(stale);
  return "done";
}

async function userFrom(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data?.user || null;
}

async function handleRequest(userId: string, kind: "auto" | "regenerate") {
  const { data: profile } = await admin.from("profiles")
    .select("id, avatar_url, avatar_motion_enabled, account_status").eq("id", userId).maybeSingle();
  if (!profile) return json({ error: "Profile not found" }, 404);
  if (profile.account_status === "suspended") return json({ ok: false, reason: "not_allowed" }, 403);
  const source = profile.avatar_url as string | null;
  if (!source || !isOwnStoredAvatar(source, SUPABASE_URL, userId)) {
    // GIFs, external photos (e.g. Google) and missing photos are simply not animated.
    return json({ ok: false, reason: "unsupported_photo" });
  }
  if (!FAL_KEY) {
    log("not_configured", { profile: userId });
    return json({ ok: false, reason: "not_configured" });
  }

  const [{ data: history }, { count: today }] = await Promise.all([
    admin.from("avatar_motion_jobs").select("kind, status, source_url, requested_at").eq("profile_id", userId).order("requested_at", { ascending: false }).limit(50),
    admin.from("avatar_motion_jobs").select("id", { count: "exact", head: true }).gte("requested_at", new Date(new Date().toISOString().slice(0, 10)).toISOString()),
  ]);
  const decision = decideRequest({
    kind, enabled: profile.avatar_motion_enabled !== false, sourceUrl: source, history: (history || []) as JobRow[],
    now: new Date(), todayPlatformCount: today || 0, dailyCap: DAILY_CAP,
  });
  if (!decision.allow) {
    log("declined", { profile: userId, kind, reason: decision.reason });
    return json({ ok: false, reason: decision.reason, retryAfter: (decision as any).retryAfter });
  }

  // Validate the actual file before anything is sent anywhere.
  const imageResponse = await fetch(source);
  const imageBytes = imageResponse.ok ? await readLimited(imageResponse, MAX_SOURCE_BYTES) : null;
  const check = imageBytes ? checkSourceImage(imageBytes, imageResponse.headers.get("content-type")) : { ok: false as const, reason: "unreadable_or_too_large" };
  if (!check.ok) {
    await admin.from("avatar_motion_jobs").insert({ profile_id: userId, source_url: source, kind, status: "skipped", error: check.reason, model: MODEL, completed_at: new Date().toISOString() });
    log("rejected_source", { profile: userId, reason: check.reason });
    return json({ ok: false, reason: "unsupported_photo" });
  }

  const { data: job, error: insertError } = await admin.from("avatar_motion_jobs")
    .insert({ profile_id: userId, source_url: source, kind, model: MODEL, status: "queued", cost_usd: estimatedCost(MODEL) })
    .select("*").single();
  if (insertError) {
    // The unique index refused a duplicate: a job for this photo is already running.
    return json({ ok: false, reason: "already_running" });
  }
  log("requested", { job: job.id, profile: userId, kind, model: MODEL, width: check.info.width, height: check.info.height });
  await setProfileStatus(userId, source, "pending");

  const webhook = `${SUPABASE_URL}/functions/v1/avatar-motion?job=${job.id}&token=${job.webhook_token}`;
  const submit = await fetch(`https://queue.fal.run/${MODEL}?fal_webhook=${encodeURIComponent(webhook)}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
      // Delete the provider's copy of the output after a day; we keep our own.
      "X-Fal-Object-Lifecycle-Preference": JSON.stringify({ expiration_duration_seconds: 86400 }),
    },
    body: JSON.stringify(providerInput(MODEL, source)),
  });
  const queued = await submit.json().catch(() => ({}));
  if (!submit.ok || !queued?.request_id) {
    await failJob({ ...job, started_at: new Date().toISOString() }, `submit_failed_${submit.status}: ${JSON.stringify(queued?.detail || queued).slice(0, 300)}`);
    return json({ ok: false, reason: "provider_unavailable" });
  }
  await admin.from("avatar_motion_jobs").update({
    status: "processing", started_at: new Date().toISOString(), provider_request_id: queued.request_id,
    provider_status_url: queued.status_url, provider_response_url: queued.response_url,
  }).eq("id", job.id);
  await setProfileStatus(userId, source, "processing");
  log("started", { job: job.id, profile: userId, provider: "fal", model: MODEL, request: queued.request_id });
  return json({ ok: true, status: "processing", job: job.id });
}

async function handleStatus(userId: string) {
  const { data: profile } = await admin.from("profiles")
    .select("avatar_url, avatar_motion_enabled, avatar_motion_url, avatar_motion_source, avatar_motion_status, avatar_motion_updated_at")
    .eq("id", userId).maybeSingle();
  if (!profile) return json({ error: "Profile not found" }, 404);
  const { data: jobs } = await admin.from("avatar_motion_jobs")
    .select("*").eq("profile_id", userId).order("requested_at", { ascending: false }).limit(10);
  const current = (jobs || []).find((j: any) => j.source_url === profile.avatar_url) || null;

  // Backup path: the callback may be late or lost. After two minutes, ask the provider directly.
  if (current && current.status === "processing" && current.started_at && Date.now() - new Date(current.started_at).getTime() > 120000) {
    const outcome = await completeJob(current).catch((e) => { log("poll_error", { job: current.id, error: String(e).slice(0, 200) }); return "pending" as const; });
    if (outcome === "pending" && Date.now() - new Date(current.started_at).getTime() > 30 * 60000) await failJob(current, "timed_out");
    if (outcome !== "pending") return handleStatus(userId);
  }

  const history = (jobs || []).map((j: any) => ({ kind: j.kind, status: j.status, source_url: j.source_url, requested_at: j.requested_at })) as JobRow[];
  const regen = decideRequest({
    kind: "regenerate", enabled: profile.avatar_motion_enabled !== false, sourceUrl: profile.avatar_url || "", history,
    now: new Date(), todayPlatformCount: 0, dailyCap: Number.MAX_SAFE_INTEGER,
  });
  return json({
    configured: Boolean(FAL_KEY),
    enabled: profile.avatar_motion_enabled !== false,
    status: profile.avatar_motion_status,
    ready: profile.avatar_motion_status === "ready" && profile.avatar_motion_source === profile.avatar_url && Boolean(profile.avatar_motion_url),
    supported: isOwnStoredAvatar(profile.avatar_url, SUPABASE_URL, userId),
    canRegenerate: regen.allow,
    regenerateBlockedReason: regen.allow ? null : regen.reason,
    retryAfter: regen.allow ? null : (regen as any).retryAfter || null,
  });
}

async function handleWebhook(url: URL) {
  const jobId = url.searchParams.get("job") || "";
  const token = url.searchParams.get("token") || "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !/^[0-9a-f-]{36}$/i.test(token)) return json({ error: "Bad request" }, 400);
  const { data: job } = await admin.from("avatar_motion_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job || job.webhook_token !== token) return json({ error: "Not found" }, 404);
  if (job.status !== "processing") return json({ ok: true, ignored: job.status });
  const outcome = await completeJob(job);
  return json({ ok: true, outcome });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = new URL(req.url);
  try {
    if (url.searchParams.has("job")) return await handleWebhook(url);
    const user = await userFrom(req);
    if (!user) return json({ error: "Sign in required" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body?.action === "request") return await handleRequest(user.id, body.kind === "regenerate" ? "regenerate" : "auto");
    if (body?.action === "status") return await handleStatus(user.id);
    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    log("error", { error: String(error).slice(0, 300) });
    return json({ error: "Something went wrong" }, 500);
  }
});
