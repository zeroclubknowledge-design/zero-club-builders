import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Brain,
  Check,
  Clock3,
  Gamepad2,
  Gift,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trophy,
  Users,
  WalletCards,
} from "@/components/icons/solar";
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

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-10">
      <header className="sticky top-0 z-40 bg-background/96 px-4 py-3 backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-foreground text-background">
            <Gamepad2 className="h-5 w-5 fill-current" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Skill arena</p>
            <h1 className="truncate text-[19px] font-semibold tracking-tight">Zero Games</h1>
          </div>
          <Link to="/app/wallet" className="hidden h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-[11px] font-semibold sm:flex">
            <WalletCards className="h-4 w-4 fill-current text-primary" />
            {format(Number(profile?.coins || 0), { notation: "compact" })}
          </Link>
          <Link to="/app/games/solo" search={{ game: "sudoku", difficulty: "easy", profession: "Web Developer" }} className="hidden h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[11px] font-semibold min-[430px]:flex">
            <Gamepad2 className="h-4 w-4 fill-current" />Play solo
          </Link>
          <Link to="/app/games/create" search={{ game: undefined }} className="flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-[11px] font-semibold text-background sm:px-4">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            <span className="hidden min-[380px]:inline">Create race</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 py-5 md:px-7 md:py-8">
        <section className="grid gap-3 md:grid-cols-2">
          <GameProductCard
            type="sudoku"
            title="Zero Sudoku"
            description="Solve a fresh logic grid alone or race builders for a winner reward."
            action={<div className="flex items-center gap-4"><Link to="/app/games/solo" search={{ game: "sudoku", difficulty: "easy", profession: "Web Developer" }} className="text-[11px] font-semibold text-foreground hover:text-primary">Play solo</Link><Link to="/app/games/create" search={{ game: "sudoku" }} className="text-[11px] font-semibold text-muted-foreground hover:text-primary">Create race</Link></div>}
          />
          <GameProductCard
            type="words"
            title="Zero Words"
            description="Trace professional terms at your own pace or compete on a shared board."
            action={<div className="flex items-center gap-4"><Link to="/app/games/solo" search={{ game: "words", difficulty: "easy", profession: "Web Developer" }} className="text-[11px] font-semibold text-foreground hover:text-primary">Play solo</Link><Link to="/app/games/create" search={{ game: "words" }} className="text-[11px] font-semibold text-muted-foreground hover:text-primary">Create race</Link></div>}
          />
        </section>

        <section className="mt-6 flex flex-col gap-3 border-y border-border/70 py-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a competition, field, or host" className="h-11 w-full rounded-md border border-border bg-card pl-10 pr-4 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/10" />
          </div>
          <div className="grid grid-cols-3 rounded-md border border-border bg-card p-1 sm:w-[260px]">
            {(["all", "sudoku", "words"] as const).map((filter) => (
              <button key={filter} onClick={() => setActiveGame(filter)} className={`h-8 rounded-sm text-[10px] font-semibold capitalize ${activeGame === filter ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                {filter === "all" ? "All games" : filter}
              </button>
            ))}
          </div>
        </section>

        {error ? (
          <div className="mt-8 rounded-md border border-destructive/20 bg-destructive/[0.04] p-5 text-center">
            <p className="text-[14px] font-semibold">Zero Games needs its database update</p>
            <p className="mx-auto mt-1 max-w-lg text-[12px] leading-5 text-muted-foreground">Apply the new Zero Games Supabase migration, then refresh this page.</p>
          </div>
        ) : isLoading ? (
          <div className="grid min-h-64 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : (
          <>
            {liveGames.length > 0 && <CompetitionSection title="Live now" detail="Races already on the clock" competitions={liveGames} format={format} live />}
            <CompetitionSection title="Open competitions" detail="Join freely and wait for the host to begin" competitions={openGames} format={format} />
            {data?.myGames && data.myGames.length > 0 && <CompetitionSection title="Created by you" detail="Manage the races you are hosting" competitions={data.myGames} format={format} />}
            {completedGames.length > 0 && <CompetitionSection title="Recent finishes" detail="Completed races from the community" competitions={completedGames} format={format} />}
          </>
        )}
      </main>

    </div>
  );
}

function GameProductCard({ type, title, description, action }: { type: "sudoku" | "words"; title: string; description: string; action: ReactNode }) {
  return (
    <article className="relative min-h-[190px] overflow-hidden rounded-md border border-border bg-card p-5 sm:p-6">
      <div className="relative z-10 max-w-[65%]">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">{type === "sudoku" ? "Logic race" : "Professional vocabulary"}</p>
        <h2 className="mt-2 text-[21px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-[12px] leading-5 text-muted-foreground">{description}</p>
        <div className="mt-5">{action}</div>
      </div>
      {type === "sudoku" ? <SudokuMark /> : <WordsMark />}
    </article>
  );
}

function SudokuMark() {
  const values = ["8", "", "3", "", "1", "", "4", "", "9", "", "6", "", "2", "", "7", "", "5", "", "", "9", "", "5", "", "2", "", "7", ""];
  return <div className="absolute -bottom-3 -right-3 grid h-36 w-36 rotate-3 grid-cols-3 overflow-hidden rounded-md border-2 border-foreground bg-background shadow-xl">{values.map((value, index) => <span key={index} className="grid place-items-center border border-border text-[13px] font-semibold text-foreground">{value}</span>)}</div>;
}

function WordsMark() {
  return <div className="absolute -bottom-3 -right-3 grid h-36 w-36 -rotate-2 grid-cols-4 overflow-hidden rounded-md border-2 border-foreground bg-background shadow-xl">{"ZEROGAMESBUILDRACEPLAY".split("").slice(0, 16).map((letter, index) => <span key={index} className={`grid place-items-center border border-border text-[13px] font-semibold ${[0, 5, 10, 15].includes(index) ? "bg-primary text-primary-foreground" : "text-foreground"}`}>{letter}</span>)}</div>;
}

function CompetitionSection({ title, detail, competitions, format, live = false }: { title: string; detail: string; competitions: ZeroGameCompetition[]; format: (value: number, options?: any) => string; live?: boolean }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><h2 className="text-[16px] font-semibold tracking-tight">{title}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p></div>
        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{competitions.length}</span>
      </div>
      {competitions.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {competitions.map((competition) => <CompetitionCard key={competition.id} competition={competition} format={format} live={live} />)}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border px-5 py-10 text-center"><p className="text-[13px] font-semibold">No races here yet</p><Link to="/app/games/create" search={{ game: undefined }} className="mt-2 inline-flex text-[11px] font-semibold text-primary">Create the first one</Link></div>
      )}
    </section>
  );
}

function CompetitionCard({ competition, format, live }: { competition: ZeroGameCompetition; format: (value: number, options?: any) => string; live?: boolean }) {
  const isSudoku = competition.game_type === "sudoku";
  const reward = competition.reward_type === "cash" ? format(competition.prize_amount) : competition.offer_label;
  return (
    <Link to="/app/games/$id" params={{ id: competition.id }} className="group flex min-h-[175px] flex-col rounded-md border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_16px_35px_-28px_rgba(0,0,0,0.65)]">
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${isSudoku ? "bg-[#171217] text-white" : "bg-primary text-primary-foreground"}`}>{isSudoku ? <Brain className="h-5 w-5 fill-current" /> : <Sparkles className="h-5 w-5 fill-current" />}</div>
        <div className="min-w-0 flex-1"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{getGameName(competition.game_type)} · {competition.difficulty}</p><h3 className="mt-1 line-clamp-2 text-[14px] font-semibold leading-5 tracking-tight group-hover:text-primary">{competition.title}</h3></div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[9px] font-semibold ${live ? "bg-rose-500/10 text-rose-600" : "bg-foreground/[0.055] text-muted-foreground"}`}>{live ? <><span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />Live</> : <><Clock3 className="h-3 w-3" />Open</>}</span>
        {competition.profession && <span className="rounded-sm bg-foreground/[0.055] px-2 py-1 text-[9px] font-semibold text-muted-foreground">{competition.profession}</span>}
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/60 pt-3">
        <div className="min-w-0"><p className="truncate text-[10px] font-semibold">{reward}</p><p className="mt-0.5 text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">{competition.reward_type === "cash" ? "Secured prize" : "Winner offer"}</p></div>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-muted-foreground"><Users className="h-3.5 w-3.5" />{playerCount(competition)}/{competition.max_players}</span>
      </div>
    </Link>
  );
}
