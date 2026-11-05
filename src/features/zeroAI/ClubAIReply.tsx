import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getCachedSession } from "@/lib/auth";
import { ZeroMark } from "@/components/ZeroLoader";
import { AIMessage } from "./AIMessage";

export const tagsZeroAI = (text: string) => /(?:^|\s)@zero\s?ai\b/i.test(text);
const replyKey = (id: string) => ["club-ai-reply", id];

export async function askClubAI(clubId: string, messageId: string) {
  const { data: { session } } = await getCachedSession();
  if (!session) throw new Error("Please sign in again.");
  const response = await fetch("/api/zero-ai/chat", {
    method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ clubId, clubMessageId: messageId }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Zero AI could not reply. Try again.");
  return result;
}

/** Kept separate from member messages so an answer cannot impersonate a person. */
export function ClubAIReply({ message, isMe }: { message: any; isMe: boolean }) {
  const client = useQueryClient();
  const reply = useQuery({
    queryKey: replyKey(message.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("club_ai_replies").select("content,created_at").eq("message_id", message.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
    // Realtime normally delivers this; a short poll also covers deployments without publication.
    refetchInterval: query => !query.state.data?.content && Date.now() - new Date(message.created_at).getTime() < 120000 ? 4000 : false,
  });
  useEffect(() => {
    const channel = supabase.channel(`club-ai:${message.id}`).on("postgres_changes", { event: "*", schema: "public", table: "club_ai_replies", filter: `message_id=eq.${message.id}` }, () => void client.invalidateQueries({ queryKey: replyKey(message.id) })).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [message.id, client]);
  const retry = useMutation({
    mutationFn: () => askClubAI(message.club_id, message.id),
    onSuccess: () => void client.invalidateQueries({ queryKey: replyKey(message.id) }),
    onError: (error: Error) => toast.error(error.message),
  });
  const pending = retry.isPending || (!!reply.data && !reply.data.content && Date.now() - new Date(reply.data.created_at).getTime() < 120000);
  return <div className="mx-3 my-3 max-w-[760px] rounded-2xl bg-foreground/[0.03] p-4 sm:mx-6">
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ZeroMark size={20} className="text-[#c3217e]" />Zero AI<span className="text-xs font-normal text-muted-foreground">Club assistant</span></div>
    {reply.data?.content ? <AIMessage content={reply.data.content} /> : <p className="text-sm text-muted-foreground">{pending ? "Zero AI is thinking…" : "Ask Zero AI about this club’s discussions, announcements and learning activity."}</p>}
    {isMe && !reply.data?.content && <button type="button" disabled={pending} onClick={() => retry.mutate()} className="mt-2 text-sm font-medium text-accent disabled:opacity-50">{pending ? "Preparing reply…" : "Ask Zero AI"}</button>}
  </div>;
}
