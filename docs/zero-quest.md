# Zero Quest

Open **Zero Games → Zero Quest**, or `/app/games/quest`.

## Enable the game

Apply `supabase/migrations/20261019140000_zero_quest.sql` to Supabase, then deploy the app. The existing reliable XP migration (`20260803100000_reliable_xp_system.sql`) must already be installed. No additional service, API key or paid membership is required.

The migration enables access-controlled realtime updates when the `supabase_realtime` publication exists. A ten-second refresh also keeps squads synchronized when realtime is unavailable. Browsers reconnect after returning online; closing a tab never leaves or ends the squad.

## Play

- Create a named city and share its invite link or 12-character code.
- Squads hold 2–6 players. Connected players ready up before the host starts.
- Build four districts in 25 minutes. Each district has a server-checked challenge and a creative brief.
- Wrong challenge answers cost one of the city's 12 energy points. Attempts have a five-second cooldown.
- Submit 120–4,000 characters for a brief, optionally with an HTTPS project link. Another teammate approves it against the displayed criteria or requests revisions. Self-review is blocked.
- Complete all eight missions to win together. Squad chat helps coordinate the work.
- Members can return to their city across page reloads. Unsubmitted work and chat drafts are saved per account on the same device. Submitted work is saved on the server and remains accessible in results.
- Leaving is explicit and transfers host duties. A disconnected lobby host can be replaced at start after 90 seconds, provided at least two connected teammates are ready. Offline members keep their seats. New players cannot join after a game starts; existing members can rejoin.

## Rewards

Each contributing member who is still in the squad at the win earns **100 XP**, for a maximum of **three rewarded wins per UTC day** (300 XP). Completing a challenge, writing an approved brief, or approving a teammate's brief counts as participation. Idle members receive no XP. Further wins remain playable and count toward the **City Builder** achievement shown inside Zero Quest.

XP is awarded through the existing XP ledger, with one reward per player per room. Database locks enforce the daily cap across rooms. XP raises progression; the game does not issue wallet funds, ZP, professional certificates or automatically published portfolio proof. Brief reviews are teammate feedback, not professional verification. Players can copy their saved work and develop it into a portfolio project themselves.

## Validation

Run `node --test scripts/zero-quest.test.mjs` for the PostgreSQL lifecycle, privacy, readiness, review, reconnection, deadline and reward tests. Purchases in the separate Zero Space marketplace do not affect Zero Quest.
