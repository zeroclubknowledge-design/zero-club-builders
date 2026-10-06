# Zero AI deployment

Zero AI uses authenticated server routes for GPT chat, WebRTC voice, and
user-approved scheduled phone calls. No OpenAI or phone-provider credential
belongs in a `VITE_*` variable, browser code, or Git.

The current in-app voice UI uses **Vapi with GPT assistants**. Follow
[Vapi voice and project-confirmation setup](./vapi-zero-ai-setup.md) for its
credentials, saved assistants, authenticated webhooks, and new publication
migration. The direct OpenAI WebRTC endpoint below remains for older clients;
it is no longer the default voice UI. Text chat and scheduled phone calls still
use the OpenAI routes documented here.

## Database

Apply the following migrations to the same Supabase project the app uses:

- `20261006130000_zero_ai_limits_and_club_counts.sql`
- `20261006131000_bootcamp_club_members_are_enrolled.sql`
- `20261006132000_zero_ai_scheduled_calls.sql`

The earlier creator-only bootcamp migration is still needed too. These new
migrations preserve existing enrollments and payments. The enrollment RPC
returns `already: true` and `charged: 0` for bootcamp club members.

## Chat and in-app voice

Set server-side environment variables on the app host:

| Variable              | Value                                                        |
| --------------------- | ------------------------------------------------------------ |
| `OPENAI_API_KEY`      | OpenAI project API key with model access and billing enabled |
| `SUPABASE_URL`        | Supabase project URL                                         |
| `SUPABASE_ANON_KEY`   | Supabase publishable/anon key; user JWTs enforce RLS         |
| `ZERO_AI_MODEL`       | Optional; defaults to `gpt-5-mini`                           |
| `ZERO_AI_VOICE_MODEL` | Optional; defaults to `gpt-realtime-2.1`                     |

The Supabase URL/key can also come from the existing `VITE_SUPABASE_*`
configuration. `OPENAI_API_KEY` must remain server-only. Models are configurable
because availability depends on the OpenAI project.

Chat streams Responses API events through the server and the Vercel bridge.
Voice uses the Realtime WebRTC call endpoint, requires HTTPS and microphone
permission, and releases microphone tracks when ended or when leaving the page.
The browser voice session ends after ten minutes.

Conversation history is stored locally per account and active role. It is sent
to OpenAI when the user sends a message. Responses use `store: false`; this
does not independently guarantee zero retention under OpenAI's data policies.
Private courses, learner records and wallet actions are not connected as tools.
There is no charge to the user's Zero AI gift-card balance. Usage limits are
100 chat attempts and 5 voice sessions per account per UTC day, enforced
atomically by the database. Failed upstream attempts also consume this quota.

## Automated phone calls

The user supplies an international number, purpose and optional local date/time,
then confirms the recipient agreed to receive the call. Blank time means the
next scheduler run. Calls are private to their creator and limited to three
scheduled calls per UTC day. Retrying the same scheduling request is idempotent.

Phone calls use OpenAI GPT-Live with a SIP trunk and a managed GPT Responses
backend. Outbound SIP must be enabled for the OpenAI organization. Your trunk
must support TLS signaling, Opus and SRTP. Configure these server-only variables:

| Variable                         | Value                                                          |
| -------------------------------- | -------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`      | Server-only key for the call dispatcher                        |
| `ZERO_AI_SIP_URL`                | Provider trunk endpoint, e.g. `sips:sip.provider.example:5061` |
| `ZERO_AI_SIP_USERNAME`           | Trunk username                                                 |
| `ZERO_AI_SIP_PASSWORD`           | Trunk password                                                 |
| `ZERO_AI_CALLER_NUMBER`          | Provider-authorized caller number in E.164 format              |
| `ZERO_AI_PHONE_MODEL`            | Optional; defaults to `gpt-live-1`                             |
| `CRON_SECRET`                    | Random secret protecting the dispatcher                        |
| `ZERO_AI_CALL_SCHEDULER_ENABLED` | Set `true` only after the scheduler is running                 |

Configure your hosting scheduler to call `GET /api/zero-ai/calls/dispatch`
**once per minute** with `Authorization: Bearer <CRON_SECRET>`. The dispatcher
also accepts POST. The scheduler must keep running to end calls and process
future jobs. This repository does not assume a hosting plan supports a
one-minute cron; configure the scheduler on the actual deployment platform.

The dispatcher atomically claims due jobs and never automatically redials after
an ambiguous timeout, 5xx response, or worker crash. Known sessions are ended
if their state cannot be saved. It attempts hangup five minutes after initiation
(plus the scheduler interval), and users can also end requested calls. Set
provider-side spend/duration limits: scheduler outages can delay hangup.
"Call requested" means OpenAI accepted the session request; it does **not**
claim the person answered. Detailed ringing, answered, transcripts, and final
usage monitoring require a persistent GPT-Live sideband worker and are not
implemented in this serverless scheduler.

## Validation

Run `node --test scripts/zero-ai.test.mjs` and `npx tsc --noEmit`, then the
production build. Tests mock all external services and never place phone calls.
After configuring a staging deployment, verify chat with an approved test account,
voice microphone teardown, and a call to a consenting test recipient. Confirm
hangup, cancellation, ownership, and quota behavior against the deployed database.

Official references: [Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses),
[Realtime WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?voice-api=realtime),
[Telephony and SIP](https://developers.openai.com/api/docs/guides/voice-sip).

## Loading changes

The shared profile now becomes available before follow statistics finish.
Session reads share an in-flight request and are invalidated when auth changes.
Bootcamp creator, modules, syllabus and club load in parallel after the bootcamp
row, and enrollment, membership, profile and wishlist checks also run in parallel.
Feed auth starts alongside content. Inbox support identity loads alongside
conversations. Notifications retain their per-user query cache across navigation.
Club counts return aggregated rows rather than the entire membership list, with
an older-database fallback. Actual load times still depend on the deployed
database, indexes, hosting cold starts and network; no production timings have
been measured from this workspace.
