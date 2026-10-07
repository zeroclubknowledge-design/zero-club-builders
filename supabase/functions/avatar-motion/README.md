# avatar-motion — animated profile pictures

Turns a member's uploaded profile photo into a short, subtle, looping clip
(a blink, a small smile, a tiny head movement, back to the start).

## Setup (one time)

Add these in **Supabase → Project Settings → Edge Functions → Secrets**
(never in the app's `.env` — the browser must not see them):

| Secret | Required | Value |
|---|---|---|
| `FAL_KEY` | **Yes** | API key from https://fal.ai/dashboard/keys |
| `AVATAR_MOTION_MODEL` | No | Default `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` (~$0.35 per clip). Cheaper: `fal-ai/wan-flf2v` (~$0.20, 480p). |
| `AVATAR_MOTION_DAILY_CAP` | No | Max generations per UTC day for the whole platform. Default `300`. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically.
Until `FAL_KEY` is set, nothing is generated and profiles stay static; the
switch in Edit profile is hidden.

## How it works

1. Member uploads a photo (unchanged flow) → the app calls `{ action: "request" }`.
2. The function checks the photo is the member's own file in the `profiles`
   bucket, reads its real type and size from the bytes (JPG/PNG/WebP, 256–8000px,
   ≤10 MB, sane aspect ratio), applies limits, records a job and queues it at fal.ai.
3. fal.ai calls back `?job=<id>&token=<per-job token>`. The function then fetches
   the result from fal.ai with `FAL_KEY` (the callback body is not trusted),
   validates the MP4, and stores it at `profiles/<member>/motion/<job>.mp4`.
4. If the member changed photo meanwhile, the job is marked `superseded` and
   nothing is attached. Older clips for the member are removed.
5. Backup: `{ action: "status" }` (polled every 15 s by the app while processing)
   asks fal.ai directly if the callback is 2+ minutes late; jobs time out at 30 min.

## Limits (cost control) — see logic.ts
- One automatic generation per photo; at most 5 automatic per member per 30 days.
- Regenerate: once per 24 h, 3 per 30 days, only after the last job finished.
- Platform daily cap (`AVATAR_MOTION_DAILY_CAP`). Suspended accounts never generate.
- fal.ai output files expire after 24 h; our copy is the only long-lived one.

## Logs
Edge Function logs, filter `"scope":"avatar_motion"`: requested, started, completed
(duration_ms, output_bytes), failed (reason), superseded, declined, rejected_source.
No image data or keys are logged. Admin → System shows 30-day stats and failures.

## Tests
`node --test scripts/avatar-motion.test.mjs`
