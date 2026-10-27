# Zero Live

Owns live learning rooms: rooms, recordings, transcription, attendance, and live chat.

Current route entry points include:

- `src/routes/app.live.$classId.tsx`
- `src/components/GlobalLiveRoom.tsx`

## Local recordings

Everyone in a class can record it for themselves (**Record** for hosts, **Record
for myself** for learners). Each recording is independent and runs only on that
person's device: starting, stopping or leaving never affects anyone else's. The
red **REC** badge shows only your own recording; other people's recordings show
as a quiet note under the header ("A host is saving a copy too", "2 people are
saving a copy for themselves").

Saving is instant. The browser records a fragmented MP4; on **Stop**,
`mp4Finalize.ts` writes one standard index (moov, at the front) and points it at
the recorded media in place, as Blob slices that stay on disk. No conversion, no
re-encoding, no ffmpeg, no download of tools. A one-hour, 540 MB recording is
finished in about 0.6 s with no extra memory, and the result passes the WhatsApp
compatibility check. If finishing ever fails, the original recording is saved
as recorded. Firefox's WebM is saved as recorded. The file then downloads
straight to the device (Downloads), with "Download again" for 20 seconds and
crash recovery as below.

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
