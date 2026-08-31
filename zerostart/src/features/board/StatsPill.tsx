import type { BoardStats } from "@/types";
import { Skeleton } from "@/components/ui/primitives";

/**
 * The liveness strip under the header.
 *
 * Every number is real and comes from the database. The temptation with a pill
 * like this is to pad it with something impressive-sounding that nobody
 * measures — a made-up "online" count is the classic — and the moment one
 * number is decorative the others stop being believed too.
 *
 * Zeros are shown, not hidden. A board honestly reporting no open seats is
 * more trustworthy than one that quietly drops the figure until it flatters.
 */
export function StatsPill({ stats }: { stats: BoardStats | null }) {
  if (!stats) return <Skeleton className="h-9 w-[280px] rounded-full" />;

  const items = [
    { value: stats.open_seats.toLocaleString(), label: "open seats", live: true },
    { value: stats.live_campaigns.toLocaleString(), label: "live campaigns" },
    { value: stats.tests_approved.toLocaleString(), label: "tests approved" },
    { value: `${stats.zp_paid.toLocaleString()}`, label: "ZP paid" },
  ];

  return (
    <div className="no-scrollbar -mx-4 flex overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="zs-card flex shrink-0 items-center gap-1 rounded-full px-4 py-2">
        {items.map((item, i) => (
          <span key={item.label} className="flex shrink-0 items-center">
            {i > 0 && <span aria-hidden className="mx-2.5 text-ink-faint/40">·</span>}
            {item.live && (
              <span aria-hidden className="zs-live-dot mr-1.5 h-1.5 w-1.5 rounded-full bg-ok" />
            )}
            <span className="text-[12.5px] font-bold text-ink">{item.value}</span>
            <span className="ml-1 whitespace-nowrap text-[12.5px] text-ink-muted">{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
