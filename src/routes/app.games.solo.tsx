import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Brain,
  Check,
  Clock3,
  Gamepad2,
  RotateCcw,
  Sparkles,
  Trophy,
} from "@/components/icons/solar";
import { SudokuRaceBoard } from "@/features/games/SudokuRaceBoard";
import { WordsRaceBoard } from "@/features/games/WordsRaceBoard";
import {
  formatGameTime,
  generatePracticeSudoku,
  generateWordsPuzzle,
  getGameName,
  ZERO_GAME_PROFESSIONS,
  type ZeroGameDifficulty,
  type ZeroGameType,
} from "@/features/games/zeroGames";
import { toast } from "sonner";

export const Route = createFileRoute("/app/games/solo")({
  validateSearch: (search: Record<string, unknown>) => ({
    game: search.game === "words" ? "words" as const : "sudoku" as const,
    difficulty: (["easy", "medium", "hard", "expert"] as const).includes(search.difficulty as ZeroGameDifficulty)
      ? search.difficulty as ZeroGameDifficulty
      : "easy" as const,
    profession: typeof search.profession === "string" && ZERO_GAME_PROFESSIONS.includes(search.profession as any)
      ? search.profession
      : ZERO_GAME_PROFESSIONS[0],
  }),
  component: SoloGame,
});

function SoloGame() {
  const search = Route.useSearch();
  const [gameType, setGameType] = useState<ZeroGameType>(search.game);
  const [difficulty, setDifficulty] = useState<ZeroGameDifficulty>(search.difficulty);
  const [profession, setProfession] = useState(search.profession);
  const [session, setSession] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [bestTime, setBestTime] = useState<number | null>(null);

  const puzzle = useMemo(() => gameType === "sudoku"
    ? generatePracticeSudoku(difficulty)
    : generateWordsPuzzle(profession, difficulty), [difficulty, gameType, profession, session]);

  const bestTimeKey = `zero-games:solo-best:${gameType}:${difficulty}:${gameType === "words" ? profession : "logic"}`;

  useEffect(() => {
    const saved = Number(localStorage.getItem(bestTimeKey));
    setBestTime(saved > 0 ? saved : null);
  }, [bestTimeKey]);

  useEffect(() => {
    if (completed) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [completed, session]);

  const startFresh = () => {
    setElapsed(0);
    setProgress(0);
    setCompleted(false);
    setSession((value) => value + 1);
  };

  const changeGame = (next: ZeroGameType) => {
    setGameType(next);
    setDifficulty("easy");
    setElapsed(0);
    setProgress(0);
    setCompleted(false);
    setSession((value) => value + 1);
  };

  const finish = () => {
    if (completed) return;
    setProgress(100);
    setCompleted(true);
    const previous = Number(localStorage.getItem(bestTimeKey));
    if (!previous || elapsed < previous) {
      localStorage.setItem(bestTimeKey, String(Math.max(1, elapsed)));
      setBestTime(Math.max(1, elapsed));
      toast.success("Solo game complete. New personal best.");
    } else {
      toast.success("Solo game complete.");
    }
  };

  const submitSudoku = (solution: string) => {
    if (gameType !== "sudoku") return;
    if (solution !== (puzzle as ReturnType<typeof generatePracticeSudoku>).solution) {
      toast.error("A few cells still need another look.");
      return;
    }
    finish();
  };

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-40 bg-background/96 px-4 py-3 backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3">
          <Link to="/app/games" className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-card"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0 flex-1"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Solo play</p><h1 className="truncate text-[17px] font-semibold tracking-tight">{getGameName(gameType)}</h1></div>
          <span className="hidden rounded-md border border-border bg-card px-3 py-2 text-[10px] font-semibold text-muted-foreground sm:block">No lobby · No rewards</span>
          <button type="button" onClick={startFresh} className="grid h-9 w-9 place-items-center rounded-md bg-foreground text-background" title="New board"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 py-5 md:px-7 md:py-7">
        <section className="border-b border-border pb-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Your own pace</p>
              <h2 className="mt-1 text-[22px] font-semibold tracking-tight">Play without a waiting room</h2>
              <p className="mt-1 max-w-2xl text-[11.5px] leading-5 text-muted-foreground">Solve a fresh board immediately. Solo sessions do not use a reward allowance and cannot unlock cash, offers, ZP, or XP.</p>
            </div>
            <div className="grid grid-cols-2 rounded-md border border-border bg-card p-1">
              <ModeButton active={gameType === "sudoku"} onClick={() => changeGame("sudoku")} Icon={Brain} label="Sudoku" />
              <ModeButton active={gameType === "words"} onClick={() => changeGame("words")} Icon={Sparkles} label="Words" />
            </div>
          </div>
        </section>

        <section className="grid gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_250px] lg:items-start">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Current board</p>
                <h3 className="mt-1 text-[16px] font-semibold capitalize">{difficulty} {gameType === "words" ? profession : "logic"}</h3>
              </div>
              <div className="flex items-center gap-2">
                {gameType === "words" && <select value={profession} onChange={(event) => { setProfession(event.target.value); startFresh(); }} className="h-9 max-w-[180px] rounded-md border border-border bg-card px-2 text-[10.5px] font-semibold outline-none">{ZERO_GAME_PROFESSIONS.map((field) => <option key={field}>{field}</option>)}</select>}
                <select value={difficulty} onChange={(event) => { setDifficulty(event.target.value as ZeroGameDifficulty); startFresh(); }} className="h-9 rounded-md border border-border bg-card px-2 text-[10.5px] font-semibold capitalize outline-none">{(["easy", "medium", "hard", "expert"] as const).map((level) => <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>)}</select>
              </div>
            </div>

            {gameType === "sudoku" ? (
              <SudokuRaceBoard
                key={`sudoku-${session}-${difficulty}`}
                puzzle={(puzzle as ReturnType<typeof generatePracticeSudoku>).puzzle}
                disabled={completed}
                onProgress={setProgress}
                onSubmit={submitSudoku}
                submitLabel="Finish game"
              />
            ) : (
              <WordsRaceBoard
                key={`words-${session}-${profession}-${difficulty}`}
                letters={(puzzle as ReturnType<typeof generateWordsPuzzle>).letters}
                words={(puzzle as ReturnType<typeof generateWordsPuzzle>).words}
                size={(puzzle as ReturnType<typeof generateWordsPuzzle>).size}
                disabled={completed}
                onProgress={setProgress}
                onSubmit={() => finish()}
                submitLabel="Finish game"
                wordListTitle="Words to find"
                wordListHint="Trace each word across the board. Words can run straight or diagonally."
                wordListFirstOnMobile
              />
            )}
          </div>

          <aside className="rounded-md border border-border bg-card p-4 lg:sticky lg:top-20">
            <div className={`grid h-10 w-10 place-items-center rounded-md ${completed ? "bg-emerald-500 text-white" : "bg-foreground text-background"}`}>{completed ? <Check className="h-5 w-5" strokeWidth={3} /> : <Gamepad2 className="h-5 w-5 fill-current" />}</div>
            <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{completed ? "Session complete" : "Solo session"}</p>
            <p className="mt-1 text-[16px] font-semibold">{completed ? "Board cleared" : "Keep building focus"}</p>
            <div className="mt-4 divide-y divide-border border-y border-border text-[11px]">
              <StatRow Icon={Clock3} label="Time" value={formatGameTime(elapsed)} />
              <StatRow Icon={Trophy} label="Personal best" value={bestTime ? formatGameTime(bestTime) : "First run"} />
              <StatRow Icon={Gamepad2} label="Progress" value={`${progress}%`} />
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
            <button type="button" onClick={startFresh} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground text-[11px] font-semibold text-background"><RotateCcw className="h-4 w-4" />New board</button>
            <Link to="/app/games/create" search={{ game: gameType }} className="mt-2 grid h-10 place-items-center rounded-md border border-border text-[10.5px] font-semibold">Host a rewarded race</Link>
          </aside>
        </section>
      </main>
    </div>
  );
}

function ModeButton({ active, onClick, Icon, label }: any) {
  return <button type="button" onClick={onClick} className={`flex h-9 items-center justify-center gap-2 rounded-sm px-4 text-[10.5px] font-semibold ${active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4 fill-current" />{label}</button>;
}

function StatRow({ Icon, label, value }: any) {
  return <div className="flex items-center gap-2.5 py-3"><Icon className="h-3.5 w-3.5 text-muted-foreground" /><span className="flex-1 text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{value}</span></div>;
}
