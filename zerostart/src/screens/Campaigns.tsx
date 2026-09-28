import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Rocket } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getMe } from "@/lib/ambassadorApi";
import { getEarnings, listMyCampaigns } from "@/lib/campaignApi";
import { isCurrency, type PayoutCurrency } from "@/lib/money";
import type { MyCampaign } from "@/types/campaign";
import type { AmbassadorMe } from "@/types/ambassador";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { MyCampaignCard } from "@/features/campaigns/CampaignCard";
import { CampaignSheet } from "@/features/campaigns/CampaignSheet";
import { CampaignForm } from "@/features/campaigns/CampaignForm";

const MAX_RUNNING = 3;

export function Campaigns() {
  const { session, loading } = useAuth();
  const [me, setMe] = useState<AmbassadorMe | null>(null);
  const [items, setItems] = useState<MyCampaign[] | null>(null);
  const [currency, setCurrency] = useState<PayoutCurrency>("NGN");
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ edit?: MyCampaign } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!session) return;
    setError(null);
    getMe().then(setMe).catch((e) => setError(e.message));
    listMyCampaigns().then(setItems).catch((e) => setError(e.message));
    getEarnings().then((e) => isCurrency(e?.currency) && setCurrency(e.currency)).catch(() => {});
  };
  useEffect(load, [session?.user?.id]);

  if (loading) return <Skeleton className="h-[420px] rounded-[18px]" />;
  if (!session) {
    return (
      <EmptyState
        title="Sign in to run campaigns"
        body="Zero Ambassadors start their own campaigns and earn commission on everyone they bring in."
        action={<Link to="/signin" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">Sign in</Link>}
      />
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!me || !items) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-[18px]" />)}
      </div>
    );
  }
  if (!me.found) {
    return (
      <EmptyState
        title="Campaigns are for Zero Ambassadors"
        body="Apply to become an ambassador. Once you're approved you can start your own campaigns and earn commission."
        action={<Link to="/join" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">Apply now</Link>}
      />
    );
  }

  const active = me.status === "active";
  const running = items.filter((c) => c.status === "live" || c.status === "paused");
  const inReview = items.filter((c) => c.status === "ended" && c.review_status === "pending");
  const done = items.filter((c) => !running.includes(c) && !inReview.includes(c));
  const canStart = active && running.length < MAX_RUNNING;
  const open = items.find((c) => c.id === openId) || null;

  return (
    <div className="zs-rise">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-ink sm:text-[30px]">My campaigns</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">Start a campaign, share your link, get paid after the Zero Club check.</p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => setForm({})}
            disabled={!canStart}
            className="zs-glow inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-4 text-[13.5px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40 sm:px-5"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New campaign</span><span className="sm:hidden">New</span>
          </button>
        )}
      </div>
      {!active && <p className="mt-3 rounded-xl bg-warn/10 px-4 py-3 text-[12.5px] font-medium text-warn">Your ambassador account is {me.status}, so you can't start new campaigns right now.</p>}
      {active && running.length >= MAX_RUNNING && (
        <p className="mt-3 text-[12.5px] text-ink-muted">You're running {MAX_RUNNING} campaigns — the most at once. End one to start another.</p>
      )}

      {items.length === 0 && (
        <section className="zs-hero mt-6 p-6 sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Rocket className="h-5 w-5" /></span>
          <h2 className="mt-4 text-[22px] font-bold leading-tight text-white">Start your first campaign</h2>
          <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-white/70">
            Pick a goal and an end date. You get a personal link right away; you earn {me.commission_rate ?? 20}% of every payment made by
            people who join through it. When it ends, the Zero Club team checks it and pays you — plus a bonus for strong results.
          </p>
          <button
            onClick={() => setForm({})}
            disabled={!canStart}
            className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[14px] font-semibold text-ink transition hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Start a campaign
          </button>
        </section>
      )}

      <Group title="Running" items={running} currency={currency} onOpen={setOpenId} />
      <Group title="Waiting for the Zero Club check" items={inReview} currency={currency} onOpen={setOpenId} />
      <Group title="Finished" items={done} currency={currency} onOpen={setOpenId} />

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

function Group({ title, items, currency, onOpen }: { title: string; items: MyCampaign[]; currency: PayoutCurrency; onOpen: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <>
      <h2 className="mb-3 mt-7 text-[12px] font-bold uppercase tracking-wider text-ink-faint">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => <MyCampaignCard key={c.id} campaign={c} currency={currency} onOpen={() => onOpen(c.id)} />)}
      </div>
    </>
  );
}
