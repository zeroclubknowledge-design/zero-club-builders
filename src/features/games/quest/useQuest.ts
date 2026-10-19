import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  questAction,
  questError,
  questHome,
  questPing,
  questRoom,
  type QuestAction,
  type QuestActionResult,
} from "./api";

export function useQuest(profileId: string | undefined, roomId: string | undefined) {
  const client = useQueryClient();
  const home = useQuery({
    queryKey: ["zero-quest-home", profileId],
    queryFn: questHome,
    enabled: Boolean(profileId && !roomId),
    staleTime: 0,
  });
  const room = useQuery({
    queryKey: ["zero-quest-room", profileId, roomId],
    queryFn: () => questRoom(roomId!),
    enabled: Boolean(profileId && roomId),
    refetchInterval: (query) => {
      const status = query.state.data?.room.status;
      return !status || status === "lobby" || status === "active" ? 10_000 : false;
    },
    retry: 1,
  });
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting">(
    "connecting",
  );
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const requests = useRef(new Map<string, string>());
  useEffect(() => {
    if (!roomId || !profileId) return;
    setConnection("connecting");
    let disposed = false;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (disposed) return;
      if (refresh) clearTimeout(refresh);
      refresh = setTimeout(() => {
        if (!document.hidden)
          void client.invalidateQueries({ queryKey: ["zero-quest-room", profileId, roomId] });
      }, 150);
    };
    const channel = supabase.channel(`zero-quest:${roomId}:${profileId}:${crypto.randomUUID()}`);
    for (const table of [
      "zero_quest_rooms",
      "zero_quest_members",
      "zero_quest_missions",
      "zero_quest_messages",
    ]) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${table === "zero_quest_rooms" ? "id" : "room_id"}=eq.${roomId}`,
        },
        update,
      );
    }
    channel.subscribe((status) => {
      if (disposed) return;
      setConnection(
        status === "SUBSCRIBED"
          ? "live"
          : status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"
            ? "reconnecting"
            : "connecting",
      );
      if (status === "SUBSCRIBED") update();
    });
    const ping = () => {
      if (!document.hidden) void questPing(roomId).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 30_000);
    const resume = () => {
      if (!document.hidden) {
        ping();
        update();
      }
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      disposed = true;
      if (refresh) clearTimeout(refresh);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      // Navigating or minimizing disconnects updates, never leaves the squad.
      void supabase.removeChannel(channel);
    };
  }, [roomId, profileId, client]);

  const act = async (
    action: QuestAction,
    payload: Record<string, unknown> = {},
  ): Promise<QuestActionResult | undefined> => {
    if (locked.current || !profileId) return;
    locked.current = true;
    setBusy(true);
    const key = JSON.stringify([profileId, roomId, action, payload]);
    const request = requests.current.get(key) || crypto.randomUUID();
    requests.current.set(key, request);
    try {
      const result = await questAction(roomId, action, payload, request);
      requests.current.delete(key);
      if (result.notice)
        result.correct === false ? toast.error(result.notice) : toast.success(result.notice);
      if (action !== "leave")
        await client.invalidateQueries({ queryKey: ["zero-quest-room", profileId, roomId] });
      void client.invalidateQueries({ queryKey: ["zero-quest-home", profileId] });
      return result;
    } catch (error) {
      toast.error(questError(error));
      if (roomId) void room.refetch().catch(() => {});
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (room.data?.room.status === "won")
      void client.invalidateQueries({ queryKey: ["profile", "current"] });
  }, [room.data?.room.status, roomId, client]);
  return { home, room, connection, busy, act };
}
