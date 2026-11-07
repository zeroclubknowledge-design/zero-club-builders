import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
let source = ts
  .transpileModule(fs.readFileSync("src/lib/voicePlayback.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  .outputText.replaceAll('"react"', JSON.stringify(import.meta.resolve("react")));
const { createVoicePlayback } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
class AudioStub {
  src = "";
  currentTime = 0;
  duration = 60;
  playbackRate = 1;
  paused = true;
  events = new Map();
  addEventListener(name, fn) {
    this.events.set(name, fn);
  }
  emit(name) {
    this.events.get(name)?.();
  }
  async play() {
    this.paused = false;
    this.emit("play");
    this.emit("playing");
  }
  pause() {
    this.paused = true;
    this.emit("pause");
  }
  removeAttribute() {
    this.src = "";
  }
  load() {}
}
test("voice audio survives inline unsubscribe and switches notes without duplicate playback", async () => {
  const audio = new AudioStub();
  let created = 0;
  const player = createVoicePlayback(() => {
    created++;
    return audio;
  });
  const unsubscribe = player.subscribe(() => {});
  await player.play("first.webm", { duration: 60, origin: "/app/chat" });
  audio.currentTime = 12;
  audio.emit("timeupdate");
  unsubscribe();
  assert.equal(audio.paused, false);
  assert.equal(player.snapshot().position, 12);
  await player.play("second.webm", { duration: 30, origin: "/app/clubs/chat" });
  assert.equal(created, 1);
  assert.equal(player.snapshot().src, "second.webm");
  assert.equal(player.snapshot().position, 0);
  player.pause();
  assert.equal(audio.paused, true);
  await player.play("second.webm");
  assert.equal(player.snapshot().origin, "/app/clubs/chat");
  player.speed();
  assert.equal(audio.playbackRate, 1.5);
  player.seek(100);
  assert.equal(audio.currentTime, 30);
  player.close();
  assert.equal(audio.src, "");
  assert.equal(player.snapshot().src, "");
  assert.equal(audio.paused, true);
});
test("a failed audio start clears loading and can be retried", async () => {
  const audio = new AudioStub();
  audio.play = async () => {
    throw Error("network");
  };
  const player = createVoicePlayback(() => audio);
  await assert.rejects(player.play("note.webm"));
  assert.equal(player.snapshot().loading, false);
  assert.equal(player.snapshot().playing, false);
  assert.ok(player.snapshot().error);
});

test("a note can start at the waveform position chosen before playing", async () => {
  const audio = new AudioStub();
  const player = createVoicePlayback(() => audio);
  await player.play("note.webm", { duration: 60, position: 24, origin: "/app/chat" });
  assert.equal(audio.currentTime, 24);
  assert.equal(player.snapshot().position, 24);
  player.pause();
  await player.play("note.webm");
  assert.equal(audio.currentTime, 24);
});

test("switching notes while the first is loading does not show a false playback error",async()=>{
 const audio=new AudioStub();let rejectFirst;let plays=0;
 audio.play=()=>{if(++plays===1)return new Promise((resolve,reject)=>{rejectFirst=reject;});audio.emit('play');return Promise.resolve();};
 const player=createVoicePlayback(()=>audio);
 const first=player.play('first.webm');await player.play('second.webm');
 rejectFirst(Error('replaced'));await first;
 assert.equal(player.snapshot().src,'second.webm');assert.equal(player.snapshot().error,'');assert.equal(player.snapshot().playing,true);
});
