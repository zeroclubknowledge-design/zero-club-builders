import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { getRoster, listFocusAreas } from "@/lib/ambassadorApi";
import type { FocusArea, RosterEntry } from "@/types/ambassador";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";

/* Only the top three get a coloured badge. If every rank is decorated, none of
   them reads as an achievement. */
const MEDAL = ["bg-accent text-accent-ink", "bg-ink text-bg", "bg-ink/70 text-bg"];

/**
 * Who is representing Zero Club, and where.
 *
 * Ranked by approved tasks rather than by ZP, because ZP depends on which
 * tasks happened to be worth more — the count is the honest measure of work.
 */
export function AmbassadorRoster() {
  const [rows, setRows] = useState<RosterEntry[] | null>(null);
  const [areas, setAreas] = useState<FocusArea[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setRows(null);
    getRoster(60).then(setRows).catch((e) => setError(e.message || "Could not load the roster."));
    listFocusAreas().then(setAreas).catch(() => setAreas([]));
  };

  useEffect(load, []);

  const labelFor = (slug: string) => areas.find((a) => a.slug === slug)?.label ?? slug;

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <h1 className="text-[26px] font-bold text-ink sm:text-[30px]">Ambassadors</h1>
      <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-ink-muted">
        The people growing Zero Club where they are. Ranked by tasks the team has approved.
      </p>

      <div className="mt-6">
        {!rows && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px] rounded-[18px]" />)}
          </div>
        )}

        {rows && rows.length === 0 && (
          <EmptyState
            title="No ambassadors yet"
            body="Be the first to represent Zero Club in your area."
          />
        )}

        {rows && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((row, i) => (
              <Card key={row.profile_id} className="flex items-center gap-4 p-4 sm:p-5">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11.5px] font-bold ${
                    MEDAL[i] || "bg-ink/[0.06] text-ink-muted"
                  }`}
                >
                  {i + 1}
                </span>

                {row.avatar_url ? (
                  <img src={row.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-[13px] font-bold text-ink-muted">
                    {row.display_name.charAt(0).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{row.display_name}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 truncate text-[11.5px] text-ink-faint">
                    <MapPin className="h-3 w-3 shrink-0" /> {row.location}
                  </p>
                  {row.focus.length > 0 && (
                    <p className="mt-1 truncate text-[11px] text-ink-faint">
                      {row.focus.slice(0, 3).map(labelFor).join(" · ")}
                      {row.focus.length > 3 ? ` +${row.focus.length - 3}` : ""}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-bold text-ink">{row.tasks_approved}</p>
                  <p className="text-[10.5px] text-ink-faint">{row.level}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
