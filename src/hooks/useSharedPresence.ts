import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// Global cache for presence channels so we don't recreate them or add duplicate listeners
const presenceChannels: Record<string, { channel: any; subscribers: number; state: any }> = {};

export function useSharedPresence(topic: string, trackPayload?: any) {
  const [presenceState, setPresenceState] = useState<any>(presenceChannels[topic]?.state || {});
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!topic) return;

    let chObj = presenceChannels[topic];

    if (!chObj) {
      // First component connecting to this topic
      const ch = supabase.channel(topic);
      chObj = { channel: ch, subscribers: 1, state: {} };
      presenceChannels[topic] = chObj;

      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        presenceChannels[topic].state = state;
        // Broadcast via a custom event so all hooks can update
        window.dispatchEvent(new CustomEvent(`presence-sync-${topic}`, { detail: state }));
      }).subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && trackPayload) {
          await ch.track(trackPayload);
        }
      });
    } else {
      // Already created
      chObj.subscribers++;
      // If we are joining an already subscribed channel, track our payload
      if (trackPayload) {
        if (chObj.channel.state === 'joined') {
          chObj.channel.track(trackPayload).catch(() => {});
        } else {
          // If it's still joining, we wait until it's joined
          const interval = setInterval(() => {
            if (chObj.channel.state === 'joined') {
              chObj.channel.track(trackPayload).catch(() => {});
              clearInterval(interval);
            }
          }, 500);
          setTimeout(() => clearInterval(interval), 5000);
        }
      }
    }

    channelRef.current = chObj.channel;
    setPresenceState(chObj.state);

    const handleSync = (e: any) => {
      setPresenceState(e.detail);
    };

    window.addEventListener(`presence-sync-${topic}`, handleSync);

    return () => {
      window.removeEventListener(`presence-sync-${topic}`, handleSync);
      const obj = presenceChannels[topic];
      if (obj) {
        obj.subscribers--;
        if (obj.subscribers <= 0) {
          supabase.removeChannel(obj.channel);
          delete presenceChannels[topic];
        }
      }
    };
  }, [topic]);

  // When trackPayload changes dynamically (like isAdmin), we should re-track
  useEffect(() => {
    if (channelRef.current?.state === 'joined' && trackPayload) {
      channelRef.current.track(trackPayload).catch(() => {});
    }
  }, [JSON.stringify(trackPayload)]);

  return { presenceState, channel: channelRef.current };
}
