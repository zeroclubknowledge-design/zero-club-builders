# Shareable video downloads

Downloads from posts, chat actions and the media viewer, native file sharing,
live-call recordings and recovered recordings use the shared MP4 export path.
The original video is processed on the user's device, not sent to a third party.

The exporter probes the real streams, copies compatible H.264/yuv420p video and
AAC audio, and converts other readable formats to H.264 Main/yuv420p with AAC
stereo audio. Converted video is limited to 1280 pixels on its longest side and
30 fps. Compatible H.264 up to 1920 pixels is remuxed without re-encoding. MP4
metadata is placed before video data (`faststart`). The encoder must finish
successfully before a download starts. Output is checked for an MP4 container.

Old WebM files incorrectly labeled as MP4 are detected from their bytes and
converted on download. Previously saved files on a user's phone are not changed;
download those videos again after deploying the fix.

The single-thread FFmpeg worker requires no cross-origin isolation headers.
The package, worker, core JavaScript and WASM are served from the app's own
origin, with content-hashed URLs. WASM is split into assets no larger than 16 MiB
and reassembled on the device to fit the host's individual file limit. The
~32 MB core is loaded only when exporting,
and excluded from service-worker precaching so opening the app does not download
the encoder. Keep all emitted engine parts and the core script available when
deploying. No external codec CDN or server keys are required.

Conversion is queued one file at a time and its worker/memory is released after
each job. Download progress and cancellation are available; long live recordings
also show saving progress. Native sharing can lose user activation while a video
is prepared; in that case the same prepared file is downloaded, without fetching
or converting it twice.

Device conversion accepts inputs up to 512 MiB and runs for at most 30 minutes.
Corrupt, unsupported or oversized inputs show an error and an explicit **Save
original** option with the actual container extension. This option does not imply
social-app compatibility. Larger recordings need a server-side video processing
service for guaranteed MP4 conversion; no such service is configured here.

Dependencies: `@ffmpeg/ffmpeg` 0.12.15 (MIT) and `@ffmpeg/core` 0.12.10
(GPL-2.0-or-later), including libx264. Upstream source, build instructions and
licenses: https://github.com/ffmpegwasm/ffmpeg.wasm and
https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/packages/core.

Validation: `node --test scripts/video-downloads.test.mjs scripts/live-recording.test.mjs scripts/chat-attachments.test.mjs scripts/message-actions.test.mjs`.
The encoder test creates and fully decodes a 20-second WebM-to-MP4 export with
sound, checks H.264/AAC streams, duration and faststart metadata ordering.
Browser checks cover both development and bundled production worker playback.
Physical Android/iOS sharing into third-party apps still requires device QA.
