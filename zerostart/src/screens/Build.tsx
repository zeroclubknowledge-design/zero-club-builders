import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { myMvps } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Mvp } from "@/types";
import { Card, EmptyState, ErrorState, Skeleton, StatusBadge } from "@/components/ui/primitives";

/** What the builder has listed, and where each thing is stuck. */
export function Build() {
  const { session, loading: authLoading } = useAuth();
  const [mvps, setMvps] = useState<Mvp[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const uid = session?.user?.id;
    if (!uid) return;
    setError(null);
    setMvps(null);
    myMvps(uid).then(setMvps).catch((e) => setError(e.message || "Could not load your MVPs."));
  };

  useEffect(load, [session?.user?.id]);

  if (authLoading) return <Skeleton className="h-[400px] rounded-[18px]" />;

  if (!session) {
    return (
      <EmptyState
        title="Sign in to list an MVP"
        body="Your ZeroStart listings sit on the same Zero account you already use."
        action={
          <Link to="/signin" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">
            Sign in
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-bold text-ink sm:text-[30px]">Build</h1>
        <Link
          to="/build/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-ink transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> List an MVP
        </Link>
      </div>

      <div className="mt-6">
        {error && <ErrorState message={error} onRetry={load} />}

        {!error && !mvps && (
          <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-[120px] rounded-[18px]" />)}</div>
        )}

        {mvps && mvps.length === 0 && (
          <EmptyState
            title="Nothing listed yet"
            body="List what you've built, create a campaign, and real testers will put it through its paces."
            action={
              <Link to="/build/new" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">
                List an MVP
              </Link>
            }
          />
        )}

        {mvps && mvps.length > 0 && (
          <div className="space-y-3">
            {mvps.map((mvp) => (
              <Card key={mvp.id} className="p-5">
                <div className="flex items-start gap-4">
                  {mvp.logo_url ? (
                    <img src={mvp.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-[15px] font-bold text-accent">
                      {mvp.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">{mvp.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-muted">{mvp.short_description}</p>
                  </div>
                  <StatusBadge status={mvp.status} />
                </div>

                {/* The one thing a builder actually needs to know: what happens
                    next, and whether it's on them. */}
                {mvp.status === "draft" && (
                  <p className="mt-4 text-[12.5px] leading-relaxed text-ink-muted">
                    Still a draft — nobody can see it yet.
                  </p>
                )}
                {mvp.status === "rejected" && (
                  <p className="mt-4 rounded-xl bg-bad/10 px-4 py-3 text-[12.5px] leading-relaxed text-bad">
                    This listing was taken down.
                    {mvp.review_note ? ` ${mvp.review_note}` : " Get in touch if you think that was a mistake."}
                  </p>
                )}

                {(mvp.status === "live" || mvp.status === "approved" || mvp.status === "completed") && (
                  <div className="mt-4 border-t border-line pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                        {(mvp.campaigns?.length || 0) === 0
                          ? "No campaigns yet"
                          : `${mvp.campaigns!.length} campaign${mvp.campaigns!.length === 1 ? "" : "s"}`}
                      </p>
                      <Link
                        to="/build/$mvpId/campaign"
                        params={{ mvpId: mvp.id }}
                        className="rounded-full bg-ink/[0.06] px-3.5 py-2 text-[12px] font-semibold text-ink transition hover:bg-ink/10"
                      >
                        New campaign
                      </Link>
                    </div>

                    {mvp.campaigns && mvp.campaigns.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {mvp.campaigns.map((c) => (
                          <Link
                            key={c.id}
                            to="/build/campaign/$id"
                            params={{ id: c.id }}
                            className="flex items-center justify-between gap-3 rounded-xl bg-ink/[0.03] px-3.5 py-2.5 transition hover:bg-ink/[0.05]"
                          >
                            <span className="min-w-0 truncate text-[13px] font-medium text-ink">{c.name}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="text-[12px] text-ink-faint">{c.zp_reward} ZP</span>
                              <StatusBadge status={c.status} />
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
