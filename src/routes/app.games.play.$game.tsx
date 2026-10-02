import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useGoBack } from "@/hooks/useGoBack";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Clock3, RotateCcw, Trophy, X } from "@/components/icons/glyphs";
import { ZeroPageLoader } from "@/components/ZeroLoader";
import { SudokuRaceBoard } from "@/features/games/SudokuRaceBoard";
import { WordsRaceBoard } from "@/features/games/WordsRaceBoard";
import {
  formatGameTime,
  generatePracticeSudoku,
  generateWordsPuzzle,
  ZERO_GAME_PROFESSIONS,
  type ZeroGameDifficulty,
} from "@/features/games/zeroGames";
import { ZERO_GAMES, isZeroGameKey, wordsScore, type ZeroGameKey } from "@/features/games/v2/catalog";
import { GameSplash, SPLASH_CSS } from "@/features/games/v2/GameSplash";
import { ZeroSpaceGame, type ZeroSpaceResult } from "@/features/games/v2/ZeroSpace";
import {
  countdown, finishRun, joinTournament, JOIN_REFUSAL, listTournaments, previewPrizeLine, startRun, tournamentDetail,
} from "@/features/games/v2/api";

export const Route = createFileRoute("/app/games/play/$game")({
  validateSearch: (search: Record<string, unknown>): { t?: string; code?: string } => ({
    t: typeof search.t === "string" ? search.t : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  component: PlayGame,
});

type Phase = "splash" | "playing" | "result";
type Result = { score: number; best?: number; detail: string; failed?: boolean; newBest?: boolean };
type Board =
  | { kind: "space" }
  | { kind: "sudoku"; puzzle: string; solution?: string }
  | { kind: "words"; letters: string[]; words: string[]; size: number };

const DIFFS: ZeroGameDifficulty[] = ["easy", "medium", "hard"];

/** A full grid is correct if every row, column and box holds 1–9 once and the givens are kept. */
function sudokuValid(puzzle: string, sol: string) {
  if (!/^[1-9]{81}$/.test(sol)) return false;
  for (let i = 0; i < 81; i++) if (puzzle[i] !== "-" && puzzle[i] !== sol[i]) return false;
  const ok = (cells: number[]) => new Set(cells.map((c) => sol[c])).size === 9;
  for (let k = 0; k < 9; k++) {
    const row = Array.from({ length: 9 }, (_, j) => k * 9 + j);
    const col = Array.from({ length: 9 }, (_, j) => j * 9 + k);
    const br = Math.floor(k / 3) * 3, bc = (k % 3) * 3;
    const box = Array.from({ length: 9 }, (_, j) => (br + Math.floor(j / 3)) * 9 + bc + (j % 3));
    if (!ok(row) || !ok(col) || !ok(box)) return false;
  }
  return true;
}

const bestKey = (game: ZeroGameKey, variant: string) => `zero-games:v2-best:${game}:${variant}`;
const readBest = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const writeBest = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* storage unavailable */ } };

function PlayGame() {
  const { game: rawGame } = Route.useParams();
  const { t: tournamentId, code } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const game: ZeroGameKey = isZeroGameKey(rawGame) ? rawGame : "space";
  const info = ZERO_GAMES[game];

  const [phase, setPhase] = useState<Phase>("splash");
  const [board, setBoard] = useState<Board | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [difficulty, setDifficulty] = useState<ZeroGameDifficulty>("easy");
  const [profession, setProfession] = useState<string>(ZERO_GAME_PROFESSIONS[0]);
  const [runKey, setRunKey] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const runRef = useRef<string | null>(null);
  const startedAt = useRef(0);
  const [now, setNow] = useState(Date.now());

  const detail = useQuery({
    queryKey: ["zero-tournament", tournamentId, code],
    queryFn: () => tournamentDetail(tournamentId!, code),
    enabled: Boolean(tournamentId),
  });
  const t = detail.data && detail.data.found && !detail.data.locked ? detail.data : null;

  /*
   * Opening a game from the Zero Games home used to start PRACTICE, which
   * never reaches a leaderboard — so people played "the competition" and no
   * score was ever recorded for them. When this game has a live tournament
   * open to everyone, that is now what the big button plays; practice is the
   * second option.
   */
  const liveForGame = useQuery({
    queryKey: ["zero-tournaments", "live"],
    queryFn: () => listTournaments("live"),
    enabled: !tournamentId,
    staleTime: 60_000,
  });
  const featured = (liveForGame.data || [])
    .filter((row) => row.game_type === game && row.status === "live" && row.visibility === "public")
    .sort((a, b) => Number(Boolean(b.sponsored)) - Number(Boolean(a.sponsored)) || (b.players || 0) - (a.players || 0))[0] || null;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase !== "playing" || game === "space") return;
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [phase, game, runKey]);

  // Leaving mid-game shouldn't be a single mis-tap.
  useEffect(() => {
    if (phase !== "playing") return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const variant = tournamentId ? `t:${tournamentId}` : game === "words" ? `${difficulty}:${profession}` : game === "sudoku" ? difficulty : "practice";

  const begin = (b: Board) => {
    setBoard(b);
    setResult(null);
    setElapsed(0);
    startedAt.current = Date.now();
    setRunKey((k) => k + 1);
    setPhase("playing");
  };

  const startPractice = () => {
    if (game === "space") return begin({ kind: "space" });
    if (game === "sudoku") {
      const p = generatePracticeSudoku(difficulty);
      return begin({ kind: "sudoku", puzzle: p.puzzle, solution: p.solution });
    }
    const w = generateWordsPuzzle(profession, difficulty);
    begin({ kind: "words", letters: w.letters, words: w.words, size: w.size });
  };

  const startTournamentRun = async () => {
    if (!t || !tournamentId) return;
    setBusy(true);
    try {
      if (!t.joined) {
        const j = await joinTournament(tournamentId, code);
        if (!j.ok) throw new Error(JOIN_REFUSAL[j.reason || ""] || "Couldn't join this tournament.");
      }
      const r = await startRun(tournamentId);
      if (!r.ok || !r.run_id) throw new Error(JOIN_REFUSAL[r.reason || ""] || "Couldn't start a run.");
      runRef.current = r.run_id;
      const diff = (r.difficulty as ZeroGameDifficulty) || "medium";
      if (game === "space") begin({ kind: "space" });
      else if (game === "sudoku") {
        const puzzle = r.puzzle || generatePracticeSudoku(diff).puzzle;
        begin({ kind: "sudoku", puzzle });
      } else {
        const w = generateWordsPuzzle(r.profession || ZERO_GAME_PROFESSIONS[0], diff);
        begin({ kind: "words", letters: w.letters, words: w.words, size: w.size });
      }
      void queryClient.invalidateQueries({ queryKey: ["zero-tournament", tournamentId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const complete = async (score: number, detailText: string, meta: Record<string, unknown>, solution?: string) => {
    const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    if (tournamentId && runRef.current) {
      setSubmitting(true);
      try {
        const r = await finishRun(runRef.current, score, { ...meta, seconds }, solution);
        runRef.current = null;
        if (!r.ok) {
          setResult({ score: 0, detail: r.reason === "ended" ? "The tournament ended before this run was saved." : "This run couldn't be saved.", failed: true });
        } else {
          const prev = t?.me?.best_score || 0;
          setResult({ score: r.score || 0, best: r.best, detail: detailText, newBest: (r.score || 0) > prev && (r.score || 0) > 0 });
        }
        void queryClient.invalidateQueries({ queryKey: ["zero-tournament", tournamentId] });
        void queryClient.invalidateQueries({ queryKey: ["zero-tournaments"] });
      } catch (e) {
        setResult({ score, detail: (e as Error).message, failed: true });
      } finally {
        setSubmitting(false);
      }
    } else {
      const k = bestKey(game, variant);
      const prev = readBest(k);
      if (score > prev) writeBest(k, score);
      setResult({ score, best: Math.max(prev, score), detail: detailText, newBest: score > prev && prev > 0 });
    }
    setPhase("result");
  };

  const onSpaceOver = (r: ZeroSpaceResult) => {
    void complete(r.score, `${r.orbs} orbs · ${r.seconds}s · ${r.cause === "fuel" ? "ran out of fuel" : "caught by doubt"}`, { orbs: r.orbs, cause: r.cause });
  };

  const onSudoku = (sol: string) => {
    if (board?.kind !== "sudoku") return;
    if (!sudokuValid(board.puzzle, sol)) {
      toast.error("Not quite — some rows, columns or boxes repeat a number.");
      return;
    }
    const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const score = Math.max(1000, 10000 - seconds * 4);
    void complete(score, `Solved in ${formatGameTime(seconds)}`, {}, sol);
  };

  const onWords = (found: Array<{ word: string }>) => {
    if (board?.kind !== "words") return;
    const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const score = wordsScore(found.length, board.words.length, seconds);
    void complete(score, `${found.length} of ${board.words.length} words · ${formatGameTime(seconds)}`, { total: board.words.length, found: found.length });
  };

  const quit = () => {
    if (!window.confirm(tournamentId ? "Leave this run? It will count as 0." : "Leave this game?")) return;
    if (tournamentId && runRef.current) {
      void finishRun(runRef.current, 0, { quit: true }).catch(() => undefined);
      runRef.current = null;
    }
    setPhase("splash");
  };

  // Back returns to the page you opened the game from (the tournament or the
  // hub) instead of pushing a new copy of it, which made back loop.
  const back = useGoBack(tournamentId ? `/app/games/t/${tournamentId}${code ? `?code=${encodeURIComponent(code)}` : ""}` : "/app/games");

  /* ── splash ── */
  if (phase === "splash") {
    if (tournamentId) {
      if (detail.isLoading) return <div className="fixed inset-0 z-[60] grid place-items-center bg-[#0b0618]"><ZeroPageLoader /></div>;
      if (!t) {
        return (
          <GameSplash
            game={game} onBack={back} eyebrow="Tournament"
            primaryLabel={detail.data && detail.data.found && detail.data.locked ? "Invite link needed" : "Tournament not found"}
            primaryDisabled onPrimary={() => undefined}
            secondary={{ label: "Back to Zero Games", onClick: () => navigate({ to: "/app/games" }) }}
          />
        );
      }
      const tour = t.tournament;
      const starts = new Date(tour.starts_at).getTime(), ends = new Date(tour.ends_at).getTime();
      const status = now < starts ? "upcoming" : now >= ends ? "ended" : "live";
      const label = status === "upcoming" ? `Starts in ${countdown(starts - now)}`
        : status === "ended" ? "Tournament ended"
        : !t.can_enter ? "Premium members only"
        : t.joined ? (t.me?.plays ? "Play another run" : "Start your run") : "Join & play";
      return (
        <GameSplash
          game={game}
          onBack={back}
          eyebrow={tour.title}
          primaryLabel={label}
          primaryBusy={busy}
          primaryDisabled={status !== "live" || !t.can_enter}
          onPrimary={() => void startTournamentRun()}
          secondary={{ label: "Leaderboard", onClick: back }}
          footer={status === "live" ? (
            <span>
              Ends in {countdown(ends - now)} · {t.me?.best_score ? `Your best ${t.me.best_score.toLocaleString()}${t.me.rank ? ` (#${t.me.rank})` : ""}` : "Best run counts"}
            </span>
          ) : undefined}
        />
      );
    }
    const best = readBest(bestKey(game, variant));
    if (featured) {
      return (
        <GameSplash
          game={game}
          onBack={back}
          eyebrow={featured.sponsored ? "Zero Club tournament · live" : "Live tournament"}
          primaryLabel={featured.joined ? "Play in the tournament" : "Join & play the tournament"}
          onPrimary={() => navigate({ to: "/app/games/play/$game", params: { game }, search: { t: featured.id, code: undefined }, replace: true })}
          secondary={{ label: "Practice instead", onClick: startPractice }}
          footer={
            <div className="space-y-1">
              <p className="font-semibold text-white/90">{featured.title}</p>
              <p>{previewPrizeLine(featured)} · {featured.players.toLocaleString()} {featured.players === 1 ? "player" : "players"} · ends in {countdown(new Date(featured.ends_at).getTime() - now)}</p>
              <p className="text-white/55">Only tournament runs count on the leaderboard.</p>
            </div>
          }
        />
      );
    }
    return (
      <GameSplash
        game={game}
        onBack={back}
        primaryLabel="Play practice"
        onPrimary={startPractice}
        secondary={{ label: `${info.name} tournaments`, onClick: () => navigate({ to: "/app/games", search: { game } }) }}
        footer={
          <div className="space-y-3">
            {game !== "space" && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {DIFFS.map((d) => (
                  <button key={d} onClick={() => setDifficulty(d)} className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold capitalize ${difficulty === d ? "bg-white text-[#140a1c]" : "bg-white/10 text-white/75"}`}>{d}</button>
                ))}
                {game === "words" && (
                  <select value={profession} onChange={(e) => setProfession(e.target.value)} className="h-8 max-w-[170px] rounded-full border-0 bg-white/10 px-3 text-[12.5px] font-semibold text-white outline-none">
                    {ZERO_GAME_PROFESSIONS.map((p) => <option key={p} value={p} className="text-black">{p}</option>)}
                  </select>
                )}
              </div>
            )}
            <p>{best > 0 ? `Your best: ${best.toLocaleString()} pts` : "Practice runs don't affect tournaments"}</p>
          </div>
        }
      />
    );
  }

  /* ── result ── */
  if (phase === "result" && result) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-6 text-center text-white" style={{ background: `radial-gradient(120% 80% at 50% 20%, ${info.to}, ${info.from} 70%)` }}>
        <style>{SPLASH_CSS}</style>
        <p className="zg-rise text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: info.accent }}>
          {result.failed ? "Run not saved" : result.newBest ? "New personal best" : tournamentId ? "Run saved" : "Run complete"}
        </p>
        <p className="zg-pop mt-3 font-display text-[64px] font-bold leading-none tabular-nums">{result.score.toLocaleString()}</p>
        <p className="mt-1 text-[14px] text-white/60">Game Points</p>
        <p className="zg-rise mt-5 max-w-[320px] text-[14.5px] text-white/80" style={{ animationDelay: "120ms" }}>{result.detail}</p>
        {result.best !== undefined && !result.failed && (
          <p className="mt-2 text-[13px] text-white/55">{tournamentId ? "Your tournament best" : "Your best"}: {result.best.toLocaleString()}</p>
        )}
        <div className="mt-10 w-full max-w-[360px] space-y-3">
          <button
            onClick={() => (tournamentId ? void startTournamentRun() : startPractice())}
            disabled={busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full text-[16px] font-bold text-[#140a1c] disabled:opacity-50"
            style={{ background: info.accent }}
          >
            <RotateCcw className="h-5 w-5" /> Play again
          </button>
          {tournamentId ? (
            <Link to="/app/games/t/$id" params={{ id: tournamentId }} search={{ code }} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white/10 text-[14.5px] font-semibold">
              <Trophy className="h-4 w-4" /> Leaderboard
            </Link>
          ) : (
            <button onClick={() => setPhase("splash")} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white/10 text-[14.5px] font-semibold">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── playing ── */
  if (game === "space" || board?.kind === "space") {
    return (
      <div className="fixed inset-0 z-[60] bg-[#0b0618]">
        <SafeTop>{(top) => <ZeroSpaceGame key={runKey} onGameOver={onSpaceOver} topInset={top} />}</SafeTop>
        <button onClick={quit} aria-label="Leave game" className="absolute bottom-[calc(env(safe-area-inset-bottom)+14px)] right-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/80 backdrop-blur">
          <X className="h-5 w-5" />
        </button>
        {submitting && <div className="absolute inset-0 grid place-items-center bg-black/40"><ZeroPageLoader label="Saving your run" /></div>}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] backdrop-blur">
        <button onClick={quit} aria-label="Leave game" className="grid h-10 w-10 place-items-center rounded-full hover:bg-foreground/[0.05]"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{info.name}</p>
          <p className="truncate text-[12px] text-muted-foreground">{t ? t.tournament.title : "Practice"}</p>
        </div>
        <span className="flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 text-[14px] font-bold tabular-nums">
          <Clock3 className="h-4 w-4" /> {formatGameTime(elapsed)}
        </span>
      </header>
      <main className="mx-auto w-full max-w-[720px] px-3 py-4">
        {board?.kind === "sudoku" && (
          <SudokuRaceBoard key={runKey} puzzle={board.puzzle} submitting={submitting} submitLabel="Submit grid" onSubmit={onSudoku} />
        )}
        {board?.kind === "words" && (
          <WordsRaceBoard
            key={runKey}
            letters={board.letters}
            words={board.words}
            size={board.size}
            submitting={submitting}
            submitLabel="Finish"
            wordListTitle="Words to find"
            wordListHint="Drag across letters in a straight line."
            wordListFirstOnMobile
            onSubmit={onWords}
          />
        )}
      </main>
    </div>
  );
}

/** Measures env(safe-area-inset-top) so the canvas HUD clears the notch. */
function SafeTop({ children }: { children: (top: number) => ReactNode }) {
  const probe = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => { setTop(probe.current ? probe.current.getBoundingClientRect().height : 0); }, []);
  return (
    <>
      <div ref={probe} aria-hidden className="pointer-events-none absolute left-0 top-0 w-px" style={{ height: "env(safe-area-inset-top)" }} />
      <div className="absolute inset-0">{top === null ? null : children(top)}</div>
    </>
  );
}
