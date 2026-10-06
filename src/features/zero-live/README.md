# Zero Live

Owns live learning rooms: rooms, recordings, transcription, attendance, and live chat.

Current route entry points include:

- `src/routes/app.live.$classId.tsx`
- `src/components/GlobalLiveRoom.tsx`

## Local recordings

Hosts select **Record**, then **Stop recording** to save a video. Everyone sees a
red **REC** badge only while a host who is connected right now is recording; the
normal **LIVE** badge is brand pink with a still dot, so the two never look alike.

`recording.ts` draws participant videos and shared screens on a 1280×720 canvas
at 15 fps (a single shared screen fills the frame with cameras beside it) and
mixes live call audio through Web Audio. Original call tracks are never stopped.

Long recordings:
- Video is written to IndexedDB every 2 seconds, not kept in memory, so a class
  can be recorded for hours (up to 6 hours / 8 GB per file, then start another).
  Without IndexedDB it falls back to memory, capped at 256 MB.
- The frame timer runs in a Web Worker, so switching tabs does not slow or stop
  the recording. Only closing the page stops and saves it.
- If the tab crashes or is closed mid-recording, the next visit to a live room
  offers "Save video" for the recovered recording. Saved recordings are kept on
  the device for 24 hours, then cleared.

Format: MP4 (H.264 + AAC) wherever the browser can make it (Chrome, Edge,
Safari), which plays on phones, Windows, Mac, WhatsApp and editors. Firefox can
only record WebM.

## Screen sharing

Several people can present at once. Hosts can switch **Everyone can present**
on, letting learners share without the request-and-approve step. Phone browsers
(Android and iOS) cannot share a screen at all; presenters need a computer.

Run `node --test scripts/live-recording.test.mjs` for recording lifecycle tests.
