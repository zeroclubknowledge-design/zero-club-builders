import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Raised hands and live emoji reactions for a group call.
 *
 * Both ride on Supabase realtime channels for this one call (group + start
 * time), so nothing is stored and no server change is needed:
 *  - Reactions (and "lower hand") are broadcasts on their own channel with
 *    no presence, so they never wait on, or get throttled with, presence.
 *  - Hands use presence on a second channel. Everyone's "hand raised at"
 *    travels with their presence, so someone who joins late still sees the
 *    queue, and a hand disappears by itself when that person leaves.
 * The call starter and group admins can lower anyone's hand.
 *
 * Why two channels and the retry loop: supabase-js hands back an existing
 * channel when one with the same topic is still closing, and a channel that
 * fails to join silently falls back to sending over HTTP — so emojis were
 * "sent" but nobody was listening. Each channel now removes any stale copy
 * first, rejoins on error or timeout, and only tracks presence once joined.
 */

export const CALL_REACTIONS = ["👏", "❤️", "😂", "🎉", "👍", "🔥", "😮", "🙌"] as const;

export type RaisedHand = { profileId: string; name: string; avatar: string | null; at: number };
/** `target` is the profile the reaction was sent to (the last person who spoke), or null for the whole call. */
export type FloatingReaction = { id: string; emoji: string; name: string; mine: boolean; x: number; drift: number; target: string | null };

type Presence = { name: string; avatar: string | null; hand: number | null };
type Me = { id: string; name: string; avatar: string | null };

/** A stable topic for this call, whatever format the start time arrives in. */
function callTopic(groupId: string, startedAt: string) {
  const ms = Date.parse(startedAt.includes("T") ? startedAt : startedAt.replace(" ", "T"));
  return `group-call:${groupId}:${Number.isFinite(ms) ? ms : startedAt.replace(/[^0-9]/g, "").slice(0, 17)}`;
}

/**
 * Join `topic` and keep it joined until `stop()` is called: removes a stale
 * channel with the same topic, then retries with backoff on error/timeout/close.
 */
function keepJoined(
  topic: string,
  config: Parameters<typeof supabase.channel>[1],
  setup: (ch: RealtimeChannel) => void,
  onState: (ch: RealtimeChannel | null, joined: boolean) => void,
) {
  let stopped = false;
  let current: RealtimeChannel | null = null;
  let retry: number | undefined;
  let attempt = 0;

  const open = async () => {
    if (stopped) return;
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
    if (stale) await supabase.removeChannel(stale).catch(() => undefined);
    if (stopped) return;
    const ch = supabase.channel(topic, config);
    current = ch;
    setup(ch);
    onState(ch, false);
    ch.subscribe((status) => {
      if (stopped || current !== ch) return;
      if (status === "SUBSCRIBED") {
        attempt = 0;
        onState(ch, true);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        onState(ch, false);
        window.clearTimeout(retry);
        const wait = Math.min(10_000, 1000 * 2 ** attempt++);
        retry = window.setTimeout(() => {
          if (stopped || current !== ch) return;
          current = null;
          void supabase.removeChannel(ch).catch(() => undefined).then(open);
        }, wait);
      }
    });
  };
  void open();

  return () => {
    stopped = true;
    window.clearTimeout(retry);
    onState(null, false);
    if (current) void supabase.removeChannel(current).catch(() => undefined);
    current = null;
  };
}

export function useCallSignals({ groupId, startedAt, me, enabled = true }: { groupId: string; startedAt: string; me: Me | null; enabled?: boolean }) {
  const [hands, setHands] = useState<RaisedHand[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [myHand, setMyHand] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const fx = useRef<{ ch: RealtimeChannel | null; joined: boolean }>({ ch: null, joined: false });
  const presence = useRef<{ ch: RealtimeChannel | null; joined: boolean }>({ ch: null, joined: false });
  const ready = useRef(false);
  const seenHands = useRef(new Set<string>());
  const lastReaction = useRef(0);
  const myHandRef = useRef<number | null>(null);
  myHandRef.current = myHand;
  const meRef = useRef<Me | null>(me);
  meRef.current = me;

  const float = useCallback((emoji: string, name: string, mine: boolean, target: string | null) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item: FloatingReaction = { id, emoji, name, mine, target, x: target ? 18 + Math.random() * 52 : 8 + Math.random() * 74, drift: Math.round((Math.random() - 0.5) * 60) };
    setReactions((list) => [...list.slice(-24), item]);
    window.setTimeout(() => setReactions((list) => list.filter((r) => r.id !== id)), 3200);
  }, []);

  const say = useCallback((text: string) => {
    const id = Date.now();
    setNotice({ id, text });
    window.setTimeout(() => setNotice((n) => (n?.id === id ? null : n)), 3200);
  }, []);

  const trackMe = useCallback(() => {
    const p = presence.current;
    const who = meRef.current;
    if (!p.ch || !p.joined || !who) return;
    void p.ch.track({ name: who.name, avatar: who.avatar, hand: myHandRef.current } satisfies Presence).catch(() => undefined);
  }, []);

  const myId = me?.id;
  useEffect(() => {
    if (!enabled || !myId || !groupId || !startedAt) return;
    const base = callTopic(groupId, startedAt);

    // Reactions + "lower hand": broadcast only.
    const stopFx = keepJoined(
      `${base}:fx`,
      { config: { broadcast: { self: false, ack: false } } },
      (ch) => {
        ch.on("broadcast", { event: "react" }, ({ payload }) => {
          if (payload?.emoji && (CALL_REACTIONS as readonly string[]).includes(payload.emoji))
            float(payload.emoji, String(payload.name || "Member"), false, typeof payload.target === "string" ? payload.target : null);
        }).on("broadcast", { event: "lower" }, ({ payload }) => {
          if (payload?.target === myId && myHandRef.current) {
            setMyHand(null);
            say(`${String(payload.by || "The host")} lowered your hand`);
          }
        });
      },
      (ch, joined) => { fx.current = { ch, joined }; },
    );

    // Raised hands: presence.
    const stopHands = keepJoined(
      `${base}:hands`,
      { config: { presence: { key: myId } } },
      (ch) => {
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
              if (hand.profileId !== myId && ready.current) say(`${hand.name.split(" ")[0]} raised a hand`);
            }
          }
          setHands(list);
        });
      },
      (ch, joined) => {
        presence.current = { ch, joined };
        if (joined) {
          trackMe();
          window.setTimeout(() => { ready.current = true; }, 1500);
        }
      },
    );

    return () => {
      ready.current = false;
      stopFx();
      stopHands();
    };
  }, [enabled, groupId, startedAt, myId, float, say, trackMe]);

  // Publish my hand whenever it changes (only once the hands channel is joined).
  useEffect(() => { trackMe(); }, [myHand, trackMe]);

  const toggleHand = useCallback(() => setMyHand((h) => (h ? null : Date.now())), []);

  /** Send a reaction to `target` (the last person who spoke), or to the whole call. */
  const react = useCallback(
    (emoji: string, target: string | null = null) => {
      const now = Date.now();
      const who = meRef.current;
      if (now - lastReaction.current < 350 || !who) return;
      lastReaction.current = now;
      float(emoji, "You", true, target);
      void fx.current.ch?.send({ type: "broadcast", event: "react", payload: { emoji, name: who.name, target } });
    },
    [float],
  );

  const lowerHand = useCallback(
    (profileId: string) => {
      if (profileId === meRef.current?.id) { setMyHand(null); return; }
      void fx.current.ch?.send({ type: "broadcast", event: "lower", payload: { target: profileId, by: meRef.current?.name } });
      setHands((list) => list.filter((h) => h.profileId !== profileId));
    },
    [],
  );

  return { hands, reactions, myHand, notice, toggleHand, react, lowerHand };
}
