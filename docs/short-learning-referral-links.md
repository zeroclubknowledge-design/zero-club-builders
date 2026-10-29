# Short bootcamp and Zero Form referral links

Signed-in members share a stable link such as
`https://www.zeroclubs.xyz/s/a1b2c3d4e5f6` (illustrative code).
The database maps the opaque 12-character code to the authenticated sharer and
bootcamp or form. Usernames and raw account/bootcamp UUIDs are not put in the
shared URL. Repeated shares of the same destination by the same account reuse
the code; different accounts get distinct links.

## Sharing and opening

- The bootcamp detail share button and state-aware creator share action use
  these links, including the Zero Form used before the bootcamp starts.
- Form editor Share/Copy buttons in both apps, and Zero Form Browse card Share,
  use the same account-bound link service.
- Anonymous sharers retain a plain destination link because there is no signed-in
  account to credit. Signed-in share failures are shown rather than silently
  copying a link with missing attribution.
- `/s/:code` resolves server-side with a noncached 302 redirect to a fixed Zero
  Club destination. The destination's existing server-rendered social metadata
  remains responsible for previews. The code never accepts an arbitrary host.
- The destination verifies the link's bootcamp/form, remembers the visit through
  signup/sign-in and records the authenticated visitor. It retries attribution
  before enrolment/payment; a failed attribution write prevents that attempt
  from taking payment without the expected referral.
- Form Info on the standalone product captures attribution before its Register
  navigation drops the query string. Short form shares currently resolve to the
  canonical public form on the main Zero Club domain.

## Rewards

The existing `settle_bootcamp_payment` function determines the owner-configured
referral percentage at payment time. No percentage is encoded in the link.
No reward is created with referrals disabled, for self-referrals, for an expired
30-day attribution or for a coupon payment under the existing no-stacking rule.
Earnings follow the existing pending/month-end release process. An early-bird
Zero Form price is its purchase price, not a coupon flag.

This is bootcamp acquisition commission funded from the organiser's share.
ZeroStart ambassador commission remains a separate calculation; its 20% of the
platform fee has not been changed.

## Zero Form settlement compatibility

The checked-in older `submit_zero_form_v2` directly credits the organiser. The
migration recognizes that owner-credit statement and routes bootcamp payments
through the existing platform/referral/organiser split. Its legacy direct buyer
debit is replaced with `wallet_apply`. Later pricing, enrolment, waitlist and
capacity changes in the function are retained. Non-bootcamp forms keep their
existing owner credit. Gift-plus-wallet payments continue wrapping the same
function atomically.

An installation already calling `settle_bootcamp_payment` is left unchanged.
An unrecognized custom settlement body causes a clear error and rolls back the
migration; inspect the live function before adapting it. Do not replace a live
custom checkout with the older checked-in function just to make installation pass.
No previous registrations, wallet balances or historical earnings are backfilled.

## Deployment

1. Apply `supabase/migrations/20261029130000_short_learning_referral_links.sql`
   in Supabase SQL Editor, or through the normal reviewed migration workflow.
   It requires the existing bootcamp referral/settlement and Zero Form schemas.
2. Deploy the main Zero Club app, including the generated `/s/:code` server route.
3. Deploy Zero Form for its editor/Browse share buttons and attribution capture.

No edge-function deployment or new provider secret is needed. Until the SQL is
installed, signed-in Share/Copy reports that the referral link could not be
created. Existing long public links remain usable but cannot retroactively identify
a sharer when no referral was present.

## Validation

`node --test scripts/learning-referrals.test.mjs`

PostgreSQL tests cover stable per-user/destination codes, form-to-bootcamp
resolution, permissions, self/expired attribution, duplicate visit handling,
actual commission/fee/organiser settlement, zero rewards, coupon exclusion,
migration reruns and safe rejection of unrecognized payment bodies. Frontend
tests cover anonymous-to-signed-in attribution and redirect response behavior.
Main app type checks/build and Zero Form build verify the integration.
Live payout behavior must be checked after the migration and sites are deployed.
