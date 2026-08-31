import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Sparkles } from "lucide-react";
import {
  getBoardStats, getLeaderboard, getRecentActivity, listLiveCampaigns,
} from "@/lib/api";
import type { ActivityItem, BoardStats, Campaign, LeaderboardRow } from "@/types";
import { Card, EmptyState, ErrorState, Skeleton, ZpBadge } from "@/components/ui/primitives";
import { readableError } from "@/lib/links";
import { StatsPill } from "@/features/board/StatsPill";
import { ListingHero } from "@/features/board/ListingHero";
import { ActivityFeed } from "@/features/board/ActivityFeed";
import { Leaderboard } from "@/features/board/Leaderboard";

/**
 * The board.
 *
 * A ranked list rather than a grid of equal cards. Rank gives a reason to look
 * at the top of the page and a reason to keep scrolling, and it lets one row
 * carry the reward, the seats and the action without any of them competing for
 * the same corner of a tile.
 *
 * Campaigns are ordered by how much is on offer. That is the honest answer to
 * "why should I read this one first" — it is the number the tester is deciding
 * on, and sorting by anything else while showing ZP would be pretending
 * otherwise.
 */
export function Discover() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [stats, setStats] = useState<BoardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [leaders, setLeaders] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("All");

  const load = () => {
    setError(null);
    setCampaigns(null);

    listLiveCampaigns()
      .then(setCampaigns)
      .catch((e) => setError(readableError(e.message) || "Could not load the board."));

    /* The side panels load independently and never block the board. If the
       leaderboard is slow or the function has not been created yet, the
       campaigns must still appear — they are the reason anyone came. */
    getBoardStats().then(setStats).catch(() => setStats(null));
    getRecentActivity(8).then(setActivity).catch(() => setActivity([]));
    getLeaderboard(6).then(setLeaders).catch(() => setLeaders([]));
  };

  useEffect(load, []);

  /* Counted from what is already loaded rather than fetched. The whole live set
     is on the client, so a per-category request would be a round trip to
     recompute something we can already see. */
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    (campaigns || []).forEach((c) => {
      const key = c.mvp?.category || "Other";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [campaigns]);

  const shown = useMemo(() => {
    if (!campaigns) return null;
    const list = category === "All"
      ? campaigns
      : campaigns.filter((c) => c.mvp?.category === category);
    // Featured first, then by reward. Rank has to mean something consistent.
    return [...list].sort((a, b) => {
      const featured = Number(b.mvp?.is_featured ?? false) - Number(a.mvp?.is_featured ?? false);
      return featured !== 0 ? featured : b.zp_reward - a.zp_reward;
    });
  }, [campaigns, category]);

  return (
    <div>
      <StatsPill stats={stats} />
      <ListingHero />

      {/* Only categories that actually have something in them. A filter that
          leads to an empty page is a filter that should not have been offered. */}
      {counts.size > 1 && (
        <div className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Chip
            label="All"
            count={campaigns?.length ?? 0}
            active={category === "All"}
            onClick={() => setCategory("All")}
          />
          {[...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => (
              <Chip
                key={name}
                label={name}
                count={n}
                active={category === name}
                onClick={() => setCategory(name)}
              />
            ))}
        </div>
      )}

      <div className="mt-5">
        {error && <ErrorState message={error} onRetry={load} />}

        {!error && !shown && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-[18px]" />)}
          </div>
        )}

        {shown && shown.length === 0 && (
          <EmptyState
            title="Nothing live right now"
            body="No campaigns are recruiting testers at the moment. New ones open regularly — check back, or list your own product above."
          />
        )}

        {shown && shown.length > 0 && (
          <div className="space-y-3">
            {shown.map((campaign, i) => (
              <CampaignRow key={campaign.id} campaign={campaign} rank={i + 1} />
            ))}
          </div>
        )}
      </div>

      <ActivityFeed items={activity} />
      <Leaderboard rows={leaders} />
    </div>
  );
}

function Chip({ label, count, active, onClick }: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition ${
        active ? "bg-accent text-accent-ink" : "zs-card text-ink-muted hover:text-ink"
      }`}
    >
      {label}
      <span className={`ml-1.5 ${active ? "text-accent-ink/70" : "text-ink-faint"}`}>{count}</span>
    </button>
  );
}

function CampaignRow({ campaign, rank }: { campaign: Campaign; rank: number }) {
  const mvp = campaign.mvp;
  const taken = campaign.seats_taken ?? 0;
  const left = Math.max(0, campaign.tester_limit - taken);
  const full = left === 0;

  // Videos need a poster frame to be worth showing at this size, so the cover
  // falls back to the logo rather than rendering a black rectangle.
  const cover = mvp?.media_urls?.find((u) => !/\.(mp4|webm|mov)(\?|$)/i.test(u)) || mvp?.logo_url;

  return (
    <Card hover className="p-4 sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
            rank <= 3 ? "bg-accent text-accent-ink" : "bg-ink/[0.06] text-ink-muted"
          }`}
        >
          {rank}
        </span>

        {cover ? (
          <img src={cover} alt="" loading="lazy" decoding="async"
            className="h-11 w-11 shrink-0 rounded-xl object-cover sm:h-12 sm:w-12" />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-[15px] font-bold text-accent sm:h-12 sm:w-12">
            {(mvp?.name || "?").charAt(0).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {mvp ? (
              <Link
                to="/product/$id"
                params={{ id: mvp.id }}
                className="truncate text-[14.5px] font-semibold text-ink hover:text-accent"
              >
                {mvp.name}
              </Link>
            ) : (
              <h3 className="truncate text-[14.5px] font-semibold text-ink">Product</h3>
            )}
            {mvp?.is_featured && <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-muted">{mvp?.short_description}</p>
          <p className="mt-1.5 text-[11.5px] text-ink-faint">
            {mvp?.category}
            <span className="mx-1.5">·</span>
            {full
              ? <span className="font-semibold text-warn">All seats taken</span>
              : <span><span className="font-semibold text-ink-muted">{left}</span> of {campaign.tester_limit} seats left</span>}
          </p>
        </div>

        <div className="hidden shrink-0 sm:block">
          <ZpBadge amount={campaign.zp_reward} />
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3 sm:mt-4">
        <span className="sm:hidden"><ZpBadge amount={campaign.zp_reward} /></span>
        <Link
          to="/campaign/$id"
          params={{ id: campaign.id }}
          className={`ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold transition ${
            full
              ? "bg-ink/[0.06] text-ink-muted hover:bg-ink/10"
              : "zs-glow bg-accent text-accent-ink hover:opacity-90"
          }`}
        >
          {full ? "View" : `Test for ${campaign.zp_reward} ZP`}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  );
}
