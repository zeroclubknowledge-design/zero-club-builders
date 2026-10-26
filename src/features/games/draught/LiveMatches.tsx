import { useQuery } from "@tanstack/react-query";
import { Coins, Eye, MessageCircle } from "@/components/icons/glyphs";
import { GameAvatar } from "../GameAvatar";
import { draughtLive, draughtWatchError } from "./api";

/** Matches being played right now that anyone can watch. */
export function LiveMatches({ onWatch }: { onWatch: (room: string) => void }) {
  const live = useQuery({ queryKey: ["draught-live"], queryFn: draughtLive, retry: false, refetchInterval: 15_000 });

  return (
    <section className="my-8">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#fe94d1]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#fd49b0] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#fd49b0]" />
            </span>
            Live now
          </p>
          <h2 className="mt-1 text-lg font-bold">Watch a match</h2>
        </div>
        {live.data && live.data.length > 0 && <span className="text-xs text-white/40">{live.data.length} playing</span>}
      </div>
      {live.error ? (
        <div role="alert" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-sm text-white/60">
          <p>{draughtWatchError(live.error)}</p>
          <button type="button" disabled={live.isFetching} onClick={() => void live.refetch()} className="mt-3 min-h-11 rounded-full bg-white/[0.08] px-4 font-semibold text-[#fe94d1] disabled:opacity-40">Try again</button>
        </div>
      ) : !live.data?.length ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/45">
          {live.isPending ? "Looking for live matches…" : "No matches are being played right now. Start one and others can watch."}
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {live.data.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onWatch(m.id)}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-[#fd49b0]/40 hover:bg-white/[0.06] active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  <GameAvatar id={m.red.id} name={m.red.name} photo={m.red.photo} className="h-10 w-10 ring-2 ring-[#fd49b0]" />
                  <GameAvatar id={m.black.id} name={m.black.name} photo={m.black.photo} className="h-10 w-10 ring-2 ring-white/70" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {m.red.name} <span className="font-normal text-white/40">vs</span> {m.black.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-3 text-[11.5px] text-white/45">
                    <span>Move {Math.floor(m.ply / 2) + 1}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" />{m.comments}</span>
                  </p>
                </div>
                {m.stake > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#ffca75]/15 px-2.5 py-1 text-[11.5px] font-bold text-[#ffca75]">
                    <Coins className="h-3 w-3" />{(m.stake * 2).toLocaleString()} ZP
                  </span>
                )}
              </div>
              <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#fe94d1] transition group-hover:gap-2">
                <Eye className="h-3.5 w-3.5" /> Watch and comment
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
