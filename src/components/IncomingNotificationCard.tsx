import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { stripMarkdownAsterisks } from "@/components/LinkifiedText";
import {
  AtSign,
  BellRing,
  ThumbsUp,
  MessageSquare,
  Repeat2,
  Trophy,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type IncomingNotification = {
  id: string;
  actor_id?: string | null;
  type?: string | null;
  entity_id?: string | null;
  content?: string | null;
  created_at?: string | null;
  is_read?: boolean | null;
  actor?: {
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

type IncomingNotificationCardProps = {
  recipientId?: string;
  belowFeedHeader?: boolean;
  onReceived?: () => void;
  onRead?: () => void;
};

const notificationStyles = {
  like: {
    Icon: ThumbsUp,
    label: "liked your post",
    color: "bg-rose-500 text-white",
  },
  comment_like: {
    Icon: ThumbsUp,
    label: "liked your comment",
    color: "bg-rose-500 text-white",
  },
  comment: {
    Icon: MessageSquare,
    label: "commented on your post",
    color: "bg-sky-600 text-white",
  },
  follow: {
    Icon: UserPlus,
    label: "started following you",
    color: "bg-emerald-600 text-white",
  },
  repost: {
    Icon: Repeat2,
    label: "reposted your post",
    color: "bg-emerald-600 text-white",
  },
  mention: {
    Icon: AtSign,
    label: "mentioned you",
    color: "bg-amber-500 text-black",
  },
  build_tagged: {
    Icon: Trophy,
    label: "tagged your work for verification",
    color: "bg-violet-600 text-white",
  },
  game_buzz: {
    Icon: BellRing,
    label: "is buzzing you into the game",
    color: "bg-amber-400 text-black",
  },
  system: {
    Icon: Zap,
    label: "sent you an update",
    color: "bg-primary text-primary-foreground",
  },
} as const;

const cleanContent = (content?: string | null) =>
  stripMarkdownAsterisks((content || "").replace(/<[^>]*>?/gm, "")).trim();

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

export function IncomingNotificationCard({
  recipientId,
  belowFeedHeader = false,
  onReceived,
  onRead,
}: IncomingNotificationCardProps) {
  const navigate = useNavigate();
  const [active, setActive] = useState<IncomingNotification | null>(null);
  const queueRef = useRef<IncomingNotification[]>([]);
  const receivedRef = useRef(onReceived);
  const readRef = useRef(onRead);
  const actorCacheRef = useRef(new Map<string, IncomingNotification["actor"]>());

  useEffect(() => {
    receivedRef.current = onReceived;
    readRef.current = onRead;
  }, [onRead, onReceived]);

  const dismiss = () => {
    setActive(queueRef.current.shift() || null);
  };

  useEffect(() => {
    if (!active) return;
    if (active.type === "game_buzz") playGameBuzz();
    const timeout = window.setTimeout(dismiss, active.type === "game_buzz" ? 12_000 : 4_800);
    return () => window.clearTimeout(timeout);
  }, [active?.id, active?.type]);

  useEffect(() => {
    if (!recipientId) return;

    const channel = supabase
      .channel(`incoming-notifications:${recipientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${recipientId}`,
        },
        ({ new: record }) => {
          const notification = record as IncomingNotification;
          const cachedActor = notification.actor_id
            ? actorCacheRef.current.get(notification.actor_id)
            : null;
          const immediate = { ...notification, actor: cachedActor || null };

          if (!notification.is_read) receivedRef.current?.();
          setActive((current) => {
            if (!current) return immediate;
            queueRef.current = [...queueRef.current, immediate].slice(-3);
            return current;
          });

          if (!notification.actor_id || cachedActor) return;
          void supabase
            .from("profiles")
            .select("username, full_name, avatar_url")
            .eq("id", notification.actor_id)
            .maybeSingle()
            .then(({ data: actor }) => {
              actorCacheRef.current.set(notification.actor_id!, actor);
              setActive((current) =>
                current?.id === notification.id ? { ...current, actor } : current,
              );
              queueRef.current = queueRef.current.map((item) =>
                item.id === notification.id ? { ...item, actor } : item,
              );
            });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [recipientId]);

  if (!active) return null;

  const type = active.type as keyof typeof notificationStyles;
  const style = notificationStyles[type] || {
    Icon: BellRing,
    label: "interacted with you",
    color: "bg-foreground text-background",
  };
  const actorName = active.actor?.full_name || active.actor?.username || "Someone";
  const detail = cleanContent(active.content);
  const initials = actorName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const openNotification = () => {
    void supabase.from("notifications").update({ is_read: true }).eq("id", active.id);
    if (!active.is_read) readRef.current?.();
    if (active.type === "follow" && active.actor_id) {
      void navigate({ to: "/app/profile/$id", params: { id: active.actor_id } });
    } else if (active.type === "game_buzz" && active.entity_id) {
      void navigate({ to: "/app/games/$id", params: { id: active.entity_id } });
    } else if (active.entity_id && active.type !== "system") {
      void navigate({ to: "/app/post/$id", params: { id: active.entity_id } });
    } else {
      void navigate({ to: "/app/notifications" });
    }
    dismiss();
  };

  return (
    <aside
      key={active.id}
      aria-live={active.type === "game_buzz" ? "assertive" : "polite"}
      className={`pointer-events-none fixed left-1/2 z-[65] w-[calc(100%-24px)] max-w-[390px] -translate-x-1/2 animate-in fade-in slide-in-from-top-3 duration-200 ${
        belowFeedHeader
          ? "top-[calc(74px+env(safe-area-inset-top))] md:top-3"
          : "top-[calc(12px+env(safe-area-inset-top))]"
      }`}
    >
      <div className="pointer-events-auto overflow-hidden rounded-md border border-border/80 bg-background/98 shadow-[0_14px_36px_-20px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        <div className={`h-0.5 w-full ${active.type === "game_buzz" ? "bg-amber-400" : "bg-primary"}`} />
        <div className="flex items-center gap-2.5 p-2.5">
          <button
            type="button"
            onClick={openNotification}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left tap"
          >
            <div className="relative h-10 w-10 shrink-0">
              {active.actor?.avatar_url ? (
                <img
                  src={active.actor.avatar_url}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                  {initials || "ZC"}
                </div>
              )}
              <span
                className={`absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full ring-2 ring-background ${style.color}`}
              >
                <style.Icon className="h-3 w-3" strokeWidth={2.6} />
              </span>
            </div>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-5 text-foreground">
                <strong className="font-semibold">{actorName}</strong>{" "}
                <span className="text-muted-foreground">{style.label}</span>
              </span>
              {detail && (
                <span className="mt-0.5 block truncate text-[12px] leading-4 text-muted-foreground">
                  {detail}
                </span>
              )}
              <span className="mt-1 block text-[10px] font-semibold uppercase text-primary">
                Now
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss notification"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground tap hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
