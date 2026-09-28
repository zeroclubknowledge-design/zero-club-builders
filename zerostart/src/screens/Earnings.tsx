import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Check, Info, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getEarnings } from "@/lib/campaignApi";
import { config } from "@/lib/config";
import { isCurrency, money, type PayoutCurrency } from "@/lib/money";
import { nextTier, type Earnings as EarningsData } from "@/types/campaign";
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
    return <EmptyState title="Sign in to see your earnings" body="Weekly payouts and bonuses live here." action={<Link to="/signin" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">Sign in</Link>} />;
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Skeleton className="h-[420px] rounded-[24px]" />;
  if (!data.found) {
    return <EmptyState title="Set up your ambassador profile" body="Earnings start once you're an ambassador and join a campaign." action={<Link to="/join" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">Get started</Link>} />;
  }

  const currency: PayoutCurrency = isCurrency(data.currency) ? data.currency : "NGN";
  const carried = Math.max(0, Number(data.unpaid_total) - Number(data.this_week_total));
  const weeks = buildWeeks(data.week_start, data.weekly_results);
  const peak = Math.max(1, ...weeks.map((w) => w.results));

  return (
    <div className="zs-rise">
      <h1 className="text-[26px] font-bold text-ink sm:text-[30px]">Earnings</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">Commission on your referrals' payments, paid weekly into your Zero Club wallet.</p>

      <section className="zs-hero mt-5 p-6 sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
          This week · {fmtDay(data.week_start)} – {fmtDay(addDays(data.week_start, 6))}
        </p>
        <p className="mt-2 font-display text-[42px] font-bold leading-none tracking-tight">{money(data.this_week_total, currency)}</p>
        <p className="mt-2 text-[12.5px] text-white/65">
          {data.commission_rate}% of {money(data.this_week_sales, currency)} your referrals paid this week, plus bonuses
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-white/65">
          <CalendarDays className="h-3.5 w-3.5" /> Payout from {fmtDay(data.next_payout_on, { weekday: "long", month: "short", day: "numeric" })}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-white/50">Members you brought in</p>
            <p className="mt-1.5 font-display text-[18px] font-bold">{data.referred_members}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-white/50">Of them, paying</p>
            <p className="mt-1.5 font-display text-[18px] font-bold">{data.paying_members}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-white/50">Waiting from earlier weeks</p>
            <p className="mt-1.5 font-display text-[18px] font-bold">{money(carried, currency)}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/10">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-white/50">Paid all time</p>
            <p className="mt-1.5 font-display text-[18px] font-bold">{money(data.paid_total, currency)}</p>
          </div>
        </div>
        <a href={`${config.zeroClubUrl}/app/wallet`} className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white">
          <Wallet className="h-4 w-4" /> Open my wallet
        </a>
      </section>

      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">This week by campaign</h2>
      {data.this_week.length === 0 ? (
        <Card className="p-5">
          <p className="text-[13px] text-ink-muted">
            No verified results yet this week. <Link to="/campaigns" className="font-semibold text-accent">Share a campaign link</Link> to start earning.
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {data.this_week.map((line, i) => {
            const tier = nextTier(line.tiers, line.results);
            const pct = tier ? Math.min(100, (line.results / tier.min) * 100) : 100;
            return (
              <Card key={line.campaign_id ?? `bonus-${i}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-ink">{line.title}</p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {line.campaign_id
                        ? `${money(line.sales, currency)} in referral sales · ${line.results} new result${line.results === 1 ? "" : "s"}`
                        : "Bonus from the Zero Club team"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-[16px] font-bold text-ink">{money(Number(line.base) + Number(line.bonus), currency)}</p>
                    {Number(line.bonus) > 0 && <p className="text-[11.5px] font-semibold text-ok">incl. +{money(line.bonus, currency)} bonus</p>}
                  </div>
                </div>
                {line.campaign_id && line.tiers?.length > 0 && (
                  <>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-ink-faint">
                      {tier ? <>{tier.min - line.results} more results for a +{money(tier.bonus, currency)} bonus</> : <><Check className="mr-1 inline h-3 w-3 text-ok" />Top bonus reached</>}
                    </p>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Latest commissions</h2>
      {data.recent_commissions.length === 0 ? (
        <Card className="p-5">
          <p className="text-[13px] text-ink-muted">When someone you referred pays for a bootcamp, membership, store item or club, your commission shows up here instantly.</p>
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
              <p className="font-display text-[15px] font-bold text-ok">+{money(c.amount, currency)}</p>
            </div>
          ))}
        </Card>
      )}

      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">New results · last 8 weeks</h2>
      <Card className="p-5">
        <div className="flex h-32 items-end gap-2">
          {weeks.map((w) => (
            <div key={w.week_start} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[10.5px] font-semibold text-ink-muted">{w.results || ""}</span>
              <div
                className={`w-full rounded-t-md ${w.week_start === data.week_start ? "bg-accent" : "bg-accent/25"}`}
                style={{ height: `${Math.max(4, (w.results / peak) * 88)}px` }}
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
        <Card className="p-5"><p className="text-[13px] text-ink-muted">Your first payout will appear here after your first full week.</p></Card>
      ) : (
        <Card className="divide-y divide-line">
          {data.payouts.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ok/10 text-ok"><Check className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink">Week of {fmtDay(p.week_start)}</p>
                <p className="text-[11.5px] text-ink-faint">{p.results} results{Number(p.bonus) > 0 ? ` · +${money(p.bonus, currency)} bonus` : ""} · paid {fmtDay(p.paid_at.slice(0, 10))}</p>
              </div>
              <p className="font-display text-[15px] font-bold text-ink">{money(p.total, currency)}</p>
            </div>
          ))}
        </Card>
      )}

      <Card className="mt-8 flex gap-3 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
        <p className="text-[12px] leading-relaxed text-ink-muted">
          You earn {data.commission_rate}% of every payment made by members who joined through your link — locked in for as long as
          you're an ambassador. Weeks run Monday to Sunday (Lagos time); after a week closes, your commission and any bonuses are
          paid together into your Zero Club wallet.
        </p>
      </Card>
    </div>
  );
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildWeeks(current: string, rows: { week_start: string; results: number }[]) {
  const out: { week_start: string; results: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const w = addDays(current, -7 * i);
    out.push({ week_start: w, results: rows.find((r) => r.week_start === w)?.results ?? 0 });
  }
  return out;
}
