import type { ReactNode } from "react";

/**
 * The small shared pieces the spec asks for in section 47.
 *
 * Deliberately tiny and unopinionated. A design system that arrives before the
 * screens do tends to be wrong about what the screens need; these are the four
 * that every screen genuinely uses.
 */

export function Card({ children, className = "", hover = false }: {
  children: ReactNode; className?: string; hover?: boolean;
}) {
  return <div className={`zs-card ${hover ? "zs-card-hover" : ""} ${className}`}>{children}</div>;
}

/** ZP, always shown the same way so the number is recognisable anywhere. */
export function ZpBadge({ amount, className = "" }: { amount: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold text-accent ${className}`}>
      {amount.toLocaleString()} ZP
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  // Semantic colours, used consistently — the same green always means the
  // same thing, which is what lets people stop reading the label.
  approved: "bg-ok/15 text-ok",
  live: "bg-ok/15 text-ok",
  completed: "bg-ok/15 text-ok",
  submitted: "bg-warn/15 text-warn",
  pending_review: "bg-warn/15 text-warn",
  started: "bg-warn/15 text-warn",
  paused: "bg-warn/15 text-warn",
  rejected: "bg-bad/15 text-bad",
  cancelled: "bg-bad/15 text-bad",
  draft: "bg-ink/[0.06] text-ink-faint",
};

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  started: "In progress",
  submitted: "Awaiting review",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] || "bg-ink/[0.06] text-ink-faint";
  const label = STATUS_LABEL[status] || status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

/** Seats, as a bar rather than a fraction alone — "12 / 20" is a number, a
    bar is an answer to "is there room for me?". */
export function SeatMeter({ taken, limit }: { taken: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (taken / limit) * 100) : 0;
  const full = taken >= limit;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="font-semibold text-ink">{taken} / {limit} testers</span>
        {full && <span className="text-[11px] font-semibold text-warn">Full</span>}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${full ? "bg-warn" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="px-6 py-14 text-center">
      <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-[320px] text-[13px] leading-relaxed text-ink-muted">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </Card>
  );
}

/** A skeleton, not a spinner: the spec asks for no empty screens while loading,
    and a shape that matches what is coming reads as "nearly there". */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink/[0.05] ${className}`} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="px-6 py-12 text-center">
      <h3 className="text-[15px] font-semibold text-ink">Something went wrong</h3>
      <p className="mx-auto mt-2 max-w-[340px] text-[13px] leading-relaxed text-ink-muted">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex h-10 items-center rounded-full bg-accent px-5 text-[13px] font-semibold text-accent-ink transition hover:opacity-90"
        >
          Try again
        </button>
      )}
    </Card>
  );
}
