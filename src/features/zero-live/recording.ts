export interface RecordingVideo {
  track: MediaStreamTrack;
  label: string;
  screen?: boolean;
}
export interface RecordingSources {
  videos: RecordingVideo[];
  audio: MediaStreamTrack[];
  title: string;
}
export const RECORDING_MAX_BYTES = 128 * 1024 * 1024;
export const RECORDING_MAX_MS = 30 * 60 * 1000;
export const recordingMimeType = () => [
  "video/webm;codecs=vp8,opus", "video/webm", "video/mp4",
].find((type) => MediaRecorder.isTypeSupported(type));

/** Owns only derived tracks. Never stop or mute the call's original tracks. */
export class LiveRecording {
  private recorder?: MediaRecorder;
  private context?: AudioContext;
  private output?: MediaStream;
  private canvas?: HTMLCanvasElement;
  private timer?: ReturnType<typeof setInterval>;
  private container?: HTMLDivElement;
  private videos = new Map<MediaStreamTrack, HTMLVideoElement>();
  private audio = new Map<MediaStreamTrack, MediaStreamAudioSourceNode>();
  private chunks: Blob[] = [];
  private bytes = 0;
  private startedAt = 0;
  private done!: (blob: Blob) => void;
  private result: Promise<Blob>;
  private finished = false;

  constructor(
    private sources: () => RecordingSources,
    private onEnd: (blob: Blob, reason?: string) => void,
  ) {
    this.result = new Promise((resolve) => { this.done = resolve; });
  }

  async start() {
    try {
      if (typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") {
        throw new Error("Recording is unavailable in this browser. Try Chrome, Edge or Safari.");
      }
      this.canvas = document.createElement("canvas");
      this.canvas.width = 960;
      this.canvas.height = 540;
      if (!this.canvas.captureStream || !this.canvas.getContext("2d")) {
        throw new Error("This browser cannot record live video. Try another browser.");
      }
      this.container = document.createElement("div");
      this.container.setAttribute("aria-hidden", "true");
      this.container.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none";
      document.body.append(this.container);
      this.context = new AudioContext();
      await this.context.resume();
      // Leaving while the browser resumes audio must not start a stray recorder.
      if (this.finished) return;
      const destination = this.context.createMediaStreamDestination();
      const compressor = this.context.createDynamicsCompressor();
      compressor.connect(destination);
      this.output = this.canvas.captureStream(15);
      destination.stream.getAudioTracks().forEach((track) => this.output!.addTrack(track));
      const mimeType = recordingMimeType();
      this.recorder = new MediaRecorder(this.output, {
        ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 64_000,
      });
      let endReason: string | undefined;
      this.recorder.ondataavailable = ({ data }) => {
        if (!data.size) return;
        this.chunks.push(data);
        this.bytes += data.size;
        if (this.bytes >= RECORDING_MAX_BYTES && this.recorder?.state === "recording") {
          endReason = "Recording saved at the device memory limit. Start a new recording to continue.";
          void this.stop();
        }
      };
      this.recorder.onerror = () => {
        endReason = "Recording was interrupted. Any captured video has been saved.";
        // MediaRecorder emits a final dataavailable and stop after an error.
      };
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder!.mimeType || mimeType || "video/webm" });
        this.chunks = [];
        this.finished = true;
        this.cleanup();
        this.done(blob);
        this.onEnd(blob, endReason);
      };
      this.startedAt = Date.now();
      const frame = () => {
        if (this.finished) return;
        try {
          this.draw(compressor);
          if (Date.now() - this.startedAt >= RECORDING_MAX_MS) {
            endReason = "30-minute recording saved. Start another recording to continue.";
            void this.stop();
          }
        } catch {
          endReason = "Recording was interrupted. Any captured video has been saved.";
          void this.stop();
        }
      };
      this.draw(compressor);
      this.recorder.start(2000);
      this.timer = setInterval(frame, 1000 / 15);
    } catch (error) {
      this.finished = true;
      this.cleanup();
      this.done(new Blob());
      throw error;
    }
  }

  stop(): Promise<Blob> {
    if (this.finished) return this.result;
    if (this.timer) clearInterval(this.timer);
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    } else if (!this.recorder) {
      this.finished = true;
      this.cleanup();
      this.done(new Blob());
    }
    return this.result;
  }

  private draw(destination: AudioNode) {
    const sources = this.sources();
    const audio = new Set(sources.audio.filter((track) => track.readyState === "live"));
    for (const [track, node] of this.audio) {
      if (!audio.has(track)) { node.disconnect(); this.audio.delete(track); }
    }
    for (const track of audio) {
      if (!this.audio.has(track)) {
        const node = this.context!.createMediaStreamSource(new MediaStream([track]));
        node.connect(destination);
        this.audio.set(track, node);
      }
    }
    const available = sources.videos.filter(({ track }) => track.readyState === "live");
    const visible = [...available].sort((a, b) => Number(b.screen) - Number(a.screen)).slice(0, 12);
    const active = new Set(visible.map(({ track }) => track));
    for (const [track, video] of this.videos) {
      if (!active.has(track)) { video.pause(); video.srcObject = null; video.remove(); this.videos.delete(track); }
    }
    const ctx = this.canvas!.getContext("2d")!;
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, 960, 540);
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(sources.title.slice(0, 80), 16, 28);
    const columns = visible.length <= 1 ? 1 : visible.length <= 4 ? 2 : 3;
    const rows = Math.max(1, Math.ceil(visible.length / columns));
    const width = 960 / columns, height = 460 / rows;
    visible.forEach(({ track, label, screen }, index) => {
      let video = this.videos.get(track);
      if (!video) {
        video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = new MediaStream([track]);
        this.container!.append(video);
        void video.play().catch(() => { /* Retry when another frame arrives. */ });
        this.videos.set(track, video);
      }
      const x = (index % columns) * width, y = 44 + Math.floor(index / columns) * height;
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const scale = Math.min((width - 8) / video.videoWidth, (height - 28) / video.videoHeight);
        const w = video.videoWidth * scale, h = video.videoHeight * scale;
        ctx.drawImage(video, x + (width - w) / 2, y + (height - 28 - h) / 2, w, h);
      }
      ctx.fillStyle = "#ffffff";
      ctx.font = "14px sans-serif";
      ctx.fillText(`${label}${screen ? " · Screen" : ""}`.slice(0, 45), x + 10, y + height - 9, width - 20);
    });
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px sans-serif";
    if (!visible.length) ctx.fillText("Live audio · Cameras are off", 340, 270);
    ctx.fillText(`Zero Live · ${Math.floor((Date.now() - this.startedAt) / 1000)}s${available.length > 12 ? " · First 12 videos shown" : ""}`, 16, 528);
  }

  private cleanup() {
    if (this.timer) clearInterval(this.timer);
    this.videos.forEach((video) => { video.pause(); video.srcObject = null; video.remove(); });
    this.videos.clear();
    this.audio.forEach((node) => node.disconnect());
    this.audio.clear();
    this.output?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.container?.remove();
  }
}
