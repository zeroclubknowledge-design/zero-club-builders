import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight, CalendarDays, ClipboardList, Gift, LinkIcon, MapPin, Megaphone, Trophy, Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getMe } from "@/lib/ambassadorApi";
import { getEarnings, getLeaderboard, listCampaigns } from "@/lib/campaignApi";
import { isCurrency, money, type PayoutCurrency } from "@/lib/money";
import { nextTier, type Campaign, type Earnings, type LeaderRow } from "@/types/campaign";
import type { AmbassadorMe } from "@/types/ambassador";
import { Card, ErrorState, Skeleton } from "@/components/ui/primitives";
import { CampaignCard } from "@/features/campaigns/CampaignCard";
import { CampaignSheet } from "@/features/campaigns/CampaignSheet";
import { Landing } from "./Landing";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Home() {
  const { session, profile, loading } = useAuth();
  const [me, setMe] = useState<AmbassadorMe | null>(null);
  const [earn, setEarn] = useState<Earnings | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [open, setOpen] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!session) return;
    setError(null);
    getMe().then(setMe).catch((e) => setError(e.message));
    getEarnings().then(setEarn).catch(() => setEarn(null));
    listCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
    getLeaderboard("week", 200).then(setBoard).catch(() => setBoard([]));
  };
  useEffect(load, [session?.user?.id]);

  if (loading) return <Skeleton className="h-[460px] rounded-[24px]" />;
  if (!session) return <Landing />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!me) return <Skeleton className="h-[460px] rounded-[24px]" />;
  if (!me.found) return <Landing signedIn applicationStatus={me.application?.status} />;

  const currency: PayoutCurrency = isCurrency(earn?.currency) ? earn!.currency : "NGN";
  const firstName = (profile?.full_name || profile?.username || "there").split(" ")[0];
  const weekResults = (earn?.this_week || []).reduce((s, l) => s + l.results, 0);
  const mine = (campaigns || []).filter((c) => c.joined && c.status !== "ended");
  const open_ = (campaigns || []).filter((c) => !c.joined && c.status === "live").slice(0, 4);
  const rank = board.findIndex((r) => r.profile_id === session.user.id);

  // The nearest bonus across this week's campaigns: the most motivating number on the page.
  const nudge = (earn?.this_week || [])
    .map((l) => ({ line: l, tier: nextTier(l.tiers, l.results) }))
    .filter((x) => x.tier)
    .sort((a, b) => a.tier!.min - a.line.results - (b.tier!.min - b.line.results))[0];

  const payDay = earn ? new Date(earn.next_payout_on + "T00:00:00") : null;

  return (
    <div className="zs-rise">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-muted">{greeting()},</p>
          <h1 className="truncate text-[26px] font-bold leading-tight text-ink sm:text-[30px]">{firstName}</h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted">
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">{me.level}</span>
            <MapPin className="h-3.5 w-3.5" /> {me.location}
          </p>
        </div>
        {rank >= 0 && weekResults > 0 && (
          <Link to="/leaderboard" className="zs-card flex shrink-0 items-center gap-2 px-3.5 py-2.5">
            <Trophy className="h-4 w-4 text-accent" />
            <span className="text-[12.5px] font-semibold text-ink">#{rank + 1} this week</span>
          </Link>
        )}
      </div>

      {/* ── Earnings hero ── */}
      <section className="zs-hero relative mt-5 overflow-hidden p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Earned this week</p>
            <p className="mt-2 font-display text-[40px] font-bold leading-none tracking-tight sm:text-[48px]">
              {earn ? money(earn.this_week_total, currency) : "—"}
            </p>
            {payDay && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-white/65">
                <CalendarDays className="h-3.5 w-3.5" /> Paid to your wallet from{" "}
                {payDay.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
              </p>
            )}
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Wallet className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <HeroStat label={`${me.commission_rate ?? 0}% of sales`} value={earn ? money(earn.this_week_sales, currency, true) : "—"} />
          <HeroStat label="Referred" value={String(earn?.referred_members ?? 0)} />
          <HeroStat label="Paid so far" value={earn ? money(earn.paid_total, currency, true) : "—"} />
        </div>

        {nudge?.tier && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.08] px-4 py-3 ring-1 ring-white/10">
            <Gift className="h-5 w-5 shrink-0 text-[#f28fd0]" />
            <p className="text-[12.5px] leading-snug text-white/80">
              <span className="font-semibold text-white">{nudge.tier.min - nudge.line.results} more</span> on {nudge.line.title} unlocks a{" "}
              <span className="font-semibold text-white">+{money(nudge.tier.bonus, currency)}</span> bonus.
            </p>
          </div>
        )}

        <Link to="/earnings" className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white">
          See earnings <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* ── Your campaigns ── */}
      <SectionTitle title="Your campaigns" to="/campaigns" action="Browse all" />
      {!campaigns && <Skeleton className="h-28 rounded-[18px]" />}
      {campaigns && mine.length === 0 && (
        <Card className="flex items-center gap-4 p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Megaphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Join your first campaign</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">Get a personal link, share it, and earn for every result.</p>
          </div>
          <Link to="/campaigns" className="shrink-0 rounded-full bg-accent px-4 py-2 text-[12.5px] font-semibold text-accent-ink">Browse</Link>
        </Card>
      )}
      {mine.length > 0 && (
        <div className="space-y-2.5">
          {mine.map((c) => (
            <button key={c.id} onClick={() => setOpen(c)} className="zs-card zs-card-hover flex w-full items-center gap-3.5 p-3.5 text-left">
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#1d1420]">
                {c.cover_url ? <img src={c.cover_url} alt="" className="h-full w-full object-cover" /> : <LinkIcon className="h-5 w-5 text-white/70" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">{c.title}</span>
                <span className="mt-0.5 block text-[12px] text-ink-muted">
                  <span className="font-semibold text-ink">{c.my_week_results}</span> this week · code <span className="font-mono font-semibold">{c.my_code}</span>
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent">Share</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Open campaigns ── */}
      {open_.length > 0 && (
        <>
          <SectionTitle title="Open campaigns" to="/campaigns" action="See all" />
          <div className="grid gap-3 sm:grid-cols-2">
            {open_.map((c) => (
              <CampaignCard key={c.id} campaign={c} currency={currency} rate={me.commission_rate} onOpen={() => setOpen(c)} />
            ))}
          </div>
        </>
      )}

      {/* ── Tasks ── */}
      <SectionTitle title="Tasks & initiatives" />
      <Link to="/tasks" className="zs-card zs-card-hover flex items-center gap-4 p-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink/[0.05] text-ink">
          <ClipboardList className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-ink">Tasks from Zero Club & your own initiatives</span>
          <span className="mt-0.5 block text-[12.5px] text-ink-muted">
            {me.tasks_approved ?? 0} approved · {me.tasks_submitted ?? 0} in review · {(me.zp_earned ?? 0).toLocaleString()} ZP earned
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
      </Link>

      {open && (
        <CampaignSheet
          campaign={open}
          currency={currency}
          rate={me.commission_rate}
          isAmbassador
          onClose={() => setOpen(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.07] px-3 py-3 ring-1 ring-white/10">
      <p className="truncate font-display text-[18px] font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/50">{label}</p>
    </div>
  );
}

export function SectionTitle({ title, to, action }: { title: string; to?: "/campaigns" | "/earnings" | "/leaderboard"; action?: string }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between">
      <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">{title}</h2>
      {to && action && (
        <Link to={to} className="text-[12.5px] font-semibold text-accent">{action}</Link>
      )}
    </div>
  );
}
