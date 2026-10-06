import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LiveRecording, type RecordingSources } from "./recording";

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
    const recording = new LiveRecording(() => latest.current, (blob, reason) => {
      if (active.current === recording) active.current = null;
      if (mounted.current) setPhase("idle");
      if (!blob.size) { toast.error("No video was captured. Please try recording again."); return; }
      if (savedUrl.current) URL.revokeObjectURL(savedUrl.current);
      const url = URL.createObjectURL(blob);
      savedUrl.current = url;
      const filename = `${title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "Zero-Live"}-${new Date().toISOString().replace(/[:.]/g, "-")}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
      const download = () => {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
      };
      if (mounted.current) setSaved({ url, filename });
      download();
      toast.success(reason || "Recording ready. Save the video to your device.", {
        duration: 20000, action: { label: "Download", onClick: download },
      });
      // Keep the final download alive after leaving; browsers may consume it late.
      if (!mounted.current) setTimeout(() => URL.revokeObjectURL(url), 60000);
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

  useEffect(() => {
    mounted.current = true;
    const visibility = () => {
      if (document.visibilityState === "hidden" && active.current) {
        toast.info("Recording stopped because the app went into the background.");
        void stop();
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
      if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
  }, [stop]);

  return { phase, elapsed, saved, start, stop };
}
