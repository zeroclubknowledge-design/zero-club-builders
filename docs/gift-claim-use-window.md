# Six-hour Zero Gift claims

Apply **all** of `supabase/migrations/20261027090000_gift_claim_use_window.sql`
in the production Supabase SQL editor before deploying the frontend changes.
It builds on the existing gift campaigns, funding, redemptions and club-scope
migrations. It does not replace the older migration files.

For each new claim of an expiring campaign, the server sets an immutable deadline
to `least(claim time + 6 hours, campaign expiry)`. The claimed copy's `expires_at`
is that effective deadline, so every existing gift balance lookup and checkout
already refuses it at the cutoff. Shortening a campaign caps its claimed copies.
Extending a campaign cannot exceed an existing claim's original deadline or revive
released credit. Legacy wallet cash gifts without expiry remain ordinary cash.

Completely unused claims (full remaining amount and no redemption records) become
cancelled, have zero spendable credit and get a `claim_released_at` marker. Their
parent's claimed count decreases once, reopening a sold-out campaign when
appropriate. Their receipt remains, enforcing one claim per account. Partly or
fully spent claims never recycle: their slot has been used, and reissuing it
would create unfunded credit. Unspent credit remaining after a partial purchase
still expires at the claim deadline.

Campaign and receipt row locks serialize allocation and recycling. Gift edits
refresh expired reservations before calculating top-up funding. Closing a gift
also refreshes reservations before refunding unclaimed places; platform-sponsored
gifts never create personal wallet refunds. Previously existing expiring receipts
receive a six-hour rollout grace period, capped by their previous expiry. Re-running
the migration never extends their deadline or resets released claims.

Claimants receive a persistent in-app notification with their exact UTC deadline
and an immediate claim-page/code-redemption message showing local time. Claim
screens and received cards show time remaining. Browse, received-credit and creator
views refresh every ten seconds; public reads and claims reclaim due places too.

The migration enables `pg_cron` when available and schedules the named job
`zero-gift-claim-expiry` every minute. Check installation after running it:

```sql
select jobname, schedule, active from cron.job
where jobname = 'zero-gift-claim-expiry';
```

The job should be active with schedule `* * * * *`. Supabase installation reference:
https://supabase.com/docs/guides/cron/install. If cron is unavailable, the migration
prints a notice; frontend refreshes, public reads and claims still recycle places.
Configure a once-per-minute server job calling `refresh_zero_gift_claims()` for
background recycling with no users online. Credit cutoff is enforced by checkout
even between sweeps. Slot counts and expiry notifications update on the next sweep
or read, rather than requiring an always-open browser.

Validation:
`node --test scripts/gift-claim-window.test.mjs scripts/gift-claim-expiry-ui.test.mjs scripts/multi-claim-gifts.test.mjs scripts/gift-edit-ui.test.mjs`.
After deployment verify a short-expiry gift on mobile, a returned slot on Browse,
the claimant's notification, and an eligible bootcamp/Zero Form split payment.
