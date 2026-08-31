import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, ExternalLink, Pencil, Share2, Star } from "lucide-react";
import { getMvp, getMvpOverview, listCampaignsForMvp } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { externalUrl, isUuid, readableError } from "@/lib/links";
import type { Campaign, Mvp, MvpOverview } from "@/types";
import {
  Card, EmptyState, ErrorState, SeatMeter, Skeleton, StatusBadge, ZpBadge,
} from "@/components/ui/primitives";

/**
 * The product, rather than one campaign on it.
 *
 * A tester deciding whether to spend an hour on something wants to know what
 * it is, who is behind it, how it stacks up and whether anyone has tested it
 * before — none of which belongs on a single campaign's page. This is that
 * page, and every campaign links back to it.
 */
export function ProductPage() {
  const { id } = useParams({ from: "/product/$id" });
  const { session } = useAuth();

  const [mvp, setMvp] = useState<Mvp | null | undefined>(undefined);
  const [overview, setOverview] = useState<MvpOverview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    setError(null);
    setMvp(undefined);

    /* A link that is not a product id at all — an old URL, or a relative href
       that resolved into this route. Answering it here means a clear "not
       found" instead of the database complaining about uuid syntax. */
    if (!isUuid(id)) { setMvp(null); return; }

    getMvp(id).then(setMvp).catch((e) => setError(readableError(e.message) || "Could not load this product."));
    getMvpOverview(id).then(setOverview).catch(() => setOverview(null));
    listCampaignsForMvp(id).then(setCampaigns).catch(() => setCampaigns([]));
  };

  useEffect(load, [id]);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard is blocked in some contexts. The share button still works. */
    }
  };

  const share = async () => {
    // Only exists on mobile and in some desktop browsers, so it is a bonus
    // path rather than the only one — Copy link is always there.
    if (navigator.share) {
      try { await navigator.share({ title: mvp?.name, url: shareUrl }); return; } catch { /* dismissed */ }
    }
    copy();
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (mvp === undefined) return <Skeleton className="h-[560px] rounded-[18px]" />;
  if (mvp === null) {
    return (
      <EmptyState
        title="Product not found"
        body="This link doesn't point at a product on ZeroStart. It may have been taken down, or the link may be out of date."
        action={<Link to="/" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">Back to the board</Link>}
      />
    );
  }

  const isOwn = mvp.builder_id === session?.user?.id;
  const link = externalUrl(mvp.zerohub_url) || externalUrl(mvp.website_url);
  const media = mvp.media_urls ?? [];
  const live = (campaigns || []).filter((c) => c.status === "live");
  // The owner sees everything, including drafts and paused ones. Those are
  // precisely the campaigns they need to get back into.
  const listed = isOwn ? (campaigns || []) : live;
  const best = live.reduce((n, c) => Math.max(n, c.zp_reward), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Discover
      </Link>

      <div className="flex items-start gap-4">
        {mvp.logo_url || media[0] ? (
          <img
            src={mvp.logo_url || media[0]}
            alt=""
            className="h-16 w-16 shrink-0 rounded-2xl object-cover sm:h-20 sm:w-20"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent-soft font-display text-[24px] font-bold text-accent sm:h-20 sm:w-20">
            {mvp.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-[24px] font-bold leading-tight text-ink sm:text-[32px]">{mvp.name}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted sm:text-[14.5px]">
            {mvp.short_description}
          </p>
        </div>
      </div>

      <p className="mt-4 text-[12.5px] text-ink-faint">
        {mvp.category}
        {mvp.builder?.username && <> · by @{mvp.builder.username}</>}
        {" · "}
        {new Date(mvp.created_at).toLocaleDateString(undefined, {
          month: "short", day: "numeric", year: "numeric",
        })}
      </p>

      {/* The stat cards. Rank is by the best reward currently on offer — the
          number a tester is choosing on, so the honest thing to rank by. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <StatCard
          label="ZP on offer"
          value={overview ? overview.zp_offered.toLocaleString() : null}
          foot={live.length > 0
            ? `across ${live.length} live campaign${live.length === 1 ? "" : "s"}`
            : "no live campaigns"}
        />
        <StatCard
          label="Category rank"
          value={overview && overview.category_total > 0 ? `#${overview.category_rank}` : null}
          foot={overview ? `of ${overview.category_total} in ${mvp.category}` : ""}
        />
        <StatCard
          label="Overall"
          value={overview && overview.overall_total > 0 ? `#${overview.overall_rank}` : null}
          foot={overview ? `of ${overview.overall_total} on the board` : ""}
        />
        <StatCard
          label="Tests approved"
          value={overview ? overview.tests_approved.toLocaleString() : null}
          foot={overview ? `${overview.zp_paid.toLocaleString()} ZP paid to testers` : ""}
        />
      </div>

      <div className="mt-4 space-y-2.5">
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer noopener"
            className="zs-glow flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90"
          >
            Visit {mvp.name} <ExternalLink className="h-4 w-4" />
          </a>
        )}

        {best > 0 && !isOwn && (
          <Link
            to="/campaign/$id"
            params={{ id: live.find((c) => c.zp_reward === best)!.id }}
            className="zs-card flex h-12 w-full items-center justify-center rounded-full text-[13.5px] font-semibold text-ink transition hover:bg-ink/[0.02]"
          >
            Start testing for {best.toLocaleString()} ZP
          </Link>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={copy}
            className="zs-card flex h-11 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold text-ink-muted transition hover:text-ink"
          >
            {copied ? <><Check className="h-3.5 w-3.5 text-ok" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy link</>}
          </button>
          <button
            onClick={share}
            className="zs-card flex h-11 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold text-ink-muted transition hover:text-ink"
          >
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
        </div>
      </div>

      {media.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {media.map((url) =>
            /\.(mp4|webm|mov)(\?|$)/i.test(url) ? (
              <video key={url} src={url} controls playsInline preload="metadata"
                className="aspect-[16/10] w-[85%] shrink-0 snap-start rounded-xl bg-black object-cover sm:w-[58%]" />
            ) : (
              <img key={url} src={url} alt="" loading="lazy" decoding="async"
                className="aspect-[16/10] w-[85%] shrink-0 snap-start rounded-xl bg-ink/[0.04] object-cover sm:w-[58%]" />
            )
          )}
        </div>
      )}

      {mvp.full_description && (
        <Card className="mt-4 p-5 sm:p-6">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">About</h2>
          <p className="mt-2.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-muted">
            {mvp.full_description}
          </p>
        </Card>
      )}

      {/* Feedback counts, never feedback content. What a tester wrote stays
          between them and the builder. */}
      {overview && overview.feedback_count > 0 && (
        <Card className="mt-4 p-5 sm:p-6">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">
            Tester reach
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-3">
            <Figure value={String(overview.testers)} label="testers joined" />
            <Figure value={String(overview.feedback_count)} label="feedback submitted" />
            {overview.average_rating !== null && (
              <Figure
                value={
                  <span className="inline-flex items-center gap-1">
                    {overview.average_rating}
                    <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                  </span>
                }
                label="average rating"
              />
            )}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
            Counts only. What testers wrote goes to the builder, not the board.
          </p>
        </Card>
      )}

      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">
        Campaigns
      </h2>

      {!campaigns && <Skeleton className="h-[120px] rounded-[18px]" />}

      {campaigns && listed.length === 0 && (
        <EmptyState
          title="No open campaigns"
          body={isOwn
            ? "Open one to say what you want tested and how much ZP a tester earns."
            : "This product isn't recruiting testers right now. Check back soon."}
          action={isOwn ? (
            <Link
              to="/build/$mvpId/campaign"
              params={{ mvpId: mvp.id }}
              className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink"
            >
              New campaign
            </Link>
          ) : undefined}
        />
      )}

      {listed.length > 0 && (
        <div className="space-y-3">
          {listed.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to="/campaign/$id"
                    params={{ id: c.id }}
                    className="block truncate text-[14.5px] font-semibold text-ink hover:text-accent"
                  >
                    {c.name}
                  </Link>
                  {c.objective && (
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
                      {c.objective}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ZpBadge amount={c.zp_reward} />
                  <StatusBadge status={c.status} />
                </div>
              </div>
              <div className="mt-4 max-w-[260px]">
                <SeatMeter taken={c.seats_taken ?? 0} limit={c.tester_limit} />
              </div>

              {isOwn && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to="/build/campaign/$id/edit"
                    params={{ id: c.id }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-semibold text-accent-ink transition hover:opacity-90"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit campaign
                  </Link>
                  <Link
                    to="/build/campaign/$id"
                    params={{ id: c.id }}
                    className="inline-flex h-9 items-center rounded-full bg-ink/[0.06] px-4 text-[12.5px] font-semibold text-ink-muted transition hover:text-ink"
                  >
                    Submissions
                  </Link>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, foot }: { label: string; value: string | null; foot: string }) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-accent">{label}</p>
      {value === null
        ? <Skeleton className="mt-2 h-8 w-20" />
        : <p className="mt-1.5 font-display text-[28px] font-bold leading-none text-ink">{value}</p>}
      <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">{foot}</p>
    </Card>
  );
}

function Figure({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <span>
      <span className="block font-display text-[19px] font-bold text-ink">{value}</span>
      <span className="block text-[11.5px] text-ink-faint">{label}</span>
    </span>
  );
}
