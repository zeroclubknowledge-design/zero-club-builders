import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { Mvp } from "@/types";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";

/**
 * The admin queue for MVP listings.
 *
 * Read through `zs_pending_mvps()` rather than a plain select, because the read
 * policy deliberately hides pending listings from everyone but their builder.
 * Widening that policy so this page could work would have widened it for every
 * other query too.
 */
export function AdminReview() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Mvp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setError(null);
    supabase.rpc("zs_pending_mvps").then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setRows((data || []) as Mvp[]);
    });
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const decide = async (mvpId: string, approve: boolean) => {
    setBusyId(mvpId);
    const { error: e } = await supabase.rpc("zs_review_mvp", {
      p_mvp_id: mvpId, p_approve: approve, p_note: null,
    });
    setBusyId(null);
    if (e) { setError(e.message); return; }
    load();
  };

  if (loading) return <Skeleton className="h-[300px] rounded-[18px]" />;
  if (!isAdmin) return <EmptyState title="Not for you" body="This page is for ZeroStart admins." />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[26px] font-bold text-ink">Listing review</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-muted">
        Approve a listing and its builder can open campaigns and recruit testers.
      </p>

      <div className="mt-6">
        {error && <ErrorState message={error} onRetry={load} />}
        {!error && !rows && <Skeleton className="h-[200px] rounded-[18px]" />}
        {rows && rows.length === 0 && (
          <EmptyState title="Queue is clear" body="Nothing is waiting for review." />
        )}
        {rows && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((mvp) => (
              <Card key={mvp.id} className="p-5">
                <p className="text-[15px] font-semibold text-ink">{mvp.name}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{mvp.short_description}</p>
                {mvp.full_description && (
                  <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-faint">
                    {mvp.full_description}
                  </p>
                )}
                {(mvp.zerohub_url || mvp.website_url) && (
                  <a
                    href={mvp.zerohub_url || mvp.website_url!}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 inline-block break-all text-[12.5px] font-semibold text-accent"
                  >
                    {mvp.zerohub_url || mvp.website_url}
                  </a>
                )}
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => decide(mvp.id, true)}
                    disabled={busyId === mvp.id}
                    className="h-10 flex-1 rounded-full bg-accent text-[13px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decide(mvp.id, false)}
                    disabled={busyId === mvp.id}
                    className="h-10 rounded-full bg-white/8 px-5 text-[13px] font-semibold text-ink-muted transition hover:text-bad disabled:opacity-40"
                  >
                    Reject
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
