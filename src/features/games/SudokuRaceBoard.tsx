import { useEffect, useMemo, useState } from "react";
import { Eraser, Pencil, RotateCcw, Send } from "lucide-react";
import { hasSudokuConflict } from "@/features/games/zeroGames";

type SudokuRaceBoardProps = {
  puzzle: string;
  disabled?: boolean;
  submitting?: boolean;
  onProgress?: (progress: number) => void;
  onSubmit: (solution: string) => void;
};

export function SudokuRaceBoard({
  puzzle,
  disabled = false,
  submitting = false,
  onProgress,
  onSubmit,
}: SudokuRaceBoardProps) {
  const initialBoard = useMemo(() => puzzle.split("").map((value) => value === "-" ? "" : value), [puzzle]);
  const givens = useMemo(() => new Set(initialBoard.map((value, index) => value ? index : -1).filter((index) => index >= 0)), [initialBoard]);
  const [board, setBoard] = useState(initialBoard);
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  const [notes, setNotes] = useState<Record<number, number[]>>({});
  const [history, setHistory] = useState<string[][]>([]);

  useEffect(() => {
    setBoard(initialBoard);
    setSelected(null);
    setNotes({});
    setHistory([]);
  }, [initialBoard]);

  const placeNumber = (value: number | null) => {
    if (disabled || selected === null || givens.has(selected)) return;
    if (notesMode && value) {
      setNotes((current) => {
        const cellNotes = current[selected] || [];
        return {
          ...current,
          [selected]: cellNotes.includes(value)
            ? cellNotes.filter((note) => note !== value)
            : [...cellNotes, value].sort(),
        };
      });
      return;
    }

    setHistory((current) => [...current.slice(-19), board]);
    const next = [...board];
    next[selected] = value ? String(value) : "";
    setBoard(next);
    setNotes((current) => ({ ...current, [selected]: [] }));
    const editableCells = 81 - givens.size;
    const completedCells = next.filter(Boolean).length - givens.size;
    onProgress?.(Math.round((completedCells / editableCells) * 100));
  };

  const undo = () => {
    if (disabled || history.length === 0) return;
    const previous = history[history.length - 1];
    setBoard(previous);
    setHistory((current) => current.slice(0, -1));
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (/^[1-9]$/.test(event.key)) placeNumber(Number(event.key));
      if (event.key === "Backspace" || event.key === "Delete") placeNumber(null);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") undo();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const hasConflict = board.some((_, index) => hasSudokuConflict(board, index));
  const isComplete = board.every(Boolean);

  return (
    <div className="mx-auto w-full max-w-[610px]">
      <div className="mx-auto grid aspect-square w-full max-w-[560px] grid-cols-9 overflow-hidden border-2 border-foreground bg-foreground">
        {board.map((value, index) => {
          const row = Math.floor(index / 9);
          const column = index % 9;
          const isSelected = selected === index;
          const selectedValue = selected !== null ? board[selected] : "";
          const related = selected !== null && (
            Math.floor(selected / 9) === row
            || selected % 9 === column
            || (Math.floor(Math.floor(selected / 9) / 3) === Math.floor(row / 3)
              && Math.floor((selected % 9) / 3) === Math.floor(column / 3))
          );
          const matching = Boolean(value && selectedValue && value === selectedValue);
          const conflict = hasSudokuConflict(board, index);
          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(index)}
              aria-label={`Row ${row + 1}, column ${column + 1}${value ? `, ${value}` : ""}`}
              className={`relative grid min-h-0 min-w-0 place-items-center bg-background text-[clamp(14px,4.8vw,27px)] font-semibold tabular-nums transition-colors disabled:cursor-default sm:text-[25px] ${
                isSelected ? "!bg-primary/20 text-primary" : matching ? "!bg-primary/10 text-primary" : related ? "!bg-foreground/[0.055]" : ""
              } ${conflict ? "!bg-destructive/12 !text-destructive" : ""}`}
              style={{
                borderRight: column === 8 ? 0 : `${column === 2 || column === 5 ? 2 : 1}px solid ${column === 2 || column === 5 ? "var(--foreground)" : "var(--border)"}`,
                borderBottom: row === 8 ? 0 : `${row === 2 || row === 5 ? 2 : 1}px solid ${row === 2 || row === 5 ? "var(--foreground)" : "var(--border)"}`,
              }}
            >
              {value ? (
                <span className={givens.has(index) ? "text-foreground" : "text-primary"}>{value}</span>
              ) : notes[index]?.length ? (
                <span className="grid h-full w-full grid-cols-3 grid-rows-3 p-[2px] text-[clamp(5px,1.7vw,9px)] font-medium text-muted-foreground">
                  {Array.from({ length: 9 }, (_, noteIndex) => (
                    <span key={noteIndex} className="grid place-items-center">{notes[index]?.includes(noteIndex + 1) ? noteIndex + 1 : ""}</span>
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-4 grid max-w-[560px] grid-cols-9 gap-1.5 sm:gap-2">
        {Array.from({ length: 9 }, (_, index) => index + 1).map((number) => (
          <button
            key={number}
            type="button"
            disabled={disabled}
            onClick={() => placeNumber(number)}
            className="aspect-square rounded-md border border-border bg-card text-[15px] font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/[0.06] active:scale-95 disabled:opacity-50 sm:text-[17px]"
          >
            {number}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-3 grid max-w-[560px] grid-cols-[44px_44px_44px_minmax(0,1fr)] gap-2">
        <button type="button" title="Undo" onClick={undo} disabled={disabled || history.length === 0} className="grid h-11 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-35">
          <RotateCcw className="h-[18px] w-[18px]" />
        </button>
        <button type="button" title="Pencil notes" onClick={() => setNotesMode((current) => !current)} disabled={disabled} className={`grid h-11 place-items-center rounded-md border transition ${notesMode ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
          <Pencil className="h-[18px] w-[18px] fill-current" />
        </button>
        <button type="button" title="Erase" onClick={() => placeNumber(null)} disabled={disabled} className="grid h-11 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-35">
          <Eraser className="h-[18px] w-[18px] fill-current" />
        </button>
        <button
          type="button"
          disabled={disabled || submitting || !isComplete || hasConflict}
          onClick={() => onSubmit(board.join(""))}
          className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-md bg-foreground px-4 text-[12px] font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Send className="h-4 w-4 fill-current" />
          <span>{submitting ? "Checking" : "Finish race"}</span>
        </button>
      </div>
    </div>
  );
}
