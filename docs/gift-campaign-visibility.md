# Gifts created in Zero Club appearing in Zero Gifts

The standalone Browse page uses the shared `browse_gift_cards` RPC, which lists
public campaigns. Zero Club never marked new campaigns public; the standalone
creator also required an opt-in toggle and silently ignored publishing failures.

Apply `supabase/migrations/20261027120000_publish_gift_campaigns.sql` in the shared
Supabase project, then deploy Zero Gifts. The migration repairs existing campaign
visibility and publishes future campaigns atomically inside their creation
transaction, including campaigns created by older deployed clients. No extra
publishing request or toggle is required. Both applications must use the same
`VITE_SUPABASE_URL` project.

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
