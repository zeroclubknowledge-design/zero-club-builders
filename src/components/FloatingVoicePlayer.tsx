import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Pause, Play, X, Mic } from "@/components/icons/glyphs";
import { voicePlayback, useVoicePlayback } from "@/lib/voicePlayback";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export function FloatingVoicePlayer() {
  const state = useVoicePlayback();
  const location = useRouterState({ select: (s) => s.location.pathname + s.location.searchStr });
  useEffect(() => {
    let user: string | undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (user && session?.user.id !== user)) voicePlayback.close();
      user = session?.user.id;
    });
    return () => subscription.unsubscribe();
  }, []);
  if (!state.src || location === state.origin) return null;
  return (
    <aside
      aria-label="Voice note mini player"
      className="fixed right-3 top-[calc(env(safe-area-inset-top)+72px)] z-[10070] w-[min(340px,calc(100vw-24px))] rounded-2xl bg-card p-3 text-foreground shadow-xl ring-1 ring-border"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#c3217e]/10 text-[#c3217e]">
          <Mic className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Voice note</p>
          <p className="text-xs text-muted-foreground">
            {state.error ||
              `${time(state.position)}${state.duration ? ` / ${time(state.duration)}` : ""}`}
          </p>
        </div>
        <button
          type="button"
          aria-label={state.playing ? "Pause voice note" : "Resume voice note"}
          onClick={() =>
            state.playing
              ? voicePlayback.pause()
              : void voicePlayback
                  .play(state.src)
                  .catch(() => toast.error("Could not resume this voice note."))
          }
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#c3217e] text-white"
        >
          {state.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => voicePlayback.speed()}
          className="p-2 text-xs font-semibold"
          aria-label="Change playback speed"
        >
          {state.speed}×
        </button>
        <button
          type="button"
          onClick={() => voicePlayback.close()}
          aria-label="Close voice note player"
          className="p-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {state.duration > 0 && (
        <input
          aria-label="Voice note position"
          type="range"
          min={0}
          max={state.duration}
          step={0.1}
          value={Math.min(state.position, state.duration)}
          onChange={(event) => voicePlayback.seek(Number(event.target.value))}
          className="mt-2 h-2 w-full accent-[#c3217e]"
        />
      )}
    </aside>
  );
}
