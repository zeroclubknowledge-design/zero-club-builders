import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageCircle, Send } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { GameAvatar } from "../GameAvatar";
import { draughtComment, draughtComments, draughtWatchError, type DraughtComment } from "./api";

/**
 * Live comments under a match: players and spectators talk while it plays.
 * New comments stream in over realtime; the list sticks to the newest one
 * unless the reader has scrolled up to read older ones.
 */
export function MatchComments({ roomId, myId, playerIds }: { roomId: string; myId?: string; playerIds: string[] }) {
  const client = useQueryClient();
  const key = ["draught-comments", roomId, myId];
  const comments = useQuery({ queryKey: key, queryFn: () => draughtComments(roomId), enabled: Boolean(myId), retry: false, refetchInterval: 10_000 });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    if (!myId) return;
    const channel = supabase
      .channel(`draught-comments:${roomId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "zero_draught_comments", filter: `room_id=eq.${roomId}` }, () =>
        void client.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myId, client]);

  useEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [comments.data?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const saved = await draughtComment(roomId, body);
      setText("");
      pinned.current = true;
      client.setQueryData<DraughtComment[]>(key, (old) => (old?.some((c) => c.id === saved.id) ? old : [...(old || []), saved]));
      void client.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.error(draughtWatchError(error, "chat"));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
      <header className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <MessageCircle className="h-4 w-4 text-[#fe94d1]" /> Match chat
        </h3>
        <span className="text-[11px] text-white/40">{comments.data?.length || 0} comments</span>
      </header>
      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="no-scrollbar max-h-[320px] min-h-[120px] space-y-3 overflow-y-auto px-4 py-3"
      >
        {comments.error ? (
          <div role="alert" className="py-4 text-center text-[12.5px] text-white/60">
            <p>{draughtWatchError(comments.error, "chat")}</p>
            <button type="button" disabled={comments.isFetching} onClick={() => void comments.refetch()} className="mt-2 min-h-11 rounded-full bg-white/[0.08] px-4 font-semibold text-[#fe94d1] disabled:opacity-40">Try again</button>
          </div>
        ) : comments.isPending ? (
          <p className="flex justify-center py-6 text-white/40"><Loader2 className="h-4 w-4 animate-spin" /></p>
        ) : !comments.data?.length ? (
          <p className="py-6 text-center text-[12.5px] text-white/40">No comments yet. Cheer on a player or call the next move.</p>
        ) : (
          comments.data.map((c) => {
            const name = c.author?.full_name || c.author?.username || "Member";
            const isPlayer = playerIds.includes(c.profile_id);
            return (
              <div key={c.id} className="flex gap-2.5">
                <GameAvatar id={c.profile_id} name={name} photo={c.author?.avatar_url} className="h-7 w-7" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-white/80">
                    <span className="truncate">{c.profile_id === myId ? "You" : name}</span>
                    {isPlayer && <span className="rounded-full bg-[#fd49b0]/20 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-[#fe94d1]">Player</span>}
                  </p>
                  <p className="mt-0.5 break-words text-[13px] leading-snug text-white/75">{c.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2 border-t border-white/[0.07] p-2.5"
      >
        <input
          value={text}
          maxLength={280}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something about the match"
          aria-label="Comment on this match"
          className="min-h-11 min-w-0 flex-1 rounded-full bg-white/[0.06] px-4 text-[14px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/35 focus:ring-[#fd49b0]/50"
        />
        <button
          type="submit"
          disabled={!myId || !text.trim() || sending || Boolean(comments.error)}
          aria-label="Send comment"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#fd49b0,#b82a7b)] text-white transition active:scale-95 disabled:opacity-35"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </section>
  );
}
