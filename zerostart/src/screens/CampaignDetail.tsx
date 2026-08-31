import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Check } from "lucide-react";
import { getCampaign, joinCampaign } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Campaign } from "@/types";
import { Card, ErrorState, SeatMeter, Skeleton, StatusBadge, ZpBadge } from "@/components/ui/primitives";

/** Why a join was refused, said the way a person would say it. */
const REFUSAL: Record<string, string> = {
  own_campaign: "This is your own campaign — you can't test your own MVP.",
  full: "Every seat on this campaign has been taken.",
  not_live: "This campaign isn't recruiting right now.",
  closed: "The deadline for this campaign has passed.",
  not_authenticated: "Sign in to start testing.",
  not_found: "This campaign no longer exists.",
};

export function CampaignDetail() {
  const { id } = useParams({ from: "/campaign/$id" });
  const navigate = useNavigate();
  const { session } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setCampaign(undefined);
    getCampaign(id).then(setCampaign).catch((e) => setError(e.message || "Could not load this campaign."));
  };

  useEffect(load, [id]);

  const start = async () => {
    if (!session) { navigate({ to: "/signin" }); return; }
    setJoining(true);
    setRefusal(null);
    try {
      const result = await joinCampaign(id);
      if (!result.ok) {
        setRefusal(REFUSAL[result.reason || ""] || "You can't join this campaign.");
        // The seat count on screen is now known to be stale.
        load();
        return;
      }
      navigate({ to: "/test/$participationId", params: { participationId: result.participation_id! } });
    } catch (e) {
      setRefusal((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (campaign === undefined) return <Skeleton className="h-[520px] rounded-[18px]" />;
  if (campaign === null) return <ErrorState message="This campaign could not be found." />;

  const mvp = campaign.mvp;
  const taken = campaign.seats_taken ?? 0;
  const full = taken >= campaign.tester_limit;
  const isOwn = mvp?.builder_id === session?.user?.id;
  const link = mvp?.zerohub_url || mvp?.website_url;
  const media = mvp?.media_urls ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Discover
      </Link>

      <Card className="overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            {mvp?.logo_url ? (
              <img src={mvp.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
            ) : (
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent-soft font-display text-[22px] font-bold text-accent">
                {(mvp?.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {mvp ? (
                <Link
                  to="/product/$id"
                  params={{ id: mvp.id }}
                  className="text-[22px] font-bold leading-tight text-ink hover:text-accent sm:text-[26px]"
                >
                  {mvp.name}
                </Link>
              ) : (
                <h1 className="text-[22px] font-bold leading-tight text-ink sm:text-[26px]">Product</h1>
              )}
              <p className="mt-1 text-[13px] text-ink-faint">
                {mvp?.category}
                {mvp?.builder?.username && <> · by @{mvp.builder.username}</>}
              </p>
            </div>
            <StatusBadge status={campaign.status} />
          </div>

          <p className="mt-5 text-[14px] leading-relaxed text-ink-muted">{mvp?.short_description}</p>
          {mvp?.full_description && (
            <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-muted">
              {mvp.full_description}
            </p>
          )}

          {/* A horizontal strip rather than a grid: the order the builder chose
              is meaningful, and a strip keeps the first one prominent instead of
              flattening all six into equal thumbnails. */}
          {media.length > 0 && (
            <div className="no-scrollbar -mx-6 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 sm:-mx-8 sm:px-8">
              {media.map((url) =>
                /\.(mp4|webm|mov)(\?|$)/i.test(url) ? (
                  <video
                    key={url}
                    src={url}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-[16/10] w-[85%] shrink-0 snap-start rounded-xl bg-black object-cover sm:w-[60%]"
                  />
                ) : (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-[16/10] w-[85%] shrink-0 snap-start rounded-xl bg-ink/[0.04] object-cover sm:w-[60%]"
                  />
                )
              )}
            </div>
          )}

          {mvp && (
            <Link
              to="/product/$id"
              params={{ id: mvp.id }}
              className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent"
            >
              See full product details →
            </Link>
          )}

          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-ink/10"
            >
              Open the product <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        <div className="border-t border-line bg-surface-2 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-semibold text-ink">{campaign.name}</h2>
              {campaign.objective && (
                <p className="mt-1 max-w-[440px] text-[13px] leading-relaxed text-ink-muted">
                  {campaign.objective}
                </p>
              )}
            </div>
            <ZpBadge amount={campaign.zp_reward} />
          </div>

          <div className="mt-5 max-w-[280px]">
            <SeatMeter taken={taken} limit={campaign.tester_limit} />
          </div>

          {campaign.tasks && campaign.tasks.length > 0 && (
            <div className="mt-7">
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">
                What you'll do
              </h3>
              <ol className="mt-3 space-y-2.5">
                {campaign.tasks.map((task, i) => (
                  <li key={task.id} className="flex gap-3">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-[11px] font-bold text-ink-muted">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-ink">{task.title}</p>
                      {task.description && (
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">{task.description}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {refusal && (
            <p className="mt-6 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{refusal}</p>
          )}

          <button
            onClick={start}
            disabled={joining || full || isOwn || campaign.status !== "live"}
            className="zs-glow mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-8"
          >
            {isOwn ? "Your own campaign"
              : full ? "All seats taken"
              : campaign.status !== "live" ? "Not recruiting"
              : joining ? "Taking your seat…"
              : <><Check className="h-4 w-4" /> Start testing</>}
          </button>

          <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
            ZP is paid once, after the builder approves your submission.
          </p>
        </div>
      </Card>
    </div>
  );
}
