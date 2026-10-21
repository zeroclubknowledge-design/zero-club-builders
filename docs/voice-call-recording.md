# Enable voice-call recording

The old “Call recording isn't switched on yet” message is shown when the
group-call recording RPC is missing from Supabase's API schema. Zero Live
uses a separate recording path, so its Record button can still work.

## Deployment

1. In the existing project's Supabase SQL Editor, run
   `supabase/migrations/20261021220000_enable_group_call_recording.sql`.
   It requires the already-used `20261017200000_group_call_reliability.sql`.
   It is safe to rerun and works even if the optional group-call cards
   migration has not been applied. If applying all migrations, keep date order.
2. Deploy the app changes. Existing clients also work with the repair's
   compatibility RPC. The SQL reloads Supabase's API schema automatically.
3. Start a voice group call as its starter or a group admin, with a second
   participant. Tap Record. Both participants should see REC and the group
   chat should show who started recording. Stop recording and check that
   both voices are audible in the downloaded audio file.
4. Check that ending recording does not end the call, and that leaving during
   recording saves it. Test on the actual Android browser/WebView used by
   members as well as desktop.

Voice recordings mix local and remote audio directly with MediaRecorder;
they do not require a camera or canvas video capture. The browser chooses
a supported format (M4A, WebM audio, or Ogg). Video calls retain video recording.
Recordings save to the recording participant's device, not to a server.

The server announces recording before local capture begins. Failed or
cancelled startup clears that announcement. Only the starter or group admins
can start recording, and only one connection can hold the recording slot.
Announcements are scoped to the call and device connection so delayed
requests from an old call cannot clear a new recording's notice.

Local verification:

```text
node --test scripts/live-recording.test.mjs scripts/group-call-recording.test.mjs scripts/group-call-reliability.test.mjs
```

These tests cover audio/video resource handling, changing participants,
startup cancellation, recording permissions, legacy clients, and stale
call/device requests against PostgreSQL. They do not replace a real two-device
call check after deployment.
