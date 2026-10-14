import { useEffect, useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Post signal: how far a post has travelled.
 *
 * Level 0 · quiet       — nothing coloured yet
 * Level 1 · warming up  — about 30%: some people are seeing it
 * Level 2 · gaining     — about 50%: more people are seeing and interacting
 * Level 3 · trending    — 100%: most active members have seen it, engaged and shared it
 *
 * Worked out on the server (post_signals) from real activity: who saw it,
 * liked or commented, and how often it was reposted or quoted, measured
 * against everyone active on Zero Club in the last 30 days.
 */
export type PostSignal = {
  post_id: string;
  level: 0 | 1 | 2 | 3;
  score: number;
  reach: number;
  viewers: number;
  engaged: number;
  shares: number;
};

export const SIGNAL_COPY: Record<number, { name: string; detail: string; color: string }> = {
  0: { name: "Quiet", detail: "Just getting started — a few people have seen it.", color: "" },
  1: { name: "Warming up", detail: "Some people are seeing it.", color: "#f59e0b" },
  2: { name: "Gaining traction", detail: "More people are seeing it and joining in.", color: "#10b981" },
  3: { name: "Trending", detail: "Most of Zero Club has seen it, joined in and is sharing it.", color: "#cc208f" },
};

/* ── Batched loading: every card on screen asks, one request answers. ── */
let queue = new Map<string, Array<(s: PostSignal | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const batch = queue;
  queue = new Map();
  const ids = [...batch.keys()];
  if (!ids.length) return;
  supabase
    .rpc("post_signals" as any, { p_post_ids: ids })
    .then(({ data, error }) => {
      const rows = new Map<string, PostSignal>();
      if (!error) for (const row of (data || []) as PostSignal[]) rows.set(row.post_id, row);
      for (const [id, resolvers] of batch) resolvers.forEach((r) => r(rows.get(id) || null));
    });
}

function loadSignal(id: string) {
  return new Promise<PostSignal | null>((resolve) => {
    const list = queue.get(id) || [];
    list.push(resolve);
    queue.set(id, list);
    if (!timer) timer = setTimeout(flush, 60);
  });
}

export function usePostSignal(postId?: string | null) {
  return useQuery({
    queryKey: ["post_signal", postId],
    queryFn: () => loadSignal(postId!),
    enabled: Boolean(postId),
    staleTime: 2 * 60_000,
  });
}

/* ── Views: a post counts as seen after half of it is on screen for a second. ── */
const seenThisSession = new Set<string>();
let pending = new Set<string>();
let viewTimer: ReturnType<typeof setTimeout> | null = null;

function sendViews() {
  viewTimer = null;
  const ids = [...pending];
  pending = new Set();
  if (!ids.length) return;
  void supabase.rpc("record_post_views" as any, { p_post_ids: ids }).then(() => undefined);
}

export function recordPostView(postId: string) {
  if (!postId || seenThisSession.has(postId)) return;
  seenThisSession.add(postId);
  pending.add(postId);
  if (!viewTimer) viewTimer = setTimeout(sendViews, 4000);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", sendViews);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sendViews();
  });
}

export function useRecordView(ref: RefObject<HTMLElement | null>, postId?: string | null, enabled = true) {
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !postId || !enabled || done.current || typeof IntersectionObserver === "undefined") return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timeout = setTimeout(() => {
            done.current = true;
            recordPostView(postId);
            io.disconnect();
          }, 1000);
        } else if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      if (timeout) clearTimeout(timeout);
      io.disconnect();
    };
  }, [ref, postId, enabled]);
}

/** The three dots, coloured by signal. Doubles as the "more options" icon. */
export function SignalDots({ level = 0, size = 20 }: { level?: number; size?: number }) {
  const color = SIGNAL_COPY[level]?.color;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="zc-icon overflow-visible">
      {[5, 12, 19].map((cx, i) => {
        const lit = level > i;
        return (
          <circle
            key={cx}
            cx={cx}
            cy={12}
            r={lit ? 2.6 : 2}
            fill={lit ? color : "currentColor"}
            style={lit && level === 3 ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined}
          />
        );
      })}
    </svg>
  );
}

/** The first row of the ⋯ menu: what the colours mean for this post. */
export function SignalSummary({ signal }: { signal?: PostSignal | null }) {
  const level = signal?.level ?? 0;
  const copy = SIGNAL_COPY[level];
  return (
    <div className="px-2.5 pb-2 pt-1.5">
      <div className="flex items-center gap-2">
        <span style={{ color: copy.color || undefined }} className={copy.color ? "" : "text-muted-foreground"}>
          <SignalDots level={level} size={22} />
        </span>
        <span className="text-[13px] font-semibold">Post signal · {copy.name}</span>
      </div>
      <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{copy.detail}</p>
      {signal && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Reached {signal.reach}% of active members · {signal.engaged} engaged · {signal.shares} {signal.shares === 1 ? "share" : "shares"}
        </p>
      )}
    </div>
  );
}
