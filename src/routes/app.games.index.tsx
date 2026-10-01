import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Clock3, LockKeyhole, Plus, ShieldCheck, Trophy, Users, WalletCards } from "@/components/icons/glyphs";
import { ZeroLoader } from "@/components/ZeroLoader";
import { useGoBack } from "@/hooks/useGoBack";
import { useUser } from "@/hooks/useUser";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { ZERO_GAMES, ZERO_GAME_LIST, isZeroGameKey, type ZeroGameKey } from "@/features/games/v2/catalog";
import { GameEmblem, SPLASH_CSS } from "@/features/games/v2/GameSplash";
import { countdown, listTournaments, rewardHeadline, type TournamentRow } from "@/features/games/v2/api";

export const Route = createFileRoute("/app/games/")({
  validateSearch: (search: Record<string, unknown>): { game?: ZeroGameKey } => ({
    game: isZeroGameKey(search.game) ? search.game : undefined,
  }),
  component: ZeroGamesHub,
});

type Tab = "live" | "mine" | "ended";
const TABS: { value: Tab; label: string }[] = [
  { value: "live", label: "Live & upcoming" },
  { value: "mine", label: "My tournaments" },
  { value: "ended", label: "Results" },
];

function ZeroGamesHub() {
  const { game } = Route.useSearch();
  const navigate = useNavigate();
  const goBack = useGoBack("/app");
  const { data: profile } = useUser();
  const { format } = useWalletCurrency();
  const [tab, setTab] = useState<Tab>("live");
  const [filter, setFilter] = useState<ZeroGameKey | "all">(game || "all");
  const [now, setNow] = useState(Date.now());

  useEffect(() => { if (game) setFilter(game); }, [game]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  const query = useQuery({
    queryKey: ["zero-tournaments", tab],
    queryFn: () => listTournaments(tab),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const rows = (query.data || []).filter((r) => filter === "all" || r.game_type === filter);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <style>{SPLASH_CSS}</style>
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button onClick={goBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Zero Games</h1>
          <Link to="/app/wallet" className="mr-1 flex h-8 items-center gap-1.5 rounded-full bg-[#cc208f]/10 px-3 text-[13px] font-bold tabular-nums text-[#a3186f]">
            <WalletCards className="h-3.5 w-3.5" />
            {format(Number(profile?.coins || 0), { notation: "compact" })}
          </Link>
        </div>
      </header>

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        {/* Featured: Zero Space */}
        <section className="bg-card p-3 md:rounded-xl md:border md:border-border">
          <button
            onClick={() => navigate({ to: "/app/games/play/$game", params: { game: "space" }, search: { t: undefined, code: undefined } })}
            className="relative flex w-full items-center gap-4 overflow-hidden rounded-2xl p-5 text-left text-white transition active:scale-[0.99]"
            style={{ background: `radial-gradient(120% 120% at 100% 0%, ${ZERO_GAMES.space.to}, ${ZERO_GAMES.space.from} 70%)` }}
          >
            <div className="min-w-0 flex-1">
              <span className="inline-flex h-6 items-center rounded-full bg-white/15 px-2.5 text-[11px] font-bold uppercase tracking-wide">New</span>
              <p className="mt-3 font-display text-[26px] font-bold leading-none tracking-[-0.02em]">Zero Space</p>
              <p className="mt-2 text-[13.5px] leading-snug text-white/70">{ZERO_GAMES.space.tagline}</p>
              <span className="mt-4 inline-flex h-9 items-center rounded-full px-4 text-[13.5px] font-bold text-[#140a1c]" style={{ background: ZERO_GAMES.space.accent }}>Play now</span>
            </div>
            <GameEmblem game="space" size={110} />
          </button>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            {ZERO_GAME_LIST.filter((g) => g.key !== "space").map((g) => (
              <button
                key={g.key}
                onClick={() => navigate({ to: "/app/games/play/$game", params: { game: g.key }, search: { t: undefined, code: undefined } })}
                className="flex flex-col items-start overflow-hidden rounded-2xl p-4 text-left text-white transition active:scale-[0.98]"
                style={{ background: `linear-gradient(150deg, ${g.to}, ${g.from})` }}
              >
                <GameEmblem game={g.key} size={56} />
                <p className="mt-3 font-display text-[17px] font-bold">{g.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-white/65">{g.tagline}</p>
              </button>
            ))}
          </div>

          <Link
            to="/app/games/create"
            search={{ game: filter === "all" ? undefined : filter }}
            className="mt-2.5 flex items-center gap-3 rounded-2xl border border-border p-3.5 transition hover:bg-foreground/[0.02]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#cc208f,#6b2a8f)" }}>
              <Trophy className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Host a tournament</p>
              <p className="truncate text-[12.5px] text-muted-foreground">Set the game, time, players, access and prizes</p>
            </div>
            <Plus className="h-5 w-5 text-muted-foreground" />
          </Link>
        </section>

        {/* Tournaments */}
        <section className="flex-1 bg-card md:rounded-xl md:border md:border-border">
          <div className="flex gap-1 overflow-x-auto px-3 pt-3 [scrollbar-width:none]">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`h-9 shrink-0 rounded-full px-4 text-[13.5px] font-semibold transition ${tab === t.value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-foreground/[0.05]"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 pt-2.5 [scrollbar-width:none]">
            {(["all", "space", "sudoku", "words"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setFilter(g)}
                className={`h-7 shrink-0 rounded-full border px-3 text-[12.5px] font-semibold transition ${filter === g ? "border-[#cc208f] bg-[#cc208f]/10 text-[#cc208f]" : "border-border text-muted-foreground"}`}
              >
                {g === "all" ? "All games" : ZERO_GAMES[g].name}
              </button>
            ))}
          </div>

          {query.isLoading ? (
            <div className="flex justify-center py-14"><ZeroLoader /></div>
          ) : query.error ? (
            <p className="px-5 py-10 text-center text-[13.5px] text-muted-foreground">Couldn't load tournaments. Pull to refresh.</p>
          ) : rows.length === 0 ? (
            <div className="border-t border-border/60 px-6 py-12 text-center">
              <p className="text-[15px] font-semibold">
                {tab === "mine" ? "You haven't joined any tournaments" : tab === "ended" ? "No results yet" : "No tournaments running"}
              </p>
              <Link to="/app/games/create" search={{ game: filter === "all" ? undefined : filter }} className="mt-1 inline-flex text-[14px] font-semibold text-[#cc208f]">
                Host the first one
              </Link>
            </div>
          ) : (
            rows.map((row) => <TournamentCard key={row.id} row={row} now={now} money={(n) => format(n)} />)
          )}
        </section>
        <div aria-hidden className="min-h-24 bg-card md:hidden" />
      </main>
    </div>
  );
}

function TournamentCard({ row, now, money }: { row: TournamentRow; now: number; money: (n: number) => string }) {
  const g = ZERO_GAMES[row.game_type];
  const starts = new Date(row.starts_at).getTime(), ends = new Date(row.ends_at).getTime();
  const status = now < starts ? "upcoming" : now >= ends ? "ended" : "live";
  return (
    <Link to="/app/games/t/$id" params={{ id: row.id }} search={{ code: undefined }} className="flex items-center gap-3 border-t border-border/60 px-4 py-3 transition hover:bg-foreground/[0.02]">
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl" style={{ background: `linear-gradient(150deg, ${g.to}, ${g.from})` }}>
        <GameEmblem game={row.game_type} size={34} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {status === "live" && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#e0245e]" />}
          <p className="truncate text-[15px] font-semibold">{row.title}</p>
          {row.visibility === "private" && <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          {row.eligibility === "subscribers" && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#cc208f]" />}
          {row.sponsored && <span className="shrink-0 rounded-full bg-[#cc208f] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">Zero Club</span>}
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-muted-foreground">
          <Clock3 className="h-3 w-3 shrink-0" />
          {status === "upcoming" ? `Starts in ${countdown(starts - now)}` : status === "live" ? `${countdown(ends - now)} left` : "Ended"}
          <span className="mx-0.5">·</span>
          <Users className="h-3 w-3 shrink-0" />
          {row.players}{row.max_players ? `/${row.max_players}` : ""}
          <span className="mx-0.5">·</span>
          {g.name}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="max-w-[110px] truncate text-[13px] font-bold text-[#1a7f4b]">{rewardHeadline(row, money)}</p>
        {row.my_best ? <p className="text-[11.5px] text-muted-foreground">Best {row.my_best.toLocaleString()}</p> : <ChevronRight className="ml-auto mt-0.5 h-4 w-4 text-muted-foreground" />}
      </div>
    </Link>
  );
}
