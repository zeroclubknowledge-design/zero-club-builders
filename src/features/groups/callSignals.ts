import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Raised hands and live emoji reactions for a group call.
 *
 * Both ride on a Supabase realtime channel for this one call (group + start
 * time), so nothing is stored and no server change is needed:
 *  - Hands use presence. Everyone's "hand raised at" travels with their
 *    presence, so someone who joins late still sees the queue, and a hand
 *    disappears by itself when that person leaves the call.
 *  - Reactions are broadcasts: fire-and-forget, shown for a few seconds.
 * The call starter and group admins can lower anyone's hand.
 */

export const CALL_REACTIONS = ["👏", "❤️", "😂", "🎉", "👍", "🔥", "😮", "🙌"] as const;

export type RaisedHand = { profileId: string; name: string; avatar: string | null; at: number };
export type FloatingReaction = { id: string; emoji: string; name: string; mine: boolean; x: number; drift: number };

type Presence = { name: string; avatar: string | null; hand: number | null };
type Me = { id: string; name: string; avatar: string | null };

export function useCallSignals({ groupId, startedAt, me, enabled = true }: { groupId: string; startedAt: string; me: Me | null; enabled?: boolean }) {
  const [hands, setHands] = useState<RaisedHand[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [myHand, setMyHand] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const ready = useRef(false);
  const seenHands = useRef(new Set<string>());
  const lastReaction = useRef(0);
  const myHandRef = useRef<number | null>(null);
  myHandRef.current = myHand;

  const float = useCallback((emoji: string, name: string, mine: boolean) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item: FloatingReaction = { id, emoji, name, mine, x: 8 + Math.random() * 74, drift: Math.round((Math.random() - 0.5) * 60) };
    setReactions((list) => [...list.slice(-24), item]);
    window.setTimeout(() => setReactions((list) => list.filter((r) => r.id !== id)), 3200);
  }, []);

  const say = useCallback((text: string) => {
    const id = Date.now();
    setNotice({ id, text });
    window.setTimeout(() => setNotice((n) => (n?.id === id ? null : n)), 3200);
  }, []);

  useEffect(() => {
    if (!enabled || !me?.id || !groupId || !startedAt) return;
    const ch = supabase.channel(`group-call-signals:${groupId}:${Date.parse(startedAt)}`, {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });
    channel.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<Presence>();
      const list: RaisedHand[] = [];
      for (const [profileId, metas] of Object.entries(state)) {
        const meta = metas[metas.length - 1];
        if (meta?.hand) list.push({ profileId, name: meta.name || "Member", avatar: meta.avatar || null, at: meta.hand });
      }
      list.sort((a, b) => a.at - b.at);
      // A new hand from someone else gets a short notice for everyone.
      for (const hand of list) {
        const key = `${hand.profileId}:${hand.at}`;
        if (!seenHands.current.has(key)) {
          seenHands.current.add(key);
          if (hand.profileId !== me.id && ready.current) say(`${hand.name.split(" ")[0]} raised a hand`);
        }
      }
      setHands(list);
    })
      .on("broadcast", { event: "react" }, ({ payload }) => {
        if (payload?.emoji && CALL_REACTIONS.includes(payload.emoji)) float(payload.emoji, String(payload.name || "Member"), false);
      })
      .on("broadcast", { event: "lower" }, ({ payload }) => {
        if (payload?.target === me.id && myHandRef.current) {
          setMyHand(null);
          say(`${String(payload.by || "The host")} lowered your hand`);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void ch.track({ name: me.name, avatar: me.avatar, hand: myHandRef.current } satisfies Presence);
          window.setTimeout(() => { ready.current = true; }, 1500);
        }
      });
    return () => {
      ready.current = false;
      channel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [enabled, groupId, startedAt, me?.id, me?.name, me?.avatar, float, say]);

  // Publish my hand whenever it changes.
  useEffect(() => {
    const ch = channel.current;
    if (!ch || !me) return;
    void ch.track({ name: me.name, avatar: me.avatar, hand: myHand } satisfies Presence).catch(() => {});
  }, [myHand, me]);

  const toggleHand = useCallback(() => setMyHand((h) => (h ? null : Date.now())), []);

  const react = useCallback(
    (emoji: string) => {
      const now = Date.now();
      if (now - lastReaction.current < 350 || !me) return;
      lastReaction.current = now;
      float(emoji, "You", true);
      void channel.current?.send({ type: "broadcast", event: "react", payload: { emoji, name: me.name } });
    },
    [float, me],
  );

  const lowerHand = useCallback(
    (profileId: string) => {
      if (profileId === me?.id) { setMyHand(null); return; }
      void channel.current?.send({ type: "broadcast", event: "lower", payload: { target: profileId, by: me?.name } });
      setHands((list) => list.filter((h) => h.profileId !== profileId));
    },
    [me],
  );

  return { hands, reactions, myHand, notice, toggleHand, react, lowerHand };
}
