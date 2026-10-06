import { useEffect, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";
import { getCachedSession } from "@/lib/auth";

export type VoiceRequest =
  { purpose: "conversation" } | { purpose: "verification"; verificationId: string };
// Both workspaces use this hook. Only one voice session may own this tab's mic.
let activeOwner: symbol | null = null;

export function useVapiVoice() {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [localVolume, setLocalVolume] = useState(0);
  const [assistantVolume, setAssistantVolume] = useState(0);
  const [ended, setEnded] = useState(0);
  const owner = useRef(Symbol("zero-ai-voice"));
  const generation = useRef(0);
  const resources = useRef<{
    sdk?: Vapi;
    stream?: MediaStream;
    abort?: AbortController;
    timer?: ReturnType<typeof setTimeout>;
  }>({});

  function cleanup() {
    const current = resources.current;
    resources.current = {};
    current.abort?.abort();
    if (current.timer) clearTimeout(current.timer);
    current.sdk?.removeAllListeners();
    if (current.sdk) {
      try {
        current.sdk.send({ type: "end-call" });
      } catch {
        /* Room leave also ends the call. */
      }
      void current.sdk.stop().catch(() => {});
    }
    current.stream?.getTracks().forEach((track) => track.stop());
    if (activeOwner === owner.current) activeOwner = null;
  }
  function stop() {
    generation.current++;
    cleanup();
    setStatus("idle");
    setMuted(false);
    setAssistantSpeaking(false);
    setLocalVolume(0);
    setAssistantVolume(0);
  }
  useEffect(
    () => () => {
      generation.current++;
      cleanup();
    },
    [],
  );

  async function start(request: VoiceRequest = { purpose: "conversation" }) {
    if (resources.current.abort) return;
    if (activeOwner && activeOwner !== owner.current) {
      setError("End your other voice session first.");
      return;
    }
    activeOwner = owner.current;
    const version = ++generation.current;
    const abort = new AbortController();
    resources.current.abort = abort;
    const valid = () => version === generation.current;
    setStatus("connecting");
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Voice needs a secure browser with microphone access.");
      // This runs only from the user's Start voice button, never on mount.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!valid()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      resources.current.stream = stream;
      resources.current.timer = setTimeout(() => {
        if (!valid()) return;
        stop();
        setError("The connection timed out. Please try text instead.");
      }, 45000);
      const {
        data: { session },
      } = await getCachedSession();
      if (!valid()) return;
      if (!session) throw new Error("Please sign in to talk to Zero AI.");
      const response = await fetch("/api/zero-ai/vapi/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: abort.signal,
      });
      const data = await response.json();
      if (!valid()) return;
      if (!response.ok)
        throw new Error(data.error || "Couldn't connect to voice. Try text instead.");
      // Lazy loading keeps the voice SDK out of the initial dashboard bundle.
      const module = await import("@vapi-ai/web");
      if (!valid()) return;
      const Constructor = module.default;
      const sdk = new Constructor(data.publicKey, undefined, undefined, {
        audioSource: stream.getAudioTracks()[0],
      });
      resources.current.sdk = sdk;
      sdk.on("call-start", () => {
        if (!valid()) return;
        if (resources.current.timer) clearTimeout(resources.current.timer);
        setStatus("connected");
        resources.current.timer = setTimeout(
          stop,
          Math.min(data.maxDurationSeconds || 120, 600) * 1000,
        );
      });
      sdk.on("speech-start", () => {
        if (valid()) setAssistantSpeaking(true);
      });
      sdk.on("speech-end", () => {
        if (valid()) setAssistantSpeaking(false);
      });
      sdk.on("volume-level", (volume) => {
        if (valid()) setAssistantVolume(Math.max(0, Math.min(1, volume)));
      });
      sdk.on("local-volume-level", (volume) => {
        if (valid()) setLocalVolume(Math.max(0, Math.min(1, volume)));
      });
      sdk.on("call-end", () => {
        if (!valid()) return;
        stop();
        setEnded((n) => n + 1);
      });
      sdk.on("error", () => {
        if (!valid()) return;
        stop();
        setError("The voice connection failed. You can continue with text.");
      });
      // Join the exact server-created room. No client assistant/prompt overrides.
      await sdk.reconnect(data.call);
      if (!valid()) {
        await sdk.stop().catch(() => {});
        return;
      }
    } catch (cause) {
      if (!valid()) return;
      stop();
      setError(
        cause instanceof Error && cause.name === "NotAllowedError"
          ? "Microphone access was denied. You can use text instead."
          : cause instanceof Error
            ? cause.message
            : "Couldn't connect to voice. Try text instead.",
      );
    }
  }
  function toggleMute() {
    const next = !muted;
    resources.current.sdk?.setMuted(next);
    resources.current.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  }
  function enableAudio() {
    void resources.current.sdk
      ?.getAudioPlayer()
      ?.play()
      .then(() => setError(""))
      .catch(() => setError("Tap Enable audio to allow playback."));
  }
  return {
    status,
    error,
    muted,
    assistantSpeaking,
    localVolume,
    assistantVolume,
    ended,
    start,
    stop,
    toggleMute,
    enableAudio,
  };
}
