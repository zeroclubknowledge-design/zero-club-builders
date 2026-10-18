import { useRef } from "react";
import { Play, UploadCloud } from "@/components/icons/glyphs";
import { toast } from "sonner";

/** Explicit controls stay visible on touch screens, matching the Zero Form editor. */
export function BootcampMediaInput({
  kind,
  value,
  onSelect,
  onRemove,
  disabled = false,
}: {
  kind: "image" | "video";
  value: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const name = kind === "image" ? "cover image" : "preview video";
  const Icon = kind === "image" ? UploadCloud : Play;
  const actionClass =
    "inline-flex min-h-10 items-center justify-center rounded-full bg-black/65 px-3 text-[11px] font-semibold text-white backdrop-blur transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50";

  return (
    <div className="min-w-0">
      <input
        ref={input}
        type="file"
        accept={`${kind}/*`}
        aria-label={`Choose ${name}`}
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || disabled) return;
          if (!file.type.startsWith(`${kind}/`)) {
            toast.error(`Choose ${kind === "image" ? "an image" : "a video"} file.`);
            return;
          }
          onSelect(file);
        }}
      />
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-border">
          {kind === "image" ? (
            <img
              src={value}
              alt="Bootcamp cover preview"
              className="aspect-video w-full object-cover"
            />
          ) : (
            <video
              src={value}
              aria-label="Bootcamp video preview"
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full bg-black object-contain"
            />
          )}
          <div
            className={`absolute right-2 flex gap-1.5 ${kind === "video" ? "top-2" : "bottom-2"}`}
          >
            <button
              type="button"
              aria-label={`Replace ${name}`}
              disabled={disabled}
              onClick={() => input.current?.click()}
              className={actionClass}
            >
              Replace
            </button>
            <button
              type="button"
              aria-label={`Remove ${name}`}
              disabled={disabled}
              onClick={onRemove}
              className={actionClass}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="group flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center transition hover:border-primary/40 hover:bg-primary/[0.03] disabled:cursor-wait disabled:opacity-50"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <span className="text-[13.5px] font-semibold">Upload a {name}</span>
          <span className="text-xs text-muted-foreground">
            {kind === "image"
              ? "Recommended size: 1600 × 900px"
              : "Short intro to pitch your bootcamp"}
          </span>
        </button>
      )}
    </div>
  );
}
