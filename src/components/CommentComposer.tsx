import { useEffect, useRef, useState } from "react";
import { Film, Image, Loader2, Mic, Paperclip, Send, Square, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { decodeChatMedia, encodeChatMedia, getChatMediaType, useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { supabase } from "@/lib/supabase";
import { LinkifiedText } from "@/components/LinkifiedText";
import { toast } from "sonner";

type CommentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (files: File[]) => Promise<boolean>;
  loading?: boolean;
  currentUser?: any;
  replyLabel?: string | null;
  onCancelReply?: () => void;
  placeholder?: string;
};

export async function buildCommentContent(text: string, files: File[], userId: string) {
  if (files.length === 0) return text.trim();

  const uploaded: string[] = [];
  for (const file of files) {
    const extension = file.name.split(".").pop() || (file.type.startsWith("audio/") ? "webm" : "bin");
    const path = `${userId}/comments/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("post-media").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("post-media").getPublicUrl(path);
    uploaded.push(encodeChatMedia(getChatMediaType(file), data.publicUrl, file.name));
  }

  return `${text.trim()}${text.trim() ? "\n\n" : ""}$$MEDIA$$${uploaded.join(",")}`;
}

export function CommentContent({ content }: { content?: string | null }) {
  const [text, mediaPayload] = (content || "").split("$$MEDIA$$", 2);
  const media = mediaPayload
    ? mediaPayload.split(",").filter(Boolean).map(decodeChatMedia)
    : [];

  return (
    <div className="space-y-2.5">
      {text.trim() && <LinkifiedText text={text.trim()} />}
      {media.length > 0 && (
        <div className={`grid gap-1.5 overflow-hidden rounded-lg ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {media.map((item, index) => {
            if (item.type === "image") {
              return <img key={`${item.url}-${index}`} src={item.url} alt={item.name} className="max-h-72 w-full rounded-lg border border-border/60 bg-muted object-cover" />;
            }
            if (item.type === "video") {
              return <video key={`${item.url}-${index}`} src={item.url} controls playsInline className="max-h-72 w-full rounded-lg border border-border/60 bg-black object-contain" />;
            }
            if (item.type === "audio") {
              return <audio key={`${item.url}-${index}`} src={item.url} controls preload="metadata" className="col-span-full h-10 w-full" />;
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

export function CommentComposer({
  value,
  onChange,
  onSubmit,
  loading = false,
  currentUser,
  replyLabel,
  onCancelReply,
  placeholder = "Post your reply",
}: CommentComposerProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const previewsRef = useRef<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const { isRecording, recordingSeconds, startRecording, stopRecording } = useVoiceRecorder((file) => {
    setFiles((current) => [...current, file]);
    setPreviews((current) => [...current, URL.createObjectURL(file)]);
  });

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => () => previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview)), []);

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = Array.from(selected).slice(0, Math.max(0, 4 - files.length));
    setFiles((current) => [...current, ...next]);
    setPreviews((current) => [...current, ...next.map((file) => URL.createObjectURL(file))]);
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPreviews((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }
    try {
      await startRecording();
    } catch (error: any) {
      toast.error(error.message || "Microphone access is required to record a voice note.");
    }
  };

  const submit = async () => {
    if ((!value.trim() && files.length === 0) || loading) return;
    const succeeded = await onSubmit(files);
    if (succeeded) {
      previews.forEach((preview) => URL.revokeObjectURL(preview));
      setFiles([]);
      setPreviews([]);
    }
  };

  const name = currentUser?.full_name || currentUser?.username || "U";

  return (
    <div className="rounded-lg border border-border/80 bg-background/95 p-2.5 shadow-[0_16px_45px_-18px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      {replyLabel && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-primary/[0.07] px-3 py-2 text-[11px] font-medium text-primary">
          <span className="truncate">Replying to {replyLabel}</span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="grid h-6 w-6 place-items-center rounded-full hover:bg-primary/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
              {file.type.startsWith("image/") ? (
                <img src={previews[index]} alt="" className="h-full w-full object-cover" />
              ) : file.type.startsWith("video/") ? (
                <video src={previews[index]} className="h-full w-full object-cover" muted />
              ) : (
                <div className="grid h-full w-full place-items-center text-primary"><Mic className="h-5 w-5" /></div>
              )}
              <button type="button" onClick={() => removeFile(index)} aria-label="Remove attachment" className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {currentUser?.avatar_url ? <img src={currentUser.avatar_url} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
        </div>

        <div className="flex min-h-10 min-w-0 flex-1 items-end rounded-lg bg-muted/70 px-2 focus-within:ring-1 focus-within:ring-primary/35">
          <textarea
            data-comment-composer=""
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 96)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={placeholder}
            rows={1}
            className="max-h-24 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-[13px] leading-5 outline-none no-scrollbar placeholder:text-muted-foreground"
          />

          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
          <input ref={videoRef} type="file" accept="video/*" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />

          <div className="flex shrink-0 items-center pb-1">
            <button type="button" onClick={toggleRecording} title={isRecording ? "Stop recording" : "Record voice note"} className={`grid h-8 place-items-center rounded-full transition ${isRecording ? "min-w-14 grid-cols-[auto_auto] gap-1 bg-red-500 px-2 text-white" : "w-8 text-muted-foreground hover:text-foreground"}`}>
              {isRecording ? <><Square className="h-3 w-3 fill-current" /><span className="text-[9px] tabular-nums">{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}</span></> : <Mic className="h-4 w-4" />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" title="Add media" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-foreground">
                  <Paperclip className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-40">
                <DropdownMenuItem onSelect={() => galleryRef.current?.click()} className="gap-2.5"><Image className="h-4 w-4" /> Gallery</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => videoRef.current?.click()} className="gap-2.5"><Film className="h-4 w-4" /> Video</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="button" onClick={() => void submit()} disabled={loading || (!value.trim() && files.length === 0)} aria-label="Post comment" className={`grid h-8 w-8 place-items-center rounded-full transition ${value.trim() || files.length > 0 ? "bg-foreground text-background" : "text-muted-foreground"}`}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
