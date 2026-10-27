import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { saveMediaBlob } from "@/lib/downloadMedia";
import { finalizeMp4 } from "./mp4Finalize";
import {
  LiveRecording,
  discardRecording,
  recordingExtension,
  recoverUnfinishedRecordings,
  type RecordingSources,
} from "./recording";

/*
 * Straight to the device, no waiting.
 *
 * The browser records a "fragmented" MP4. finalizeMp4 writes one standard
 * index for it in a second or two (nothing is converted or re-encoded, and
 * the video is never loaded into memory), so it plays and shares everywhere,
 * WhatsApp included. If that ever fails, the original recording is saved as
 * it is, which still plays almost everywhere. WebM (Firefox) is saved as
 * recorded. There is no slow conversion step any more.
 */
async function finishRecording(blob: Blob): Promise<Blob> {
  if (!blob.type.includes("mp4")) return blob;
  try {
    return await finalizeMp4(blob);
  } catch (error) {
    console.warn("Saving the recording as recorded:", error);
    return blob;
  }
}

const fileName = (title: string, type: string, at = new Date()) =>
  `${title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "Zero-Live"}-${at.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${recordingExtension(type)}`;

export function useLiveRecording(sources: RecordingSources) {
  const latest = useRef(sources);
  latest.current = sources;
  const active = useRef<LiveRecording | null>(null);
  const exporting = useRef(false);
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
    if (!exporting.current && mounted.current) setPhase("idle");
  }, []);

  const start = useCallback(async () => {
    if (active.current || exporting.current) return false;
    setPhase("starting");
    const title = latest.current.title;
    const mode = latest.current.mode;
    const startedAt = new Date();
    const recording = new LiveRecording(
      () => latest.current,
      async (blob, reason) => {
        if (active.current === recording) active.current = null;
        if (!blob.size) {
          if (mounted.current) setPhase("idle");
          toast.error(
            `No ${mode === "audio" ? "audio" : "video"} was captured. Please try recording again.`,
          );
          return;
        }
        exporting.current = true;
        if (mounted.current) setPhase("saving");
        const id = toast.loading("Saving recording to your device…");
        try {
          const output = await finishRecording(blob);
          if (savedUrl.current) URL.revokeObjectURL(savedUrl.current);
          const url = URL.createObjectURL(output);
          savedUrl.current = url;
          const filename = fileName(title, output.type || recording.mimeType, startedAt);
          const download = () => saveMediaBlob(output, filename);
          if (mounted.current) setSaved({ url, filename });
          download();
          toast.success(reason || "Recording saved to your device", {
            id,
            description: `${filename} · in your Downloads`,
            duration: 20000,
            action: { label: "Download again", onClick: download },
          });
          // Keep the final download alive after leaving; browsers may consume it late.
          if (!mounted.current) setTimeout(() => URL.revokeObjectURL(url), 120000);
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Could not prepare this recording.",
            {
              id,
              duration: 20000,
              action: {
                label: "Save original",
                onClick: () =>
                  saveMediaBlob(blob, fileName(title, blob.type || recording.mimeType, startedAt)),
              },
            },
          );
        } finally {
          exporting.current = false;
          if (mounted.current) setPhase("idle");
        }
      },
    );
    active.current = recording;
    try {
      await recording.start();
      if (mounted.current && active.current === recording) {
        setElapsed(0);
        setPhase("recording");
      }
      return mounted.current && active.current === recording;
    } catch (error) {
      if (active.current === recording) active.current = null;
      if (mounted.current) setPhase("idle");
      toast.error(error instanceof Error ? error.message : "Could not start recording.");
      return false;
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
        const filename = fileName(
          `${item.title}-recovered`,
          item.blob.type,
          new Date(item.startedAt),
        );
        toast("An unsaved recording was found", {
          description: `${item.title} · started ${new Date(item.startedAt).toLocaleString()} (${minutes} min ago)`,
          duration: Infinity,
          action: {
            label: "Save recording",
            onClick: () => {
              // Same instant finishing as a normal stop; saved straight to the device.
              void finishRecording(item.blob).then((output) => {
                saveMediaBlob(output, filename);
                toast.success("Recording saved to your device", { description: "in your Downloads" });
              });
            },
          },
          cancel: { label: "Discard", onClick: () => void discardRecording(item.id) },
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    mounted.current = true;
    /* Switching tabs or apps no longer stops the recording: video is written
       to storage as it goes, and a recorder that is cut off can be recovered. */
    const visibility = () => {
      if (
        document.visibilityState === "hidden" &&
        active.current &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      ) {
        toast.info("Still recording. Keep Zero Club open on your phone for the best recording.");
      }
    };
    const pagehide = () => {
      void stop();
    };
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
