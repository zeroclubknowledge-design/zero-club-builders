import { Link } from "@tanstack/react-router";
import type { ActivityItem } from "@/types";
import { Card, Skeleton } from "@/components/ui/primitives";

/** "3 minutes ago" beats a timestamp here — the point is that it was *recent*. */
function ago(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Proof the loop is turning.
 *
 * A board with campaigns but no visible movement reads as abandoned, and the
 * single most persuasive thing to show a new tester is that other people are
 * doing this and getting paid. Two columns on desktop so it stays compact —
 * this is supporting evidence, not the main event.
 */
export function ActivityFeed({ items }: { items: ActivityItem[] | null }) {
  if (items && items.length === 0) return null;

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="zs-live-dot h-1.5 w-1.5 rounded-full bg-accent" />
        <h2 className="text-[13px] font-bold text-ink">Latest activity</h2>
      </div>

      <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
        {!items
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[58px] rounded-xl" />)
          : items.map((item) => (
              <Link
                key={item.id}
                to="/campaign/$id"
                params={{ id: item.campaign_id }}
                className="zs-inset flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition hover:bg-ink/[0.04]"
              >
                {item.mvp_logo ? (
                  <img src={item.mvp_logo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft font-display text-[12px] font-bold text-accent">
                    {item.mvp_name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">
                    {item.mvp_name}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-faint">
                    {item.kind === "approved"
                      ? `${item.tester_name} earned ${item.zp} ZP`
                      : `${item.tester_name} started testing`}
                    {" · "}{ago(item.happened_at)}
                  </span>
                </span>
              </Link>
            ))}
      </div>
    </Card>
  );
}
