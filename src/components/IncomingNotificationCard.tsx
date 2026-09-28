import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { stripMarkdownAsterisks } from "@/components/LinkifiedText";
import {
  AtSign,
  BellRing,
  MessageSquare,
  Repeat2,
  ThumbsUp,
  Trophy,
  UserPlus,
  Zap,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";

/**
 * The in-app pop card: a floating pill that drops in from the top when
 * something happens while you're using Zero Club — a like, a follow, a
 * repost, a comment, a direct message. Tap it to go there; flick it up (or
 * sideways) to dismiss. One at a time, the rest wait their turn.
 */

type Person = { username?: string | null; full_name?: string | null; avatar_url?: string | null } | null;

type IncomingNotification = {
  id: string;
  actor_id?: string | null;
  type?: string | null;
  entity_id?: string | null;
  content?: string | null;
  is_read?: boolean | null;
  actor?: Person;
};

/** Anything that can be shown on the card. */
export type IncomingPop = {
  id: string;
  kind: "notification" | "message";
  type: string;
  person: Person;
  personId?: string | null;
  entityId?: string | null;
  detail?: string;
  isRead?: boolean;
};

/* ── A tiny bus so other parts of the app (DMs) can raise a card ─────────── */

const listeners = new Set<(pop: IncomingPop) => void>();

/** Show a pop card from anywhere, e.g. for a new direct message. */
export function showIncomingPop(pop: IncomingPop) {
  listeners.forEach((listener) => listener(pop));
}

/* ── Wording and badges ─────────────────────────────────────────────────── */

const VERBS: Record<string, { verb: string; Icon: typeof BellRing; tone: string }> = {
  like: { verb: "liked your post", Icon: ThumbsUp, tone: "zc-pop-badge--like" },
  comment_like: { verb: "liked your comment", Icon: ThumbsUp, tone: "zc-pop-badge--like" },
  comment: { verb: "replied to your post", Icon: MessageSquare, tone: "zc-pop-badge--reply" },
  follow: { verb: "followed you", Icon: UserPlus, tone: "zc-pop-badge--follow" },
  repost: { verb: "reposted", Icon: Repeat2, tone: "zc-pop-badge--repost" },
  mention: { verb: "mentioned you", Icon: AtSign, tone: "zc-pop-badge--mention" },
  club_mention: { verb: "mentioned you in a club", Icon: AtSign, tone: "zc-pop-badge--mention" },
  build_tagged: { verb: "tagged your work", Icon: Trophy, tone: "zc-pop-badge--mention" },
  game_buzz: { verb: "is buzzing you into a game", Icon: BellRing, tone: "zc-pop-badge--buzz" },
  message: { verb: "", Icon: MessageSquare, tone: "zc-pop-badge--reply" },
  system: { verb: "", Icon: Zap, tone: "" },
};

const cleanContent = (content?: string | null) =>
  stripMarkdownAsterisks((content || "").replace(/<[^>]*>?/gm, "")).replace(/\s+/g, " ").trim();

const playGameBuzz = () => {
  if (typeof window === "undefined") return;
  navigator.vibrate?.([240, 90, 240, 90, 380]);

  const AudioContextCtor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  try {
    const context = new AudioContextCtor();
    void context.resume();
    const start = context.currentTime + 0.03;
    [0, 0.3, 0.6, 0.9, 1.2].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(index % 2 === 0 ? 210 : 285, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.015);
      gain.gain.setValueAtTime(0.12, start + offset + 0.19);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.25);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.26);
    });
    window.setTimeout(() => { void context.close(); }, 1_900);
  } catch {
    // Device push still supplies vibration and the operating system alert.
  }
};

type IncomingNotificationCardProps = {
  recipientId?: string;
  /** Kept for callers; the card now always floats at the very top, like the OS. */
  belowFeedHeader?: boolean;
  onReceived?: () => void;
  onRead?: () => void;
};

const SHOW_MS = 5_200;
const EXIT_MS = 260;

export function IncomingNotificationCard({ recipientId, onReceived, onRead }: IncomingNotificationCardProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [active, setActive] = useState<IncomingPop | null>(null);
  const [leaving, setLeaving] = useState<"up" | "left" | "right" | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false });
  const queueRef = useRef<IncomingPop[]>([]);
  const receivedRef = useRef(onReceived);
  const readRef = useRef(onRead);
  const pathRef = useRef(pathname);
  const actorCacheRef = useRef(new Map<string, Person>());
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const movedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    receivedRef.current = onReceived;
    readRef.current = onRead;
    pathRef.current = pathname;
  }, [onRead, onReceived, pathname]);

  const next = useCallback(() => {
    setLeaving(null);
    setDrag({ x: 0, y: 0, dragging: false });
    setActive(queueRef.current.shift() || null);
  }, []);

  const dismiss = useCallback((direction: "up" | "left" | "right" = "up") => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setLeaving(direction);
    window.setTimeout(next, EXIT_MS);
  }, [next]);

  const enqueue = useCallback((pop: IncomingPop) => {
    setActive((current) => {
      if (!current) return pop;
      if (current.id === pop.id || queueRef.current.some((q) => q.id === pop.id)) return current;
      queueRef.current = [...queueRef.current, pop].slice(-4);
      return current;
    });
  }, []);

  // Auto-hide, paused while a finger is on the card.
  const armTimer = useCallback((ms: number) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => dismiss("up"), ms);
  }, [dismiss]);

  useEffect(() => {
    if (!active) return;
    if (active.type === "game_buzz") playGameBuzz();
    else navigator.vibrate?.(12);
    armTimer(active.type === "game_buzz" ? 12_000 : SHOW_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [active?.id]);

  // Cards raised elsewhere (direct messages).
  useEffect(() => {
    listeners.add(enqueue);
    return () => {
      listeners.delete(enqueue);
    };
  }, [enqueue]);

  // Notifications, live.
  useEffect(() => {
    if (!recipientId) return;

    const channel = supabase
      .channel(`incoming-notifications:${recipientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${recipientId}` },
        ({ new: record }) => {
          const n = record as IncomingNotification;
          if (!n.is_read) receivedRef.current?.();
          // Already looking at your notifications: the list updates, no need to pop.
          if (pathRef.current.startsWith("/app/notifications")) return;
          if (n.actor_id && n.actor_id === recipientId) return;

          const cached = n.actor_id ? actorCacheRef.current.get(n.actor_id) : null;
          const pop: IncomingPop = {
            id: n.id,
            kind: "notification",
            type: n.type || "system",
            person: cached || null,
            personId: n.actor_id,
            entityId: n.entity_id,
            detail: cleanContent(n.content),
            isRead: Boolean(n.is_read),
          };
          enqueue(pop);

          if (!n.actor_id || cached) return;
          void supabase
            .from("profiles")
            .select("username, full_name, avatar_url")
            .eq("id", n.actor_id)
            .maybeSingle()
            .then(({ data: actor }) => {
              actorCacheRef.current.set(n.actor_id!, actor);
              setActive((current) => (current?.id === n.id ? { ...current, person: actor } : current));
              queueRef.current = queueRef.current.map((item) => (item.id === n.id ? { ...item, person: actor } : item));
            });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [recipientId, enqueue]);

  if (!active) return null;

  const style = VERBS[active.type] || { verb: "interacted with you", Icon: BellRing, tone: "" };
  const isSystem = active.type === "system";
  const name = isSystem ? "Zero Club" : active.person?.full_name || active.person?.username || "Someone";
  const handle = active.person?.username ? `@${active.person.username}` : "";
  const title = style.verb ? `${name} ${style.verb}` : name;
  const detail = active.detail || "";
  const subtitle = active.kind === "message"
    ? detail
    : handle && detail ? `${handle}: ${detail}` : detail || handle;
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  const open = () => {
    if (active.kind === "notification") {
      void supabase.from("notifications").update({ is_read: true }).eq("id", active.id);
      if (!active.isRead) readRef.current?.();
    }
    const t = active.type;
    if (active.kind === "message" && active.personId) {
      void navigate({ to: "/app/chat/$id", params: { id: active.personId } });
    } else if (t === "follow" && active.personId) {
      void navigate({ to: "/app/profile/$id", params: { id: active.personId } });
    } else if (t === "game_buzz" && active.entityId) {
      void navigate({ to: "/app/games/$id", params: { id: active.entityId } });
    } else if (t === "club_mention" && active.entityId) {
      void navigate({ to: "/app/clubs/chat", search: { clubId: active.entityId } });
    } else if (active.entityId && t !== "system") {
      void navigate({ to: "/app/post/$id", params: { id: active.entityId } });
    } else {
      void navigate({ to: "/app/notifications" });
    }
    dismiss("up");
  };

  /* ── Gestures: flick up or sideways to dismiss ── */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    movedRef.current = false;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = startRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) movedRef.current = true;
    // Pulling down resists; up and sideways follow the finger.
    setDrag({ x: Math.abs(dx) > Math.abs(dy) ? dx : 0, y: dy < 0 ? dy : dy * 0.18, dragging: true });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = startRef.current;
    startRef.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const fast = Date.now() - s.t < 220;
    if (dy < -28 || (fast && dy < -10)) return dismiss("up");
    if (Math.abs(dx) > 90 || (fast && Math.abs(dx) > 40)) return dismiss(dx > 0 ? "right" : "left");
    setDrag({ x: 0, y: 0, dragging: false });
    if (!movedRef.current) open();
    else armTimer(2_600);
  };

  const transform = leaving === "up"
    ? "translate3d(0, calc(-100% - 40px), 0) scale(0.96)"
    : leaving
      ? `translate3d(${leaving === "right" ? "" : "-"}110%, ${drag.y}px, 0)`
      : `translate3d(${drag.x}px, ${drag.y}px, 0)`;

  return (
    <div className="zc-pop-host" aria-live={active.type === "game_buzz" ? "assertive" : "polite"}>
      <div
        key={active.id}
        role="button"
        tabIndex={0}
        aria-label={`${title}${subtitle ? `. ${subtitle}` : ""}. Tap to open.`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") open();
          if (e.key === "Escape") dismiss("up");
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { startRef.current = null; setDrag({ x: 0, y: 0, dragging: false }); armTimer(2_600); }}
        className={`zc-pop ${leaving ? "zc-pop--leaving" : ""} ${drag.dragging ? "zc-pop--dragging" : ""} ${active.type === "game_buzz" ? "zc-pop--buzz" : ""}`}
        style={{
          transform,
          opacity: leaving ? 0 : 1 - Math.min(0.6, Math.abs(drag.x) / 300 + Math.max(0, -drag.y) / 140),
        }}
      >
        <span className="zc-pop-avatar">
          {isSystem ? (
            <img src="/favicon-192.png" alt="" className="zc-pop-avatar-img" />
          ) : active.person?.avatar_url ? (
            <img src={active.person.avatar_url} alt="" className="zc-pop-avatar-img" decoding="async" />
          ) : (
            <span className="zc-pop-avatar-fallback">{initials || "ZC"}</span>
          )}
          <span className={`zc-pop-badge ${style.tone}`}>
            <style.Icon className="h-[10px] w-[10px]" strokeWidth={2.8} />
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="zc-pop-title">{title}</span>
          {subtitle && <span className="zc-pop-sub">{subtitle}</span>}
        </span>

        <span className="zc-pop-grip" aria-hidden>
          <i /><i /><i />
        </span>
      </div>
    </div>
  );
}
