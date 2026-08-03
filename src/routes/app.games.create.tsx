import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  Eye,
  Gamepad2,
  Gift,
  Link2,
  Loader2,
  LockKeyhole,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import {
  generateWordsPuzzle,
  ZERO_GAME_OFFERS,
  ZERO_GAME_PROFESSIONS,
  type ZeroGameDifficulty,
  type ZeroGameRewardType,
  type ZeroGameType,
  type ZeroGameVisibility,
} from "@/features/games/zeroGames";
import { toast } from "sonner";
import {
  fallbackZeroGameRewardAllowance,
  zeroGameAllowanceName,
  type ZeroGameRewardAllowance,
} from "@/features/games/rewardEntitlements";

export const Route = createFileRoute("/app/games/create")({
  validateSearch: (search: Record<string, unknown>) => ({
    game: search.game === "words" ? "words" as const : search.game === "sudoku" ? "sudoku" as const : undefined,
  }),
  component: CreateZeroGame,
});

const toLocalDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

function CreateZeroGame() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const { data: profile } = useUser();
  const { format, toBaseAmount } = useWalletCurrency();
  const [gameType, setGameType] = useState<ZeroGameType>(search.game || "sudoku");
  const [title, setTitle] = useState("");
  const [profession, setProfession] = useState<string>(ZERO_GAME_PROFESSIONS[0]);
  const [difficulty, setDifficulty] = useState<ZeroGameDifficulty>("medium");
  const [visibility, setVisibility] = useState<ZeroGameVisibility>("public");
  const [rewardType, setRewardType] = useState<ZeroGameRewardType>("offer");
  const [offerType, setOfferType] = useState<string>(ZERO_GAME_OFFERS[0].id);
  const [prizeAmount, setPrizeAmount] = useState("1000");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [startsAt, setStartsAt] = useState(toLocalDateTime(new Date(Date.now() + 10 * 60_000)));
  const [hostPlays, setHostPlays] = useState(true);
  const [creating, setCreating] = useState(false);

  const { data: allowanceData, isLoading: allowanceLoading } = useQuery({
    queryKey: ["zero-game-reward-allowance", profile?.id],
    enabled: Boolean(profile?.id),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_zero_game_reward_allowance");
      if (error) {
        console.warn("Zero Games allowance is not available yet:", error.message);
        return fallbackZeroGameRewardAllowance(profile);
      }
      return data as ZeroGameRewardAllowance;
    },
  });

  const rewardAllowance = allowanceData || fallbackZeroGameRewardAllowance(profile);
  const dailyLimitReached = rewardAllowance.daily_limit !== null
    && rewardAllowance.daily_remaining === 0
    && rewardAllowance.weekly_remaining > 0;

  const basePrizeAmount = useMemo(() => toBaseAmount(Number(prizeAmount || 0)), [prizeAmount, toBaseAmount]);
  const selectedOffer = ZERO_GAME_OFFERS.find((offer) => offer.id === offerType) || ZERO_GAME_OFFERS[0];
  const canCreate = Boolean(profile?.id)
    && !allowanceLoading
    && rewardAllowance.can_create
    && title.trim().length >= 3
    && Boolean(startsAt)
    && maxPlayers >= 2
    && (rewardType === "offer" || basePrizeAmount >= 100);

  const createCompetition = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const wordsPayload = gameType === "words" ? generateWordsPuzzle(profession) : null;
      const { data, error } = await supabase.rpc("create_zero_game_competition", {
        p_game_type: gameType,
        p_title: title.trim(),
        p_profession: gameType === "words" ? profession : null,
        p_difficulty: difficulty,
        p_visibility: visibility,
        p_reward_type: rewardType,
        p_offer_type: rewardType === "offer" ? offerType : null,
        p_prize_amount: rewardType === "cash" ? Math.round(basePrizeAmount) : 0,
        p_max_players: maxPlayers,
        p_starts_at: new Date(startsAt).toISOString(),
        p_duration_seconds: durationMinutes * 60,
        p_host_plays: hostPlays,
        p_words_payload: wordsPayload,
      });
      if (error) throw error;
      const competitionId = data?.competition_id;
      if (!competitionId) throw new Error("Competition was created without an ID");
      await queryClient.invalidateQueries({ queryKey: ["zero-game-reward-allowance", profile?.id] });
      toast.success(rewardType === "cash" ? "Race published and prize secured" : "Race published with a winner offer");
      navigate({ to: "/app/games/$id", params: { id: competitionId } });
    } catch (error: any) {
      toast.error(error.message || "Could not create this competition");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-10">
      <header className="sticky top-0 z-40 border-b border-border bg-background/96 px-4 py-3 backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[1080px] items-center gap-3">
          <button onClick={() => navigate({ to: "/app/games" })} className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0 flex-1"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Zero Games</p><h1 className="truncate text-[18px] font-semibold tracking-tight">Create competition</h1></div>
          <div className="hidden items-center gap-2 text-[11px] font-semibold text-muted-foreground sm:flex"><WalletCards className="h-4 w-4 fill-current" />{format(Number(profile?.coins || 0))}</div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1080px] gap-6 px-4 py-5 md:grid-cols-[minmax(0,1fr)_320px] md:px-7 md:py-8">
        <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center md:col-span-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Gamepad2 className="h-5 w-5 fill-current" /></span>
          <div className="min-w-0 flex-1"><p className="text-[12px] font-semibold">Prefer playing alone?</p><p className="mt-0.5 text-[10.5px] text-muted-foreground">Solo starts immediately with no lobby, invitations, or winner reward.</p></div>
          <Link to="/app/games/solo" search={{ game: gameType, difficulty, profession }} className="grid h-10 shrink-0 place-items-center rounded-md bg-foreground px-4 text-[11px] font-semibold text-background">Start Solo</Link>
        </section>
        <div className="space-y-6">
          <FormSection eyebrow="01 · Game" title="Choose the race">
            <div className="grid gap-3 sm:grid-cols-2">
              <GameChoice selected={gameType === "sudoku"} onClick={() => setGameType("sudoku")} Icon={Brain} title="Zero Sudoku" detail="The first correct logic grid wins." />
              <GameChoice selected={gameType === "words"} onClick={() => setGameType("words")} Icon={Sparkles} title="Zero Words" detail="Find every professional term first." />
            </div>
          </FormSection>

          <FormSection eyebrow="02 · Details" title="Set up the competition">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><FieldLabel>Competition name</FieldLabel><input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 80))} placeholder={gameType === "sudoku" ? "Friday logic sprint" : "Frontend words showdown"} className={fieldClass} /></label>
              {gameType === "words" && <label><FieldLabel>Professional field</FieldLabel><select value={profession} onChange={(event) => setProfession(event.target.value)} className={fieldClass}>{ZERO_GAME_PROFESSIONS.map((field) => <option key={field}>{field}</option>)}</select></label>}
              <label className={gameType === "words" ? "" : "sm:col-span-2"}><FieldLabel>Difficulty</FieldLabel><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as ZeroGameDifficulty)} className={fieldClass}>{["easy", "medium", "hard", "expert"].map((level) => <option key={level} value={level} className="capitalize">{level[0].toUpperCase() + level.slice(1)}</option>)}</select></label>
              <label><FieldLabel>Players</FieldLabel><div className="grid grid-cols-[42px_minmax(0,1fr)_42px] overflow-hidden rounded-md border border-border bg-card"><button type="button" onClick={() => setMaxPlayers((value) => Math.max(2, value - 1))} className="h-11 border-r border-border text-lg">−</button><span className="grid h-11 place-items-center text-[13px] font-semibold tabular-nums">{maxPlayers}</span><button type="button" onClick={() => setMaxPlayers((value) => Math.min(20, value + 1))} className="h-11 border-l border-border text-lg">+</button></div></label>
              <label><FieldLabel>Race duration</FieldLabel><select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className={fieldClass}>{[2, 3, 5, 10, 15].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
              <label className="sm:col-span-2"><FieldLabel>Scheduled start</FieldLabel><input type="datetime-local" value={startsAt} min={toLocalDateTime(new Date())} onChange={(event) => setStartsAt(event.target.value)} className={fieldClass} /></label>
            </div>
          </FormSection>

          <FormSection eyebrow="03 · Access" title="Choose who can join">
            <div className="grid gap-2 sm:grid-cols-3">
              <VisibilityChoice selected={visibility === "public"} onClick={() => setVisibility("public")} Icon={Eye} title="Public" detail="Discoverable in Zero Games" />
              <VisibilityChoice selected={visibility === "link"} onClick={() => setVisibility("link")} Icon={Link2} title="Link only" detail="Only people with the link" />
              <VisibilityChoice selected={visibility === "followers"} onClick={() => setVisibility("followers")} Icon={Users} title="Followers" detail="Your network can join" />
            </div>
            <label className="mt-4 flex items-center justify-between gap-4 rounded-md border border-border bg-card p-3.5">
              <div><p className="text-[12px] font-semibold">Join your own race</p><p className="mt-0.5 text-[10.5px] text-muted-foreground">Turn this off when you only want to host.</p></div>
              <button type="button" role="switch" aria-checked={hostPlays} onClick={() => setHostPlays((value) => !value)} className={`relative h-6 w-11 rounded-full transition ${hostPlays ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${hostPlays ? "left-[22px]" : "left-0.5"}`} /></button>
            </label>
          </FormSection>

          <FormSection eyebrow="04 · Reward" title="Reward the first finisher">
            <div className={`mb-4 rounded-md border p-3.5 ${rewardAllowance.can_create ? "border-border bg-card" : "border-destructive/25 bg-destructive/[0.045]"}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{zeroGameAllowanceName(rewardAllowance.plan_key)}</p>
                  <p className="mt-1 text-[12px] font-semibold">Winner reward allowance</p>
                </div>
                <span className="text-[12px] font-semibold tabular-nums">{allowanceLoading ? "..." : `${rewardAllowance.weekly_remaining} / ${rewardAllowance.weekly_limit}`}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, (rewardAllowance.weekly_used / Math.max(1, rewardAllowance.weekly_limit)) * 100)}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[9.5px] text-muted-foreground">
                <span>{rewardAllowance.can_create ? `${rewardAllowance.weekly_remaining} rewarded competition${rewardAllowance.weekly_remaining === 1 ? "" : "s"} left this week` : dailyLimitReached ? "Daily limit reached; available again tomorrow" : "Weekly reward allowance used"}</span>
                {rewardAllowance.daily_limit !== null && <span>{rewardAllowance.daily_remaining} / {rewardAllowance.daily_limit} left today</span>}
              </div>
              {!rewardAllowance.can_create && !dailyLimitReached && <button type="button" onClick={() => navigate({ to: "/app/premium" })} className="mt-3 text-[10px] font-semibold text-primary">Compare membership plans</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <RewardChoice selected={rewardType === "offer"} onClick={() => setRewardType("offer")} Icon={Gift} title="Free with an offer" detail="Everyone joins free. The winner unlocks a verified offer." />
              <RewardChoice selected={rewardType === "cash"} onClick={() => setRewardType("cash")} Icon={Banknote} title="Host-funded prize" detail="Reserve a cash prize from your wallet. Players still join free." />
            </div>

            {rewardType === "offer" ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {ZERO_GAME_OFFERS.map((offer) => (
                  <button key={offer.id} type="button" onClick={() => setOfferType(offer.id)} className={`flex min-h-[76px] items-start gap-3 rounded-md border p-3 text-left ${offerType === offer.id ? "border-primary bg-primary/[0.055]" : "border-border bg-card"}`}>
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-sm border ${offerType === offer.id ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{offerType === offer.id && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                    <span><span className="block text-[11.5px] font-semibold">{offer.label}</span><span className="mt-1 block text-[9.5px] leading-4 text-muted-foreground">{offer.detail}</span></span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3"><div><FieldLabel>Secured cash prize</FieldLabel><p className="text-[10px] text-muted-foreground">Reserved immediately when you publish.</p></div><LockKeyhole className="h-5 w-5 fill-current text-primary" /></div>
                <div className="mt-3 flex items-center rounded-md border border-border bg-background px-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"><span className="text-[13px] font-semibold text-muted-foreground">{format(0).replace(/[\d.,\s]/g, "") || "₦"}</span><input type="number" min="100" value={prizeAmount} onChange={(event) => setPrizeAmount(event.target.value)} className="h-12 min-w-0 flex-1 bg-transparent px-2 text-[18px] font-semibold tabular-nums outline-none" /></div>
                <div className="mt-3 flex items-center justify-between text-[10px]"><span className="text-muted-foreground">Wallet balance</span><span className={basePrizeAmount > Number(profile?.coins || 0) ? "font-semibold text-destructive" : "font-semibold text-foreground"}>{format(Number(profile?.coins || 0))}</span></div>
              </div>
            )}
          </FormSection>
        </div>

        <aside className="md:sticky md:top-24 md:self-start">
          <div className="rounded-md border border-border bg-card p-5">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-md bg-foreground text-background"><Gamepad2 className="h-5 w-5 fill-current" /></div><div><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Competition preview</p><p className="text-[14px] font-semibold">{title.trim() || "Untitled race"}</p></div></div>
            <div className="mt-5 divide-y divide-border border-y border-border text-[11px]">
              <SummaryRow label="Game" value={gameType === "sudoku" ? "Zero Sudoku" : "Zero Words"} />
              <SummaryRow label="Players" value={`Up to ${maxPlayers}`} />
              <SummaryRow label="Duration" value={`${durationMinutes} minutes`} />
              <SummaryRow label="Access" value={visibility === "link" ? "Link only" : visibility === "followers" ? "Followers" : "Public"} />
              <SummaryRow label="Reward" value={rewardType === "cash" ? format(basePrizeAmount) : selectedOffer.label} />
            </div>
            <button disabled={!canCreate || creating} onClick={createCompetition} className="mt-5 hidden h-11 w-full items-center justify-center gap-2 rounded-md bg-foreground text-[12px] font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35 md:flex">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4 fill-current" />}{creating ? "Publishing" : rewardType === "cash" ? "Secure prize & publish" : "Publish competition"}</button>
          </div>
        </aside>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/96 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden">
        <button disabled={!canCreate || creating} onClick={createCompetition} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-foreground text-[12px] font-semibold text-background disabled:opacity-35">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4 fill-current" />}{creating ? "Publishing" : rewardType === "cash" ? "Secure prize & publish" : "Publish competition"}</button>
      </div>
    </div>
  );
}

const fieldClass = "mt-1.5 h-11 w-full rounded-md border border-border bg-card px-3 text-[12px] font-medium outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10";
const FieldLabel = ({ children }: { children: ReactNode }) => <span className="block text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{children}</span>;

function FormSection({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <section><div className="mb-3"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">{eyebrow}</p><h2 className="mt-1 text-[17px] font-semibold tracking-tight">{title}</h2></div>{children}</section>;
}

function GameChoice({ selected, onClick, Icon, title, detail }: any) {
  return <button type="button" onClick={onClick} className={`flex min-h-[100px] items-start gap-3 rounded-md border p-4 text-left transition ${selected ? "border-primary bg-primary/[0.055] ring-1 ring-primary/10" : "border-border bg-card hover:border-foreground/20"}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${selected ? "bg-primary text-primary-foreground" : "bg-foreground text-background"}`}><Icon className="h-5 w-5 fill-current" /></span><span className="min-w-0"><span className="flex items-center gap-2 text-[13px] font-semibold">{title}{selected && <BadgeCheck className="h-4 w-4 fill-primary text-primary-foreground" />}</span><span className="mt-1 block text-[10.5px] leading-4 text-muted-foreground">{detail}</span></span></button>;
}

function VisibilityChoice({ selected, onClick, Icon, title, detail }: any) {
  return <button type="button" onClick={onClick} className={`min-h-[84px] rounded-md border p-3 text-left ${selected ? "border-primary bg-primary/[0.05]" : "border-border bg-card"}`}><div className="flex items-center justify-between"><Icon className={`h-4 w-4 ${selected ? "fill-current text-primary" : "text-muted-foreground"}`} />{selected && <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} />}</div><p className="mt-3 text-[11.5px] font-semibold">{title}</p><p className="mt-0.5 text-[9.5px] leading-4 text-muted-foreground">{detail}</p></button>;
}

function RewardChoice({ selected, onClick, Icon, title, detail }: any) {
  return <button type="button" onClick={onClick} className={`min-h-[112px] rounded-md border p-4 text-left ${selected ? "border-primary bg-primary/[0.05]" : "border-border bg-card"}`}><div className="flex items-center justify-between"><span className={`grid h-9 w-9 place-items-center rounded-md ${selected ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-foreground"}`}><Icon className="h-[18px] w-[18px] fill-current" /></span>{selected && <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" strokeWidth={3} /></span>}</div><p className="mt-3 text-[12px] font-semibold">{title}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p></button>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-3"><span className="text-muted-foreground">{label}</span><span className="max-w-[180px] truncate text-right font-semibold">{value}</span></div>;
}
