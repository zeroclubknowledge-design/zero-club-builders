import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  LiveRecording,
  discardRecording,
  recordingExtension,
  recoverUnfinishedRecordings,
  type RecordingSources,
} from "./recording";

const fileName = (title: string, type: string, at = new Date()) =>
  `${title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "Zero-Live"}-${at.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${recordingExtension(type)}`;

function saveFile(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

export function useLiveRecording(sources: RecordingSources) {
  const latest = useRef(sources);
  latest.current = sources;
  const active = useRef<LiveRecording | null>(null);
  const mounted = useRef(true);
  const savedUrl = useRef<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "starting" | "recording" | "saving">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [saved, setSaved] = useState<{ url: string; filename: string } | null>(null);

  const stop = useCallback(async () => {
    const recording = active.current;
    if (!recording) return;
    if (mounted.current) setPhase("saving");
    await recording.stop();
    if (active.current === recording) active.current = null;
    if (mounted.current) setPhase("idle");
  }, []);

  const start = useCallback(async () => {
    if (active.current) return;
    setPhase("starting");
    const title = latest.current.title;
    const startedAt = new Date();
    const recording = new LiveRecording(() => latest.current, (blob, reason) => {
      if (active.current === recording) active.current = null;
      if (mounted.current) setPhase("idle");
      if (!blob.size) { toast.error("No video was captured. Please try recording again."); return; }
      if (savedUrl.current) URL.revokeObjectURL(savedUrl.current);
      const url = URL.createObjectURL(blob);
      savedUrl.current = url;
      const filename = fileName(title, blob.type || recording.mimeType, startedAt);
      const download = () => saveFile(url, filename);
      if (mounted.current) setSaved({ url, filename });
      download();
      toast.success(reason || "Recording saved to your device.", {
        description: filename,
        duration: 20000,
        action: { label: "Download again", onClick: download },
      });
      // Keep the final download alive after leaving; browsers may consume it late.
      if (!mounted.current) setTimeout(() => URL.revokeObjectURL(url), 120000);
    });
    active.current = recording;
    try {
      await recording.start();
      if (mounted.current && active.current === recording) { setElapsed(0); setPhase("recording"); }
    } catch (error) {
      if (active.current === recording) active.current = null;
      if (mounted.current) setPhase("idle");
      toast.error(error instanceof Error ? error.message : "Could not start recording.");
    }
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  /* A recording cut off by a crash, a closed tab or a flat battery is still on
     the device. Offer it back the next time the room opens. */
  useEffect(() => {
    let cancelled = false;
    void recoverUnfinishedRecordings().then((found) => {
      if (cancelled) return;
      for (const item of found) {
        const minutes = Math.max(1, Math.round((Date.now() - item.startedAt) / 60000));
        const filename = fileName(`${item.title}-recovered`, item.blob.type, new Date(item.startedAt));
        toast("An unsaved recording was found", {
          description: `${item.title} · started ${new Date(item.startedAt).toLocaleString()} (${minutes} min ago)`,
          duration: Infinity,
          action: {
            label: "Save video",
            onClick: () => {
              const url = URL.createObjectURL(item.blob);
              saveFile(url, filename);
              setTimeout(() => { URL.revokeObjectURL(url); void discardRecording(item.id); }, 120000);
            },
          },
          cancel: { label: "Discard", onClick: () => void discardRecording(item.id) },
        });
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    mounted.current = true;
    /* Switching tabs or apps no longer stops the recording: video is written
       to storage as it goes, and a recorder that is cut off can be recovered. */
    const visibility = () => {
      if (document.visibilityState === "hidden" && active.current && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        toast.info("Still recording. Keep Zero Club open on your phone for the best recording.");
      }
    };
    const pagehide = () => { void stop(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      void active.current?.stop();
      const url = savedUrl.current;
      if (url) setTimeout(() => URL.revokeObjectURL(url), 120000);
    };
  }, [stop]);

  return { phase, elapsed, saved, start, stop };
}
