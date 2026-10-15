import { useState, type ReactNode } from "react";
import { Play } from "@/components/icons/glyphs";

/*
 * Photos and videos in a chat, shown on their own like a social app's DM:
 * a rounded media card first, with any text as a separate bubble under it.
 * Videos show a still, a play button and their length; tapping anything opens
 * the full-screen viewer.
 */

export type ChatVisual = { type: "image" | "video"; url: string };

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

function VideoTile({ url, fill }: { url: string; fill: boolean }) {
  const [duration, setDuration] = useState("");
  return (
    <>
      <video
        src={`${url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(event) => setDuration(formatDuration(event.currentTarget.duration))}
        className={`pointer-events-none block w-full bg-black object-cover ${fill ? "h-full" : "max-h-[380px] min-h-[160px]"}`}
      />
      <span className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm ring-1 ring-white/25">
          <Play className="ml-0.5 h-6 w-6 fill-current" />
        </span>
      </span>
      {duration && (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
          {duration}
        </span>
      )}
    </>
  );
}

export function ChatMediaGrid({
  items,
  mine,
  onOpen,
  overlay,
}: {
  items: ChatVisual[];
  mine: boolean;
  onOpen: (index: number) => void;
  /** Time and ticks laid over the corner when there is no text under it. */
  overlay?: ReactNode;
}) {
  if (!items.length) return null;
  const single = items.length === 1;
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;

  return (
    <div
      className={`relative overflow-hidden rounded-[20px] bg-foreground/[0.06] ${mine ? "" : "ring-1 ring-foreground/[0.07]"} ${
        single ? "w-[min(72vw,300px)]" : "grid w-[min(72vw,300px)] grid-cols-2 gap-[3px]"
      }`}
    >
      {shown.map((item, i) => (
        // A div, not a button: long-pressing a photo still opens the message
        // menu like any other message, and a tap opens the viewer.
        <div
          key={`${item.url}-${i}`}
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(i);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(i);
            }
          }}
          className={`relative block cursor-pointer overflow-hidden text-left transition active:opacity-90 ${single ? "w-full" : "aspect-square"} ${
            !single && items.length === 3 && i === 0 ? "col-span-2 aspect-[2/1]" : ""
          }`}
          aria-label={item.type === "video" ? "Play video" : "Open photo"}
        >
          {item.type === "video" ? (
            <VideoTile url={item.url} fill={!single} />
          ) : (
            <img
              src={item.url}
              alt=""
              loading="lazy"
              decoding="async"
              className={`block w-full object-cover ${single ? "max-h-[380px] min-h-[120px]" : "h-full"}`}
            />
          )}
          {extra > 0 && i === shown.length - 1 && (
            <span className="absolute inset-0 grid place-items-center bg-black/55 text-[22px] font-bold text-white">+{extra}</span>
          )}
        </div>
      ))}
      {overlay && (
        <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] leading-none tabular-nums text-white backdrop-blur-sm">
          {overlay}
        </span>
      )}
    </div>
  );
}
