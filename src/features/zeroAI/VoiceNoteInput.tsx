import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "@/components/icons/glyphs";
import { toast } from "sonner";
import { getCachedSession } from "@/lib/auth";

export function VoiceNoteInput({ disabled, onBusyChange, onTranscript }: { disabled: boolean; onBusyChange: (busy: boolean) => void; onTranscript: (text: string) => void }) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const disposed = useRef(false);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [preview, setPreview] = useState<string>();
  const [recordingBlob, setRecordingBlob] = useState<Blob>();
  const [transcribing, setTranscribing] = useState(false);
  const transcriptionRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      transcriptionRequest.current?.abort();
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
      onBusyChange(false);
    };
  }, [onBusyChange]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice notes aren't supported in this browser.");
      return;
    }
    setStarting(true);
    onBusyChange(true);
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed.current) { audio.getTracks().forEach(track => track.stop()); return; }
      stream.current = audio;
      const next = new MediaRecorder(audio);
      const chunks: BlobPart[] = [];
      next.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        clearTimeout(timer.current);
        audio.getTracks().forEach(track => track.stop());
        if (disposed.current) return;
        setRecording(false);
        onBusyChange(false);
        if (chunks.length) {
          const blob = new Blob(chunks, { type: next.mimeType });
          setRecordingBlob(blob);
          setPreview(URL.createObjectURL(blob));
        }
      };
      next.onerror = () => {
        audio.getTracks().forEach(track => track.stop());
        if (!disposed.current) { setRecording(false); onBusyChange(false); toast.error("Couldn't record. Please try again."); }
      };
      recorder.current = next;
      next.start();
      setRecording(true);
      timer.current = setTimeout(() => { if (next.state === "recording") next.stop(); }, 60000);
    } catch {
      stream.current?.getTracks().forEach(track => track.stop());
      onBusyChange(false);
      toast.error("Allow microphone access to record a voice note.");
    } finally { if (!disposed.current) setStarting(false); }
  };

  const transcribe = async () => {
    if (!recordingBlob || transcriptionRequest.current) return;
    if (recordingBlob.size > 3 * 1024 * 1024 - 4096) {
      toast.error("This recording is too large. Please record a shorter note.");
      return;
    }
    const controller = new AbortController();
    transcriptionRequest.current = controller;
    setTranscribing(true);
    onBusyChange(true);
    try {
      const { data: { session } } = await getCachedSession();
      if (!session) throw new Error("Sign in to transcribe a voice note.");
      const body = new FormData();
      const type = recordingBlob.type.split(";")[0];
      const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      body.set("file", recordingBlob, `voice-note.${extension}`);
      const response = await fetch("/api/zero-ai/transcribe", {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(70000)]),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Couldn't transcribe. Please try again.");
      if (typeof result.text !== "string" || !result.text.trim()) throw new Error("No speech was detected.");
      if (!disposed.current) {
        onTranscript(result.text);
        setPreview(undefined);
        setRecordingBlob(undefined);
        toast.success("Voice note added. Review your message before sending.");
      }
    } catch (error) {
      if (!disposed.current && !controller.signal.aborted) toast.error((error as Error).message || "Couldn't transcribe. Please try again.");
    } finally {
      transcriptionRequest.current = null;
      if (!disposed.current) { setTranscribing(false); onBusyChange(false); }
    }
  };

  return <>
    <button type="button" aria-label={recording ? "Stop voice note" : "Record voice note"} title={recording ? "Stop voice note" : "Record voice note"} disabled={disabled || starting || transcribing || Boolean(preview)} onClick={() => recording ? recorder.current?.stop() : void start()} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-foreground/5 disabled:opacity-40 ${recording ? "text-destructive" : "text-foreground"}`}>
      {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
    {recording && <span role="status" className="text-xs text-muted-foreground">Recording · tap stop</span>}
    {preview && <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl bg-card p-3 shadow-lg">
      <div className="flex items-center gap-2"><audio controls src={preview} className="h-10 min-w-0 flex-1" /><button type="button" disabled={transcribing} aria-label="Discard voice note" onClick={() => { setPreview(undefined); setRecordingBlob(undefined); }} className="p-2"><X className="h-4 w-4" /></button></div>
      <p className="mt-2 text-xs text-muted-foreground">Convert this recording to editable text using Groq. Review it before sending.</p>
      <button type="button" disabled={transcribing || disabled} onClick={() => void transcribe()} className="mt-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">{transcribing ? "Converting…" : "Use voice note"}</button>
    </div>}
  </>;
}
