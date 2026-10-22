import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Flame, Loader2, Play, RotateCcw, Trophy } from "@/components/icons/glyphs";
import { getWordPack, recordWordResults, wordReviewDue, wordsError, type BankSummary, type WordResult, type WordTerm } from "./api";
import { btnGhost, btnPrimary, FindStage, makeMatchItems, MatchStage, RecallStage, scoreRound, StageSteps, TermOutcome, WordsShell } from "./WordsGame";

type Phase = "intro" | "find" | "match" | "recall" | "done";

/** One pack, three stages: Find → Match → Recall, then results saved to the Word Bank. */
export function WordsPackRound({ packId }: { packId: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const pack = useQuery({ queryKey: ["words-pack", packId], queryFn: () => getWordPack(packId), retry: false });
  const [phase, setPhase] = useState<Phase>("intro");
  const [found, setFound] = useState<string[]>([]);
  const [match, setMatch] = useState<WordResult[]>([]);
  const [recall, setRecall] = useState<WordResult[]>([]);
  const [summary, setSummary] = useState<BankSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [round, setRound] = useState(0);
  const terms = pack.data?.terms || [];
  const matchItems = useMemo(() => makeMatchItems(terms), [terms, round]);
  const back = () => navigate({ to: "/app/games/words" });

  const finish = async (recallResults: WordResult[]) => {
    setRecall(recallResults);
    setPhase("done");
    setSaving(true);
    // A term counts as known when both Match and Recall were right; the slower answer decides "quick".
    const results: WordResult[] = terms.map((t) => {
      const m = match.find((r) => r.term === t.term);
      const r = recallResults.find((x) => x.term === t.term);
      return { term: t.term, correct: Boolean(m?.correct && r?.correct), ms: Math.max(m?.ms || 0, r?.ms || 0) };
    });
    try {
      setSummary(await recordWordResults(packId, results));
      void client.invalidateQueries({ queryKey: ["words-summary"] });
      void client.invalidateQueries({ queryKey: ["words-packs"] });
      void client.invalidateQueries({ queryKey: ["words-bank"] });
    } catch (error) {
      toast.error(wordsError(error));
    } finally {
      setSaving(false);
    }
  };

  const again = () => {
    setFound([]); setMatch([]); setRecall([]); setSummary(null); setRound((r) => r + 1); setPhase("find");
  };

  if (pack.isLoading) return <WordsShell title="Zero Words" onBack={back}><Loader2 className="mx-auto my-24 h-6 w-6 animate-spin text-white/50" /></WordsShell>;
  if (pack.error || !pack.data)
    return (
      <WordsShell title="Zero Words" onBack={back}>
        <p className="mx-auto mt-16 max-w-[420px] rounded-[22px] bg-white/[0.04] p-6 text-center text-white/70 ring-1 ring-white/10">{wordsError(pack.error)}</p>
      </WordsShell>
    );
  const p = pack.data;
  const stage = phase === "find" ? 0 : phase === "match" ? 1 : 2;

  return (
    <WordsShell title={p.title} sub={`${p.field} · ${p.terms.length} terms`} onBack={back}>
      {phase !== "intro" && phase !== "done" && <StageSteps stage={stage as 0 | 1 | 2} />}

      {phase === "intro" && (
        <section className="zw-in mx-auto max-w-[560px] text-center">
          <span className="zw-pop mx-auto grid h-20 w-20 place-items-center rounded-[26px] font-display text-[34px] font-black text-[#2a1600] shadow-[0_20px_50px_-18px_rgba(255,181,71,0.9)]" style={{ background: "linear-gradient(145deg,#ffe2a0,#ffb547 55%,#e07b17)" }}>
            {p.terms.length}
          </span>
          <h2 className="mt-5 font-display text-[28px] font-extrabold tracking-tight">{p.title}</h2>
          <p className="mt-1 text-[14px] text-white/55">{p.terms.length} terms from {p.mine ? "your text" : `${p.owner?.name || "a member"}'s pack`} · about 3 minutes</p>
          <div className="mt-6 grid gap-2 text-left">
            {[
              p.ai
                ? ["Find", "Spot each term in the letter grid. Each one flips to show what it means."]
                : ["Find", "The terms stay hidden. Read each clue and find its term in the letter grid."],
              ["Match", "See a meaning, pick the right term. Quick answers score more."],
              ["Recall", "Fill the gap in the original sentence. This is what makes it stick."],
            ].map(([t, d], i) => (
              <div key={t} className="flex items-start gap-3 rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/[0.07]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ffb547]/15 text-[13px] font-bold text-[#ffb547]">{i + 1}</span>
                <div>
                  <p className="text-[14.5px] font-bold">{t}</p>
                  <p className="text-[13px] leading-snug text-white/55">{d}</p>
                </div>
              </div>
            ))}
          </div>
          <button className={`${btnPrimary} mt-6 w-full`} onClick={() => setPhase("find")}>
            <Play className="h-4 w-4 fill-current" /> Start
          </button>
        </section>
      )}

      {phase === "find" && (
        <FindStage key={round} terms={terms} clues={!p.ai} onDone={(f) => { setFound(f); setPhase("match"); }} />
      )}
      {phase === "match" && <MatchStage key={round} items={matchItems} onDone={(r) => { setMatch(r); setPhase("recall"); }} />}
      {phase === "recall" && <RecallStage key={round} terms={terms} onDone={(r) => void finish(r)} />}

      {phase === "done" && (
        <Results
          score={scoreRound(found.length, match, recall)}
          known={terms.filter((t) => match.find((m) => m.term === t.term)?.correct && recall.find((r) => r.term === t.term)?.correct)}
          terms={terms}
          summary={summary}
          saving={saving}
          onAgain={again}
          onReview={() => navigate({ to: "/app/games/words/review" })}
          onDone={back}
        />
      )}
    </WordsShell>
  );
}

function Results({ score, known, terms, summary, saving, onAgain, onReview, onDone }: {
  score: number; known: WordTerm[]; terms: WordTerm[]; summary: BankSummary | null; saving: boolean;
  onAgain: () => void; onReview: () => void; onDone: () => void;
}) {
  const knownSet = new Set(known.map((k) => k.term));
  const pct = Math.round((known.length / Math.max(1, terms.length)) * 100);
  return (
    <section className="zw-in mx-auto max-w-[560px]">
      <div className="text-center">
        <span className="zw-pop mx-auto grid h-20 w-20 place-items-center rounded-full text-[#2a1600] shadow-[0_20px_50px_-18px_rgba(255,181,71,0.9)]" style={{ background: "linear-gradient(145deg,#ffe2a0,#ffb547 55%,#e07b17)" }}>
          <Trophy className="h-9 w-9" />
        </span>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffb547]">{pct >= 80 ? "Excellent round" : pct >= 50 ? "Good progress" : "Every round counts"}</p>
        <p className="mt-1 font-display text-[54px] font-extrabold leading-none tabular-nums">{score.toLocaleString()}</p>
        <p className="mt-1 text-[13px] text-white/50">points · {known.length} of {terms.length} terms known</p>
      </div>
      {summary && (
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            ["Mastered", summary.mastered, "#61e6ac"],
            ["In your bank", summary.total, "#ffb547"],
            ["Day streak", summary.streak, "#ff9a52"],
          ].map(([label, value, color]) => (
            <div key={label as string} className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
              <p className="font-display text-[22px] font-bold tabular-nums" style={{ color: color as string }}>{value as number}</p>
              <p className="text-[11px] text-white/45">{label as string}</p>
            </div>
          ))}
        </div>
      )}
      {saving && <p className="mt-3 flex items-center justify-center gap-2 text-[12.5px] text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving to your Word Bank…</p>}
      <ul className="mt-5 space-y-1.5">
        {terms.map((t) => <TermOutcome key={t.term} term={t.term} ok={knownSet.has(t.term)} />)}
      </ul>
      <p className="mt-3 text-center text-[12px] text-white/40">Terms you missed come back tomorrow. The ones you knew come back a little later each time, until they're mastered.</p>
      <div className="mt-5 grid gap-2">
        {summary && summary.due > 0 ? (
          <button className={btnPrimary} onClick={onReview}><Flame className="h-4 w-4" /> Review {summary.due} due {summary.due === 1 ? "term" : "terms"}</button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button className={btnGhost} onClick={onAgain}><RotateCcw className="h-4 w-4" /> Play again</button>
          <button className={btnGhost} onClick={onDone}>Done</button>
        </div>
      </div>
    </section>
  );
}

/**
 * Daily review: everything due across all packs. Newer terms (box 0–1) are
 * picked from options; stronger ones (box 2+) must be recalled from memory.
 */
export function WordsReview() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const due = useQuery({ queryKey: ["words-due"], queryFn: () => wordReviewDue(12), staleTime: 0 });
  const [phase, setPhase] = useState<"match" | "recall" | "done">("match");
  const [results, setResults] = useState<WordResult[]>([]);
  const [summary, setSummary] = useState<BankSummary | null>(null);
  const back = () => navigate({ to: "/app/games/words" });
  const items = due.data || [];
  const easy = items.filter((t) => t.box <= 1 && t.others.length > 0);
  const hard = items.filter((t) => !(t.box <= 1 && t.others.length > 0));
  const matchItems = useMemo(() => makeMatchItems(easy, items.flatMap((t) => t.others)), [due.data]);

  const save = async (all: WordResult[]) => {
    setPhase("done");
    try {
      setSummary(await recordWordResults(null, all));
      void client.invalidateQueries({ queryKey: ["words-summary"] });
      void client.invalidateQueries({ queryKey: ["words-bank"] });
    } catch (error) {
      toast.error(wordsError(error));
    }
  };

  if (due.isLoading) return <WordsShell title="Daily review" onBack={back}><Loader2 className="mx-auto my-24 h-6 w-6 animate-spin text-white/50" /></WordsShell>;
  if (!items.length && phase !== "done")
    return (
      <WordsShell title="Daily review" onBack={back}>
        <div className="zw-in mx-auto mt-10 max-w-[440px] text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#61e6ac]/15 text-[#61e6ac]"><Trophy className="h-7 w-7" /></span>
          <h2 className="mt-4 font-display text-[24px] font-bold">Nothing due right now</h2>
          <p className="mt-1 text-[14px] text-white/55">Your terms are resting. Come back later, or make a new pack.</p>
          <button className={`${btnPrimary} mt-6`} onClick={back}>Back to Zero Words</button>
        </div>
      </WordsShell>
    );

  return (
    <WordsShell title="Daily review" sub={`${items.length} ${items.length === 1 ? "term" : "terms"} due`} onBack={back}>
      {phase === "match" && (matchItems.length ? (
        <MatchStage items={matchItems} label="Which term means this?" onDone={(r) => { setResults(r); if (hard.length) setPhase("recall"); else void save(r); }} />
      ) : (
        <RecallStage terms={hard} onDone={(r) => void save(r)} />
      ))}
      {phase === "recall" && <RecallStage terms={hard} onDone={(r) => void save([...results, ...r])} />}
      {phase === "done" && (
        <section className="zw-in mx-auto max-w-[480px] text-center">
          <span className="zw-pop mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#ff7a2f]/15 text-[#ff9a52]"><Flame className="h-9 w-9" /></span>
          <h2 className="mt-4 font-display text-[28px] font-extrabold">Review done</h2>
          {summary ? (
            <p className="mt-1 text-[14px] text-white/60">
              {summary.streak} day streak · {summary.mastered} mastered · {summary.total} in your bank
            </p>
          ) : (
            <p className="mt-1 flex items-center justify-center gap-2 text-[13px] text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</p>
          )}
          <button className={`${btnPrimary} mt-6 w-full`} onClick={back}>Back to Zero Words</button>
        </section>
      )}
    </WordsShell>
  );
}
