import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight, BadgeCheck, CalendarDays, ChevronRight, Clock, Crown, LogOut, MapPin, Pencil, Users, Wallet,
} from "../components/icons/glyphs";
import { useAuth } from "@/lib/auth";
import { getMe, listFocusAreas, setPayoutFrequency } from "@/lib/ambassadorApi";
import { getEarnings } from "@/lib/campaignApi";
import { config } from "@/lib/config";
import { isCurrency, money, type PayoutCurrency } from "@/lib/money";
import type { AmbassadorMe, FocusArea } from "@/types/ambassador";
import type { Earnings } from "@/types/campaign";
import { Card, ErrorState, Skeleton } from "@/components/ui/primitives";
import { CurrencyPicker } from "@/features/campaigns/CurrencyPicker";

/**
 * The ambassador's own profile: who they are, how they're doing, and the
 * payout settings (currency and weekly/monthly schedule). Reached from the
 * avatar in the header — sign out lives here now.
 */
export function Profile() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState<AmbassadorMe | null>(null);
  const [earn, setEarn] = useState<Earnings | null>(null);
  const [areas, setAreas] = useState<FocusArea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingFreq, setSavingFreq] = useState(false);

  const load = () => {
    if (!session) return;
    setError(null);
    getMe().then(setMe).catch((e) => setError(e.message));
    getEarnings().then(setEarn).catch(() => setEarn(null));
    listFocusAreas().then(setAreas).catch(() => setAreas([]));
  };
  useEffect(load, [session?.user?.id]);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/signin" });
  }, [loading, session, navigate]);

  // Arriving from the Earnings page's "Change" link: scroll to payout settings once it has rendered.
  useEffect(() => {
    if (me && typeof window !== "undefined" && window.location.hash === "#payouts") {
      requestAnimationFrame(() => document.getElementById("payouts")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [me]);

  if (loading || !session) return <Skeleton className="h-[520px] rounded-[24px]" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!me) return <Skeleton className="h-[520px] rounded-[24px]" />;

  const name = profile?.full_name?.trim() || profile?.username || "You";
  const isAmb = me.found;
  const app = me.application;
  const pending = !isAmb && app?.status === "pending";
  const currency: PayoutCurrency = isCurrency(earn?.currency || me.payout_currency || "") ? ((earn?.currency || me.payout_currency) as PayoutCurrency) : "NGN";
  const frequency = (earn?.payout_frequency || me.payout_frequency || app?.payout_frequency || "weekly") as "weekly" | "monthly";
  const total = earn?.found ? Number(earn.in_review_total) + Number(earn.ready_total) + Number(earn.paid_total) : 0;
  const focusLabels = (me.focus || app?.focus || []).map((slug) => areas.find((a) => a.slug === slug)?.label || slug);

  const changeFrequency = async (f: "weekly" | "monthly") => {
    if (f === frequency || savingFreq) return;
    setSavingFreq(true);
    try {
      const res = await setPayoutFrequency(f);
      if (res.ok) {
        setMe((m) => (m ? { ...m, payout_frequency: f, application: m.application ? { ...m.application, payout_frequency: f } : m.application } : m));
        setEarn((e) => (e ? { ...e, payout_frequency: f } : e));
      }
    } finally {
      setSavingFreq(false);
    }
  };

  return (
    <div className="zs-rise mx-auto max-w-3xl">
      {/* Identity */}
      <section className="relative overflow-hidden rounded-[28px] bg-surface shadow-[var(--shadow-card)] ring-1 ring-line">
        <div className="zs-hero relative h-32 rounded-none sm:h-40">
          <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_120%,#ffd23f_0,transparent_40%),radial-gradient(circle_at_90%_-20%,#cc208f_0,transparent_45%)]" />
          {isAmb && (
            <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11.5px] font-semibold text-white backdrop-blur">
              <Crown className="h-3.5 w-3.5" /> {me.level || "Ambassador"}
            </span>
          )}
        </div>
        <div className="px-5 pb-6 sm:px-7">
          <div className="-mt-12 flex items-end justify-between gap-3">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-ink/[0.06] ring-4 ring-surface">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[34px] font-bold uppercase text-ink">{name.charAt(0)}</span>
              )}
            </div>
            <Link to="/join" className="mb-1 inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[13px] font-semibold text-ink transition hover:bg-ink/[0.04]">
              <Pencil className="h-4 w-4" /> {isAmb ? "Edit profile" : pending ? "Edit application" : "Apply"}
            </Link>
          </div>
          <div className="mt-3">
            <h1 className="flex flex-wrap items-center gap-2 text-[24px] font-bold leading-tight text-ink">
              {name}
              {isAmb && <BadgeCheck className="h-5 w-5 text-accent" />}
            </h1>
            <p className="mt-0.5 text-[13.5px] text-ink-muted">
              {profile?.username ? `@${profile.username}` : ""}
              {(me.location || app?.location) && (
                <span className="ml-2 inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{me.location || app?.location}</span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {isAmb ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[12px] font-semibold text-accent">
                  <BadgeCheck className="h-3.5 w-3.5" /> Zero Club Ambassador
                </span>
              ) : pending ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/12 px-3 py-1 text-[12px] font-semibold text-warn">
                  <Clock className="h-3.5 w-3.5" /> Application under review
                </span>
              ) : (
                <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-[12px] font-semibold text-ink-muted">Not an ambassador yet</span>
              )}
              {isAmb && me.joined_at && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1 text-[12px] font-medium text-ink-muted">
                  <CalendarDays className="h-3.5 w-3.5" /> Since {new Date(me.joined_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </span>
              )}
            </div>
            {(me.bio || app?.bio) && <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-ink-muted">{me.bio || app?.bio}</p>}
            {focusLabels.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {focusLabels.map((f) => (
                  <span key={f} className="rounded-full border border-line px-3 py-1 text-[12px] font-medium text-ink">{f}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Numbers */}
      {isAmb && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Earned all time" value={money(total, currency, true)} />
          <StatTile label="Commission rate" value={`${me.commission_rate ?? earn?.commission_rate ?? 0}%`} />
          <StatTile label="Members brought in" value={String(earn?.referred_members ?? 0)} />
          <StatTile label="Tasks approved" value={String(me.tasks_approved ?? 0)} />
        </div>
      )}

      {!isAmb && !pending && (
        <Link to="/join" className="mt-4 block overflow-hidden rounded-[24px] ring-1 ring-line">
          <img src="/ambassador-banner.jpg" alt="The Student Ambassador Program — apply now" className="aspect-[3/2] w-full object-cover" />
        </Link>
      )}

      {/* Payout settings */}
      <h2 id="payouts" className="mb-3 mt-8 scroll-mt-24 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Payout settings</h2>
      <Card className="p-5">
        <p className="text-[14px] font-semibold text-ink">Withdrawal schedule</p>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">How often your approved earnings can move to your Zero Club wallet.</p>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Withdrawal schedule">
          {([
            ["weekly", "Weekly", "Every Monday"],
            ["monthly", "Monthly", "On the 1st of each month"],
          ] as const).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={frequency === value}
              disabled={savingFreq}
              onClick={() => changeFrequency(value)}
              className={`rounded-xl px-3.5 py-3 text-left transition disabled:opacity-60 ${frequency === value ? "bg-ink text-bg" : "zs-inset text-ink"}`}
            >
              <span className="block text-[13.5px] font-bold">{label}</span>
              <span className={`mt-0.5 block text-[11.5px] ${frequency === value ? "text-bg/70" : "text-ink-faint"}`}>{hint}</span>
            </button>
          ))}
        </div>

        {isAmb && (
          <>
            <p className="mt-5 text-[14px] font-semibold text-ink">Currency</p>
            <p className="mt-0.5 mb-3 text-[12.5px] text-ink-muted">How your earnings are shown and paid.</p>
            <CurrencyPicker value={currency} onChange={(c) => setEarn((e) => (e ? { ...e, currency: c } : e))} />
          </>
        )}

        <Link to="/earnings" className="mt-5 flex items-center gap-3 rounded-xl bg-ink/[0.04] px-4 py-3 transition hover:bg-ink/[0.07]">
          <Wallet className="h-5 w-5 text-accent" />
          <span className="flex-1 text-[13.5px] font-semibold text-ink">Zero Wallet & earnings</span>
          <ChevronRight className="h-4 w-4 text-ink-faint" />
        </Link>
      </Card>

      {/* Account */}
      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Account</h2>
      <Card className="divide-y divide-line">
        <a href={`${config.zeroClubUrl}/app/profile/${session.user.id}`} className="flex items-center gap-3 px-5 py-4 transition hover:bg-ink/[0.03]">
          <Users className="h-5 w-5 text-ink-muted" />
          <span className="flex-1 text-[14px] font-semibold text-ink">View my Zero Club profile</span>
          <ArrowUpRight className="h-4 w-4 text-ink-faint" />
        </a>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate({ to: "/" });
          }}
          className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-bad/[0.04]"
        >
          <LogOut className="h-5 w-5 text-bad" />
          <span className="flex-1 text-[14px] font-semibold text-bad">Sign out</span>
        </button>
      </Card>
      <p className="mt-4 text-center text-[11.5px] text-ink-faint">Your theme follows your Zero Club account.</p>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-card)] ring-1 ring-line">
      <p className="truncate font-display text-[20px] font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[11.5px] font-medium text-ink-faint">{label}</p>
    </div>
  );
}
