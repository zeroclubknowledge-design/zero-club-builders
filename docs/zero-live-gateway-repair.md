# Zero Live gateway repair

The production-origin join check on 29 October 2026 still failed before media
capture with `CAN_NOT_GET_GATEWAY_SERVER`, flag `4096`, description `unknown error`.
Agora's HTTPS gateway endpoints answered, but their response envelope included a
`502` detail. The exact account/configuration/routing cause is not established.
Issuing a token successfully does not prove Agora accepts it.

## Project-owner checks

1. Open https://console.agora.io/ and find the project with App ID
   `bfd9392ddcbc425e8946e8011ac2820b`, which is currently used by both call clients.
2. Confirm the project is active and its RTC service is available. Check account
   notifications, usage, balance and any suspension/limit notices. Do not enable
   or purchase the separate RTMP Media Gateway product just because the error
   mentions a gateway: Zero Live uses the RTC Web SDK.
3. Compare the App ID and an enabled certificate from **that same project** with
   Supabase Edge Function secrets `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE`.
   Re-enter the matching values if they are uncertain. Keep the certificate in
   Supabase, never in frontend environment variables, source, screenshots or chat.
   Do not rotate/delete certificates as a diagnostic step.
4. If the desired Agora project has a different App ID, the frontend constants in
   `GlobalLiveRoom.tsx` and `GroupCallHost.tsx` must be updated as well. Changing
   only the server secret would introduce a client/token mismatch.
5. From **Command Prompt**, deploy the token function from the correct folder:

   ```cmd
   cd /d "C:\Users\user\Downloads\New Zero Club APK"
   npx --yes supabase functions deploy agora-token --project-ref tiyifgfsuzhcvdvntjmp
   ```

6. Deploy the main app to activate the recovery changes. Close/reopen the call
   and run `node scripts/audit-live-join.mjs --production-origin` to verify channel
   admission, rather than treating a successful token HTTP response as success.
7. If project/certificate checks are correct and the join still fails, compare
   another network and contact Agora support with the SDK error, date/time and
   App ID. Do not send tokens or the certificate. Agora may need to inspect the
   project's gateway rejection; the generic description cannot identify it.

No SQL migration is required. The SSO `sso-handoff` deployment does not update
video calls; `agora-token` is a separate function.

## App changes in this repair

- The club live room now observes initial join errors and actual connection state.
- Club and group calls share bounded recovery with fresh tokens and serialized
  renewal, including foreground/online checks and a manual reconnect action.
- Rejoined participants retain their RTC UID. Previously published media tracks
  are restored without changing mic/camera mute choices.
- Token requests have a 15-second cancellation deadline. Intentional leave and
  unmount cancel recovery; an in-flight rejoin cannot silently revive a left call.
- SDK configuration/banning failures stop automatic retry; raw SDK error text is
  replaced with account-appropriate connection messages without tokens.

These changes improve failure handling. They do **not** correct an invalid
provider certificate, restore a suspended provider account or resolve an Agora
gateway failure on their own. Successful real call admission remains required.

## Checks

`node --test scripts/rtc-recovery.test.mjs` covers failed initial join, continued
retries without state changes, attempt limits, duplicate expiry events, UID/media
restoration, terminal failures, cancellation, intentional leave and message safety.

References:
- https://github.com/AgoraIO/docs-portal/blob/main/content/docs/en/realtime-media/voice/reference/error-codes.mdx
- https://docs-legacy.agora.io/en/voice-calling/get-started/manage-agora-account
- https://agoraio.zendesk.com/hc/en-us/articles/46605959557652-App-ID-and-Token-Mismatch-Error-Resolved-by-Correcting-URL-Endpoint-Configuration
- https://status.agora.io/
