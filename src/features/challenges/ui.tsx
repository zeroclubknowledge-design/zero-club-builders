import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "@/components/icons/glyphs";
import { formatWalletAmount } from "@/hooks/useWalletCurrency";
import type { ChallengeStatus, PayoutStatus, PrizeType, RightsPreset, TaskType } from "./api";

export const TASK_TYPES: { key: TaskType; label: string; hint: string }[] = [
  { key: "improve", label: "Improve it", hint: "Make an existing part better" },
  { key: "recreate", label: "Recreate", hint: "Rebuild a design or screen your way" },
  { key: "feature", label: "Add a feature", hint: "Something new it should do" },
  { key: "fix", label: "Fix or optimise", hint: "Bugs, speed, accessibility" },
  {
    key: "alternative",
    label: "Alternative take",
    hint: "A different solution to the same problem",
  },
  { key: "extend", label: "Extend it", hint: "Take it somewhere new" },
];
export const taskLabel = (t: TaskType) => TASK_TYPES.find((x) => x.key === t)?.label || "Challenge";

export const RIGHTS: { key: RightsPreset; title: string; short: string; body: string }[] = [
  {
    key: "showcase",
    title: "Showcase",
    short: "Winner keeps all rights",
    body: "You can show the winning work with credit. You can't use it in your product.",
  },
  {
    key: "use_with_credit",
    title: "Use with credit",
    short: "Winner keeps ownership",
    body: "You can use and adapt the winning work in this project, crediting the winner. They can still use it anywhere.",
  },
  {
    key: "full_transfer",
    title: "Full transfer",
    short: "Prize buys the rights",
    body: "The prize buys full rights to the winning entry. The winner can still show it in their portfolio. Other entries stay theirs.",
  },
];
export const rightsInfo = (k: RightsPreset) => RIGHTS.find((r) => r.key === k) || RIGHTS[1];

/** Default judging criteria by project category. Editable. */
export function defaultCriteria(category: string | null | undefined): string[] {
  const c = (category || "").toLowerCase();
  if (/design|brand|graphic|ui|ux/.test(c))
    return ["Visual quality", "Usability", "Originality", "Fit to the brief"];
  if (/data|analytic/.test(c))
    return ["Accuracy", "Clarity of insight", "Method", "Fit to the brief"];
  if (/automation|workflow|ai/.test(c))
    return ["Reliability", "Time saved", "Simplicity", "Fit to the brief"];
  if (/market|copy|content/.test(c))
    return ["Clarity", "Persuasiveness", "Originality", "Fit to the brief"];
  return ["Quality of the solution", "Usability", "Technical implementation", "Fit to the brief"];
}

export function formatPrize(amount: number, type: PrizeType, compact = false) {
  if (type === "zp") return `${Number(amount || 0).toLocaleString()} ZP`;
  return formatWalletAmount(Number(amount || 0), undefined, compact ? { notation: "compact" } : {});
}

/** Live "2d 4h left" style countdown. */
export function useCountdown(target: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [target]);
  if (!target) return { ms: 0, label: "" };
  const ms = new Date(target).getTime() - now;
  return { ms, label: durationLabel(ms) };
}

export function durationLabel(ms: number) {
  if (ms <= 0) return "Ended";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d >= 1) return `${d}d ${h}h`;
  if (h >= 1) return `${h}h ${mm}m`;
  return `${Math.max(1, mm)}m`;
}

export function statusMeta(status: ChallengeStatus, payout?: PayoutStatus) {
  if (payout === "frozen") return { label: "Under review", tone: "amber" as const };
  switch (status) {
    case "open":
      return { label: "Open for entries", tone: "green" as const };
    case "judging":
      return { label: "Judging", tone: "violet" as const };
    case "result_posted":
      return { label: "Winner announced", tone: "pink" as const };
    case "completed":
      return {
        label: payout === "paid" ? "Completed · prize paid" : "Completed",
        tone: "muted" as const,
      };
    case "cancelled":
      return { label: "Closed without a winner", tone: "muted" as const };
    case "admin_review":
      return { label: "Zero Club reviewing", tone: "amber" as const };
  }
}

const TONES = {
  green: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
  pink: "bg-[#c3217e]/12 text-[#c3217e]",
  amber: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  muted: "bg-foreground/[0.07] text-muted-foreground",
};

export function StatusPill({ status, payout }: { status: ChallengeStatus; payout?: PayoutStatus }) {
  const m = statusMeta(status, payout);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${TONES[m.tone]}`}
    >
      {status === "open" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {m.label}
    </span>
  );
}

/** The prize, shown as the hero of a challenge. */
export function PrizeHero({
  total,
  type,
  places,
  children,
}: {
  total: number;
  type: PrizeType;
  places: number;
  children?: ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-[1.5px]"
      style={{ background: "linear-gradient(135deg,#fd49b0,#c3217e 45%,#721e4e)" }}
    >
      <div className="relative rounded-[15px] bg-card px-4 py-3.5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[#c3217e]/20 blur-2xl"
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Prize{places > 1 ? ` · ${places} winners` : ""}
        </p>
        <p className="mt-0.5 font-display text-[30px] font-bold leading-none tracking-tight text-foreground">
          {formatPrize(total, type)}
        </p>
        {children}
      </div>
    </div>
  );
}

export const placeLabel = (p: number) => (p === 1 ? "1st" : p === 2 ? "2nd" : "3rd");
export const MIN_PRIZE = 2000;

/** Press and hold to confirm a money action, so it can't happen by accident. */
export function HoldToConfirm({
  children,
  onConfirm,
  disabled,
  busy,
}: {
  children: ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const start = () => {
    if (disabled || busy) return;
    const began = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - began) / 900);
      setProgress(p);
      if (p >= 1) {
        stop(false);
        if (navigator.vibrate) navigator.vibrate(30);
        onConfirm();
      } else timer.current = window.requestAnimationFrame(tick);
    };
    timer.current = window.requestAnimationFrame(tick);
  };
  const stop = (reset = true) => {
    if (timer.current) window.cancelAnimationFrame(timer.current);
    timer.current = null;
    if (reset) setProgress(0);
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={() => stop()}
      onPointerLeave={() => stop()}
      onPointerCancel={() => stop()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.repeat) onConfirm();
      }}
      className="relative h-12 w-full select-none overflow-hidden rounded-full bg-[#c3217e]/25 text-[15px] font-semibold text-white disabled:opacity-40 [-webkit-touch-callout:none]"
    >
      <span
        className="absolute inset-y-0 left-0 bg-[#c3217e]"
        style={{ width: `${(busy ? 1 : progress) * 100}%` }}
      />
      <span className="relative flex items-center justify-center gap-2">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Holding the prize…" : children}
      </span>
    </button>
  );
}
