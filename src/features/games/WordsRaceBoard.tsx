import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, Send } from "lucide-react";
import { getSelectionPath } from "@/features/games/zeroGames";

type WordsRaceBoardProps = {
  letters: string[];
  words: string[];
  size?: number;
  disabled?: boolean;
  submitting?: boolean;
  onProgress?: (progress: number) => void;
  onSubmit: (found: Array<{ word: string; path: number[] }>) => void;
};

export function WordsRaceBoard({
  letters,
  words,
  size = 12,
  disabled = false,
  submitting = false,
  onProgress,
  onSubmit,
}: WordsRaceBoardProps) {
  const [start, setStart] = useState<number | null>(null);
  const [preview, setPreview] = useState<number[]>([]);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [foundPaths, setFoundPaths] = useState<number[][]>([]);
  const [miss, setMiss] = useState(false);

  useEffect(() => {
    setStart(null);
    setPreview([]);
    setFoundWords([]);
    setFoundPaths([]);
  }, [letters, words]);

  const foundCells = useMemo(() => new Set(foundPaths.flat()), [foundPaths]);
  const previewCells = useMemo(() => new Set(preview), [preview]);

  const chooseCell = (index: number) => {
    if (disabled) return;
    if (start === null) {
      setStart(index);
      setPreview([index]);
      setMiss(false);
      return;
    }

    const path = getSelectionPath(start, index, size);
    const selection = path.map((cell) => letters[cell]).join("");
    const reversed = selection.split("").reverse().join("");
    const match = words.find((word) => !foundWords.includes(word) && (word === selection || word === reversed));
    if (match) {
      const nextFound = [...foundWords, match];
      const nextPaths = [...foundPaths, path];
      setFoundWords(nextFound);
      setFoundPaths(nextPaths);
      onProgress?.(Math.round((nextFound.length / words.length) * 100));
      if (nextFound.length === words.length) {
        onSubmit(nextFound.map((word, foundIndex) => ({ word, path: nextPaths[foundIndex] })));
      }
    } else {
      setMiss(true);
      window.setTimeout(() => setMiss(false), 260);
    }
    setStart(null);
    setPreview([]);
  };

  const resetSelection = () => {
    setStart(null);
    setPreview([]);
    setMiss(false);
  };

  return (
    <div className="mx-auto grid w-full max-w-[980px] gap-5 lg:grid-cols-[minmax(0,620px)_minmax(220px,1fr)] lg:items-start">
      <div>
        <div
          className={`grid aspect-square w-full max-w-[620px] border border-foreground/80 bg-foreground/10 p-1 transition ${miss ? "translate-x-0.5 ring-2 ring-destructive/30" : ""}`}
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {letters.map((letter, index) => {
            const isPreview = previewCells.has(index);
            const isFound = foundCells.has(index);
            return (
              <button
                key={index}
                type="button"
                disabled={disabled}
                data-word-cell={index}
                onClick={() => chooseCell(index)}
                onPointerEnter={(event) => {
                  if (start !== null && event.pointerType === "mouse") setPreview(getSelectionPath(start, index, size));
                }}
                className={`grid min-h-0 min-w-0 place-items-center border border-background/70 text-[clamp(10px,3.3vw,22px)] font-semibold transition-colors sm:text-[18px] ${
                  isFound ? "bg-emerald-500 text-white" : isPreview ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-primary/10"
                }`}
                aria-label={`Letter ${letter}`}
              >
                {letter}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-[44px_minmax(0,1fr)] gap-2 lg:hidden">
          <button type="button" title="Clear selection" onClick={resetSelection} disabled={disabled || start === null} className="grid h-11 place-items-center rounded-md border border-border bg-card text-muted-foreground disabled:opacity-35">
            <RotateCcw className="h-[18px] w-[18px]" />
          </button>
          <button type="button" disabled={disabled || submitting || foundWords.length !== words.length} onClick={() => onSubmit(foundWords.map((word, foundIndex) => ({ word, path: foundPaths[foundIndex] })))} className="flex h-11 items-center justify-center gap-2 rounded-md bg-foreground text-[12px] font-semibold text-background disabled:opacity-35">
            <Send className="h-4 w-4 fill-current" /> {submitting ? "Checking" : "Finish race"}
          </button>
        </div>
      </div>

      <aside className="rounded-md border border-border bg-card p-4 lg:sticky lg:top-5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Word board</p>
          <span className="text-[11px] font-semibold tabular-nums text-primary">{foundWords.length}/{words.length}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
          {words.map((word) => {
            const found = foundWords.includes(word);
            return (
              <div key={word} className={`flex h-9 min-w-0 items-center gap-2 rounded-md border px-2.5 text-[11px] font-semibold ${found ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400" : "border-border bg-background text-foreground"}`}>
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-sm ${found ? "bg-emerald-500 text-white" : "border border-border"}`}>{found && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                <span className={found ? "truncate line-through opacity-65" : "truncate"}>{word}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 hidden grid-cols-[44px_minmax(0,1fr)] gap-2 lg:grid">
          <button type="button" title="Clear selection" onClick={resetSelection} disabled={disabled || start === null} className="grid h-11 place-items-center rounded-md border border-border bg-background text-muted-foreground disabled:opacity-35">
            <RotateCcw className="h-[18px] w-[18px]" />
          </button>
          <button type="button" disabled={disabled || submitting || foundWords.length !== words.length} onClick={() => onSubmit(foundWords.map((word, foundIndex) => ({ word, path: foundPaths[foundIndex] })))} className="flex h-11 items-center justify-center gap-2 rounded-md bg-foreground text-[12px] font-semibold text-background disabled:opacity-35">
            <Send className="h-4 w-4 fill-current" /> {submitting ? "Checking" : "Finish race"}
          </button>
        </div>
      </aside>
    </div>
  );
}
