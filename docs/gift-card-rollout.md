# Gift card update

Apply these database migrations in order **before deploying the app**:

1. `20261018090000_multi_claim_gift_cards.sql`
2. `20261018100000_zero_form_gift_payment.sql`
3. `20261018110000_universal_gift_checkout.sql`
4. `20261018120000_admin_sponsored_gift_cards.sql`

They depend on the existing gift, wallet, Zero Form and club payment migrations. No external API or new secret is required.

If the first migration previously failed with `column "remaining_amount" does not exist`, run the entire updated `20261018090000_multi_claim_gift_cards.sql` again. It now installs missing gift-balance columns and the redemption table itself. Its transaction rolls back a failed attempt; rerunning the updated file preserves existing spent balances. Do not run the old restricted-balance migration afterwards, as its legacy backfill can restore already-spent gifts.

If universal checkout failed with `type "public.zero_gift_payment_receipts" does not exist`, its receipt table was missing. The updated universal checkout file now creates and secures that table before defining its function, and safely preserves receipts on reruns. Still run the complete updated multi-claim migration successfully first: checkout requires its gift balance and consumption functions at payment time, in addition to this receipt table. Run each entire file from `begin;` through `commit;` in the same Supabase project.

Regular accounts reserve `amount per person × quantity` from their wallet. Zero Club platform admins instead create platform-sponsored gifts without a wallet debit or balance requirement. The server checks the existing protected `is_zero_club_admin()` role; club/bootcamp admins do not qualify. Funding origin is recorded permanently so closing a sponsored gift never pays a personal wallet refund, even after an admin role change. Previously wallet-funded gifts keep their original refund terms. If the first three migrations already succeeded, apply only migration 4 for this admin update, then deploy the UI. If rerunning the full sequence, always apply migration 4 last.

Claims are serialized against the campaign, with one receipt per account. The creator cannot claim their own card. Creation and payment request identifiers prevent retries from charging twice.

Both claiming and spending expire. New flexible credit is separate from wallet cash, so expiry does not remove a member's money. Existing undated gifts keep their previous terms; money already credited to a wallet is not retroactively removed.

Bootcamp restrictions are checked at balance lookup and consumption. Zero Form uses the native registration/payment function inside an atomic gift-funding transaction, preserving its existing price, capacity, guest and enrolment rules. Failed payments roll back provisional gift funding and preserve the native pending registration flow.

Existing integrated purchases use the shared funding primitive. Club and fund-link payments use a whitelisted gateway. Gift credit cannot be withdrawn or used to fund a new gift or refundable prize/budget through that gateway. Cancelling remaining claims returns only unclaimed slot value; claimed credit keeps its expiry.

Validation: `node --test scripts/multi-claim-gifts.test.mjs`, TypeScript check, production build, and simulated mobile/desktop creation, claim and checkout checks. Check two real accounts after deployment, especially a deadline passing with partially spent credit and a Zero Form registration with a gift/wallet split.

An existing unrelated assertion in `scripts/admin-user-gifts.test.mjs` expects two plans for a learner, while the current catalog permits three non-institution plans. That pre-existing assertion was not changed by this update.
