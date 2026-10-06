# Zero Live

Owns live learning rooms: rooms, recordings, transcription, attendance, and live chat.

Current route entry points include:

- `src/routes/app.live.$classId.tsx`
- `src/components/GlobalLiveRoom.tsx`

## Local recordings

Tutors and live-room hosts can select **Record**, then **Stop recording** to
download a video. Everyone sees the host's recording status through room
presence, including people who join while a recording is underway.

`recording.ts` combines subscribed participant videos and shared screens on a
960×540 canvas at 15 fps, and mixes live call audio through Web Audio. Muted
local microphones are excluded. Sources update when people join, leave, mute,
change devices or present. Up to 12 video feeds appear, with screens first;
all connected audio feeds are mixed. Screen/system audio is included only if
it is already published in the call; the current screen-sharing flow publishes
video only. Original call tracks are never stopped by the recorder.

No API key, recording service or upload is required. Files use WebM or MP4
depending on browser support. A download link remains in the room after saving.
Recording also finalizes on Leave, backgrounding or teardown. Keep the app
visible: browser/device suspension and closing the tab can interrupt local
recording and downloads. A local recording cannot survive a browser crash.

To limit mobile memory use, each recording stops and saves at 30 minutes or
128 MiB. Start another recording to continue. This feature records the media
received by the host, so it cannot capture streams the host has not subscribed
to. It does not record chat or other dashboard UI.

Run `node --test scripts/live-recording.test.mjs` for recording lifecycle tests.
