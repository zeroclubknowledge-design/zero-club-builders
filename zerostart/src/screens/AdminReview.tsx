import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { Mvp } from "@/types";
import { Card, EmptyState, ErrorState, Skeleton, StatusBadge } from "@/components/ui/primitives";

/**
 * Moderation, after the fact rather than before it.
 *
 * Listings no longer wait for approval, so this is not a queue — it is a view
 * of what is up, with the ability to take something down. An admin reads
 * everything here because the read policy grants them that; there is no
 * separate function fetching a hidden set.
 */
export function AdminReview() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Mvp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = () => {
    setError(null);
    supabase
      .from("zs_mvps")
      .select("*, builder:profiles!zs_mvps_builder_id_fkey (id, username, full_name, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error: e }) => {
        if (e) { setError(e.message); return; }
        setRows((data || []) as unknown as Mvp[]);
      });
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const act = async (mvp: Mvp, takeDown: boolean) => {
    setBusyId(mvp.id);
    const { error: e } = takeDown
      ? await supabase.rpc("zs_take_down_mvp", { p_mvp_id: mvp.id, p_note: note[mvp.id]?.trim() || null })
      : await supabase.rpc("zs_restore_mvp", { p_mvp_id: mvp.id });
    setBusyId(null);
    if (e) { setError(e.message); return; }
    load();
  };

  if (loading) return <Skeleton className="h-[300px] rounded-[18px]" />;
  if (!isAdmin) return <EmptyState title="Not for you" body="This page is for ZeroStart admins." />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[26px] font-bold text-ink">Moderation</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
        Listings publish immediately. Take one down if it shouldn't be up — its campaigns stop
        recruiting at the same time.
      </p>

      <div className="mt-6">
        {error && <ErrorState message={error} onRetry={load} />}
        {!error && !rows && <Skeleton className="h-[200px] rounded-[18px]" />}
        {rows && rows.length === 0 && <EmptyState title="Nothing listed yet" body="No MVPs have been published." />}

        {rows && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((mvp) => {
              const down = mvp.status === "rejected";
              return (
                <Card key={mvp.id} className="p-5">
                  <div className="flex items-start gap-3">
                    {mvp.media_urls?.[0] ? (
                      <img src={mvp.media_urls[0]} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-[15px] font-bold text-accent">
                        {mvp.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-ink">{mvp.name}</p>
                      <p className="mt-0.5 text-[12px] text-ink-faint">
                        {mvp.category}
                        {mvp.builder?.username && <> · @{mvp.builder.username}</>}
                      </p>
                    </div>
                    <StatusBadge status={mvp.status} />
                  </div>

                  <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">{mvp.short_description}</p>

                  {(mvp.zerohub_url || mvp.website_url) && (
                    <a
                      href={mvp.zerohub_url || mvp.website_url!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-block break-all text-[12.5px] font-semibold text-accent"
                    >
                      {mvp.zerohub_url || mvp.website_url}
                    </a>
                  )}

                  {down ? (
                    <div className="mt-4">
                      {mvp.review_note && (
                        <p className="mb-3 text-[12.5px] leading-relaxed text-ink-faint">
                          Reason given: {mvp.review_note}
                        </p>
                      )}
                      <button
                        onClick={() => act(mvp, false)}
                        disabled={busyId === mvp.id}
                        className="h-10 rounded-full bg-white/8 px-5 text-[13px] font-semibold text-ink transition hover:bg-white/12 disabled:opacity-40"
                      >
                        Restore
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                      <input
                        value={note[mvp.id] || ""}
                        onChange={(e) => setNote((n) => ({ ...n, [mvp.id]: e.target.value }))}
                        placeholder="Reason (shown to the builder)"
                        className="h-10 w-full rounded-full border border-line bg-bg px-4 text-[12.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50 sm:flex-1"
                      />
                      <button
                        onClick={() => act(mvp, true)}
                        disabled={busyId === mvp.id}
                        className="h-10 w-full shrink-0 rounded-full bg-white/8 px-5 text-[13px] font-semibold text-ink-muted transition hover:text-bad disabled:opacity-40 sm:w-auto"
                      >
                        Take down
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
