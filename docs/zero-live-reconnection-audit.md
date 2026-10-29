# Zero Live reconnection audit — 28 October 2026

## Result

The user clarified that the failure starts immediately on joining. A subsequent
isolated headless Chrome test reproduced an initial join failure using the
installed Agora SDK, the deployed token service, and the production Zero Club
website origin. The SDK reported `CAN_NOT_GET_GATEWAY_SERVER` with flag `4096`
and description `unknown error`. State changed from `CONNECTING` directly to
`DISCONNECTED`; it never reached `CONNECTED`.

Multiple Agora gateway hosts answered their HTTPS signaling requests with HTTP
200, but the response envelope contained a `502` entry in its `detail` map. The
outer HTTP success does not mean channel admission succeeded. This establishes
an initial signaling/gateway failure in the tested environment. It does not
establish a specific certificate, billing, account-status or network-route cause
for the gateway failure, or prove the same underlying condition on every device.

The confirmed client recovery and error-reporting defects below also conceal
join failures and make recovery unreliable. Long-call token renewal and mobile
backgrounding are not sufficient explanations for an immediate failure.

This audit changes no calling behavior.

**29 October follow-up:** App recovery changes have now been implemented after
the user requested a repair. See `zero-live-gateway-repair.md` for the code
changes and the project-owner checks still needed. A fresh production-origin
diagnostic reproduced the gateway failure; successful call admission has not
been verified.

## Confirmed findings

### High: club live discards initial join failures

`src/components/GlobalLiveRoom.tsx:559` calls `useJoin` without using its returned
error, loading state or connection state. The installed `agora-rtc-react` 2.5.1
hook catches join exceptions and returns them to the caller. It does not retry a
failed join merely because the component renders again. The room's separate
connection state starts as `CONNECTED` at line 787, even before a successful join.
The participant can therefore see a normal classroom when authentication or
signaling never connected.

### High: club live has no recovery when SDK reconnection ends

At lines 800–838 the connection listener records only the current state, dropping
the previous state and disconnect reason. There is no handler that rejoins a
terminally disconnected client, no bounded recovery controller, and no online or
foreground event that restores the RTC connection. `useMicRecovery` only repairs
the microphone capture device; it does not reconnect the RTC client.

At line 2384 the only connection banner is for `RECONNECTING`; it gives an
unconditional assurance that the person will return and provides no action.
If the SDK changes to `DISCONNECTED`, that banner disappears without explaining
why the connection failed. Ordinary network blips are left to SDK recovery;
failure after that mechanism stops is not handled by the application.

### High: token refresh failures are silently lost

At lines 818–825, club live token renewal discards the `error` returned by
`supabase.functions.invoke`, skips renewal if the response has no token and
provides neither retry nor user feedback. Supabase function errors need not throw
an exception, so the catch does not cover this path. Both expiry events share
the same unguarded request, allowing overlapping refreshes. The code always calls
`renewToken`; it does not distinguish a connection that has already disconnected
and needs a new join.

### Medium: group automatic retry can stop after one failure

`src/features/groups/GroupCallHost.tsx:375–381` schedules recovery only when
`connectionState` changes to `DISCONNECTED` after a prior successful connection.
If refreshing a token or joining fails while the client stays `DISCONNECTED`,
there is no new state change to schedule another attempt. Its backoff counter
does not create a continuing retry loop. Initial join failures also bypass that
automatic path because `connectedOnce` is false. Group calls do expose a manual
Reconnect button, unlike club lives.

### Separate security finding: the deployed token function accepts anonymous callers

A public-anon-key request to the deployed `agora-token` function returned a
publisher token for an isolated audit channel. The checked-in function also
does not authenticate the user or check club/group membership. Client route
membership checks do not restrict direct calls to the token service. This is
not evidence for the reported reconnecting symptom, but requires a separate
server authorization fix across all supported channel types. No existing live
channel was joined and no participant audio or video was accessed during testing.

## Live checks

- The deployed `agora-token` endpoint returned HTTP 200 with an AccessToken2
  (`007`) token for the isolated audit request.
- Parsed application ID matched the client ID. Token duration and RTC privilege
  offsets were two hours. Tokens and signature bytes were not printed or saved.
- This rules out a missing endpoint, a missing certificate response, an obvious
  application-ID mismatch in the issued token, and an immediately expired token
  for that request. It does **not** prove Agora accepts the signing certificate,
  that the account has usable service quota, or that the affected device can
  reach Agora signaling/media servers.
- No video-blocking CSP was present on the checked live page. The checked-in
  service worker bypasses cross-origin requests, including Agora requests.
- The database theme/SSO server deployment from the preceding work is separate
  from video signaling. Deploying `sso-handoff` does not modify `agora-token`.
- Two attempts to start the in-app browser failed because its runtime exited.
  An isolated installed Chrome profile was subsequently used for a real SDK
  join attempt. It reproduced the failure both on localhost and from the actual
  `https://www.zeroclubs.xyz` origin, ruling out a localhost-only origin restriction
  for this test. No camera/microphone permissions were requested, no tracks were
  captured or published, and only random empty diagnostic channels were used.
- Device network transitions and a successful connected call remain unverified.

## Repeatable startup diagnostic

Run `node scripts/audit-live-join.mjs --production-origin` from this workspace.
It uses the installed Chrome browser in a separate temporary profile and the
installed Agora SDK. `CHROME_PATH` can override the default Chrome executable.
It prints connection states, a redacted join error, and selected gateway response
metadata. It never prints the issued token or network IP addresses. It does not
use an existing browser account or join an existing live session. It removes its
temporary browser profile when finished.

The token endpoint currently permits the anon-key request used by this diagnostic.
After the server authorization fix, this script should fail at token acquisition
until it is adapted to an authorized test account and empty test room.

## Recommended repair and verification

1. Capture join errors and SDK state/reason without recording tokens. Show an
   honest connecting/reconnecting/disconnected state and actionable recovery.
2. Use one serialized token/reconnection controller, bounded timeouts and
   backoff, triggered by expiry, terminal disconnect, online and foreground
   return. Preserve the assigned RTC UID and participant mic/camera choices.
   Leave SDK automatic reconnection alone during short interruptions. Do not
   close local capture tracks as part of a retry or restart an intentional leave.
3. Stop retrying on terminal bans/configuration/authentication failures and
   show the appropriate reason. Do not promise recovery for every error.
4. Test actual network loss/restoration, Wi-Fi/mobile-data changes, background
   return, initial invalid token, expired token, failed renewal, repeated retry,
   simultaneous expiry events and Leave during a pending reconnect.
5. Capture the affected device's join error or disconnect reason before
   attributing its original drop to certificate settings, account limits or its
   network. The audit's metadata-only HTTP check cannot replace this test.

No production code, configuration or database changes were deployed by this audit.
