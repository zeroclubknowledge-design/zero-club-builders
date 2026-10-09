import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Delivered ticks.
 *
 * While Zero Club is open on someone's phone, any message sent to them is
 * marked delivered straight away (two grey ticks for the sender), even if
 * they haven't opened that chat yet. Opening the chat then marks it read
 * (two pink ticks). Mounted once in the app shell.
 */
export function useMarkMessagesDelivered(userId?: string | null) {
  useEffect(() => {
    if (!userId) return;
    let timer: number | undefined;
    const mark = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void supabase.rpc("mark_messages_delivered"), 400);
    };
    mark();
    const channel = supabase
      .channel(`delivered-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        mark,
      )
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") mark();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
