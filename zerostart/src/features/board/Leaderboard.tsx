import type { LeaderboardRow } from "@/types";
import { Card, Skeleton } from "@/components/ui/primitives";

/* Only the top three get a coloured badge. If every rank is decorated, none of
   them reads as an achievement. */
const MEDAL = ["bg-accent text-accent-ink", "bg-ink text-bg", "bg-ink/70 text-bg"];

/**
 * Top testers, by approved tests first and ZP second.
 *
 * That order matters: ranking by ZP alone would put whoever happened to test
 * the most generous campaigns on top, which rewards luck rather than work.
 */
export function Leaderboard({ rows }: { rows: LeaderboardRow[] | null }) {
  if (rows && rows.length === 0) return null;

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-bold text-ink">Top testers</h2>
        <span className="text-[11.5px] text-ink-faint">by approved tests</span>
      </div>

      <div className="mt-3.5 space-y-1">
        {!rows
          ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[46px] rounded-xl" />)
          : rows.map((row, i) => (
              <div key={row.profile_id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    MEDAL[i] || "bg-ink/[0.06] text-ink-muted"
                  }`}
                >
                  {i + 1}
                </span>

                {row.avatar_url ? (
                  <img src={row.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-[12px] font-bold text-ink-muted">
                    {row.display_name.charAt(0).toUpperCase()}
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {row.display_name}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-faint">{row.level}</span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-bold text-ink">{row.tests_approved}</span>
                  <span className="block text-[11px] text-ink-faint">
                    {row.total_zp_earned.toLocaleString()} ZP
                  </span>
                </span>
              </div>
            ))}
      </div>
    </Card>
  );
}
