# ZeroStart shared sign-in

ZeroStart uses the same one-time-code bridge as Zero Form and Zero Gifts. When
there is no local session it checks the signed-in Zero Club account in the same
browser, then creates its own session. Access and refresh tokens are never passed
between applications. Existing ZeroStart sessions are retained.

Both `https://start.zeroclubs.xyz` (the main app's link) and
`https://zerostart.zeroclubs.xyz` (the deployment guide's domain) are explicitly
allowed. Unknown subdomains and local development do not attempt a handoff.

Returning to an unsigned-in tab checks again, throttled to once every 15 seconds.
Signing out of ZeroStart disables automatic sign-in there until the user signs
in manually. If the bridge is unavailable or browser storage restrictions prevent
it from reading the Club session, the usual confirmation-code sign-in is available.

## Deployment

1. Deploy the updated Supabase edge function: `supabase functions deploy sso-handoff`.
2. Deploy the main Zero Club app, including `public/sso-bridge.html`.
3. Deploy ZeroStart with its existing Supabase settings and `VITE_ZERO_CLUB_URL`
   pointing at the actual Zero Club host (default `https://www.zeroclubs.xyz`).

No database migration is needed. Deploying only ZeroStart will not enable the
handoff because both the bridge and edge function must trust the requesting host.

## Account appearance

ZeroStart loads `profiles.theme_mode` and `profiles.dark_theme` after sign-in.
It keeps the cached appearance during the shared sign-in check and restores it
before React loads, including the browser theme colour. It refreshes settings
on tab visibility, desktop window focus and back/forward-cache restoration.
Concurrent return events share a refresh; responses from a previous signed-in
account are ignored after cleanup. Offline refreshes retain the current theme.
System mode follows device changes, and retired Dim values use Black just as
they do in Zero Club. Explicit sign-out resets the appearance cache.

## Verification

Run `node --test scripts/zerostart-sso.test.mjs scripts/zerostart-theme.test.mjs`
and `npm --prefix ZeroStart run build`.
On the deployed apps, sign in to Zero Club, then open ZeroStart in the same browser
and check the profile matches. Also test explicit ZeroStart sign-out, manual
confirmation-code sign-in, and signing in to Club before returning to an open
ZeroStart tab. The automated tests use simulated browser events and do not verify
live deployment or browser-specific storage policies.
