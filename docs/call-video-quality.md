# Club and group video clarity

Group cameras now capture 1280×720 at 30 fps with balanced SDK adaptation.
The secondary camera stream is 640×360 at 15 fps/400 kbps, replacing 320×180.
The first four remote camera tiles use the high stream; speakers outside those
four also receive HD priority. Joining a fifth participant no longer forces all
remote cameras onto the low stream. During screen sharing, the full screen uses
high quality while the 170px camera strip uses the secondary stream. Minimizing
uses lower streams, and restoring recalculates the policy. Audio-only users do
not consume the four camera priorities. Applied policy is cleared on reconnect;
failed stream requests are retried on later policy updates. Existing screen and
camera congestion fallbacks are retained.

Club live rooms start at 720p with balanced encoding and use a 360p companion
stream rather than 240p. In rooms with up to four remote audience cameras, all
those cameras receive high streams. Presenter, tutor and active-speaker priority
continues in larger rooms. Three consecutive poor uplink reports still step the
local camera down one preset to preserve audio. Ten good reports restore one
preset toward the person's selected quality, without exceeding their choice.
Unmeasured network quality does not trigger recovery.

The saved preference key is now `zc-live-camera-quality-v3`. The previous 540p
default was automatically saved for every visitor, so it is replaced by the new
HD default. Other v2 choices are migrated, and all new explicit choices including
540p are honored. Automatic network changes remain session-only.

No database migration is needed. Deploy the frontend and rejoin a call to create
new camera tracks. Existing uploaded chat videos are untouched; this change is
for live video calls. Resolution still depends on camera capability and available
bandwidth. Real multi-device video/audio QA is required after deployment.

Validation: `node --test scripts/call-video-quality.test.mjs scripts/group-call-reliability.test.mjs scripts/group-call-recording.test.mjs`.
