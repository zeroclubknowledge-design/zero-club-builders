import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, Hourglass, MapPin, Plus, Rocket, Trophy, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getMe } from "@/lib/ambassadorApi";
import { getEarnings, getLeaderboard, listMyCampaigns } from "@/lib/campaignApi";
import { isCurrency, money, type PayoutCurrency } from "@/lib/money";
import { daysLeft, type Earnings, type LeaderRow, type MyCampaign } from "@/types/campaign";
import type { AmbassadorMe } from "@/types/ambassador";
import { Card, ErrorState, Skeleton } from "@/components/ui/primitives";
import { PhasePill } from "@/features/campaigns/CampaignCard";
import { CampaignSheet } from "@/features/campaigns/CampaignSheet";
import { CampaignForm } from "@/features/campaigns/CampaignForm";
import { Landing } from "./Landing";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Home() {
  const { session, profile, loading } = useAuth();
  const [me, setMe] = useState<AmbassadorMe | null>(null);
  const [earn, setEarn] = useState<Earnings | null>(null);
  const [campaigns, setCampaigns] = useState<MyCampaign[] | null>(null);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ edit?: MyCampaign } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!session) return;
    setError(null);
    getMe().then(setMe).catch((e) => setError(e.message));
    getEarnings().then(setEarn).catch(() => setEarn(null));
    listMyCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
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
  const running = (campaigns || []).filter((c) => c.status === "live" || c.status === "paused");
  const waiting = (campaigns || []).filter((c) => c.status === "ended" && c.review_status === "pending");
  const shown = [...running, ...waiting];
  const rank = board.findIndex((r) => r.profile_id === session.user.id);
  const canStart = me.status === "active" && running.length < 3;
  const open = (campaigns || []).find((c) => c.id === openId) || null;

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
        {rank >= 0 && (
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
              {earn ? money(earn.this_week_commission, currency) : "—"}
            </p>
            <p className="mt-2 text-[12.5px] text-white/65">
              {me.commission_rate ?? 0}% of {earn ? money(earn.this_week_sales, currency) : "—"} your referrals paid this week
            </p>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Wallet className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <HeroStat label="In review" value={earn ? money(earn.in_review_total, currency, true) : "—"} />
          <HeroStat label="Referred" value={String(earn?.referred_members ?? 0)} />
          <HeroStat label="Paid so far" value={earn ? money(earn.paid_total, currency, true) : "—"} />
        </div>

        {earn && Number(earn.ready_total) > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[0.08] px-4 py-3 ring-1 ring-white/10">
            <Hourglass className="h-5 w-5 shrink-0 text-[#f28fd0]" />
            <p className="text-[12.5px] leading-snug text-white/80">
              <span className="font-semibold text-white">{money(earn.ready_total, currency)}</span> approved — it's in the next payout.
            </p>
          </div>
        )}

        <Link to="/earnings" className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white">
          See earnings <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* ── Your campaigns ── */}
      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">Your campaigns</h2>
        <Link to="/campaigns" className="text-[12.5px] font-semibold text-accent">All campaigns</Link>
      </div>
      {!campaigns && <Skeleton className="h-28 rounded-[18px]" />}
      {campaigns && shown.length === 0 && (
        <Card className="flex items-center gap-4 p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Rocket className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Start a campaign</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">Get your own link in seconds and earn on everyone who joins through it.</p>
          </div>
          <button onClick={() => setForm({})} disabled={!canStart} className="shrink-0 rounded-full bg-accent px-4 py-2 text-[12.5px] font-semibold text-accent-ink disabled:opacity-40">
            Start
          </button>
        </Card>
      )}
      {shown.length > 0 && (
        <div className="space-y-2.5">
          {shown.map((c) => {
            const left = daysLeft(c.ends_at);
            const live = c.status === "live" || c.status === "paused";
            return (
              <button key={c.id} onClick={() => setOpenId(c.id)} className="zs-card zs-card-hover flex w-full items-center gap-3.5 p-3.5 text-left">
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#1d1420]">
                  {c.cover_url ? <img src={c.cover_url} alt="" className="h-full w-full object-cover" /> : <Rocket className="h-5 w-5 text-white/70" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{c.title}</span>
                  <span className="mt-0.5 block text-[12px] text-ink-muted">
                    <span className="font-semibold text-ink">{c.new_members}</span> joined · <span className="font-semibold text-ink">{money(c.commission, currency, true)}</span> earned
                    {live && left != null && <> · {left}d left</>}
                  </span>
                </span>
                {live ? <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent">Share</span> : <PhasePill campaign={c} />}
              </button>
            );
          })}
          {canStart && (
            <button onClick={() => setForm({})} className="flex h-12 w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-line text-[13px] font-semibold text-ink-muted transition hover:text-ink">
              <Plus className="h-4 w-4" /> Start another campaign
            </button>
          )}
        </div>
      )}

      {/* ── Tasks ── */}
      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Tasks & initiatives</h2>
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

      {open && !form && (
        <CampaignSheet
          campaign={open}
          currency={currency}
          rate={me.commission_rate}
          onClose={() => setOpenId(null)}
          onChanged={load}
          onEdit={() => setForm({ edit: open })}
        />
      )}
      {form && (
        <CampaignForm
          initial={form.edit}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            if (id) setOpenId(id);
            load();
          }}
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
