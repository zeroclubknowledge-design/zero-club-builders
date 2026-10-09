import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * "typing…" for a conversation, like WhatsApp.
 *
 * A broadcast-only realtime channel per conversation (no database writes).
 * While someone types, a small "typing" signal goes out at most every two
 * seconds; it stops when they send, clear the box or go quiet. Each typist
 * drops off the indicator four seconds after their last signal, so a closed
 * app never leaves someone "typing" forever.
 */

export type Typist = { id: string; name: string };

const SEND_EVERY_MS = 2000;
const EXPIRE_AFTER_MS = 4000;

export function useTyping(topic: string | null, me?: { id?: string | null; name?: string | null }) {
  const [typists, setTypists] = useState<Typist[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef(0);
  const timersRef = useRef(new Map<string, number>());
  const meId = me?.id || null;
  const meName = me?.name || "Someone";

  useEffect(() => {
    if (!topic || !meId) return;
    const timers = timersRef.current;
    const drop = (id: string) => {
      window.clearTimeout(timers.get(id));
      timers.delete(id);
      setTypists((current) => current.filter((typist) => typist.id !== id));
    };
    const ch = supabase.channel(`typing:${topic}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      const typist = payload as Typist;
      if (!typist?.id || typist.id === meId) return;
      setTypists((current) =>
        current.some((t) => t.id === typist.id) ? current : [...current, typist],
      );
      window.clearTimeout(timers.get(typist.id));
      timers.set(
        typist.id,
        window.setTimeout(() => drop(typist.id), EXPIRE_AFTER_MS),
      );
    })
      .on("broadcast", { event: "stop" }, ({ payload }) => {
        const id = (payload as { id?: string })?.id;
        if (id) drop(id);
      })
      .subscribe();
    channelRef.current = ch;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      setTypists([]);
      channelRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, [topic, meId]);

  /** Call on every keystroke; it throttles itself. */
  const notifyTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !meId) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_EVERY_MS) return;
    lastSentRef.current = now;
    void ch.send({ type: "broadcast", event: "typing", payload: { id: meId, name: meName } });
  }, [meId, meName]);

  /** Call when the message is sent or the box is cleared. */
  const stopTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !meId || lastSentRef.current === 0) return;
    lastSentRef.current = 0;
    void ch.send({ type: "broadcast", event: "stop", payload: { id: meId } });
  }, [meId]);

  return { typists, notifyTyping, stopTyping };
}

/** "Ada is typing…", "Ada and Tolu are typing…", "3 people are typing…". */
export function typingLabel(typists: Typist[]) {
  const first = (name: string) => name.split(" ")[0] || name;
  if (typists.length === 0) return "";
  if (typists.length === 1) return `${first(typists[0].name)} is typing`;
  if (typists.length === 2)
    return `${first(typists[0].name)} and ${first(typists[1].name)} are typing`;
  return `${typists.length} people are typing`;
}

/* ── Direct messages ─────────────────────────────────────────────
   Each person has one "inbox" typing channel. Someone writing to you sends
   their signal to yours, so both your inbox list and your open chat can say
   "typing…" without opening a channel per conversation. The payload is just
   the sender's id. */

type InboxState = {
  channel: RealtimeChannel;
  users: number;
  typing: Map<string, number>;
  listeners: Set<() => void>;
};
const inboxes = new Map<string, InboxState>();
const EMPTY = new Set<string>();

function inboxFor(meId: string) {
  let inbox = inboxes.get(meId);
  if (inbox) return inbox;
  const typing = new Map<string, number>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const drop = (id: string) => {
    window.clearTimeout(typing.get(id));
    if (typing.delete(id)) notify();
  };
  const channel = supabase.channel(`typing:inbox:${meId}`, {
    config: { broadcast: { self: false } },
  });
  channel
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const id = (payload as { id?: string })?.id;
      if (!id || id === meId) return;
      const had = typing.has(id);
      window.clearTimeout(typing.get(id));
      typing.set(
        id,
        window.setTimeout(() => drop(id), EXPIRE_AFTER_MS),
      );
      if (!had) notify();
    })
    .on("broadcast", { event: "stop" }, ({ payload }) => {
      const id = (payload as { id?: string })?.id;
      if (id) drop(id);
    })
    .subscribe();
  inbox = { channel, users: 0, typing, listeners };
  inboxes.set(meId, inbox);
  return inbox;
}

/** Ids of people typing to me right now. */
export function useInboxTyping(meId?: string | null) {
  const [typing, setTyping] = useState<Set<string>>(EMPTY);
  useEffect(() => {
    if (!meId) return;
    const inbox = inboxFor(meId);
    inbox.users += 1;
    const update = () => setTyping(new Set(inbox.typing.keys()));
    inbox.listeners.add(update);
    update();
    return () => {
      inbox.listeners.delete(update);
      inbox.users -= 1;
      if (inbox.users <= 0) {
        inbox.typing.forEach((timer) => window.clearTimeout(timer));
        void supabase.removeChannel(inbox.channel);
        inboxes.delete(meId);
      }
    };
  }, [meId]);
  return typing;
}

/** Lets the person I'm writing to see "typing…". */
export function useSendTypingTo(otherId?: string | null, meId?: string | null) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSentRef = useRef(0);
  useEffect(() => {
    if (!otherId || !meId || otherId === meId) return;
    const ch = supabase.channel(`typing:inbox:${otherId}`);
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, [otherId, meId]);

  const notifyTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !meId) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_EVERY_MS) return;
    lastSentRef.current = now;
    void ch.send({ type: "broadcast", event: "typing", payload: { id: meId } });
  }, [meId]);

  const stopTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !meId || lastSentRef.current === 0) return;
    lastSentRef.current = 0;
    void ch.send({ type: "broadcast", event: "stop", payload: { id: meId } });
  }, [meId]);

  return { notifyTyping, stopTyping };
}
