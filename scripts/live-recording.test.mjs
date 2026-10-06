import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function environment({ unsupported = false, blocked = false, resume } = {}) {
  const nodes = [], videos = [], intervals = new Map(), recorders = [], owned = [];
  let now = 0, next = 0;
  const track = (kind, id) => ({ kind, id, readyState: "live", stops: 0, stop() { this.stops++; } });
  class Stream {
    constructor(tracks = []) { this.tracks = [...tracks]; }
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter((t) => t.kind === "audio"); }
    addTrack(t) { this.tracks.push(t); }
  }
  const ctx = { fillRect() {}, fillText() {}, drawImage() {} };
  const document = {
    body: { append() {} },
    createElement(type) {
      if (type === "canvas") return { getContext: () => ctx, ...(unsupported ? {} : { captureStream() {
        const t = track("video", "derived-canvas"); owned.push(t); return new Stream([t]);
      } }) };
      if (type === "video") {
        const v = { readyState: 2, videoWidth: 640, videoHeight: 360, play: async () => {}, pause() {}, remove() {} };
        videos.push(v); return v;
      }
      return { style: {}, setAttribute() {}, append() {}, remove() {} };
    },
  };
  class Audio {
    state = "running";
    resume() { return resume ? resume() : Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createMediaStreamDestination() {
      const t = track("audio", "derived-mix"); owned.push(t); return { stream: new Stream([t]) };
    }
    createDynamicsCompressor() { return { connect() {} }; }
    createMediaStreamSource(stream) {
      const node = { track: stream.getTracks()[0], disconnected: false, connect() {}, disconnect() { this.disconnected = true; } };
      nodes.push(node); return node;
    }
  }
  class Recorder {
    state = "inactive";
    mimeType = "video/webm";
    static isTypeSupported(type) { return type.startsWith("video/webm"); }
    constructor() { if (blocked) throw new Error("Encoder unavailable"); recorders.push(this); }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable({ data: new Blob(["final-chunk"]) });
      this.onstop();
    }
  }
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(new URL("../src/features/zero-live/recording.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, Blob, MediaStream: Stream, MediaRecorder: Recorder, AudioContext: Audio, document,
    Date: { now: () => now }, setInterval(fn) { intervals.set(++next, fn); return next; }, clearInterval(id) { intervals.delete(id); },
  });
  return { ...exports, track, nodes, videos, owned, recorders, intervals,
    tick(ms = 100) { now += ms; [...intervals.values()].forEach((fn) => fn()); },
  };
}

test("records changing participant streams, removes muted sources and never stops call tracks", async () => {
  const e = environment();
  const mic = e.track("audio", "mic"), remote = e.track("audio", "remote"), camera = e.track("video", "camera"), screen = e.track("video", "screen");
  let sources = { title: "Class", audio: [mic], videos: [{ track: camera, label: "Tutor" }] };
  let saved;
  const recording = new e.LiveRecording(() => sources, (blob) => { saved = blob; });
  await recording.start();
  assert.equal(e.recorders.length, 1);
  assert.equal(e.nodes[0].track, mic);
  sources = { title: "Class", audio: [remote], videos: [{ track: screen, label: "Learner", screen: true }] };
  e.tick();
  assert.equal(e.nodes[0].disconnected, true);
  assert.equal(e.nodes[1].track, remote);
  assert.equal(e.videos[0].srcObject, null);
  const blob = await recording.stop();
  assert.equal(await blob.text(), "final-chunk");
  assert.equal(saved, blob);
  assert.equal(await recording.stop(), blob);
  assert.equal(e.intervals.size, 0);
  assert.ok(e.owned.every((t) => t.stops === 1));
  assert.ok([mic, remote, camera, screen].every((t) => t.stops === 0));
});

test("unsupported browsers and encoder failures release all derived resources", async () => {
  for (const options of [{ unsupported: true }, { blocked: true }]) {
    const e = environment(options);
    const recording = new e.LiveRecording(() => ({ title: "Class", audio: [], videos: [] }), () => assert.fail("Should not save failed startup"));
    await assert.rejects(recording.start());
    assert.equal(e.intervals.size, 0);
    assert.ok(e.owned.every((t) => t.stops === 1));
    assert.equal((await recording.stop()).size, 0);
  }
});

test("leaving during audio startup cannot create a recorder afterward", async () => {
  let resume;
  const e = environment({ resume: () => new Promise((resolve) => { resume = resolve; }) });
  const recording = new e.LiveRecording(() => ({ title: "Class", audio: [], videos: [] }), () => {});
  const started = recording.start();
  await recording.stop();
  resume();
  await started;
  assert.equal(e.recorders.length, 0);
  assert.equal(e.intervals.size, 0);
});

test("time and memory limits finalize partial recordings with a reason", async () => {
  for (const limit of ["time", "memory"]) {
    const e = environment();
    let reason;
    const recording = new e.LiveRecording(() => ({ title: "Class", audio: [], videos: [] }), (_, message) => { reason = message; });
    await recording.start();
    if (limit === "time") e.tick(e.RECORDING_MAX_MS);
    else e.recorders[0].ondataavailable({ data: { size: e.RECORDING_MAX_BYTES } });
    await recording.stop();
    assert.ok(reason);
    assert.equal(e.recorders[0].state, "inactive");
    assert.equal(e.intervals.size, 0);
  }
});
