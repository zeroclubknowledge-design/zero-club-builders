# Product accounts and claimed Zero Cards

## Account switching

Zero Form and Zero Gifts profile pictures open a responsive account dialog.
It shows the current account and the logins already added to Zero Club in the
same browser, including their names and avatars. The current account is marked;
another account can be selected directly. Manage accounts opens Zero Club.

The sign-in bridge serves explicit account metadata only to allowlisted product
origins. It looks up a selected account in Zero Club's own saved-account store,
validates/refreshes that login using an isolated auth client, and requests the
existing one-time-code handoff. Saved access/refresh tokens never go to either
product. Selecting an arbitrary profile ID cannot mint a handoff. Expired or
revoked logins require signing in again in Zero Club.

Switching the standalone product does not change the account in an open main
Zero Club tab. The product clears queries and old profile state, ignores stale
profile responses, applies the new profile theme and reloads its current route
under the selected login. Existing drafts remain subject to their account keys.
Auth callback profile reads are deferred until Supabase's session lock is released.

Accounts are the browser-saved logins used by the existing main-app switcher;
this does not create a new server-side relationship between unrelated users or
make a saved login on one device available on every device.

## Gift payments

Manual gift-code entry is removed from the shared checkout component, main
wallet/gift screens and Zero Gifts received page. Gift links and browse-card
claim buttons continue working; their existing internal code identifies the link
and is never something a customer has to type at checkout.

All three copies of `ZeroGiftPaymentOption` offer **Apply available Zero Cards**.
The existing authenticated `get_my_zero_gift_balance_v2` quote determines which
owned, claimed, unexpired cards match the service and optional bootcamp context.
Selecting credit displays the eligible gift portion and the wallet remainder.
The existing atomic server checkout still enforces restrictions, expiry,
available funds and rollback. The UI never broadens a card's purpose or converts
restricted credit to wallet cash. Gift lookup failures are shown, not silently
presented as an empty balance; stale values are hidden while the quote fails.

Checkout has no browse link or external navigation: applying eligible gift credit
happens in place. Other main-app gift links lead to `/app/gifts` inside Zero Club.
The standalone Gifts browse link also stays in its current app. The account-scoped
quote refetches on window focus when gifts have been claimed elsewhere.

## Deployment

Deploy the main Zero Club app (including `public/sso-bridge.html`), Zero Form and
Zero Gifts together. The bridge needs the new account-list/switch actions.
The existing deployed `sso-handoff` function already authenticates the selected
login and supports these origins: **no new edge-function deployment or SQL
migration is required for this change**. Existing gift-checkout migrations must
already be installed, as they were for the previous direct gift payment feature.

Until the main bridge is updated, the picker reports that it cannot retrieve
accounts rather than substituting another account's credentials.

## Validation

`node --test scripts/shared-product-accounts.test.mjs scripts/gift-claim-expiry-ui.test.mjs scripts/multi-claim-gifts.test.mjs`

Tests cover account metadata isolation, one-time handoffs, unknown/expired
accounts, exact message source/origin/nonce checks, retained ZeroStart SSO,
identical product copies and existing PostgreSQL gift scope/wallet/expiry rules.
Production builds of both standalone apps and the main app type check validate
the integration. Real account switching across the deployed browser origins must
be checked after all three sites are deployed; automated tests use fake logins.
