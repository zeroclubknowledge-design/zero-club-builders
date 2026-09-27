import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Brain,
  Gamepad2,
  Loader2,
  Search,
  TextAa,
  Trophy,
  WalletCards,
} from "@/components/icons/glyphs";
import { useGoBack } from "@/hooks/useGoBack";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import {
  getGameName,
  playerCount,
  profileName,
  type ZeroGameCompetition,
} from "@/features/games/zeroGames";

export const Route = createFileRoute("/app/games/")({
  component: ZeroGamesHome,
});

const competitionSelect = `
  *,
  creator:profiles!zero_game_competitions_creator_id_fkey(id, username, full_name, avatar_url),
  winner:profiles!zero_game_competitions_winner_id_fkey(id, username, full_name, avatar_url),
  players:zero_game_players(count)
`;

async function getZeroGames(profileId?: string) {
  const [{ data: publicGames, error: publicError }, { data: myGames, error: myError }] = await Promise.all([
    supabase
      .from("zero_game_competitions")
      .select(competitionSelect)
      .eq("visibility", "public")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(24),
    profileId
      ? supabase
        .from("zero_game_competitions")
        .select(competitionSelect)
        .eq("creator_id", profileId)
        .in("status", ["open", "countdown", "active"])
        .order("created_at", { ascending: false })
        .limit(8)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (publicError) throw publicError;
  if (myError) throw myError;
  return {
    publicGames: (publicGames || []) as unknown as ZeroGameCompetition[],
    myGames: (myGames || []) as unknown as ZeroGameCompetition[],
  };
}

function ZeroGamesHome() {
  const { data: profile } = useUser();
  const { format } = useWalletCurrency();
  const goBack = useGoBack("/app");
  const [query, setQuery] = useState("");
  const [activeGame, setActiveGame] = useState<"all" | "sudoku" | "words">("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["zero-games", profile?.id],
    queryFn: () => getZeroGames(profile?.id),
    enabled: Boolean(profile?.id),
    staleTime: 15_000,
  });

  const games = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.publicGames || []).filter((competition) => {
      const matchesGame = activeGame === "all" || competition.game_type === activeGame;
      const matchesQuery = !normalizedQuery
        || competition.title.toLowerCase().includes(normalizedQuery)
        || competition.profession?.toLowerCase().includes(normalizedQuery)
        || profileName(competition.creator).toLowerCase().includes(normalizedQuery);
      return matchesGame && matchesQuery;
    });
  }, [activeGame, data?.publicGames, query]);

  const liveGames = games.filter((competition) => competition.status === "active" || competition.status === "countdown");
  const openGames = games.filter((competition) => competition.status === "open");
  const completedGames = games.filter((competition) => competition.status === "completed").slice(0, 4);
  const myActiveGames = (data?.myGames || []).filter((competition) => competition.status === "open" || competition.status === "active" || competition.status === "countdown");

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button onClick={goBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Zero Games</h1>
          <Link to="/app/wallet" className="mr-1 flex h-8 items-center gap-1.5 rounded-full bg-[#cc208f]/10 px-3 text-[13px] font-bold tabular-nums text-[#a3186f]">
            <WalletCards className="h-3.5 w-3.5" />
            {format(Number(profile?.coins || 0), { notation: "compact" })}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
          <div className="grid grid-cols-2 gap-2.5">
            <Link
              to="/app/games/solo"
              search={{ game: "sudoku", difficulty: "easy", profession: "Web Developer" }}
              className="flex h-[132px] flex-col rounded-2xl bg-[#17181b] p-3.5 text-white transition active:scale-[0.98]"
            >
              <Gamepad2 className="h-[26px] w-[26px]" />
              <span className="mt-auto font-display text-[17px] font-semibold">Play solo</span>
              <span className="text-[12px] text-white/70">Practise, earn XP</span>
            </Link>
            <Link
              to="/app/games/create"
              search={{ game: undefined }}
              className="flex h-[132px] flex-col rounded-2xl p-3.5 text-white transition active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg,#cc208f,#6b2a8f)" }}
            >
              <Trophy className="h-[26px] w-[26px]" />
              <span className="mt-auto font-display text-[17px] font-semibold">Create a race</span>
              <span className="text-[12px] text-white/80">Set stakes, invite friends</span>
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <GameRow type="sudoku" title="Zero Sudoku" description="A fresh logic grid, alone or against builders" />
            <GameRow type="words" title="Zero Words" description="Trace professional terms on a shared board" />
          </div>
        </section>

        <section className="bg-card px-3 py-3 md:rounded-xl md:border md:border-border">
          <label className="flex h-[38px] items-center gap-2 rounded-full bg-foreground/[0.06] px-3">
            <Search className="h-[17px] w-[17px] shrink-0 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a race, field or host" className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground" />
          </label>
          <div className="mt-2.5 flex gap-2">
            {(["all", "sudoku", "words"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveGame(filter)}
                className={`h-8 rounded-full px-3.5 text-[14px] font-semibold transition ${activeGame === filter ? "bg-foreground text-background" : "border border-foreground/30 text-muted-foreground hover:border-foreground/50"}`}
              >
                {filter === "all" ? "All games" : filter === "sudoku" ? "Sudoku" : "Words"}
              </button>
            ))}
          </div>
        </section>

        {error ? (
          <div className="flex-1 bg-card px-6 py-12 text-center md:rounded-xl md:border md:border-border">
            <p className="text-[15px] font-semibold">Zero Games needs its database update</p>
            <p className="mx-auto mt-1 max-w-lg text-[13px] leading-5 text-muted-foreground">Apply the new Zero Games Supabase migration, then refresh this page.</p>
          </div>
        ) : isLoading ? (
          <div className="grid flex-1 place-items-center bg-card py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {liveGames.length > 0 && <CompetitionSection title="Live races" competitions={liveGames} format={format} live />}
            <CompetitionSection title="Open races" competitions={openGames} format={format} />
            {myActiveGames.length > 0 && <CompetitionSection title="Created by you" competitions={myActiveGames} format={format} />}
            {completedGames.length > 0 && <CompetitionSection title="Recent finishes" competitions={completedGames} format={format} done />}
            <div aria-hidden className="min-h-28 flex-1 bg-card md:hidden" />
          </>
        )}
      </main>
    </div>
  );
}

function GameRow({ type, title, description }: { type: "sudoku" | "words"; title: string; description: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-foreground/10 p-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${type === "sudoku" ? "bg-foreground/[0.06] text-foreground" : "bg-[#cc208f]/10 text-[#cc208f]"}`}>
        {type === "sudoku" ? <Brain className="h-5 w-5" /> : <TextAa className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{description}</p>
      </div>
      <Link to="/app/games/solo" search={{ game: type, difficulty: "easy", profession: "Web Developer" }} className="shrink-0 px-1 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
        Solo
      </Link>
      <Link to="/app/games/create" search={{ game: type }} className="flex h-8 shrink-0 items-center rounded-full border-[1.5px] border-foreground px-3 text-[13px] font-semibold">
        Race
      </Link>
    </div>
  );
}

function CompetitionSection({ title, competitions, format, live = false, done = false }: { title: string; competitions: ZeroGameCompetition[]; format: (value: number, options?: any) => string; live?: boolean; done?: boolean }) {
  return (
    <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        {live && <span className="h-2 w-2 animate-pulse rounded-full bg-[#e0245e]" />}
        <h2 className="font-display text-[18px] font-semibold">{title}</h2>
        <span className="ml-auto text-[13px] tabular-nums text-muted-foreground">{competitions.length}</span>
      </div>
      {competitions.length > 0 ? (
        competitions.map((competition) => <CompetitionRow key={competition.id} competition={competition} format={format} live={live} done={done} />)
      ) : (
        <div className="border-t border-border/60 px-5 py-8 text-center">
          <p className="text-[15px] font-semibold">No races here yet</p>
          <Link to="/app/games/create" search={{ game: undefined }} className="mt-1 inline-flex text-[14px] font-semibold text-[#cc208f]">Create the first one</Link>
        </div>
      )}
    </section>
  );
}

function CompetitionRow({ competition, format, live, done }: { competition: ZeroGameCompetition; format: (value: number, options?: any) => string; live?: boolean; done?: boolean }) {
  const isSudoku = competition.game_type === "sudoku";
  const reward = competition.reward_type === "cash" ? format(competition.prize_amount) : competition.offer_label;
  return (
    <Link to="/app/games/$id" params={{ id: competition.id }} className="flex items-center gap-3 border-t border-border/60 px-4 py-3 hover:bg-foreground/[0.02]">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${isSudoku ? "bg-foreground/[0.06] text-foreground" : "bg-[#cc208f]/10 text-[#cc208f]"}`}>
        {isSudoku ? <Brain className="h-[22px] w-[22px]" /> : <TextAa className="h-[22px] w-[22px]" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{competition.title}</p>
        <p className="truncate text-[13px] capitalize text-muted-foreground">
          {getGameName(competition.game_type)} · {competition.difficulty} · {playerCount(competition)}/{competition.max_players} players
        </p>
      </div>
      <div className="shrink-0 text-right">
        {reward && <p className="max-w-[110px] truncate text-[13px] font-bold text-[#1a7f4b]">{reward}</p>}
        <span className={`mt-1 inline-flex h-7 items-center rounded-full px-3 text-[13px] font-semibold ${done ? "text-muted-foreground" : live ? "border border-foreground/30" : "bg-foreground text-background"}`}>
          {done ? "Results" : live ? "Watch" : "Join"}
        </span>
      </div>
    </Link>
  );
}
