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

/*
 * Long recordings.
 *
 * Recorded video is written to the device's storage (IndexedDB) every two
 * seconds instead of being held in memory, so a class can be recorded for
 * hours without the browser running out of RAM. If storage is unavailable
 * (private browsing, very old browsers) it falls back to memory with a cap.
 *
 * Because every chunk is already on disk, a recording interrupted by a crash
 * or a closed tab can be recovered the next time the room is opened.
 */
export const RECORDING_MAX_MS = 6 * 60 * 60 * 1000; // 6 hours per file
export const RECORDING_MAX_BYTES = 256 * 1024 * 1024; // memory fallback only
export const RECORDING_MAX_DISK_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB per file

/* MP4 (H.264 + AAC) first: it plays on phones, Windows, Mac, WhatsApp and
   every editor. WebM only where the browser cannot make MP4 (Firefox). */
export const recordingMimeType = () => [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp8,opus",
  "video/webm",
].find((type) => MediaRecorder.isTypeSupported(type));

export const recordingExtension = (type: string) => (type.includes("mp4") ? "mp4" : "webm");

/* ── storage ── */
interface ChunkStore {
  readonly disk: boolean;
  add(blob: Blob): Promise<void>;
  finish(type: string): Promise<Blob>;
}

class MemoryStore implements ChunkStore {
  readonly disk = false;
  private chunks: Blob[] = [];
  async add(blob: Blob) { this.chunks.push(blob); }
  async finish(type: string) {
    const blob = new Blob(this.chunks, { type });
    this.chunks = [];
    return blob;
  }
}

const DB_NAME = "zc-live-recordings";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: ["session", "seq"] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});
async function readChunks(db: IDBDatabase, session: string): Promise<Blob[]> {
  const tx = db.transaction("chunks", "readonly");
  const range = IDBKeyRange.bound([session, 0], [session, Number.MAX_SAFE_INTEGER]);
  const request = tx.objectStore("chunks").getAll(range);
  const rows = await new Promise<any[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  return rows.sort((a, b) => a.seq - b.seq).map((row) => row.blob as Blob);
}
async function removeSession(db: IDBDatabase, session: string) {
  const tx = db.transaction(["chunks", "sessions"], "readwrite");
  tx.objectStore("chunks").delete(IDBKeyRange.bound([session, 0], [session, Number.MAX_SAFE_INTEGER]));
  tx.objectStore("sessions").delete(session);
  await done(tx);
}

class DiskStore implements ChunkStore {
  readonly disk = true;
  private seq = 0;
  private queue: Promise<void> = Promise.resolve();
  constructor(private db: IDBDatabase, readonly id: string) {}

  static async create(meta: { title: string; type: string }): Promise<DiskStore | null> {
    try {
      if (typeof indexedDB === "undefined") return null;
      const db = await openDb();
      // Ask the browser not to clear these files under storage pressure.
      void (navigator as any)?.storage?.persist?.().catch?.(() => {});
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put({ id, title: meta.title, type: meta.type, startedAt: Date.now(), finished: false });
      await done(tx);
      return new DiskStore(db, id);
    } catch {
      return null;
    }
  }

  add(blob: Blob) {
    const seq = this.seq++;
    this.queue = this.queue.then(async () => {
      const tx = this.db.transaction("chunks", "readwrite");
      tx.objectStore("chunks").put({ session: this.id, seq, blob });
      await done(tx);
    });
    return this.queue;
  }

  async finish(type: string) {
    await this.queue.catch(() => {});
    const parts = await readChunks(this.db, this.id);
    // Blobs read back from IndexedDB stay on disk; joining them does not load hours of video into memory.
    const blob = new Blob(parts, { type });
    const tx = this.db.transaction("sessions", "readwrite");
    tx.objectStore("sessions").put({ id: this.id, type, finished: true, finishedAt: Date.now() });
    await done(tx).catch(() => {});
    return blob;
  }
}

/** Recordings that were cut off (crash, closed tab, dead battery), ready to save. */
export async function recoverUnfinishedRecordings(): Promise<{ id: string; title: string; startedAt: number; blob: Blob }[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    const tx = db.transaction("sessions", "readonly");
    const request = tx.objectStore("sessions").getAll();
    const sessions = await new Promise<any[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    const out: { id: string; title: string; startedAt: number; blob: Blob }[] = [];
    for (const session of sessions) {
      if (session.finished) {
        // Saved recordings are kept for a day in case the download was missed, then cleared.
        if (Date.now() - (session.finishedAt || 0) > 24 * 60 * 60 * 1000) await removeSession(db, session.id).catch(() => {});
        continue;
      }
      const parts = await readChunks(db, session.id);
      if (!parts.length) { await removeSession(db, session.id).catch(() => {}); continue; }
      out.push({ id: session.id, title: session.title || "Zero Live", startedAt: session.startedAt || Date.now(), blob: new Blob(parts, { type: session.type || "video/webm" }) });
    }
    return out;
  } catch {
    return [];
  }
}

export async function discardRecording(id: string) {
  try { await removeSession(await openDb(), id); } catch { /* best effort */ }
}

/* ── a timer the browser does not slow down in a background tab ── */
function makeTicker(fn: () => void, ms: number): () => void {
  try {
    if (typeof Worker !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: "text/javascript" }));
      const worker = new Worker(url);
      worker.onmessage = () => fn();
      return () => { worker.terminate(); URL.revokeObjectURL(url); };
    }
  } catch { /* fall through */ }
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return `${h ? `${h}:` : ""}${h ? String(m).padStart(2, "0") : m}:${String(s).padStart(2, "0")}`;
};

/** Owns only derived tracks. Never stop or mute the call's original tracks. */
export class LiveRecording {
  private recorder?: MediaRecorder;
  private context?: AudioContext;
  private output?: MediaStream;
  private canvas?: HTMLCanvasElement;
  private stopTicker?: () => void;
  private container?: HTMLDivElement;
  private videos = new Map<MediaStreamTrack, HTMLVideoElement>();
  private audio = new Map<MediaStreamTrack, MediaStreamAudioSourceNode>();
  private store: ChunkStore = new MemoryStore();
  private bytes = 0;
  private startedAt = 0;
  private resolveDone!: (blob: Blob) => void;
  private result: Promise<Blob>;
  private finished = false;
  /** Set once the recorder is running. */
  mimeType = "";
  /** The IndexedDB session id while recording to disk. */
  sessionId: string | null = null;

  constructor(
    private sources: () => RecordingSources,
    private onEnd: (blob: Blob, reason?: string) => void,
  ) {
    this.result = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  async start() {
    try {
      if (typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") {
        throw new Error("Recording is unavailable in this browser. Try Chrome, Edge or Safari.");
      }
      this.canvas = document.createElement("canvas");
      this.canvas.width = 1280;
      this.canvas.height = 720;
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
        ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1_100_000, audioBitsPerSecond: 96_000,
      });
      this.mimeType = this.recorder.mimeType || mimeType || "video/webm";
      const disk = await DiskStore.create({ title: this.sources().title, type: this.mimeType });
      if (this.finished) return;
      if (disk) { this.store = disk; this.sessionId = disk.id; }
      const byteLimit = this.store.disk ? RECORDING_MAX_DISK_BYTES : RECORDING_MAX_BYTES;

      let endReason: string | undefined;
      this.recorder.ondataavailable = ({ data }) => {
        if (!data.size) return;
        this.bytes += data.size;
        this.store.add(data).catch(() => {
          endReason = "Your device ran out of space. The recording so far has been saved.";
          void this.stop();
        });
        if (this.bytes >= byteLimit && this.recorder?.state === "recording") {
          endReason = this.store.disk
            ? "This recording reached its size limit and was saved. Start another recording to continue."
            : "Recording saved at the device memory limit. Start a new recording to continue.";
          void this.stop();
        }
      };
      this.recorder.onerror = () => {
        endReason = "Recording was interrupted. Any captured video has been saved.";
        // MediaRecorder emits a final dataavailable and stop after an error.
      };
      this.recorder.onstop = () => {
        const type = this.mimeType;
        this.finished = true;
        this.cleanup();
        void this.store.finish(type).then((blob) => {
          this.resolveDone(blob);
          this.onEnd(blob, endReason);
        }, () => {
          const empty = new Blob([], { type });
          this.resolveDone(empty);
          this.onEnd(empty, "The recording could not be read back from storage.");
        });
      };
      this.startedAt = Date.now();
      const frame = () => {
        if (this.finished) return;
        try {
          this.draw(compressor);
          if (Date.now() - this.startedAt >= RECORDING_MAX_MS) {
            endReason = "6-hour recording saved. Start another recording to continue.";
            void this.stop();
          }
        } catch {
          endReason = "Recording was interrupted. Any captured video has been saved.";
          void this.stop();
        }
      };
      this.draw(compressor);
      this.recorder.start(2000);
      this.stopTicker = makeTicker(frame, 1000 / 15);
    } catch (error) {
      this.finished = true;
      this.cleanup();
      this.resolveDone(new Blob());
      throw error;
    }
  }

  stop(): Promise<Blob> {
    if (this.finished) return this.result;
    this.stopTicker?.();
    this.stopTicker = undefined;
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    } else if (!this.recorder) {
      this.finished = true;
      this.cleanup();
      this.resolveDone(new Blob());
    }
    return this.result;
  }

  private draw(destination: AudioNode) {
    const W = 1280, H = 720, TOP = 52, BOTTOM = 40;
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
    const screens = visible.filter((v) => v.screen);
    // One shared screen fills the frame with up to four cameras beside it; otherwise a grid.
    const featured = screens.length === 1;
    const layout = featured ? [screens[0], ...visible.filter((v) => !v.screen).slice(0, 4)] : visible;
    const active = new Set(layout.map(({ track }) => track));
    for (const [track, video] of this.videos) {
      if (!active.has(track)) { video.pause(); video.srcObject = null; video.remove(); this.videos.delete(track); }
    }
    const ctx = this.canvas!.getContext("2d")!;
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, W, H);
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(sources.title.slice(0, 80), 20, 34);
    const columns = featured ? 1 : layout.length <= 1 ? 1 : layout.length <= 4 ? 2 : 3;
    const rows = featured ? 1 : Math.max(1, Math.ceil(layout.length / columns));
    const areaH = H - TOP - BOTTOM;
    layout.forEach(({ track, label, screen }, index) => {
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
      let x: number, y: number, w: number, h: number;
      if (featured && index === 0) { x = 0; y = TOP; w = layout.length > 1 ? W - 240 : W; h = areaH; }
      else if (featured) { x = W - 236; y = TOP + (index - 1) * (areaH / 4); w = 232; h = areaH / 4 - 4; }
      else { w = W / columns; h = areaH / rows; x = (index % columns) * w; y = TOP + Math.floor(index / columns) * h; }
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const scale = Math.min((w - 8) / video.videoWidth, (h - 26) / video.videoHeight);
        const vw = video.videoWidth * scale, vh = video.videoHeight * scale;
        ctx.drawImage(video, x + (w - vw) / 2, y + (h - 26 - vh) / 2, vw, vh);
      }
      ctx.fillStyle = "#ffffff";
      ctx.font = "15px sans-serif";
      ctx.fillText(`${label}${screen ? " · Screen" : ""}`.slice(0, 45), x + 10, y + h - 8, w - 20);
    });
    ctx.fillStyle = "#ffffff";
    ctx.font = "15px sans-serif";
    if (!visible.length) ctx.fillText("Live audio · Cameras are off", W / 2 - 100, H / 2);
    ctx.fillText(`Zero Live · ${clock(Date.now() - this.startedAt)}${available.length > 12 ? " · First 12 videos shown" : ""}`, 20, H - 14);
  }

  private cleanup() {
    this.stopTicker?.();
    this.stopTicker = undefined;
    this.videos.forEach((video) => { video.pause(); video.srcObject = null; video.remove(); });
    this.videos.clear();
    this.audio.forEach((node) => node.disconnect());
    this.audio.clear();
    this.output?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.container?.remove();
  }
}
