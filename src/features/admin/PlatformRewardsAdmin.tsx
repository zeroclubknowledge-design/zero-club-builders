import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, Coins, Gift, Loader2, Search, Trophy, X } from "@/components/icons/glyphs";
import { ZeroLoader } from "@/components/ZeroLoader";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { ZERO_GAMES, type ZeroGameKey } from "@/features/games/v2/catalog";

type RewardRow = {
  id: string;
  kind: "tournament_prize" | "direct_reward";
  reward_type: "funds" | "zp";
  amount: number;
  zp: number;
  naira_cost: number;
  reason: string | null;
  place: number | null;
  created_at: string;
  recipient_id: string;
  recipient_name: string | null;
  recipient_username: string | null;
  recipient_avatar: string | null;
  admin_name: string | null;
  tournament_id: string | null;
  tournament_title: string | null;
};

type SponsoredRow = {
  id: string;
  title: string;
  game_type: ZeroGameKey;
  reward_type: string;
  prize_pool: number;
  status: "upcoming" | "live" | "ended";
  ends_at: string;
  host_name: string | null;
  players: number;
  paid: number;
};

type Ledger = {
  totals: { funds: number; zp: number; naira_cost: number; month_cost: number; count: number; recipients: number };
  committed: number;
  rewards: RewardRow[];
  tournaments: SponsoredRow[];
};

type Member = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };

/** Admin → Rewards: Zero Club-funded rewards and sponsored games, with the full record. */
export function PlatformRewardsAdmin() {
  const { format } = useWalletCurrency();
  const money = (n: number) => format(Number(n || 0));
  const query = useQuery({
    queryKey: ["admin", "platform-rewards"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_platform_rewards", { p_limit: 200 });
      if (error) throw error;
      return data as Ledger;
    },
  });
  const d = query.data;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold">Rewards &amp; sponsored games</h2>
          <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
            Money and ZP paid by Zero Club itself — direct rewards to members and prizes from sponsored tournaments. Nothing here comes out of an admin's own wallet.
          </p>
        </div>
        <Link to="/app/games/create" search={{ game: undefined }} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold text-white" style={{ background: "#cc208f" }}>
          <Trophy className="h-4 w-4" /> Host a sponsored game
        </Link>
      </div>

      {query.isLoading && <div className="flex justify-center py-16"><ZeroLoader /></div>}
      {query.error && <p className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-[13px] text-rose-600">{(query.error as Error).message}</p>}

      {d && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat label="Total paid by Zero Club" value={money(d.totals.naira_cost)} sub={`${d.totals.count} payouts · ${d.totals.recipients} members`} />
            <Stat label="This month" value={money(d.totals.month_cost)} sub="Funds + ZP at ₦ value" />
            <Stat label="Funds / ZP" value={money(d.totals.funds)} sub={`${Number(d.totals.zp).toLocaleString()} ZP`} />
            <Stat label="Committed" value={money(d.committed)} sub="Prizes in running sponsored games" />
          </div>

          <GrantReward money={money} />

          <section className="mt-6">
            <h3 className="text-[15px] font-semibold">Sponsored tournaments</h3>
            {d.tournaments.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">None yet. Sponsored games you host show up here.</p>
            ) : (
              <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {d.tournaments.map((t) => (
                  <Link key={t.id} to="/app/games/t/$id" params={{ id: t.id }} search={{ code: undefined }} className="flex items-center gap-3 p-3 hover:bg-foreground/[0.02]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: `linear-gradient(150deg, ${ZERO_GAMES[t.game_type].to}, ${ZERO_GAMES[t.game_type].from})` }}>
                      {ZERO_GAMES[t.game_type].name.split(" ")[1]?.charAt(0) || "Z"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold">{t.title}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {t.status === "live" ? "Live" : t.status === "upcoming" ? "Upcoming" : "Ended"} · {t.players} players · hosted by {t.host_name || "admin"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-bold tabular-nums">{t.reward_type === "offer" || t.reward_type === "none" ? "—" : money(t.prize_pool)}</p>
                      <p className="text-[11.5px] text-muted-foreground">{t.status === "ended" ? `Paid ${money(t.paid)}` : "Budget"}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6">
            <h3 className="text-[15px] font-semibold">Payout record</h3>
            {d.rewards.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">No payouts yet.</p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[640px] text-left text-[12.5px]">
                  <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Date</th>
                      <th className="px-3 py-2.5 font-semibold">Member</th>
                      <th className="px-3 py-2.5 font-semibold">For</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                      <th className="px-3 py-2.5 font-semibold">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.rewards.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{new Date(r.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                        <td className="px-3 py-2.5">
                          <Link to="/app/profile/$id" params={{ id: r.recipient_username || r.recipient_id }} className="font-semibold hover:underline">{r.recipient_name || "Member"}</Link>
                          {r.recipient_username && <span className="ml-1 text-muted-foreground">@{r.recipient_username}</span>}
                        </td>
                        <td className="max-w-[240px] px-3 py-2.5">
                          <span className={`mr-1.5 inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${r.kind === "direct_reward" ? "bg-[#cc208f]/10 text-[#cc208f]" : "bg-amber-500/10 text-amber-700"}`}>
                            {r.kind === "direct_reward" ? "Reward" : `#${r.place} prize`}
                          </span>
                          <span className="text-foreground/80">{r.kind === "direct_reward" ? r.reason : r.tournament_title}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums">
                          {r.reward_type === "funds" ? money(r.amount) : `${r.zp.toLocaleString()} ZP`}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{r.admin_name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-[20px] font-bold tabular-nums">{value}</p>
      <p className="truncate text-[11.5px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function GrantReward({ money }: { money: (n: number) => string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [type, setType] = useState<"funds" | "zp">("funds");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = search.trim().replace(/^@/, "").replace(/[%,()]/g, "");
    if (q.length < 2 || member) { setResults([]); return; }
    const handle = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(6);
      setResults((data || []) as Member[]);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search, member]);

  const n = Math.floor(Number(amount) || 0);
  const valid = member && reason.trim().length >= 3 && (type === "funds" ? n >= 1 && n <= 5_000_000 : n >= 10 && n % 10 === 0);

  const send = async () => {
    if (!member || !valid) return;
    const label = type === "funds" ? money(n) : `${n.toLocaleString()} ZP`;
    if (!window.confirm(`Send ${label} from Zero Club to ${member.full_name || member.username}?\n\nReason: ${reason.trim()}`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_grant_reward", { p_profile: member.id, p_type: type, p_amount: n, p_reason: reason.trim() });
      if (error) throw error;
      toast.success(`${label} sent to ${(data as { recipient?: string })?.recipient || "member"}`);
      setMember(null); setSearch(""); setAmount(""); setReason("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "platform-rewards"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold"><Gift className="h-4 w-4 text-[#cc208f]" /> Reward a member</h3>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">Paid by Zero Club. The member is notified and it's added to the record below.</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="relative">
          {member ? (
            <div className="flex h-11 items-center gap-2 rounded-xl border border-[#cc208f] bg-[#cc208f]/[0.04] px-3">
              {member.avatar_url ? <img src={member.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-[#cc208f]/10 text-[12px] font-bold text-[#cc208f]">{(member.full_name || member.username || "?").charAt(0)}</span>}
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{member.full_name || member.username} <span className="font-normal text-muted-foreground">@{member.username}</span></span>
              <button onClick={() => setMember(null)} aria-label="Change member" className="grid h-7 w-7 place-items-center rounded-full hover:bg-foreground/[0.05]"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3 focus-within:border-[#cc208f]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a member by name or @username" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" />
            </label>
          )}
          {!member && results.length > 0 && (
            <div className="absolute inset-x-0 top-12 z-10 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              {results.map((m) => (
                <button key={m.id} onClick={() => { setMember(m); setResults([]); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-foreground/[0.04]">
                  {m.avatar_url ? <img src={m.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-[#cc208f]/10 text-[12px] font-bold text-[#cc208f]">{(m.full_name || m.username || "?").charAt(0)}</span>}
                  <span className="truncate text-[13px] font-semibold">{m.full_name || m.username}</span>
                  {m.username && <span className="truncate text-[12px] text-muted-foreground">@{m.username}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex shrink-0 rounded-xl bg-foreground/[0.06] p-1">
            {([["funds", "Funds", Banknote], ["zp", "ZP", Coins]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => setType(v)} className={`flex h-9 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold ${type === v ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          <label className="flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-border px-3 focus-within:border-[#cc208f]">
            {type === "funds" && <span className="text-[14px] font-semibold text-muted-foreground">₦</span>}
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" placeholder={type === "funds" ? "Amount" : "Steps of 10"} className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold tabular-nums outline-none" />
            {type === "zp" && <span className="text-[12.5px] font-semibold text-muted-foreground">ZP</span>}
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} placeholder="Reason (shown to the member and kept in the record)" className="h-11 min-w-0 flex-1 rounded-xl border border-border px-3 text-[13.5px] outline-none focus:border-[#cc208f]" />
        <button onClick={() => void send()} disabled={!valid || busy} className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-foreground px-5 text-[13.5px] font-semibold text-background disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />} Send reward
        </button>
      </div>
      {type === "zp" && n > 0 && <p className="mt-2 text-[12px] text-muted-foreground">Costs Zero Club {money(Math.floor(n / 10))} (10 ZP = ₦1).</p>}
    </section>
  );
}
