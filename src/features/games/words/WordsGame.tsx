import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronRight, Sparkles, Wand2, X } from "@/components/icons/glyphs";
import { blankOut, buildGrid, gridForm, sameTerm, shuffle, straightPath, STRENGTH, type WordResult, type WordTerm } from "./api";

/**
 * Zero Words: the three stages of a round, shared by pack rounds and daily review.
 *
 *   Find   — spot the terms in a letter grid; each one found flips to show
 *            what it means (exposure, the warm-up).
 *   Match  — a meaning (or the term's own sentence with a gap) appears; pick
 *            the right term from four (recognition, timed).
 *   Recall — the sentence with the term blanked; type it (retrieval, the
 *            strongest for memory).
 */

export const AMBER = "#ffb547";
export const WORDS_CSS = `
@keyframes zw-in { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes zw-pop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.06); opacity: 1; } 100% { transform: none; } }
@keyframes zw-shake { 0%,100% { transform: none; } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
@keyframes zw-flip { from { transform: rotateX(80deg); opacity: 0; } to { transform: none; opacity: 1; } }
.zw-in { animation: zw-in .35s cubic-bezier(.2,.8,.2,1) both; }
.zw-pop { animation: zw-pop .4s cubic-bezier(.2,.9,.3,1.2) both; }
.zw-shake { animation: zw-shake .4s ease-in-out; }
.zw-flip { animation: zw-flip .35s cubic-bezier(.2,.8,.2,1) both; transform-origin: top; }
`;

export const btnPrimary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#ffd36b,#ffb547_50%,#f08a24)] px-6 text-[15px] font-bold text-[#2a1600] shadow-[0_16px_36px_-16px_rgba(255,181,71,0.9)] transition active:scale-[0.98] disabled:opacity-40";
export const btnGhost =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/[0.07] px-5 text-[14px] font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/[0.12] active:scale-[0.98] disabled:opacity-40";

/** Full-screen dark frame shared by every Zero Words screen. */
export function WordsShell({ title, sub, onBack, right, children }: { title: string; sub?: string; onBack: () => void; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#0d070b] text-white">
      <style>{WORDS_CSS}</style>
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#ffb547]/[0.13] blur-[130px]" />
        <div className="absolute -right-40 top-1/3 h-[500px] w-[500px] rounded-full bg-[#cc208f]/[0.14] blur-[130px]" />
      </div>
      <div className="relative mx-auto w-full max-w-[880px] px-3 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+10px)] sm:px-6">
        <header className="sticky top-[calc(env(safe-area-inset-top)+8px)] z-20 mb-5 flex items-center gap-3 rounded-[22px] bg-[#170c13]/75 px-2.5 py-2 ring-1 ring-white/[0.07] backdrop-blur-xl">
          <button onClick={onBack} aria-label="Back" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.07] transition hover:bg-white/[0.12]">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] font-display text-[17px] font-black text-[#2a1600] shadow-[0_8px_20px_-8px_rgba(255,181,71,0.8)]" style={{ background: "linear-gradient(145deg,#ffe2a0,#ffb547 55%,#e07b17)" }}>
            W
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[17px] font-bold leading-tight tracking-tight">{title}</h1>
            {sub && <p className="truncate text-[11.5px] text-white/50">{sub}</p>}
          </div>
          {right}
        </header>
        {children}
      </div>
    </div>
  );
}

export function StageSteps({ stage }: { stage: 0 | 1 | 2 }) {
  const steps = ["Find", "Match", "Recall"];
  return (
    <div className="mb-4 flex items-center gap-2" aria-label="Round progress">
      {steps.map((s, i) => (
        <div key={s} className="flex flex-1 items-center gap-2">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${i < stage ? "bg-[#61e6ac] text-[#06261a]" : i === stage ? "bg-[#ffb547] text-[#2a1600]" : "bg-white/[0.07] text-white/40"}`}>
            {i < stage ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={`text-[12.5px] font-semibold ${i === stage ? "text-white" : "text-white/40"}`}>{s}</span>
          {i < 2 && <span className={`h-px flex-1 ${i < stage ? "bg-[#61e6ac]/50" : "bg-white/10"}`} />}
        </div>
      ))}
    </div>
  );
}

/* ───────────── Find ───────────── */

/** A clue that points at a term without showing it: its meaning, or its sentence with a gap. */
export function termClue(t: WordTerm) {
  if (t.meaning) return t.meaning;
  const blanks = blankOut(t.context, t.term);
  if (!blanks) return `Starts with “${t.term.slice(0, 1).toUpperCase()}”`;
  const before = blanks.before.length > 70 ? `…${blanks.before.slice(-70).replace(/^\S*\s/, "")}` : blanks.before;
  const after = blanks.after.length > 70 ? `${blanks.after.slice(0, 70).replace(/\s\S*$/, "")}…` : blanks.after;
  return `${before}_____${after}`;
}

/**
 * clues: the term list stays hidden and each term is shown only as a clue
 * (used for packs whose creator picked the terms, so they don't just see them).
 */
export function FindStage({ terms, onDone, clues = false }: { terms: WordTerm[]; onDone: (found: string[], ms: number) => void; clues?: boolean }) {
  const { size, letters, placed } = useMemo(() => buildGrid(terms.map((t) => t.term)), [terms]);
  const startedAt = useRef(Date.now());
  const [found, setFound] = useState<string[]>([]);
  const [paths, setPaths] = useState<number[][]>([]);
  const [drag, setDrag] = useState<{ start: number; path: number[] } | null>(null);
  const [miss, setMiss] = useState(0);
  const [revealed, setRevealed] = useState<WordTerm | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const foundCells = useMemo(() => new Set(paths.flat()), [paths]);
  const dragCells = useMemo(() => new Set(drag?.path || []), [drag]);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(t);
  }, []);

  const cellAt = (x: number, y: number) => {
    const el = board.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const c = Math.floor(((x - rect.left) / rect.width) * size), r = Math.floor(((y - rect.top) / rect.height) * size);
    return r < 0 || c < 0 || r >= size || c >= size ? null : r * size + c;
  };
  const finish = (path: number[]) => {
    const word = path.map((i) => letters[i]).join("");
    const rev = word.split("").reverse().join("");
    const hit = placed.find((p) => !found.includes(p.term) && (p.form === word || p.form === rev));
    if (hit) {
      const next = [...found, hit.term];
      setFound(next);
      setPaths((ps) => [...ps, path]);
      setRevealed(terms.find((t) => t.term === hit.term) || null);
      try { navigator.vibrate?.(15); } catch { /* not supported */ }
    } else if (path.length > 1) setMiss((m) => m + 1);
  };
  const allFound = found.length >= placed.length && placed.length > 0;

  return (
    <div className="zw-in">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] text-white/60">{clues ? "Read a clue, then drag across the letters to find its term." : "Drag across the letters to find each term."}</p>
        <span className="rounded-full bg-white/[0.07] px-3 py-1 font-mono text-[13px] tabular-nums text-white/80">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div
          ref={board}
          key={miss}
          className={`grid aspect-square w-full touch-none select-none overflow-hidden rounded-[22px] bg-[#1b0f17] p-1.5 ring-1 ring-white/[0.08] ${miss ? "zw-shake" : ""}`}
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
          onPointerDown={(e) => {
            const cell = cellAt(e.clientX, e.clientY);
            if (cell === null) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDrag({ start: cell, path: [cell] });
          }}
          onPointerMove={(e) => {
            if (!drag) return;
            const cell = cellAt(e.clientX, e.clientY);
            if (cell === null) return;
            const path = straightPath(drag.start, cell, size);
            if (path.length) setDrag({ start: drag.start, path });
          }}
          onPointerUp={() => {
            if (drag) finish(drag.path);
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
        >
          {letters.map((l, i) => (
            <span
              key={i}
              className={`m-[1.5px] grid place-items-center rounded-[8px] font-display font-bold transition-colors ${
                dragCells.has(i) ? "bg-[#ffb547] text-[#2a1600]" : foundCells.has(i) ? "bg-[#61e6ac]/25 text-[#a6f5d6]" : "text-white/80"
              }`}
              style={{ fontSize: `clamp(11px, ${48 / size}vw, ${size > 11 ? 18 : 21}px)` }}
            >
              {l}
            </span>
          ))}
        </div>
        <aside className="space-y-3">
          <div className="rounded-[20px] bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
              Find {placed.length} · {found.length} found
            </p>
            {clues ? (
              <ol className="mt-2.5 space-y-2">
                {placed.map((p, i) => {
                  const done = found.includes(p.term);
                  const t = terms.find((x) => x.term === p.term);
                  return (
                    <li key={p.term} className={`flex gap-2.5 rounded-xl px-2.5 py-2 ${done ? "bg-[#61e6ac]/10" : "bg-white/[0.04]"}`}>
                      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10.5px] font-bold ${done ? "bg-[#61e6ac] text-[#06261a]" : "bg-white/10 text-white/60"}`}>
                        {done ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        {done ? (
                          <p className="text-[13px] font-bold text-[#a6f5d6]">{p.term}</p>
                        ) : (
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#ffb547]/80">{p.form.length} letters</p>
                        )}
                        <p className={`line-clamp-3 text-[12.5px] leading-snug ${done ? "text-white/45" : "text-white/75"}`}>{t ? termClue(t) : ""}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {placed.map((p) => (
                  <span key={p.term} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${found.includes(p.term) ? "bg-[#61e6ac]/15 text-[#a6f5d6] line-through decoration-2" : "bg-white/[0.06] text-white/80"}`}>
                    {p.form}
                  </span>
                ))}
              </div>
            )}
          </div>
          {revealed && (
            <div key={revealed.term} className="zw-flip rounded-[20px] bg-[linear-gradient(140deg,rgba(255,181,71,0.16),rgba(255,255,255,0.03))] p-4 ring-1 ring-[#ffb547]/30">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#ffb547]"><Sparkles className="h-3.5 w-3.5" /> Found</p>
              <p className="mt-1 font-display text-[19px] font-bold">{revealed.term}</p>
              {revealed.meaning && <p className="mt-1 text-[13.5px] leading-snug text-white/80">{revealed.meaning}</p>}
              {revealed.context && <p className="mt-2 border-l-2 border-[#ffb547]/40 pl-2.5 text-[12.5px] italic leading-snug text-white/55">“{revealed.context}”</p>}
            </div>
          )}
          <button className={`${allFound ? btnPrimary : btnGhost} w-full`} onClick={() => onDone(found, Date.now() - startedAt.current)}>
            {allFound ? "On to Match" : found.length ? "Continue to Match" : "Skip to Match"} <ChevronRight className="h-4 w-4" />
          </button>
        </aside>
      </div>
    </div>
  );
}

/* ───────────── Match ───────────── */

export type MatchItem = { term: string; clue: ReactNode; options: string[] };

export function makeMatchItems(terms: WordTerm[], pool: string[] = []) {
  const names = [...new Set([...terms.map((t) => t.term), ...pool])];
  return shuffle(terms).map((t) => {
    const blanks = blankOut(t.context, t.term);
    const clue: ReactNode = t.meaning ? (
      t.meaning
    ) : blanks ? (
      <>
        {blanks.before}
        <span className="mx-1 inline-block min-w-[70px] border-b-2 border-[#ffb547] align-baseline" />
        {blanks.after}
      </>
    ) : (
      t.term
    );
    const others = shuffle(names.filter((n) => !sameTerm(n, t.term))).slice(0, 3);
    return { term: t.term, clue, options: shuffle([t.term, ...others]) };
  });
}

export function MatchStage({ items, onDone, label = "Which term is this?" }: { items: MatchItem[]; onDone: (r: WordResult[]) => void; label?: string }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const results = useRef<WordResult[]>([]);
  const shownAt = useRef(Date.now());
  const item = items[index];
  useEffect(() => {
    shownAt.current = Date.now();
    setPicked(null);
  }, [index]);
  if (!item) return null;
  const choose = (option: string) => {
    if (picked) return;
    setPicked(option);
    const correct = sameTerm(option, item.term);
    results.current.push({ term: item.term, correct, ms: Date.now() - shownAt.current });
    try { navigator.vibrate?.(correct ? 12 : [30, 40, 30]); } catch { /* not supported */ }
    window.setTimeout(() => {
      if (index + 1 >= items.length) onDone(results.current);
      else setIndex(index + 1);
    }, correct ? 650 : 1300);
  };
  return (
    <div key={index} className="zw-in">
      <Progress value={index} total={items.length} />
      <div className="rounded-[26px] bg-white/[0.04] p-5 ring-1 ring-white/[0.08] sm:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#ffb547]">{label}</p>
        <p className="mt-3 font-display text-[21px] font-semibold leading-snug sm:text-[24px]">{item.clue}</p>
      </div>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {item.options.map((option) => {
          const right = sameTerm(option, item.term);
          const state = !picked ? "idle" : right ? "right" : option === picked ? "wrong" : "dim";
          return (
            <button
              key={option}
              onClick={() => choose(option)}
              disabled={Boolean(picked)}
              className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 text-left text-[15px] font-semibold ring-1 transition active:scale-[0.99] ${
                state === "right" ? "zw-pop bg-[#61e6ac]/20 text-[#bff7e2] ring-[#61e6ac]/60"
                  : state === "wrong" ? "zw-shake bg-[#ff6b8a]/15 text-[#ffc2cf] ring-[#ff6b8a]/50"
                  : state === "dim" ? "bg-white/[0.02] text-white/35 ring-white/[0.05]"
                  : "bg-white/[0.05] text-white ring-white/10 hover:bg-white/[0.09]"
              }`}
            >
              {option}
              {state === "right" && <Check className="h-5 w-5 shrink-0" />}
              {state === "wrong" && <X className="h-5 w-5 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Recall ───────────── */

export function RecallStage({ terms, onDone }: { terms: WordTerm[]; onDone: (r: WordResult[]) => void }) {
  const order = useMemo(() => shuffle(terms), [terms]);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [hints, setHints] = useState(0);
  const [verdict, setVerdict] = useState<"right" | "wrong" | null>(null);
  const results = useRef<WordResult[]>([]);
  const shownAt = useRef(Date.now());
  const input = useRef<HTMLInputElement>(null);
  const t = order[index];
  useEffect(() => {
    shownAt.current = Date.now();
    setValue("");
    setHints(0);
    setVerdict(null);
    window.setTimeout(() => input.current?.focus(), 50);
  }, [index]);
  if (!t) return null;
  const blanks = blankOut(t.context, t.term);
  const letters = gridForm(t.term).length;
  const submit = (giveUp = false) => {
    if (verdict) return;
    const correct = !giveUp && sameTerm(value, t.term);
    setVerdict(correct ? "right" : "wrong");
    // A hint costs speed, so a hinted answer doesn't count as a quick one.
    results.current.push({ term: t.term, correct, ms: Date.now() - shownAt.current + hints * 8000 });
    try { navigator.vibrate?.(correct ? 12 : [30, 40, 30]); } catch { /* not supported */ }
  };
  const next = () => {
    if (index + 1 >= order.length) onDone(results.current);
    else setIndex(index + 1);
  };
  return (
    <div key={index} className="zw-in">
      <Progress value={index} total={order.length} />
      <div className="rounded-[26px] bg-white/[0.04] p-5 ring-1 ring-white/[0.08] sm:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#ffb547]">Fill the gap</p>
        <p className="mt-3 font-display text-[19px] font-medium leading-relaxed sm:text-[22px]">
          {blanks ? (
            <>
              “{blanks.before}
              <span className={`mx-1 inline-block min-w-[90px] rounded-md px-2 text-center align-baseline font-bold ${verdict === "right" ? "bg-[#61e6ac]/20 text-[#bff7e2]" : verdict === "wrong" ? "bg-[#ff6b8a]/15 text-[#ffc2cf]" : "border-b-2 border-[#ffb547] text-[#ffb547]"}`}>
                {verdict ? t.term : " ".repeat(Math.min(letters, 14))}
              </span>
              {blanks.after}”
            </>
          ) : (
            t.meaning || "Type the term."
          )}
        </p>
        {blanks && t.meaning && <p className="mt-3 text-[13px] text-white/50">Meaning: {t.meaning}</p>}
        <p className="mt-3 text-[12px] text-white/40">
          {letters} letters{hints > 0 ? ` · starts with “${t.term.slice(0, hints)}”` : ""}
        </p>
      </div>
      {!verdict ? (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) submit();
          }}
        >
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Type the term"
            aria-label="Your answer"
            className="min-h-13 min-w-0 flex-1 rounded-2xl bg-white/[0.06] px-4 py-3.5 text-[17px] font-semibold text-white outline-none ring-1 ring-white/10 placeholder:font-normal placeholder:text-white/30 focus:ring-[#ffb547]/60"
          />
          <button type="submit" disabled={!value.trim()} className={btnPrimary}>Check</button>
        </form>
      ) : (
        <div className={`zw-pop mt-4 flex items-center gap-3 rounded-2xl p-4 ring-1 ${verdict === "right" ? "bg-[#61e6ac]/12 ring-[#61e6ac]/40" : "bg-[#ff6b8a]/10 ring-[#ff6b8a]/35"}`}>
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${verdict === "right" ? "bg-[#61e6ac] text-[#06261a]" : "bg-[#ff6b8a] text-white"}`}>
            {verdict === "right" ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </span>
          <p className="min-w-0 flex-1 text-[14px]">
            {verdict === "right" ? "Spot on." : <>The term is <b>{t.term}</b>. It'll come back soon so it sticks.</>}
          </p>
          <button onClick={next} className={btnPrimary}>{index + 1 >= order.length ? "Finish" : "Next"}</button>
        </div>
      )}
      {!verdict && (
        <div className="mt-3 flex gap-2">
          <button type="button" className={btnGhost} disabled={hints >= Math.min(3, t.term.length - 1)} onClick={() => setHints((h) => h + 1)}>
            <Wand2 className="h-4 w-4" /> Hint
          </button>
          <button type="button" className={btnGhost} onClick={() => submit(true)}>I don't know</button>
        </div>
      )}
    </div>
  );
}

function Progress({ value, total }: { value: number; total: number }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#ffd36b,#ffb547)] transition-all duration-500" style={{ width: `${(value / Math.max(1, total)) * 100}%` }} />
      </div>
      <span className="text-[12px] font-semibold tabular-nums text-white/50">{value + 1}/{total}</span>
    </div>
  );
}

/* ───────────── Results ───────────── */

/** Points: found 50 each; match 100 + up to 50 for speed; recall 150 + up to 50 for speed. */
export function scoreRound(found: number, match: WordResult[], recall: WordResult[]) {
  const speed = (ms: number) => Math.max(0, Math.round(50 * (1 - ms / 10000)));
  return found * 50 + match.reduce((s, r) => s + (r.correct ? 100 + speed(r.ms) : 0), 0) + recall.reduce((s, r) => s + (r.correct ? 150 + speed(r.ms) : 0), 0);
}

export function TermOutcome({ term, ok, box }: { term: string; ok: boolean; box?: number }) {
  const s = STRENGTH[Math.max(0, Math.min(5, box ?? (ok ? 1 : 0)))];
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-3 ring-1 ring-white/[0.06]">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${ok ? "bg-[#61e6ac]/20 text-[#61e6ac]" : "bg-[#ff6b8a]/15 text-[#ff8aa2]"}`}>
        {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{term}</span>
      <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ color: s.color, background: `${s.color}1c` }}>
        {ok ? "Back in a few days" : "Back tomorrow"}
      </span>
    </li>
  );
}
