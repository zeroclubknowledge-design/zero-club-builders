import { useEffect, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Who is online right now.
 *
 * Every signed-in person with Zero Club open and on screen joins one shared
 * realtime presence channel. Leaving the app, locking the phone or switching
 * tabs takes them off it within seconds, the way WhatsApp's "online" works.
 * When they're not on it, profiles.last_seen_at (touched about once a minute
 * while the app is open) gives "last seen 5m ago".
 */

const CHANNEL = "zc-online";
let channel: RealtimeChannel | null = null;
let online = new Set<string>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function readState(ch: RealtimeChannel) {
  const next = new Set<string>();
  const state = ch.presenceState() as Record<string, Array<{ user_id?: string }>>;
  for (const [key, metas] of Object.entries(state)) {
    next.add(key);
    for (const meta of metas) if (meta.user_id) next.add(meta.user_id);
  }
  online = next;
  emit();
}

/** Mounted once in the app shell for the signed-in person. */
export function useBroadcastOnline(userId?: string | null) {
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(CHANNEL, { config: { presence: { key: userId } } });
    channel = ch;
    let joined = false;
    const show = () => {
      if (!joined) return;
      void ch.track({ user_id: userId, at: Date.now() });
      void supabase.rpc("touch_last_seen");
    };
    const hide = () => {
      if (!joined) return;
      void ch.untrack();
      void supabase.rpc("touch_last_seen");
    };
    ch.on("presence", { event: "sync" }, () => readState(ch))
      .on("presence", { event: "join" }, () => readState(ch))
      .on("presence", { event: "leave" }, () => readState(ch))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          joined = true;
          if (document.visibilityState === "visible") show();
        }
      });
    // Check in straight away and keep checking in, whether or not the live
    // channel connects: "online" also counts anyone seen in the last 90s.
    void supabase.rpc("touch_last_seen");
    const onVisibility = () => {
      if (document.visibilityState === "visible") void supabase.rpc("touch_last_seen");
      return document.visibilityState === "visible" ? show() : hide();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", hide);
    // Keeps "last seen" fresh while the app stays open.
    const beat = window.setInterval(() => {
      if (document.visibilityState === "visible") void supabase.rpc("touch_last_seen");
    }, 45_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", hide);
      window.clearInterval(beat);
      void supabase.removeChannel(ch);
      if (channel === ch) channel = null;
      online = new Set();
      emit();
    };
  }, [userId]);
}

/** True while that person has Zero Club open. */
export function useIsOnline(userId?: string | null) {
  return useSyncExternalStore(
    subscribe,
    () => Boolean(userId && online.has(userId)),
    () => false,
  );
}

/** The whole set, for lists such as the inbox. */
export function useOnlineSet() {
  return useSyncExternalStore(
    subscribe,
    () => online,
    () => online,
  );
}

/** Checked in within the last 90 seconds: still online, even if the live channel missed them. */
export function isRecentlySeen(iso?: string | null) {
  return Boolean(iso && Date.now() - new Date(iso).getTime() < 90_000);
}

/** "last seen 5m ago", "last seen yesterday at 21:04". */
export function lastSeenLabel(iso?: string | null) {
  if (!iso) return "";
  const then = new Date(iso);
  const mins = Math.max(1, Math.round((Date.now() - then.getTime()) / 60000));
  if (mins < 60) return `last seen ${mins}m ago`;
  const time = then.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (then.toDateString() === today.toDateString()) return `last seen today at ${time}`;
  if (then.toDateString() === yesterday.toDateString()) return `last seen yesterday at ${time}`;
  return `last seen ${then.toLocaleDateString([], { day: "numeric", month: "short" })}`;
}
