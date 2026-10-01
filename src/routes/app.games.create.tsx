import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Banknote, Coins, Gift, Globe, LockKeyhole, Minus, Plus, ShieldCheck, Trophy, Users, X,
} from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { ZERO_GAME_OFFERS, ZERO_GAME_PROFESSIONS } from "@/features/games/zeroGames";
import { ZERO_GAMES, ZERO_GAME_LIST, isZeroGameKey, type ZeroGameKey } from "@/features/games/v2/catalog";
import { GameEmblem, SPLASH_CSS } from "@/features/games/v2/GameSplash";
import { createTournament, durationLabel, placeLabel, type TournamentReward } from "@/features/games/v2/api";

export const Route = createFileRoute("/app/games/create")({
  validateSearch: (search: Record<string, unknown>): { game?: ZeroGameKey } => ({
    game: isZeroGameKey(search.game) ? search.game : undefined,
  }),
  component: CreateTournament,
});

// 30 minutes up to 30 days (the database allows 10 minutes to 30 days).
const DURATIONS = [30, 60, 180, 360, 1440, 4320, 10080, 20160, 43200];
const DAY = 1440;
const CAPS = [10, 25, 50, 100];
const ZP_PER_NAIRA = 10;

function CreateTournament() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useUser();
  const { format } = useWalletCurrency();

  const [game, setGame] = useState<ZeroGameKey>(search.game || "space");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [profession, setProfession] = useState<string>(ZERO_GAME_PROFESSIONS[0]);
  const [startMode, setStartMode] = useState<"now" | "later">("now");
  const [startAt, setStartAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return toLocalInput(d);
  });
  const [duration, setDuration] = useState(60);
  const [capped, setCapped] = useState(false);
  const [cap, setCap] = useState(25);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [eligibility, setEligibility] = useState<"everyone" | "subscribers">("everyone");
  const [reward, setReward] = useState<TournamentReward>("none");
  const [places, setPlaces] = useState(1);
  const [amounts, setAmounts] = useState<string[]>(["1000", "500", "250"]);
  const [zps, setZps] = useState<string[]>(["500", "250", "100"]);
  const [labels, setLabels] = useState<string[]>([ZERO_GAME_OFFERS[0].label, "", ""]);
  const [saving, setSaving] = useState(false);
  const isAdmin = Boolean(profile?.is_admin);
  const [sponsorChoice, setSponsorChoice] = useState(true);
  /** Admins host on Zero Club's budget by default — no wallet top-up needed. */
  const sponsored = isAdmin && sponsorChoice;

  const info = ZERO_GAMES[game];
  const balance = Number(profile?.coins || 0);

  const pool = useMemo(() => {
    if (reward === "funds") return amounts.slice(0, places).reduce((s, v) => s + Math.max(0, Math.floor(Number(v) || 0)), 0);
    if (reward === "zp") return zps.slice(0, places).reduce((s, v) => s + Math.floor((Number(v) || 0) / ZP_PER_NAIRA), 0);
    return 0;
  }, [reward, amounts, zps, places]);

  const problems: string[] = [];
  if (title.trim().length < 3) problems.push("Give the tournament a name");
  if (startMode === "later" && new Date(startAt).getTime() < Date.now()) problems.push("Pick a start time in the future");
  if (reward === "funds" && amounts.slice(0, places).some((v) => !(Number(v) > 0))) problems.push("Each prize needs an amount");
  if (reward === "zp" && zps.slice(0, places).some((v) => !(Number(v) >= 10) || Number(v) % 10 !== 0)) problems.push("ZP prizes go in steps of 10");
  if (reward === "offer" && labels.slice(0, places).some((v) => v.trim().length < 3)) problems.push("Describe each reward");
  if (!sponsored && pool > balance) problems.push(`You need ${format(pool)} in your wallet for this prize pool`);

  const submit = async () => {
    if (problems.length) { toast.error(problems[0]); return; }
    setSaving(true);
    try {
      const prizes = Array.from({ length: places }, (_, i) =>
        reward === "funds" ? { place: i + 1, amount: Math.floor(Number(amounts[i])) }
        : reward === "zp" ? { place: i + 1, zp: Math.floor(Number(zps[i])) }
        : { place: i + 1, label: labels[i].trim() });
      const res = await createTournament({
        game_type: game,
        title: title.trim(),
        description: description.trim(),
        difficulty: game === "space" ? "medium" : difficulty,
        profession: game === "words" ? profession : null,
        starts_at: startMode === "later" ? new Date(startAt).toISOString() : null,
        duration_minutes: duration,
        max_players: capped ? cap : null,
        visibility,
        eligibility,
        reward_type: reward,
        prizes: reward === "none" ? [] : prizes,
        sponsored,
      });
      if (sponsored) void queryClient.invalidateQueries({ queryKey: ["admin", "platform-rewards"] });
      void queryClient.invalidateQueries({ queryKey: ["zero-tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["user"] });
      toast.success("Tournament created");
      navigate({ to: "/app/games/t/$id", params: { id: res.id }, search: { code: visibility === "private" ? res.share_code : undefined }, replace: true });
    } catch (e) {
      toast.error((e as Error).message.replace(/^.*?: /, "") || "Couldn't create the tournament.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas pb-[calc(env(safe-area-inset-bottom)+110px)]">
      <style>{SPLASH_CSS}</style>
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button onClick={() => window.history.back()} aria-label="Back" className="grid h-11 w-10 place-items-center rounded-full hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Host a tournament</h1>
        </div>
      </header>

      <main className="mx-auto max-w-[680px] space-y-2 pt-2">
        <Card title="Game">
          <div className="grid grid-cols-3 gap-2">
            {ZERO_GAME_LIST.map((g) => (
              <button
                key={g.key}
                onClick={() => setGame(g.key)}
                className={`flex flex-col items-center gap-2 rounded-2xl p-3 text-white transition ${game === g.key ? "ring-2 ring-[#cc208f] ring-offset-2 ring-offset-card" : "opacity-70"}`}
                style={{ background: `linear-gradient(150deg, ${g.to}, ${g.from})` }}
              >
                <GameEmblem game={g.key} size={44} />
                <span className="text-[12.5px] font-bold">{g.name}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{info.scoring}</p>
          {game !== "space" && (
            <div className="mt-3 space-y-3">
              <Segmented value={difficulty} onChange={setDifficulty} options={[["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]]} />
              {game === "words" && (
                <select value={profession} onChange={(e) => setProfession(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] outline-none focus:border-[#cc208f]">
                  {ZERO_GAME_PROFESSIONS.map((p) => <option key={p}>{p}</option>)}
                </select>
              )}
            </div>
          )}
        </Card>

        <Card title="Details">
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder={`e.g. Friday ${info.name} Showdown`} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[14.5px] outline-none focus:border-[#cc208f]" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 600))} rows={3} placeholder="Rules, shout-outs or anything players should know (optional)" className="mt-2 w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-[14px] outline-none focus:border-[#cc208f]" />
        </Card>

        <Card title="When" Icon={Trophy}>
          <Segmented value={startMode} onChange={(v) => setStartMode(v as "now" | "later")} options={[["now", "Start now"], ["later", "Schedule"]]} />
          {startMode === "later" && (
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] outline-none focus:border-[#cc208f]" />
          )}
          <p className="mb-2 mt-4 text-[13px] font-semibold">How long it runs</p>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((m) => (
              <Chip key={m} active={duration === m} onClick={() => setDuration(m)}>{m === 43200 ? "30 days (1 month)" : durationLabel(m)}</Chip>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <span className="flex-1 text-[13px] text-muted-foreground">Or set the number of days</span>
            <button type="button" onClick={() => setDuration((d) => Math.max(DAY, (Math.ceil(d / DAY) - 1) * DAY))} className="grid h-8 w-8 place-items-center rounded-full border border-border"><Minus className="h-3.5 w-3.5" /></button>
            <input
              value={duration >= DAY && duration % DAY === 0 ? duration / DAY : ""}
              placeholder="–"
              onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (n) setDuration(Math.min(30, Math.max(1, n)) * DAY); }}
              inputMode="numeric"
              className="w-10 bg-transparent text-center text-[15px] font-semibold tabular-nums outline-none"
            />
            <button type="button" onClick={() => setDuration((d) => Math.min(30 * DAY, (Math.floor(d / DAY) + 1) * DAY))} className="grid h-8 w-8 place-items-center rounded-full border border-border"><Plus className="h-3.5 w-3.5" /></button>
            <span className="text-[13px] font-semibold">days</span>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Ends {new Date((startMode === "later" ? new Date(startAt).getTime() : Date.now()) + duration * 60000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. The leaderboard is live the whole time and the winners are paid when it ends.
          </p>
        </Card>

        <Card title="Players" Icon={Users}>
          <Segmented value={capped ? "cap" : "open"} onChange={(v) => setCapped(v === "cap")} options={[["open", "Unlimited"], ["cap", "Set a limit"]]} />
          {capped && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {CAPS.map((c) => <Chip key={c} active={cap === c} onClick={() => setCap(c)}>{c}</Chip>)}
              <div className="ml-auto flex items-center gap-1 rounded-full border border-border p-1">
                <button onClick={() => setCap((c) => Math.max(2, c - 1))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/[0.05]"><Minus className="h-3.5 w-3.5" /></button>
                <input value={cap} onChange={(e) => setCap(Math.max(2, Math.min(10000, Number(e.target.value.replace(/\D/g, "")) || 2)))} inputMode="numeric" className="w-12 bg-transparent text-center text-[14px] font-semibold tabular-nums outline-none" />
                <button onClick={() => setCap((c) => Math.min(10000, c + 1))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/[0.05]"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
        </Card>

        <Card title="Access">
          <Option active={visibility === "public"} onClick={() => setVisibility("public")} Icon={Globe} title="Public" body="Listed in Zero Games. Anyone can find and join it." />
          <Option active={visibility === "private"} onClick={() => setVisibility("private")} Icon={LockKeyhole} title="Private" body="Hidden from the list. Only people with your invite link can join." />
          <p className="mb-2 mt-4 text-[13px] font-semibold">Who can enter</p>
          <Option active={eligibility === "everyone"} onClick={() => setEligibility("everyone")} Icon={Users} title="Everyone" body="Free and Premium members." />
          <Option active={eligibility === "subscribers"} onClick={() => setEligibility("subscribers")} Icon={ShieldCheck} title="Premium members" body="Only Premium, Premium+ and Creator members can join." />
        </Card>

        <Card title="Prizes">
          {isAdmin && (
            <div className="mb-4">
              <Option active={sponsored} onClick={() => setSponsorChoice(true)} Icon={ShieldCheck} title="Sponsored by Zero Club" body="Zero Club pays the winners. Nothing is taken from your wallet, and every payout is recorded in Admin → Rewards & games." />
              <Option active={!sponsored} onClick={() => setSponsorChoice(false)} Icon={Banknote} title="From my wallet" body="Prizes are held from your own wallet, like any member's tournament." />
            </div>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            {([["none", "None", Trophy], ["funds", "Funds", Banknote], ["zp", "Zero Points", Coins], ["offer", "Offer", Gift]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                onClick={() => setReward(v)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[12px] font-semibold transition ${reward === v ? "border-[#cc208f] bg-[#cc208f]/[0.07] text-[#cc208f]" : "border-border text-muted-foreground"}`}
              >
                <Icon className="h-5 w-5" /> {label}
              </button>
            ))}
          </div>

          {reward !== "none" && (
            <>
              <div className="mt-4 flex items-center">
                <p className="text-[13px] font-semibold">Winning places</p>
                <div className="ml-auto"><Segmented value={String(places)} onChange={(v) => setPlaces(Number(v))} options={[["1", "Top 1"], ["2", "Top 2"], ["3", "Top 3"]]} /></div>
              </div>
              <div className="mt-3 space-y-2">
                {Array.from({ length: places }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-[13px] font-bold text-muted-foreground">{placeLabel(i + 1)}</span>
                    {reward === "funds" && (
                      <AmountInput value={amounts[i]} onChange={(v) => setAmounts((a) => a.map((x, j) => (j === i ? v : x)))} prefix="₦" />
                    )}
                    {reward === "zp" && (
                      <AmountInput value={zps[i]} onChange={(v) => setZps((a) => a.map((x, j) => (j === i ? v : x)))} suffix="ZP" />
                    )}
                    {reward === "offer" && (
                      <div className="relative flex-1">
                        <input list="zg-offers" value={labels[i]} onChange={(e) => setLabels((a) => a.map((x, j) => (j === i ? e.target.value.slice(0, 120) : x)))} placeholder="e.g. Free mentorship call" className="h-11 w-full rounded-xl border border-border bg-card px-3 pr-9 text-[14px] outline-none focus:border-[#cc208f]" />
                        {labels[i] && <button onClick={() => setLabels((a) => a.map((x, j) => (j === i ? "" : x)))} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
                      </div>
                    )}
                  </div>
                ))}
                <datalist id="zg-offers">{ZERO_GAME_OFFERS.map((o) => <option key={o.id} value={o.label} />)}</datalist>
              </div>
              <p className="mt-3 rounded-xl bg-foreground/[0.04] px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {reward === "offer"
                  ? (sponsored ? "Zero Club delivers these offers — winners get notified with what they won." : "You deliver offers yourself — winners get notified with what they won.")
                  : sponsored
                  ? `Zero Club pays up to ${format(pool)} to the winners automatically when it ends. Your wallet isn't touched.`
                  : `${format(pool)} will be held from your wallet now (balance ${format(balance)}) and paid to winners automatically when it ends. Unclaimed places are refunded to you.`}
                {reward === "zp" && ` ${ZP_PER_NAIRA} ZP = ₦1.`}
              </p>
            </>
          )}
        </Card>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-[680px] items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold">{info.name} · {durationLabel(duration)}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              {capped ? `${cap} players` : "Unlimited players"} · {visibility === "private" ? "Private" : "Public"} · {eligibility === "subscribers" ? "Premium" : "Everyone"}
              {pool > 0 ? ` · ${format(pool)} pool` : ""}{sponsored && reward !== "none" ? " · Zero Club pays" : ""}
            </p>
          </div>
          <button onClick={() => void submit()} disabled={saving} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: "#cc208f" }}>
            {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Card({ title, children, Icon }: { title: string; children: ReactNode; Icon?: typeof Users }) {
  return (
    <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
      <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{Icon && <Icon className="h-3.5 w-3.5" />}{title}</h2>
      {children}
    </section>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex w-full rounded-full bg-foreground/[0.06] p-1">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`h-8 flex-1 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition ${value === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`h-8 rounded-full border px-3.5 text-[13px] font-semibold transition ${active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}>
      {children}
    </button>
  );
}

function Option({ active, onClick, Icon, title, body }: { active: boolean; onClick: () => void; Icon: typeof Users; title: string; body: string }) {
  return (
    <button onClick={onClick} className={`mb-2 flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${active ? "border-[#cc208f] bg-[#cc208f]/[0.05]" : "border-border"}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? "text-[#cc208f]" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="text-[12.5px] leading-snug text-muted-foreground">{body}</p>
      </div>
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${active ? "bg-[#cc208f]" : "border-[1.5px] border-foreground/20"}`}>
        {active && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
    </button>
  );
}

function AmountInput({ value, onChange, prefix, suffix }: { value: string; onChange: (v: string) => void; prefix?: string; suffix?: string }) {
  return (
    <label className="flex h-11 flex-1 items-center gap-1.5 rounded-xl border border-border bg-card px-3 focus-within:border-[#cc208f]">
      {prefix && <span className="text-[14px] font-semibold text-muted-foreground">{prefix}</span>}
      <input value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" className="min-w-0 flex-1 bg-transparent text-[14.5px] font-semibold tabular-nums outline-none" />
      {suffix && <span className="text-[13px] font-semibold text-muted-foreground">{suffix}</span>}
    </label>
  );
}
