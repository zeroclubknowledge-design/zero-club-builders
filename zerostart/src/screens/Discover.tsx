import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { listLiveCampaigns } from "@/lib/api";
import { CATEGORIES, type Campaign } from "@/types";
import { Card, EmptyState, ErrorState, SeatMeter, Skeleton, ZpBadge } from "@/components/ui/primitives";

/**
 * The front door. Every live campaign, filterable by category.
 *
 * Filtering is done in memory rather than by refetching: the whole live set is
 * small enough that a round trip per category tap would be slower and less
 * pleasant than the instant version, and it keeps the seat counts consistent
 * across taps.
 */
export function Discover() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("All");

  const load = () => {
    setError(null);
    setCampaigns(null);
    listLiveCampaigns()
      .then(setCampaigns)
      .catch((e) => setError(e.message || "Could not load campaigns."));
  };

  useEffect(load, []);

  const shown = useMemo(() => {
    if (!campaigns) return null;
    if (category === "All") return campaigns;
    return campaigns.filter((c) => c.mvp?.category === category);
  }, [campaigns, category]);

  /* Only offer categories that actually have something in them — a filter that
     leads to an empty page is a filter that shouldn't have been offered. */
  const available = useMemo(() => {
    const present = new Set((campaigns || []).map((c) => c.mvp?.category).filter(Boolean));
    return ["All", ...CATEGORIES.filter((c) => present.has(c))];
  }, [campaigns]);

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[28px] font-bold leading-tight text-ink sm:text-[34px]">
          Test what's being built
        </h1>
        <p className="mt-2 max-w-[520px] text-[14px] leading-relaxed text-ink-muted">
          Real products from real builders. Complete the tasks, leave honest feedback,
          earn ZP when the builder approves your work.
        </p>
      </div>

      {available.length > 2 && (
        <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {available.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold transition ${
                category === c ? "bg-accent text-accent-ink" : "bg-white/6 text-ink-muted hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && !shown && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[220px] rounded-[18px]" />)}
        </div>
      )}

      {shown && shown.length === 0 && (
        <EmptyState
          title="Nothing live right now"
          body="No campaigns are recruiting testers at the moment. New ones open regularly — check back, or list your own MVP."
          action={
            <Link to="/build" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">
              List your MVP
            </Link>
          }
        />
      )}

      {shown && shown.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => <CampaignCard key={c.id} campaign={c} />)}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const mvp = campaign.mvp;
  const taken = campaign.seats_taken ?? 0;
  const full = taken >= campaign.tester_limit;
  // Videos need a poster frame to be worth showing at card size, so the cover
  // falls back to the logo rather than rendering a black rectangle.
  const firstImage = mvp?.media_urls?.find((u) => !/\.(mp4|webm|mov)(\?|$)/i.test(u));
  const cover = firstImage || mvp?.logo_url || null;

  return (
    <Link to="/campaign/$id" params={{ id: campaign.id }} className="block">
      <Card hover className="flex h-full flex-col overflow-hidden">
        {/* The cover, when there is one. A tester scanning this page looks at
            the picture before the words, so a card with a screenshot is worth
            far more than one without. */}
        {cover && (
          <div className="aspect-[16/9] w-full overflow-hidden bg-white/[0.04]">
            <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          </div>
        )}
        <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-3">
          {mvp?.logo_url ? (
            <img src={mvp.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-[16px] font-bold text-accent">
              {(mvp?.name || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-[15px] font-semibold text-ink">{mvp?.name}</h3>
              {mvp?.is_featured && <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />}
            </div>
            <p className="mt-0.5 truncate text-[12px] text-ink-faint">{mvp?.category}</p>
          </div>
          <ZpBadge amount={campaign.zp_reward} />
        </div>

        <p className="mt-3.5 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
          {mvp?.short_description}
        </p>

        <div className="mt-auto pt-5">
          <SeatMeter taken={taken} limit={campaign.tester_limit} />
          <p className="mt-3 text-[12px] font-semibold text-accent">
            {full ? "View campaign" : "Start testing →"}
          </p>
        </div>
        </div>
      </Card>
    </Link>
  );
}
