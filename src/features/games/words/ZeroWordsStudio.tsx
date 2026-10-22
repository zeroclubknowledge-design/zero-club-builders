import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { BookOpen, Check, ChevronDown, Flame, Globe, Loader2, Lock, Play, Share2, Sparkles, Users } from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { ZERO_GAME_PROFESSIONS } from "@/features/games/zeroGames";
import {
  createPackFromText,
  listWordPacks,
  shareWordPack,
  STRENGTH,
  wordBankList,
  wordBankSummary,
  wordQuota,
  wordsError,
  type PickedTerm,
  type WordPack,
} from "./api";
import { TermPicker } from "./TermPicker";
import { btnGhost, btnPrimary, WordsShell } from "./WordsGame";

const MIN_TEXT = 120;

export function ZeroWordsStudio() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: profile } = useUser();
  const summary = useQuery({ queryKey: ["words-summary"], queryFn: wordBankSummary, enabled: Boolean(profile?.id) });
  const quota = useQuery({ queryKey: ["words-quota"], queryFn: wordQuota, enabled: Boolean(profile?.id) });
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const packs = useQuery({ queryKey: ["words-packs", tab], queryFn: () => listWordPacks(tab), enabled: Boolean(profile?.id) });
  const [bankOpen, setBankOpen] = useState(false);
  const bank = useQuery({ queryKey: ["words-bank"], queryFn: wordBankList, enabled: bankOpen });

  const [field, setField] = useState<string>(ZERO_GAME_PROFESSIONS[0]);
  const [custom, setCustom] = useState("");
  const [usingCustom, setUsingCustom] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const chosenField = usingCustom ? custom.trim() : field;
  const left = quota.data?.limit == null ? null : Math.max(0, quota.data.limit - quota.data.used);

  const [picking, setPicking] = useState<null | "ai-off" | "manual">(null);

  const create = async (picked?: PickedTerm[]) => {
    if (creating) return;
    setCreating(true);
    try {
      const result = await createPackFromText({ text, field: chosenField, title, picked });
      void client.invalidateQueries({ queryKey: ["words-quota"] });
      if ("needsPick" in result) {
        setPicking("ai-off");
        return;
      }
      void client.invalidateQueries({ queryKey: ["words-packs"] });
      setPicking(null);
      navigate({ to: "/app/games/words/pack/$packId", params: { packId: result.id } });
    } catch (error) {
      toast.error(wordsError(error));
    } finally {
      setCreating(false);
    }
  };

  const s = summary.data;
  const total = s?.total || 0;

  return (
    <WordsShell title="Zero Words" sub="Learn the language of your field" onBack={() => navigate({ to: "/app/games" })}>
      {/* Word Bank */}
      <section className="zw-in relative overflow-hidden rounded-[28px] p-[1px]" style={{ background: "linear-gradient(150deg,rgba(255,181,71,0.55),rgba(255,255,255,0.06) 45%,rgba(204,32,143,0.25))" }}>
        <div className="relative rounded-[27px] bg-[#150b12] p-5 sm:p-6">
          <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#ffb547]/20 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffb547]">Your Word Bank</p>
              <h2 className="mt-1.5 font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
                {total === 0 ? "Start your vocabulary" : s?.due ? `${s.due} ${s.due === 1 ? "term is" : "terms are"} ready to review` : "All caught up"}
              </h2>
              <p className="mt-1 max-w-[440px] text-[13.5px] leading-relaxed text-white/55">
                {total === 0
                  ? "Paste something from your field below. Every term you learn is saved here and comes back right before you'd forget it."
                  : s?.due
                    ? "A few minutes now keeps them from slipping. Quick right answers push a term further out."
                    : s?.next_due
                      ? `Next review ${new Date(s.next_due).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}. Paste something new meanwhile.`
                      : "Paste something new to keep growing."}
              </p>
            </div>
            <div className="shrink-0 text-center">
              <span className={`grid h-16 w-16 place-items-center rounded-2xl ${s?.streak ? "bg-[#ff7a2f]/15 text-[#ff9a52]" : "bg-white/[0.05] text-white/30"}`}>
                <Flame className="h-7 w-7" />
              </span>
              <p className="mt-1 text-[12px] font-bold tabular-nums">{s?.streak || 0} day{s?.streak === 1 ? "" : "s"}</p>
            </div>
          </div>
          {total > 0 && (
            <>
              <div className="relative mt-5 flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <span style={{ width: `${((s?.mastered || 0) / total) * 100}%`, background: "#61e6ac" }} />
                <span style={{ width: `${((s?.learning || 0) / total) * 100}%`, background: "#ffb547" }} />
                <span style={{ width: `${((s?.struggling || 0) / total) * 100}%`, background: "#ff6b8a" }} />
              </div>
              <div className="relative mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/55">
                <span><b className="text-[#61e6ac]">{s?.mastered || 0}</b> mastered</span>
                <span><b className="text-[#ffb547]">{s?.learning || 0}</b> learning</span>
                <span><b className="text-[#ff8aa2]">{s?.struggling || 0}</b> need work</span>
                <span>{total} total</span>
              </div>
            </>
          )}
          <div className="relative mt-5 flex flex-wrap gap-2">
            {Boolean(s?.due) && (
              <button className={btnPrimary} onClick={() => navigate({ to: "/app/games/words/review" })}>
                <Play className="h-4 w-4 fill-current" /> Start daily review
              </button>
            )}
            {total > 0 && (
              <button className={btnGhost} onClick={() => setBankOpen((v) => !v)}>
                <BookOpen className="h-4 w-4" /> {bankOpen ? "Hide" : "See"} all terms
              </button>
            )}
          </div>
          {bankOpen && (
            <ul className="relative mt-4 max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
              {bank.isLoading && <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-white/50" />}
              {bank.data?.map((t) => {
                const st = STRENGTH[t.box];
                return (
                  <li key={t.term} className="rounded-xl bg-white/[0.035] px-3.5 py-2.5 ring-1 ring-white/[0.05]">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{t.term}</span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ color: st.color, background: `${st.color}1c` }}>{st.label}</span>
                    </div>
                    {t.meaning && <p className="mt-0.5 text-[12.5px] leading-snug text-white/55">{t.meaning}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Create */}
      <section className="zw-in mt-5 rounded-[28px] bg-white/[0.035] p-5 ring-1 ring-white/[0.08] sm:p-6" style={{ animationDelay: "60ms" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-[20px] font-bold tracking-tight"><Sparkles className="h-5 w-5 text-[#ffb547]" /> Make a word pack</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">Paste notes, an article, a brief or a lesson. Zero AI picks the key terms, explains each one and keeps the sentence it came from.</p>
          </div>
          <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-semibold text-white/70">
            {quota.data?.premium ? "Unlimited · PRO" : left === null ? "…" : `${left} of 3 left today`}
          </span>
        </div>

        {picking ? (
          <TermPicker text={text.trim()} reason={picking} busy={creating} onBack={() => setPicking(null)} onCreate={(terms) => void create(terms)} />
        ) : (
          <>
            <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Your field</p>
            <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap">
              {ZERO_GAME_PROFESSIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setField(f); setUsingCustom(false); }}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${!usingCustom && field === f ? "bg-white text-[#1a0d12]" : "bg-white/[0.06] text-white/75 ring-1 ring-white/10 hover:bg-white/[0.1]"}`}
                >
                  {f}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUsingCustom(true)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${usingCustom ? "bg-[#ffb547] text-[#2a1600]" : "bg-[#ffb547]/10 text-[#ffcf86] ring-1 ring-[#ffb547]/30"}`}
              >
                + Custom
              </button>
            </div>
            {usingCustom && (
              <input
                autoFocus
                value={custom}
                maxLength={60}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Your field or skill, e.g. Nursing, Real estate, Copywriting"
                className="mt-3 min-h-12 w-full rounded-2xl bg-white/[0.06] px-4 text-[15px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-[#ffb547]/60"
              />
            )}

            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional), e.g. Week 3 lecture notes"
              className="mt-4 min-h-12 w-full rounded-2xl bg-white/[0.06] px-4 text-[15px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-[#ffb547]/60"
            />
            <div className="relative mt-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder="Paste the text you're learning from…"
                className="w-full resize-y rounded-2xl bg-white/[0.06] px-4 py-3.5 text-[15px] leading-relaxed text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-[#ffb547]/60"
              />
              <span className={`absolute bottom-3 right-4 text-[11px] tabular-nums ${text.trim().length >= MIN_TEXT ? "text-white/35" : "text-[#ff9aaf]"}`}>
                {text.trim().length < MIN_TEXT ? `${MIN_TEXT - text.trim().length} more characters` : `${text.trim().split(/\s+/).length} words`}
              </span>
            </div>
            <button
              className={`${btnPrimary} mt-4 w-full`}
              disabled={creating || text.trim().length < MIN_TEXT || !chosenField || (!quota.data?.premium && left === 0)}
              onClick={() => void create()}
            >
              {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Zero AI is reading your text…</> : <><Sparkles className="h-4 w-4" /> Create my word pack</>}
            </button>
            <button
              type="button"
              className="mt-2 w-full py-2 text-center text-[13px] font-semibold text-white/55 transition hover:text-white disabled:opacity-40"
              disabled={creating || text.trim().length < MIN_TEXT || !chosenField}
              onClick={() => setPicking("manual")}
            >
              Or pick the terms myself
            </button>
            {!quota.data?.premium && left === 0 && (
              <p className="mt-2 text-center text-[12.5px] text-white/50">You've used today's 3 free pastes. You can still pick the terms yourself, and PRO members paste without limits.</p>
            )}
          </>
        )}
      </section>

      {/* Packs */}
      <section className="zw-in mt-6" style={{ animationDelay: "120ms" }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-[19px] font-bold tracking-tight">Word packs</h2>
          <div className="flex gap-1 rounded-full bg-white/[0.05] p-1" role="tablist">
            {(["mine", "shared"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition ${tab === v ? "bg-white text-[#1a0d12]" : "text-white/60"}`}>
                {v === "mine" ? "Mine" : "Shared with me"}
              </button>
            ))}
          </div>
        </div>
        {packs.isLoading ? (
          <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-white/50" />
        ) : packs.error ? (
          <p className="rounded-2xl bg-white/[0.04] p-5 text-center text-sm text-white/60">{wordsError(packs.error)}</p>
        ) : !packs.data?.length ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-[13.5px] text-white/45">
            {tab === "mine" ? "Your packs will show here. Make your first one above." : "Packs that tutors and friends share with you, or to your clubs, show here."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {packs.data.map((p) => <PackCard key={p.id} pack={p} onPlay={() => navigate({ to: "/app/games/words/pack/$packId", params: { packId: p.id } })} />)}
          </div>
        )}
      </section>
    </WordsShell>
  );
}

function PackCard({ pack, onPlay }: { pack: WordPack; onPlay: () => void }) {
  const [sharing, setSharing] = useState(false);
  const pct = Math.round((pack.mastered / Math.max(1, pack.terms.length)) * 100);
  return (
    <article className="flex flex-col rounded-[22px] bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#ffb547]/12 font-display text-[16px] font-black text-[#ffb547]">{pack.terms.length}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold">{pack.title}</h3>
          <p className="truncate text-[12px] text-white/50">
            {pack.field}
            {!pack.mine && pack.owner ? ` · by ${pack.owner.name}` : ""}
            {pack.visibility === "club" && pack.club_name ? ` · ${pack.club_name}` : pack.visibility === "public" ? " · Everyone" : ""}
          </p>
        </div>
        {pack.mine && (
          <button onClick={() => setSharing((v) => !v)} aria-label="Share this pack" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/70 hover:bg-white/[0.1]">
            <Share2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="mt-3 text-[12.5px] text-white/45">{pack.terms.length} terms · {pack.ai ? "picked by Zero AI" : "picked by hand"}</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-[#61e6ac]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] tabular-nums text-white/45">{pack.mastered}/{pack.terms.length} mastered</span>
      </div>
      {sharing && <SharePanel pack={pack} onClose={() => setSharing(false)} />}
      <button onClick={onPlay} className={`${btnPrimary} mt-4 min-h-11 text-[14px]`}>
        <Play className="h-4 w-4 fill-current" /> {pack.mastered ? "Practise again" : "Play"}
      </button>
    </article>
  );
}

function SharePanel({ pack, onClose }: { pack: WordPack; onClose: () => void }) {
  const client = useQueryClient();
  const { data: profile } = useUser();
  const clubs = useQuery({
    queryKey: ["words-my-clubs", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("club_id, clubs(id, name, parent_club_id)")
        .eq("profile_id", profile!.id)
        .limit(100);
      if (error) throw error;
      return ((data || []) as any[]).map((r) => r.clubs).filter((c) => c && !c.parent_club_id) as { id: string; name: string }[];
    },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const share = async (visibility: WordPack["visibility"], club?: string) => {
    setBusy(club || visibility);
    try {
      await shareWordPack(pack.id, visibility, club);
      toast.success(visibility === "private" ? "Only you can see this pack now" : visibility === "public" ? "Shared with everyone on Zero Club" : "Shared with your club");
      void client.invalidateQueries({ queryKey: ["words-packs"] });
      onClose();
    } catch (error) {
      toast.error(wordsError(error));
    } finally {
      setBusy(null);
    }
  };
  const row = (key: string, icon: ReactNode, label: string, on: boolean, action: () => void) => (
    <button key={key} onClick={action} disabled={Boolean(busy)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition hover:bg-white/[0.06]">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06]">{busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}</span>
      <span className="flex-1">{label}</span>
      {on && <Check className="h-4 w-4 text-[#61e6ac]" />}
    </button>
  );
  return (
    <div className="zw-in mt-3 rounded-2xl bg-black/25 p-1.5 ring-1 ring-white/10">
      {row("private", <Lock className="h-4 w-4" />, "Only me", pack.visibility === "private", () => void share("private"))}
      {row("public", <Globe className="h-4 w-4" />, "Everyone on Zero Club", pack.visibility === "public", () => void share("public"))}
      {(clubs.data || []).map((c) => row(c.id, <Users className="h-4 w-4" />, c.name, pack.visibility === "club" && pack.club_id === c.id, () => void share("club", c.id)))}
      {clubs.isLoading && <Loader2 className="mx-auto my-2 h-4 w-4 animate-spin text-white/40" />}
      <button onClick={onClose} className="mt-1 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-[12px] text-white/45 hover:text-white/70">
        Close <ChevronDown className="h-3.5 w-3.5 rotate-180" />
      </button>
    </div>
  );
}
