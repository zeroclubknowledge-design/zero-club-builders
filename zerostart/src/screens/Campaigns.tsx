import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getMe } from "@/lib/ambassadorApi";
import { getEarnings, listCampaigns } from "@/lib/campaignApi";
import { isCurrency, type PayoutCurrency } from "@/lib/money";
import type { Campaign } from "@/types/campaign";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { CampaignCard } from "@/features/campaigns/CampaignCard";
import { CampaignSheet } from "@/features/campaigns/CampaignSheet";

type Filter = "all" | "joined" | "zero" | "partner";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "joined", label: "Joined" },
  { value: "zero", label: "Zero Club" },
  { value: "partner", label: "Partners" },
];

export function Campaigns() {
  const { session, loading } = useAuth();
  const [items, setItems] = useState<Campaign[] | null>(null);
  const [isAmbassador, setIsAmbassador] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [currency, setCurrency] = useState<PayoutCurrency>("NGN");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!session) return;
    setError(null);
    listCampaigns().then(setItems).catch((e) => setError(e.message));
    getMe()
      .then((m) => {
        setIsAmbassador(Boolean(m.found));
        setRate((m.found ? m.commission_rate : m.default_rate) ?? null);
      })
      .catch(() => {});
    getEarnings().then((e) => isCurrency(e?.currency) && setCurrency(e.currency)).catch(() => {});
  };
  useEffect(load, [session?.user?.id]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((c) => {
      if (filter === "joined" && !c.joined) return false;
      if (filter === "zero" && c.partner_name) return false;
      if (filter === "partner" && !c.partner_name) return false;
      if (!q) return true;
      return [c.title, c.summary, c.partner_name, c.locations].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [items, filter, query]);

  if (loading) return <Skeleton className="h-[420px] rounded-[18px]" />;
  if (!session) {
    return (
      <EmptyState
        title="Sign in to see campaigns"
        body="Campaigns are how Zero Ambassadors earn — for Zero Club and our partners."
        action={<Link to="/signin" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">Sign in</Link>}
      />
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const live = shown.filter((c) => c.status === "live" || c.status === "paused");
  const past = shown.filter((c) => c.status === "ended");

  return (
    <div className="zs-rise">
      <h1 className="text-[26px] font-bold text-ink sm:text-[30px]">Campaigns</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">Share your link and earn commission on everything your referrals pay.</p>

      <label className="zs-card mt-5 flex h-12 items-center gap-3 px-4">
        <Search className="h-4 w-4 shrink-0 text-ink-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search campaigns, partners, places"
          className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
        />
      </label>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition ${filter === f.value ? "bg-ink text-white" : "bg-ink/[0.05] text-ink-muted hover:text-ink"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!items && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-[18px]" />)}
        </div>
      )}

      {items && live.length === 0 && past.length === 0 && (
        <div className="mt-5">
          <EmptyState
            title={filter === "joined" ? "You haven't joined a campaign yet" : "No campaigns right now"}
            body={filter === "joined" ? "Open any campaign and join it to get your personal link." : "New campaigns are published by the Zero Club team. Check back soon."}
          />
        </div>
      )}

      {live.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((c) => <CampaignCard key={c.id} campaign={c} currency={currency} rate={rate} onOpen={() => setOpen(c)} />)}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">Ended</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((c) => <CampaignCard key={c.id} campaign={c} currency={currency} rate={rate} onOpen={() => setOpen(c)} />)}
          </div>
        </>
      )}

      {open && (
        <CampaignSheet campaign={open} currency={currency} rate={rate} isAmbassador={isAmbassador} onClose={() => setOpen(null)} onChanged={load} />
      )}
    </div>
  );
}
