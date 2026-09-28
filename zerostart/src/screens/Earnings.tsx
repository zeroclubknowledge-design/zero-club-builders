import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Hourglass, Info, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getEarnings } from "@/lib/campaignApi";
import { config } from "@/lib/config";
import { isCurrency, money, type PayoutCurrency } from "@/lib/money";
import type { Earnings as EarningsData } from "@/types/campaign";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { CurrencyPicker } from "@/features/campaigns/CurrencyPicker";

const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString(undefined, opts);

export function Earnings() {
  const { session, loading } = useAuth();
  const [data, setData] = useState<EarningsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!session) return;
    setError(null);
    getEarnings().then(setData).catch((e) => setError(e.message));
  };
  useEffect(load, [session?.user?.id]);

  if (loading) return <Skeleton className="h-[420px] rounded-[24px]" />;
  if (!session) {
    return <EmptyState title="Sign in to see your earnings" body="Commission, bonuses and payouts live here." action={<Link to="/signin" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">Sign in</Link>} />;
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Skeleton className="h-[420px] rounded-[24px]" />;
  if (!data.found) {
    return <EmptyState title="Become an ambassador first" body="Earnings start once you're approved and run your first campaign." action={<Link to="/join" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">Apply</Link>} />;
  }

  const currency: PayoutCurrency = isCurrency(data.currency) ? data.currency : "NGN";
  const weeks = buildWeeks(data.week_start, data.weekly_sales);
  const peak = Math.max(1, ...weeks.map((w) => Number(w.sales)));
  const total = Number(data.in_review_total) + Number(data.ready_total) + Number(data.paid_total);

  return (
    <div className="zs-rise">
      <h1 className="text-[26px] font-bold text-ink sm:text-[30px]">Earnings</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">Commission on your referrals' payments, paid into your Zero Club wallet after each campaign is checked.</p>

      <section className="zs-hero mt-5 p-6 sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Earned all time</p>
        <p className="mt-2 font-display text-[42px] font-bold leading-none tracking-tight">{money(total, currency)}</p>
        <p className="mt-2 text-[12.5px] text-white/65">
          {money(data.this_week_commission, currency)} this week · {data.commission_rate}% of every payment your referrals make
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <Stage icon={<Hourglass className="h-3.5 w-3.5" />} label="In review" value={money(data.in_review_total, currency, true)} hint="Campaigns running or being checked" />
          <Stage icon={<Check className="h-3.5 w-3.5" />} label="Ready to pay" value={money(data.ready_total, currency, true)} hint="Approved, in the next payout" />
          <Stage icon={<Wallet className="h-3.5 w-3.5" />} label="Paid" value={money(data.paid_total, currency, true)} hint="In your wallet" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[12.5px] text-white/70">
          <p><span className="font-semibold text-white">{data.referred_members}</span> members brought in</p>
          <p><span className="font-semibold text-white">{data.paying_members}</span> of them paying</p>
        </div>
        <a href={`${config.zeroClubUrl}/app/wallet`} className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white">
          <Wallet className="h-4 w-4" /> Open my wallet
        </a>
      </section>

      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Latest commissions</h2>
      {data.recent_commissions.length === 0 ? (
        <Card className="p-5">
          <p className="text-[13px] text-ink-muted">
            When someone who joined through your link pays for a bootcamp, membership, store item or club, your commission shows up here
            instantly. <Link to="/campaigns" className="font-semibold text-accent">Start a campaign</Link>
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {data.recent_commissions.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold capitalize text-ink">{c.description || c.source}</p>
                <p className="text-[11.5px] text-ink-faint">
                  {c.rate}% of {money(c.gross, currency)} · {new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-[15px] font-bold text-ok">+{money(c.amount, currency)}</p>
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">{c.paid ? "Paid" : "Pending"}</p>
              </div>
            </div>
          ))}
        </Card>
      )}

      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Referral payments · last 8 weeks</h2>
      <Card className="p-5">
        <div className="flex h-32 items-end gap-2">
          {weeks.map((w) => (
            <div key={w.week_start} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] font-semibold text-ink-muted">{Number(w.sales) ? money(w.sales, currency, true) : ""}</span>
              <div
                className={`w-full rounded-t-md ${w.week_start === data.week_start ? "bg-accent" : "bg-accent/25"}`}
                style={{ height: `${Math.max(4, (Number(w.sales) / peak) * 80)}px` }}
              />
              <span className="text-[10px] text-ink-faint">{fmtDay(w.week_start, { day: "numeric", month: "numeric" })}</span>
            </div>
          ))}
        </div>
      </Card>

      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Payout currency</h2>
      <CurrencyPicker value={currency} onChange={(c) => setData({ ...data, currency: c })} />
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
        Amounts are shown in your currency at the Zero Club wallet rate. Payouts land in your Zero Club wallet, where you can withdraw.
      </p>

      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Payout history</h2>
      {data.payouts.length === 0 ? (
        <Card className="p-5"><p className="text-[13px] text-ink-muted">Your first payout arrives when your first campaign is approved.</p></Card>
      ) : (
        <Card className="divide-y divide-line">
          {data.payouts.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ok/10 text-ok"><Check className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink">Paid {fmtDay(p.paid_at.slice(0, 10), { weekday: "short", month: "short", day: "numeric" })}</p>
                <p className="text-[11.5px] text-ink-faint">{money(p.base, currency)} commission{Number(p.bonus) > 0 ? ` · +${money(p.bonus, currency)} bonus` : ""}</p>
              </div>
              <p className="font-display text-[15px] font-bold text-ink">{money(p.total, currency)}</p>
            </div>
          ))}
        </Card>
      )}

      <Card className="mt-8 flex gap-3 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[12px] leading-relaxed text-ink-muted">
          You earn {data.commission_rate}% of every payment made by members who joined through your campaign links — locked in for as long
          as you're an ambassador. When a campaign ends, the Zero Club team checks it and pays its commission, plus any bonus, straight
          to your wallet. Members who keep paying after that keep earning you commission, paid in the regular payouts.
        </p>
      </Card>
    </div>
  );
}

function Stage({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10" title={hint}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">{icon}{label}</p>
      <p className="mt-1.5 truncate font-display text-[17px] font-bold">{value}</p>
    </div>
  );
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildWeeks(current: string, rows: { week_start: string; sales: number }[]) {
  const out: { week_start: string; sales: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const w = addDays(current, -7 * i);
    out.push({ week_start: w, sales: rows.find((r) => r.week_start === w)?.sales ?? 0 });
  }
  return out;
}
