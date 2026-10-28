# Ambassador commission: a share of Zero Club's fee

The ambassador rate is applied to the shared platform-fee policy, currently
10%, rather than the eligible wallet payment's gross amount. A 20% ambassador
rate therefore earns 2% of that payment, with rounding applied to the fee first.

Example bootcamp settlement verified with the real settlement function:

| Item | Amount |
| --- | ---: |
| Payment | 10,000 |
| Creator share, before any separate bootcamp referral | 9,000 |
| Zero Club platform fee | 1,000 |
| Ambassador share at 20% of fee | 200 |
| Platform fee retained after ambassador commission | 800 |

Ambassador attribution still requires a verified signup through the campaign,
an active ambassador, and an eligible payment source. The existing sources are
`bootcamp`, `membership`, `store` and `club`. Individual approved rates and the
separate bootcamp-referral programme are preserved. Campaign approval, bonuses
and withdrawal schedules are unchanged.

Apply `supabase/migrations/20261028150000_ambassador_platform_fee_commission.sql`
once in the shared Supabase project, then deploy ZeroStart and the main app.
Do not rerun the historical ZeroStart migrations marked already applied.

The new migration:

- Replaces the wallet commission calculation and enforces the same calculation
  on the commission ledger, including writes from older in-flight functions.
- Keeps `gross` as the payment value for sales reports; stores the platform fee,
  fee percentage and commission basis separately for audit.
- Corrects unpaid legacy commissions using their saved ambassador rate.
- Leaves already-paid commissions, payout records, bonuses and wallets intact.
- Locks the commission ledger during correction so payouts cannot use stale
  pending amounts. The normal upgrade avoids taking a wallet trigger DDL lock
  while holding that ledger lock.
- Keeps transaction idempotency and prevents a second scaling on migration reruns.

There is no live database deployment connection in this checkout; applying the
migration and deploying the app remain necessary for live activation.

Coverage boundaries: this change corrects the commission base for existing
eligible wallet debits. It does not add new attribution/payment sources, create
wallet debits for gift-only purchases, or change seller pricing and fee
collection. The older checked-in store checkout in
`20260817120000_apply_zero_gifts_to_payments.sql` credits the seller the full
effective price; that path's fee collection needs a separate audit against the
live function. The commission policy base does not itself deduct a seller fee.

Verification:

```powershell
node --test scripts/ambassador-platform-fee.test.mjs
node node_modules/typescript/bin/tsc --noEmit --pretty false
node node_modules/typescript/bin/tsc --noEmit --pretty false -p ZeroStart/tsconfig.json
```
