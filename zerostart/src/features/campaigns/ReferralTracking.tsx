import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Tracking = {
  campaigns: { id: string; title: string; visitors: number; signups: number; activations: number; last_visit: string | null }[];
  referrals: { id: string; campaign: string; username: string; full_name: string; joined_at: string; activated: boolean }[];
};

export function ReferralTracking({ campaignId }: { campaignId?: string }) {
  const [data, setData] = useState<Tracking | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("zs_my_referral_tracking", { p_campaign: campaignId || null });
    setError(Boolean(error));
    if (!error) setData(data as Tracking);
    setBusy(false);
  };
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [campaignId]);
  const totals = (data?.campaigns || []).reduce((sum, c) => ({
    visitors: sum.visitors + Number(c.visitors), joined: sum.joined + Number(c.signups), active: sum.active + Number(c.activations),
  }), { visitors: 0, joined: 0, active: 0 });
  return <section aria-label="Your referrals" className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">Your impact</p>
        <h2 className="mt-1 font-display text-[22px] font-bold tracking-tight text-ink">People you brought in</h2>
      </div>
      <button onClick={() => void load()} disabled={busy} aria-label="Refresh referrals" className="rounded-full bg-ink/[0.05] px-3.5 py-2 text-[11px] font-semibold text-ink-muted transition hover:bg-ink/[0.08] disabled:opacity-50">{busy ? "Updating…" : "Refresh"}</button>
    </div>
    <div className="overflow-hidden rounded-[24px] bg-surface shadow-[var(--shadow-card)]">
      <div className="bg-[radial-gradient(ellipse_at_top_left,rgba(195,33,126,0.12),transparent_75%)] px-5 py-6 sm:px-6">
        <div className="grid grid-cols-3 gap-3">
          {([['Joined', totals.joined], ['First posts', totals.active], ['Link visits', totals.visitors]] as const).map(([label, value]) => <div key={label}>
            <p className="font-display text-[28px] font-bold leading-none tracking-tight text-ink">{!data ? "—" : value.toLocaleString()}</p>
            <p className="mt-2 text-[11px] font-medium text-ink-muted">{label}</p>
          </div>)}
        </div>
      </div>
      <div className="px-5 pb-5 sm:px-6">
        {error ? <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-sm text-bad">Couldn't load referrals. Tap Refresh to try again.</p> : !data ? <div className="h-16 animate-pulse rounded-2xl bg-ink/[0.04]" aria-label="Loading referrals" /> : data.referrals.length === 0 ? <div className="rounded-2xl bg-ink/[0.03] px-5 py-6 text-center">
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-lg text-accent" aria-hidden="true">↗</span>
          <p className="mt-3 text-[14px] font-semibold text-ink">Your next connection starts here</p>
          <p className="mx-auto mt-1 max-w-[28ch] text-[12px] leading-relaxed text-ink-muted">Share your campaign. New members will appear here when they join.</p>
        </div> : <>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Recently joined</p>
          {data.referrals.map(r => <div key={r.id} className="flex items-center gap-3 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-bold uppercase text-accent">{(r.full_name || r.username || '?').slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{r.full_name || r.username}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink-faint">{r.username ? `@${r.username} · ` : ''}{new Date(r.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${r.activated ? 'bg-accent-soft text-accent' : 'bg-ink/[0.05] text-ink-muted'}`}>{r.activated ? 'First post' : 'Joined'}</span>
          </div>)}
        </>}
        {campaignId && data && <p className="mt-3 text-[11px] text-ink-faint">Link visits count browsers, not confirmed people.</p>}
      </div>
    </div>
  </section>;
}
