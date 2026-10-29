import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createRtcRecovery, type RtcRecoveryState } from "./rtcRecovery";

export function useRtcRecovery({ client, appId, channel, uid, joinError, isLeaving, tracks }: {
  client: Parameters<typeof createRtcRecovery>[0]["client"];
  appId: string;
  channel: string;
  uid?: number;
  joinError: unknown;
  isLeaving: () => boolean;
  tracks: Array<any>;
}) {
  const leaving = useRef(isLeaving);
  leaving.current = isLeaving;
  const media = useRef(tracks);
  media.current = tracks;
  const controller = useRef<ReturnType<typeof createRtcRecovery> | null>(null);
  const [status, setStatus] = useState<RtcRecoveryState>({ state: client.connectionState, message: null, retrying: false });
  useEffect(() => {
    const recovery = createRtcRecovery({
      client, appId, channel, uid, isLeaving: () => leaving.current(), onChange: setStatus,
      restoreMedia: async () => {
        if (leaving.current()) return;
        // usePublish remembers track IDs across a rejoin. Restore tracks that
        // were published before the disconnect, keeping mute/device choices.
        const publisher = client as typeof client & { localTracks: any[]; publish: (tracks: any[]) => Promise<void> };
        const missing = media.current.filter(track => track?.enabled && !publisher.localTracks.some(published => published.getTrackId() === track.getTrackId()));
        if (missing.length) await publisher.publish(missing);
      },
      loadToken: async (assignedUid, signal) => {
        const { data, error } = await supabase.functions.invoke("agora-token", {
          body: { channelName: channel, uid: assignedUid ?? 0 }, signal,
        });
        if (error || !data?.token) throw error || new Error("Call access token unavailable");
        return data.token;
      },
    });
    controller.current = recovery;
    const resume = () => { if (document.visibilityState === "visible" && navigator.onLine) recovery.resume(); };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      recovery.dispose();
      if (controller.current === recovery) controller.current = null;
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [client, appId, channel, uid]);
  useEffect(() => { if (joinError) controller.current?.failed(joinError); }, [joinError]);
  return { ...status, reconnect: () => controller.current?.retry() };
}
