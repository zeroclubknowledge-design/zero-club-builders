import { useRef, useState } from "react";
import { ImagePlus, Loader2, Play, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompression";

/**
 * The screenshots and clips that decide whether anyone tests your product.
 *
 * A tester scanning the discover page reads the picture before the paragraph,
 * so this is the highest-leverage field on the form — which is why it is a
 * tappable area rather than the "Logo URL" text box it replaces. Asking a
 * builder to go and host an image somewhere and paste a link was asking most
 * of them not to bother.
 *
 * Photos are compressed in the browser first. Video is not: re-encoding video
 * client-side is slow and lossy, so the size limit is enforced instead and the
 * person is told plainly when a file is too big.
 */

const BUCKET = "zerostart-media";
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_ITEMS = 6;

export interface MediaPickerProps {
  value: string[];
  onChange: (urls: string[]) => void;
  builderId: string | undefined;
}

const isVideo = (url: string) => /\.(mp4|webm|mov|quicktime)(\?|$)/i.test(url);

export function MediaPicker({ value, onChange, builderId }: MediaPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const pick = () => {
    if (!builderId) { setError("Sign in before adding media."); return; }
    inputRef.current?.click();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !builderId) return;

    const room = MAX_ITEMS - value.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (chosen.length === 0) { setError(`You can add up to ${MAX_ITEMS} items.`); return; }

    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: chosen.length });

    const uploaded: string[] = [];
    const failed: string[] = [];

    for (const [i, original] of chosen.entries()) {
      try {
        const video = original.type.startsWith("video/");

        if (video && original.size > MAX_VIDEO_BYTES) {
          failed.push(`${original.name} is over 50MB`);
          continue;
        }

        // Photos only. compressImage never throws — it returns the original
        // when it cannot help — so a odd format degrades to a plain upload
        // rather than blocking the whole batch.
        const file = video ? original : await compressImage(original);

        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${builderId}/${crypto.randomUUID()}.${ext}`;

        const { error: e } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (e) { failed.push(`${original.name}: ${e.message}`); continue; }

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        uploaded.push(data.publicUrl);
      } catch (err) {
        failed.push(`${original.name}: ${(err as Error).message}`);
      } finally {
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : null));
      }
    }

    // Keep whatever succeeded. Discarding four good uploads because the fifth
    // failed would be a needlessly cruel way to handle a partial batch.
    if (uploaded.length > 0) onChange([...value, ...uploaded]);
    if (failed.length > 0) setError(failed.join(" · "));

    setBusy(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (url: string) => onChange(value.filter((u) => u !== url));

  return (
    <div className="mt-5">
      <span className="text-[13px] font-medium text-ink">Screenshots and video</span>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
        Testers look at these before they read anything. Up to {MAX_ITEMS} items — the first
        one is used as the cover.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {value.map((url, i) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-xl bg-ink/[0.04]">
            {isVideo(url) ? (
              <>
                <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  <Play className="h-6 w-6 fill-white/90 text-white/90 drop-shadow" />
                </span>
              </>
            ) : (
              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            )}

            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-ink">
                Cover
              </span>
            )}

            <button
              type="button"
              onClick={() => remove(url)}
              aria-label="Remove"
              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-bad"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {value.length < MAX_ITEMS && (
          <button
            type="button"
            onClick={pick}
            disabled={busy}
            className="grid aspect-square place-items-center rounded-xl border border-dashed border-ink/15 bg-ink/[0.02] text-ink-faint transition hover:border-accent/50 hover:text-accent disabled:opacity-50"
          >
            {busy ? (
              <span className="flex flex-col items-center gap-1.5">
                <Loader2 className="h-5 w-5 animate-spin" />
                {progress && (
                  <span className="text-[10px] font-semibold">{progress.done}/{progress.total}</span>
                )}
              </span>
            ) : (
              <span className="flex flex-col items-center gap-1.5">
                <ImagePlus className="h-6 w-6" />
                <span className="text-[10px] font-semibold">Add media</span>
              </span>
            )}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-bad/12 px-3.5 py-2.5 text-[12px] font-medium text-bad">{error}</p>
      )}
    </div>
  );
}
