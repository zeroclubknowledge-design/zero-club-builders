import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles, X } from "@/components/icons/glyphs";
import { selectionToTerms, tokenizeForPicking, type PickedTerm } from "./api";
import { btnGhost, btnPrimary } from "./WordsGame";

export const MIN_PICK = 4;
export const MAX_PICK = 12;

/**
 * The creator taps the key terms in their own text. Words tapped side by side
 * become one term ("load" + "balancer"). An optional meaning per term becomes
 * its clue; otherwise the sentence it came from is used, with the term hidden.
 */
export function TermPicker({
  text,
  reason,
  busy,
  onBack,
  onCreate,
}: {
  text: string;
  reason: "ai-off" | "manual";
  busy: boolean;
  onBack: () => void;
  onCreate: (terms: PickedTerm[]) => void;
}) {
  const parts = useMemo(() => tokenizeForPicking(text), [text]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [meanings, setMeanings] = useState<Record<string, string>>({});
  const terms = useMemo(() => selectionToTerms(parts, selected), [parts, selected]);
  const count = terms.length;

  const toggle = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else {
      next.add(index);
      if (selectionToTerms(parts, next).length > MAX_PICK) {
        toast.message(`Up to ${MAX_PICK} terms per pack. Remove one to add another.`);
        return;
      }
    }
    setSelected(next);
  };
  const removeTerm = (start: number) => {
    const next = new Set(selected);
    for (let i = start; i < parts.length; i++) {
      if (parts[i].word) {
        if (!next.has(i)) break;
        next.delete(i);
      } else if (!/^[ \t]{1,2}$/.test(parts[i].text)) break;
    }
    setSelected(next);
  };
  // A selected word followed (over a space) by another selected word: shade the gap so the phrase reads as one.
  const joined = (i: number) => {
    const prev = parts[i - 1], next = parts[i + 1];
    return Boolean(parts[i] && !parts[i].word && prev?.word && next?.word && selected.has(i - 1) && selected.has(i + 1) && /^[ \t]{1,2}$/.test(parts[i].text));
  };

  return (
    <div className="zw-in mt-5">
      <div className="rounded-2xl bg-[#ffb547]/10 p-3.5 ring-1 ring-[#ffb547]/25">
        <p className="flex items-center gap-2 text-[13.5px] font-bold text-[#ffcf86]">
          <Sparkles className="h-4 w-4" /> {reason === "ai-off" ? "Zero AI isn't available right now, so you choose the terms" : "Choose the key terms yourself"}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">
          Tap the {MIN_PICK}–{MAX_PICK} words that matter most in your field. Tap words side by side to make a phrase, like “load balancer”. When you play, the terms stay hidden behind clues, so you still have to work for them.
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Your text</p>
        <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold tabular-nums ${count >= MIN_PICK ? "bg-[#61e6ac]/15 text-[#8ff0c8]" : "bg-white/[0.06] text-white/60"}`}>
          {count} picked · {count < MIN_PICK ? `${MIN_PICK - count} more to go` : `up to ${MAX_PICK}`}
        </span>
      </div>
      <div className="mt-2 max-h-[46vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white/[0.04] px-3.5 py-3 text-[15px] leading-[2.1] text-white/75 ring-1 ring-white/10">
        {parts.map((p, i) =>
          p.word ? (
            <span
              key={i}
              role="button"
              tabIndex={0}
              aria-pressed={selected.has(i)}
              onClick={() => toggle(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(i);
                }
              }}
              className={`-mx-[2px] cursor-pointer rounded-md px-[2px] py-[3px] transition-colors ${selected.has(i) ? "bg-[#ffb547] font-semibold text-[#2a1600]" : "hover:bg-white/[0.08] hover:text-white"} ${selected.has(i) && joined(i - 1) ? "rounded-l-none" : ""} ${selected.has(i) && joined(i + 1) ? "rounded-r-none" : ""}`}
            >
              {p.text}
            </span>
          ) : (
            <span key={i} className={joined(i) ? "relative z-[1] bg-[#ffb547] py-[3px]" : undefined}>
              {p.text}
            </span>
          ),
        )}
      </div>

      {count > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Your terms · add a meaning if you know it (optional)</p>
          <ul className="mt-2 space-y-2">
            {terms.map((t) => (
              <li key={t.term} className="zw-in rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate px-1 text-[14.5px] font-bold">{t.term}</span>
                  <button type="button" aria-label={`Remove ${t.term}`} onClick={() => removeTerm(t.start)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/60 hover:bg-white/[0.1]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input
                  value={meanings[t.term.toLowerCase()] || ""}
                  maxLength={220}
                  onChange={(e) => setMeanings((m) => ({ ...m, [t.term.toLowerCase()]: e.target.value }))}
                  placeholder="What it means, in your own words"
                  className="mt-1.5 min-h-10 w-full rounded-xl bg-black/20 px-3 text-[13.5px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-[#ffb547]/60"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button type="button" className={btnGhost} onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" /> Edit text
        </button>
        <button
          type="button"
          className={`${btnPrimary} flex-1`}
          disabled={busy || count < MIN_PICK}
          onClick={() => onCreate(terms.map((t) => ({ term: t.term, meaning: meanings[t.term.toLowerCase()]?.trim() || undefined })))}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Create pack{count ? ` (${count})` : ""}
        </button>
      </div>
    </div>
  );
}
