import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Pause, Play } from "@/components/icons/glyphs";

/**
 * A voice note, WhatsApp-style.
 *
 * Why not the browser's own <audio controls>: voice notes are recorded as
 * WebM, which carries no length in its header, so the built-in player shows
 * 0:00 / 0:00 or a jumping time until the whole note has played. Here the
 * length comes from the file name (written at recording time), and older
 * notes are measured once by seeking to the end.
 *
 * - Shows the note's length before it's played, and the time left while it plays
 * - Waveform bars fill as it plays; tap or drag across them to jump
 * - 1×, 1.5× and 2× speed
 * - Only one note plays at a time across the app
 * - Plays inline: never opens the file in a browser tab
 */

const SPEEDS = [1, 1.5, 2] as const;
const BARS = 34;
let current: HTMLAudioElement | null = null;

/** "voice-note-1784650518-42s.webm" -> 42 */
export function voiceNoteSeconds(name?: string | null) {
  const match = (name || "").match(/-(\d+)s\.\w+$/);
  return match ? Number(match[1]) : null;
}

function format(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Stable, natural-looking bar heights for this particular note. */
function barsFor(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    // Speech-like: louder in the middle of phrases, a soft start and end.
    const envelope = 0.55 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / BARS);
    out.push(Math.max(0.18, Math.min(1, r * envelope + 0.12)));
  }
  return out;
}

export function VoiceNotePlayer({
  src,
  name,
  mine = false,
  avatarUrl,
}: {
  src: string;
  name?: string | null;
  /** Sent by me: styled for my bubble. */
  mine?: boolean;
  avatarUrl?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(voiceNoteSeconds(name) ?? 0);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [loading, setLoading] = useState(false);
  const bars = useMemo(() => barsFor(src), [src]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = src;
    audioRef.current = audio;
    let measuring = false;

    const knownDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (!measuring) {
        // WebM without a length: jump far past the end, and the browser works out the real length.
        measuring = true;
        audio.currentTime = 1e101;
      }
    };
    const onDurationChange = () => {
      knownDuration();
      if (measuring && Number.isFinite(audio.duration)) {
        measuring = false;
        audio.currentTime = 0;
      }
    };
    const onTime = () => {
      if (!measuring) setPosition(audio.currentTime);
    };
    const onEnded = () => {
      setPlaying(false);
      setPosition(0);
      audio.currentTime = 0;
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    return () => {
      audio.pause();
      if (current === audio) current = null;
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.src = "";
    };
  }, [src]);

  // Smooth progress while playing (timeupdate alone only fires ~4 times a second).
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) setPosition(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (current && current !== audio) current.pause();
    current = audio;
    audio.playbackRate = speed;
    setLoading(true);
    try {
      await audio.play();
    } catch {
      /* blocked or failed; leave the button as Play */
    } finally {
      setLoading(false);
    }
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (!audio || !track || !duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setPosition(audio.currentTime);
  };

  const progress = duration ? Math.min(1, position / duration) : 0;
  const shownTime =
    playing || position > 0 ? format(Math.max(0, duration - position)) : format(duration);

  // My bubbles are ink-coloured (text-background on bg-foreground), so the
  // player inverts there.
  const ink = mine ? "text-background" : "text-foreground";
  const filled = mine ? "bg-background" : "bg-[#cc208f]";
  const empty = mine ? "bg-background/35" : "bg-foreground/25";

  return (
    <div className={`flex w-[min(78vw,280px)] items-center gap-2.5 py-1 ${ink}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition active:scale-90 bg-[#cc208f] text-white shadow-[0_6px_16px_-8px_rgba(204,32,143,0.9)]`}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : playing ? (
          <Pause className="h-[18px] w-[18px] fill-current" />
        ) : (
          <Play className="ml-0.5 h-[18px] w-[18px] fill-current" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          ref={trackRef}
          role="slider"
          aria-label="Voice note position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            seekFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons) seekFromPointer(event);
          }}
          className="relative flex h-8 cursor-pointer touch-none items-center gap-[2px]"
        >
          {bars.map((height, i) => {
            const on = (i + 0.5) / BARS <= progress;
            return (
              <span
                key={i}
                className={`flex-1 rounded-full transition-colors duration-150 ${on ? filled : empty}`}
                style={{ height: `${Math.round(height * 100)}%`, minWidth: 2 }}
              />
            );
          })}
          {/* The playhead, so the exact spot is clear while it moves. */}
          <span
            aria-hidden
            className={`pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow ${mine ? "bg-background" : "bg-[#cc208f]"}`}
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <div
          className={`mt-0.5 flex items-center justify-between text-[11.5px] tabular-nums ${mine ? "text-background/75" : "text-muted-foreground"}`}
        >
          <span>{shownTime}</span>
          <button
            type="button"
            onClick={cycleSpeed}
            aria-label={`Playback speed ${speed}×`}
            className={`rounded-full px-2 py-px text-[11px] font-bold ${mine ? "bg-background/15 text-background" : "bg-foreground/[0.08] text-foreground"}`}
          >
            {speed}×
          </button>
        </div>
      </div>

      {avatarUrl && (
        <span className="relative h-9 w-9 shrink-0">
          <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          <span
            className={`absolute -bottom-0.5 -left-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#cc208f] text-white ring-2 ${mine ? "ring-foreground" : "ring-card"}`}
          >
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden>
              <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" />
            </svg>
          </span>
        </span>
      )}
    </div>
  );
}
