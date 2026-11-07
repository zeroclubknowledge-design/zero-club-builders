# Zero Draught competitions and cash winnings

Apply these new migrations, in order, before deploying the app:

1. `supabase/migrations/20261107140000_draught_competitions.sql`
2. `supabase/migrations/20261107150000_withdrawable_game_winnings.sql`

They require the existing Draught room/action functions, wallet ledger and `wallet_apply`, earning/withdrawable-balance functions, profiles, notifications and platform revenue table. No production database connection or hosting credentials are available in this workspace; live migrations have not been applied here. Do not rerun unrelated historical migrations.

Enable the Supabase `pg_cron` extension before running migration 1. When available, the migration schedules `zero-draught-competitions` once a minute for background advancement, timeouts and registration expiry. Detail pages and competition matches also sync the server every three seconds. If pg_cron was enabled later, rerun migration 1 to install the job, or schedule `select public.tick_zero_draught_competitions();` once a minute as the database owner. Verify the job is present and succeeds before announcing unattended automation.

## Competition rules

- Any signed-in, active account can host. Hosts cannot enter their own competition.
- Limits are even numbers from 4 to 128. All places must fill before play starts automatically; there is no host override for odd/incomplete rosters.
- Non-power-of-two fields (6, 10, etc.) receive randomized first-round byes. Winners progress into subsequent pairs. Semifinal losers play a bronze match, so final ranks 1, 2 and 3 are distinct match-decided results.
- Matches use the existing server-validated rules and clocks. There is a two-minute arrival period; normal matches have ten minutes per player. Draws replay with colours swapped. Attempt 3 uses red 5 minutes / black 4 minutes, with black advancing if drawn. These rules are disclosed before registration.
- Unfilled registrations expire after seven days. Cancellation is host-only and available before play starts; all entry fees and the host contribution are refunded. Individual withdrawal is unavailable after registration.

## Funding and withdrawal

The host chooses free or paid registration and optional extra prize money. The fee applies to registration revenue only: below 100 players it is 30%, and from 100 players it is 20%. The host receives exactly half of the deducted fee; Zero Club's retained half is recorded in `platform_revenue`. No fee or host earnings are taken on cancellation. Host prize contributions go wholly to prizes.

The host sets three positive integer prize percentages totalling 100; 50/30/20 is only the editable default. First place receives any rounding remainder. A funded competition must provide at least 1 NGN to every winner after fees. Money is reserved using the existing wallet ledger and paid only when both final and bronze results exist. For example: six players at 10 NGN plus a 100 NGN host contribution gives 160 NGN gross; the 18 NGN fee is shared 9/9, leaving 142 NGN for prizes. A creator-selected 60/25/15 split pays 86/35/21 NGN. At the boundary, exactly 100 registered players uses the 20% rate; 98 uses 30%, and 102 uses 20%.

Cash prizes use `game_prize`; host fee earnings use `game_host`. Both are added to the installed earnings source list without removing existing categories. Existing and future cash Space tournament prizes (`zt_prize_...`) are classified as earnings, and historical legacy game payouts gain ledger provenance without crediting profiles twice. Escrow refunds, top-ups and converted ZP remain outside earned withdrawal sources. Existing wallet payout/account/minimum/security checks still apply.

RPCs derive identity from `auth.uid()`. Browsers have no direct table writes or private progression access. Fees, pairings, match results, payout references and refunds are server-authoritative and serialized. Repeated requests and migrations preserve money and existing state. Never reset a live bracket or edit participant/result tables manually.

## Voice notes

The app now owns one voice-note audio element across routes. Leaving the source page reveals a floating player with pause/resume, seek, speed and close controls. Returning to the original page reconnects its inline controls to the same audio position. Starting another note replaces the previous one; signing out or switching accounts closes playback. This is in-app navigation continuity, not persistence across full browser reloads or an OS terminating the app. No SQL is required for voice playback.

Before live release, test free/paid registration with real test accounts, 4/6/8/10-player brackets, absence/timeouts/draw replays, both podium matches, all fee percentages, wallet withdrawal availability, cancellation/refunds and duplicate requests. Test voice-note continuity on a physical phone across chat, clubs, feed and profile pages. Automated checks use an isolated PostgreSQL-compatible database and audio stubs, not the live backend or a physical device.
