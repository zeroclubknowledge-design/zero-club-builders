import { useEffect, useRef, useState } from "react";
import { getCachedSession } from "@/lib/auth";

export function useVoiceConversation() {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const resources = useRef<{
    peer?: RTCPeerConnection;
    stream?: MediaStream;
    audio?: HTMLAudioElement;
    abort?: AbortController;
    timer?: ReturnType<typeof setTimeout>;
  }>({});
  const generation = useRef(0);

  function cleanup() {
    const current = resources.current;
    resources.current = {};
    current.abort?.abort();
    if (current.timer) clearTimeout(current.timer);
    current.peer?.close();
    current.stream?.getTracks().forEach((track) => track.stop());
    if (current.audio) {
      current.audio.pause();
      current.audio.srcObject = null;
    }
  }

  function stop() {
    generation.current += 1;
    cleanup();
    setStatus("idle");
    setMuted(false);
  }

  useEffect(
    () => () => {
      generation.current += 1;
      cleanup();
    },
    [],
  );

  async function start() {
    if (resources.current.abort) return;
    const version = ++generation.current;
    const abort = new AbortController();
    resources.current.abort = abort;
    setError("");
    setStatus("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined")
        throw new Error("Voice needs a supported browser with microphone access.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (version !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      resources.current.stream = stream;
      const peer = new RTCPeerConnection();
      const audio = new Audio();
      audio.autoplay = true;
      resources.current.peer = peer;
      resources.current.audio = audio;
      peer.ontrack = (event) => {
        if (version !== generation.current) return;
        audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        void audio.play().catch(() => setError("Tap Enable audio to hear Zero AI."));
      };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.onconnectionstatechange = () => {
        if (version !== generation.current) return;
        if (peer.connectionState === "connected") setStatus("connected");
        if (["failed", "disconnected"].includes(peer.connectionState)) {
          stop();
          setError("The voice connection ended. You can reconnect.");
        }
      };
      const events = peer.createDataChannel("oai-events");
      resources.current.timer = setTimeout(() => {
        if (version !== generation.current) return;
        stop();
        setError("The voice connection timed out. Please try again.");
      }, 45000);
      events.onopen = () => {
        if (version !== generation.current) return;
        if (resources.current.timer) clearTimeout(resources.current.timer);
        events.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions:
                "Introduce yourself as Zero AI, an AI assistant, and ask how you can help.",
            },
          }),
        );
        resources.current.timer = setTimeout(stop, 10 * 60_000);
      };
      events.onmessage = (event) => {
        if (version !== generation.current) return;
        try {
          if (JSON.parse(event.data).type === "error") {
            stop();
            setError("Zero AI voice encountered a problem. Please reconnect.");
          }
        } catch {
          /* Non-JSON events are ignored. */
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const {
        data: { session },
      } = await getCachedSession();
      if (!session) throw new Error("Please sign in to use Zero AI.");
      if (abort.signal.aborted) return;
      const response = await fetch("/api/zero-ai/voice", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sdp: offer.sdp }),
        signal: abort.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Couldn't connect to Zero AI voice.");
      }
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (cause) {
      if (version !== generation.current) return;
      stop();
      setError(
        cause instanceof Error && cause.name === "NotAllowedError"
          ? "Allow microphone access to talk with Zero AI."
          : cause instanceof Error
            ? cause.message
            : "Couldn't connect. Please try again.",
      );
    }
  }

  function toggleMute() {
    resources.current.stream?.getAudioTracks().forEach((track) => {
      track.enabled = muted;
    });
    setMuted(!muted);
  }
  function enableAudio() {
    void resources.current.audio
      ?.play()
      .then(() => setError(""))
      .catch(() => setError("Your browser couldn't play audio. Please try again."));
  }

  return { status, error, muted, start, stop, toggleMute, enableAudio };
}
