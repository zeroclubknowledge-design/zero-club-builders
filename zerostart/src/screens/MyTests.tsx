import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getTesterStats, myParticipations } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { testerLevel, type Participation, type TesterStats } from "@/types";
import { Card, EmptyState, ErrorState, Skeleton, StatusBadge, ZpBadge } from "@/components/ui/primitives";
import { readableError } from "@/lib/links";

/** The tester's side: what's in progress, what's waiting, what paid. */
export function MyTests() {
  const { session, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Participation[] | null>(null);
  const [stats, setStats] = useState<TesterStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    const uid = session?.user?.id;
    if (!uid) return;
    setError(null);
    setRows(null);
    Promise.all([myParticipations(uid), getTesterStats(uid)])
      .then(([p, s]) => { setRows(p); setStats(s); })
      .catch((e) => setError(readableError(e.message) || "Could not load your tests."));
  };

  useEffect(load, [session?.user?.id]);

  if (authLoading) return <Skeleton className="h-[400px] rounded-[18px]" />;

  if (!session) {
    return (
      <EmptyState
        title="Sign in to see your tests"
        body="Your testing history, your level and your ZP all live on your Zero account."
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
      <h1 className="text-[26px] font-bold text-ink sm:text-[30px]">My tests</h1>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Level" value={testerLevel(stats)} accent />
        <Stat label="Submitted" value={String(stats?.tests_submitted ?? 0)} />
        <Stat label="Approved" value={String(stats?.tests_approved ?? 0)} />
        <Stat label="ZP earned" value={(stats?.total_zp_earned ?? 0).toLocaleString()} />
      </div>

      <div className="mt-7">
        {error && <ErrorState message={error} onRetry={load} />}

        {!error && !rows && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[86px] rounded-[18px]" />)}
          </div>
        )}

        {rows && rows.length === 0 && (
          <EmptyState
            title="You haven't tested anything yet"
            body="Pick a campaign, complete its tasks, and leave honest feedback. ZP lands once the builder approves."
            action={
              <Link to="/" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">
                Find a campaign
              </Link>
            }
          />
        )}

        {rows && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((p) => {
              const campaign = p.campaign;
              const mvp = campaign?.mvp;
              return (
                <Link
                  key={p.id}
                  to="/test/$participationId"
                  params={{ participationId: p.id }}
                  className="block"
                >
                  <Card hover className="flex items-center gap-4 p-4 sm:p-5">
                    {mvp?.logo_url ? (
                      <img src={mvp.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-[15px] font-bold text-accent">
                        {(mvp?.name || "?").charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-ink">{mvp?.name}</p>
                      <p className="truncate text-[12.5px] text-ink-muted">{campaign?.name}</p>
                      {p.status === "rejected" && p.review_note && (
                        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-bad">{p.review_note}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <StatusBadge status={p.status} />
                      {p.status === "approved" && campaign && <ZpBadge amount={campaign.zp_reward} />}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-1.5 font-display text-[16px] font-bold ${accent ? "text-accent" : "text-ink"}`}>
        {value}
      </p>
    </Card>
  );
}
