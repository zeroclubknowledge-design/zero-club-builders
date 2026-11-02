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
  return <section className="space-y-4 rounded-2xl border border-black/10 p-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-semibold">Referral tracking</h2>
      <button onClick={() => void load()} disabled={busy} className="text-sm underline">{busy ? "Refreshing…" : "Refresh"}</button>
    </div>
    <p className="text-sm opacity-70">Visitors are browsers that opened your link, not confirmed people. Joined members completed signup. Visit tracking starts after this update.</p>
    {error ? <p role="alert">We couldn't load your referrals. Tap Refresh to retry.</p> : !data ? <p>Loading referrals…</p> : <>
      {data.campaigns.map(c => <div key={c.id} className="rounded-xl border border-black/10 p-3">
        <p className="font-medium">{c.title}</p>
        <p className="mt-1 text-sm">{c.visitors} visitors · {c.signups} joined · {c.activations} posted</p>
        {c.last_visit && <p className="mt-1 text-xs opacity-70">Last visit: {new Date(c.last_visit).toLocaleString()}</p>}
      </div>)}
      <h3 className="text-sm font-semibold">Recent joined members</h3>
      {data.referrals.length === 0 ? <p className="text-sm opacity-70">No completed signups recorded yet. Opening a link alone doesn't count as a signup.</p> : data.referrals.map(r => <div key={r.id} className="border-t border-black/10 pt-2 text-sm">
        <p>{r.full_name || r.username} {r.username && <span className="opacity-60">@{r.username}</span>}</p>
        <p className="text-xs opacity-70">{r.campaign} · {new Date(r.joined_at).toLocaleDateString()} · {r.activated ? "First post made" : "Joined"}</p>
      </div>)}
    </>}
  </section>;
}
