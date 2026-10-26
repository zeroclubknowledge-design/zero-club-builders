import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { BarChart3, Check, Loader2, Plus, X } from "@/components/icons/glyphs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { GroupPoll, GroupVote } from "./api";
import { sendPoll, vote } from "./api";

/** Votes counted live; tap an option to vote, tap again to take it back. */
export function PollCard({ message, votes, myId, mine, onVote }: { message: { id: string; poll: GroupPoll | null }; votes: GroupVote[]; myId: string; mine: boolean; onVote?: (option: number) => Promise<unknown> }) {
  const poll = message.poll;
  const [busy, setBusy] = useState<number | null>(null);
  if (!poll) return null;
  const forThis = votes.filter((v) => v.message_id === message.id);
  const voters = new Set(forThis.map((v) => v.profile_id)).size;
  const counts = poll.options.map((_, i) => forThis.filter((v) => v.option_index === i).length);
  const top = Math.max(1, ...counts);

  const pick = async (i: number) => {
    setBusy(i);
    try {
      await (onVote ? onVote(i) : vote(message.id, i));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-w-[230px] max-w-[300px]">
      <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] ${mine ? "text-white/70" : "text-[#c3217e]"}`}>
        <BarChart3 className="h-3.5 w-3.5" /> Poll{poll.multi ? " · pick any" : ""}
      </p>
      <p className="mt-1 text-[15px] font-semibold leading-snug">{poll.question}</p>
      <div className="mt-2.5 space-y-1.5">
        {poll.options.map((opt, i) => {
          const chosen = forThis.some((v) => v.option_index === i && v.profile_id === myId);
          const pct = voters ? Math.round((counts[i] / voters) * 100) : 0;
          return (
            <button
              key={i}
              type="button"
              disabled={busy !== null}
              onClick={(e) => { e.stopPropagation(); void pick(i); }}
              className={`relative w-full overflow-hidden rounded-xl px-3 py-2 text-left text-[13.5px] font-medium transition active:scale-[0.99] ${
                mine ? "bg-white/15" : "bg-card ring-1 ring-foreground/[0.06]"
              } ${chosen ? (mine ? "ring-2 ring-white/70" : "ring-2 ring-[#c3217e]/60") : ""}`}
            >
              <span
                className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${mine ? "bg-white/20" : counts[i] === top && counts[i] > 0 ? "bg-[#c3217e]/15" : "bg-foreground/[0.06]"}`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center gap-2">
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${chosen ? (mine ? "bg-white text-[#a7196b]" : "bg-[#c3217e] text-white") : mine ? "ring-1 ring-white/60" : "ring-1 ring-foreground/30"}`}>
                  {busy === i ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : chosen && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 break-words">{opt}</span>
                <span className="shrink-0 tabular-nums text-[12px] opacity-75">{counts[i]}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className={`mt-2 text-[11.5px] ${mine ? "text-white/65" : "text-muted-foreground"}`}>
        {voters} {voters === 1 ? "vote" : "votes"}
      </p>
    </div>
  );
}

export function PollComposer({ open, onOpenChange, groupId, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; groupId?: string; onSubmit?: (poll: GroupPoll) => Promise<unknown> }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);
  const filled = options.map((o) => o.trim()).filter(Boolean);

  const submit = async () => {
    if (!question.trim() || filled.length < 2) {
      toast.error("Add a question and at least two options.");
      return;
    }
    setBusy(true);
    try {
      const poll = { question: question.trim(), options: filled, multi };
      await (onSubmit ? onSubmit(poll) : sendPoll(groupId!, poll));
      setQuestion("");
      setOptions(["", ""]);
      setMulti(false);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't send the poll.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" overlayClassName="z-[90]" className="z-[100] max-h-[90dvh] overflow-y-auto rounded-t-[28px] border-0 bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[#c3217e]" /> Create a poll</SheetTitle>
        </SheetHeader>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 300))}
          placeholder="Ask a question"
          autoFocus
          className="mt-4 h-12 w-full rounded-2xl bg-foreground/[0.05] px-4 text-[15px] font-semibold outline-none ring-1 ring-transparent focus:ring-[#c3217e]/40"
        />
        <div className="mt-3 space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value.slice(0, 100) : o)))}
                placeholder={`Option ${i + 1}`}
                className="h-11 min-w-0 flex-1 rounded-xl bg-foreground/[0.05] px-3.5 text-[14.5px] outline-none ring-1 ring-transparent focus:ring-[#c3217e]/40"
              />
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label="Remove option" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05]">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 12 && (
          <button type="button" onClick={() => setOptions([...options, ""])} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-[#c3217e] hover:bg-[#c3217e]/10">
            <Plus className="h-4 w-4" /> Add option
          </button>
        )}
        <label className="mt-3 flex items-center justify-between rounded-2xl bg-foreground/[0.04] px-4 py-3">
          <span className="text-[14px] font-medium">Allow multiple answers</span>
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="h-5 w-5 accent-[#c3217e]" />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#d22c8b,#a7196b)] text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send poll
        </button>
      </SheetContent>
    </Sheet>
  );
}

/* ── Club polls ──────────────────────────────────────────────────────────
   A club poll is a normal club message ("📊 question") with its options in
   club_polls and votes in club_poll_votes. */

type ClubPollRow = { message_id: string; question: string; options: string[]; multi: boolean };

export function ClubPollMessage({ messageId, myId, mine, fallback }: { messageId: string; myId: string; mine: boolean; fallback: React.ReactNode }) {
  const queryClient = useQueryClient();
  const key = ["club-poll", messageId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [{ data: poll }, { data: votes }] = await Promise.all([
        supabase.from("club_polls" as any).select("message_id, question, options, multi").eq("message_id", messageId).maybeSingle(),
        supabase.from("club_poll_votes" as any).select("message_id, profile_id, option_index").eq("message_id", messageId),
      ]);
      return { poll: (poll as unknown as ClubPollRow) || null, votes: ((votes || []) as unknown as GroupVote[]) };
    },
    staleTime: 30_000,
  });

  // Votes update live for everyone looking at the poll.
  useEffect(() => {
    const ch = supabase
      .channel(`club-poll-${messageId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "club_poll_votes", filter: `message_id=eq.${messageId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["club-poll", messageId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [messageId, queryClient]);

  if (isLoading) return <div className="h-24 w-[230px] animate-pulse rounded-xl bg-foreground/[0.05]" />;
  if (!data?.poll) return <>{fallback}</>;
  const poll: GroupPoll = { question: data.poll.question, options: data.poll.options, multi: data.poll.multi };
  return (
    <PollCard
      message={{ id: messageId, poll }}
      votes={data.votes}
      myId={myId}
      mine={mine}
      onVote={async (option) => {
        const { data: res, error } = await supabase.rpc("vote_club_poll" as any, { p_message: messageId, p_option: option } as any);
        if (error) throw error;
        if ((res as any)?.ok === false) throw new Error("Couldn't record your vote.");
        await queryClient.invalidateQueries({ queryKey: key });
      }}
    />
  );
}
