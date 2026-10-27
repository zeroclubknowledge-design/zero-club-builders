# Gifts created in Zero Club appearing in Zero Gifts

The standalone Browse page uses the shared `browse_gift_cards` RPC, which lists
public campaigns. Zero Club never marked new campaigns public; the standalone
creator also required an opt-in toggle and silently ignored publishing failures.

Apply `supabase/migrations/20261027150000_gift_browse_campaigns.sql` in the shared
Supabase project, then deploy Zero Gifts. This migration is self-contained for
deployments that already support quantity-based, club-scoped gift campaigns;
it does not require the earlier `20261027120000_publish_gift_campaigns.sql` fix.

The new `browse_zero_gift_campaigns` RPC lists open parent campaigns directly,
including existing campaigns with `is_public = false` and platform-sponsored
admin campaigns created without a wallet debit. It never checks creator wallet
balance or requires a matching wallet transaction. It optionally refreshes
six-hour reservations when that migration is installed.

The same migration updates the legacy `browse_gift_cards` RPC for existing
clients while preserving its `jsonb`, `jsonb[]` or `SETOF jsonb` return type.
An unusual legacy signature is left intact with a warning; deploying Zero Gifts
switches to the new RPC directly. No extra publishing request or toggle is
required. Both applications must use the same `VITE_SUPABASE_URL` project.

Claim receipts and direct gifts assigned to a member remain private. Browse keeps
its existing filters for active, unexpired campaigns with available claims and
the existing bootcamp/club restrictions. It refreshes every ten seconds while
open and immediately when revisited or focused.

Verify after applying: create a gift in Zero Club, open Zero Gifts Browse with
filters cleared, and confirm the gift appears with the same amount, remaining
quantity, expiry and creator. Claim with another account and verify no separate
receipt appears in Browse. Expire or close the campaign and verify it leaves the
claimable list. Membership/subscription gifts sent directly to a username are
personal entitlements, not publicly claimable campaigns.

Local regression checks:

```powershell
node --test scripts/gift-claim-window.test.mjs scripts/multi-claim-gifts.test.mjs
node node_modules/typescript/bin/tsc --noEmit --pretty false -p 'Zero Gifts/tsconfig.json'
```

Check the live deployment (read-only, prints no API keys or gift recipient data):

```powershell
node scripts/check-gift-browse-deployment.mjs
```

Live check during this fix: the deployed frontend still used `browse_gift_cards`,
which returned HTTP 200 with zero campaigns; the new RPC returned `PGRST202`
(not installed). The checkout has no Supabase management token or database
connection, so a successful local test/build is not evidence of live activation.
