import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Loader2, Phone, Trash2, Video } from "@/components/icons/glyphs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/lib/supabase";

/*
 * Scheduled voice and video calls in a group chat.
 *
 * Anyone who can post in the group can schedule one (admins only, when the
 * group is admins-only). Everyone gets a notification when it's scheduled,
 * a reminder 10 minutes before, and a "starting now" notification at the
 * time that opens the call (database: schedule_group_call and
 * group_call_schedule_tick, run every minute). The person who scheduled it
 * or a group admin can cancel it.
 */

export type ScheduledCall = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  starts_at: string;
  video: boolean;
  cancelled_at: string | null;
};

/** How long after its start time a scheduled call still shows ("Join"). */
const STILL_ON_MS = 90 * 60_000;

export function useScheduledCalls(groupId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["group-scheduled-calls", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_group_scheduled_calls" as never)
        .select("id, group_id, created_by, title, starts_at, video, cancelled_at")
        .eq("group_id", groupId)
        .is("cancelled_at", null)
        .gt("starts_at", new Date(Date.now() - STILL_ON_MS).toISOString())
        .order("starts_at", { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as ScheduledCall[];
    },
    staleTime: 30_000,
  });
  useEffect(() => {
    const channel = supabase
      .channel(`group-schedule-${groupId}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "chat_group_scheduled_calls", filter: `group_id=eq.${groupId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["group-scheduled-calls", groupId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [groupId, queryClient]);
  return query;
}

/** Re-render every 30 seconds so "in 5 min" / "Starting now" stay true. */
function useNow(stepMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(t);
  }, [stepMs]);
  return now;
}

export function whenLabel(iso: string, now = Date.now()) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date(now);
  const tomorrow = new Date(now + 86_400_000);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return `Today, ${time}`;
  if (sameDay(d, tomorrow)) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

function relative(iso: string, now: number) {
  const ms = Date.parse(iso) - now;
  if (ms <= 60_000 && ms > -STILL_ON_MS) return ms > 0 ? "Starting now" : "Happening now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `in ${h} h`;
  const days = Math.round(h / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** Joinable from 10 minutes before the start until 90 minutes after. */
const joinable = (iso: string, now: number) => {
  const ms = Date.parse(iso) - now;
  return ms <= 10 * 60_000 && ms > -STILL_ON_MS;
};

/** The next scheduled call, shown under the header. */
export function UpcomingCallBanner({ calls, onJoin, onOpenAll }: {
  calls: ScheduledCall[];
  onJoin: (video: boolean) => void;
  onOpenAll: () => void;
}) {
  const now = useNow();
  const next = calls.find((c) => Date.parse(c.starts_at) > now - STILL_ON_MS);
  if (!next) return null;
  const canJoin = joinable(next.starts_at, now);
  const Icon = next.video ? Video : Phone;
  const more = calls.length - 1;
  return (
    <div className="relative z-10 mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-card px-3.5 py-2.5 shadow-[0_8px_24px_-18px_rgba(0,0,0,0.6)] ring-1 ring-foreground/[0.06]">
      <button type="button" onClick={onOpenAll} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#c3217e]/10 text-[#c3217e]">
          <CalendarDays className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold">{next.title}</span>
          <span className="flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
            <Icon className="h-3 w-3 shrink-0" /> {next.video ? "Video" : "Voice"} · {whenLabel(next.starts_at, now)} · {relative(next.starts_at, now)}
            {more > 0 ? ` · +${more} more` : ""}
          </span>
        </span>
      </button>
      {canJoin ? (
        <button type="button" onClick={() => onJoin(next.video)} className="shrink-0 rounded-full bg-[#16a34a] px-3.5 py-1.5 text-[12.5px] font-bold text-white">
          Join
        </button>
      ) : (
        <button type="button" onClick={onOpenAll} className="shrink-0 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
          {more > 0 ? "All" : "Details"}
        </button>
      )}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The form: title, voice or video, date and time. */
export function ScheduleCallSheet({ open, onOpenChange, groupId }: { open: boolean; onOpenChange: (open: boolean) => void; groupId: string }) {
  const queryClient = useQueryClient();
  const defaults = useMemo(() => {
    // The next round half hour, at least 30 minutes from now.
    const d = new Date(Date.now() + 30 * 60_000);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    return { date: localDate(d), time: localTime(d) };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [title, setTitle] = useState("");
  const [video, setVideo] = useState(true);
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(""); setVideo(true); setDate(defaults.date); setTime(defaults.time);
  }, [open, defaults]);

  const submit = async () => {
    const startsAt = new Date(`${date}T${time}`);
    if (!title.trim()) return toast.error("Give the call a title");
    if (Number.isNaN(startsAt.getTime())) return toast.error("Pick a date and time");
    if (startsAt.getTime() < Date.now() - 60_000) return toast.error("Pick a time in the future");
    setBusy(true);
    try {
      const label = `${startsAt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
      const { error } = await supabase.rpc("schedule_group_call" as never, {
        p_group: groupId, p_title: title.trim(), p_starts_at: startsAt.toISOString(), p_video: video, p_when_label: label,
      } as never);
      if (error) throw error;
      toast.success(`${video ? "Video" : "Voice"} call scheduled`, { description: "Everyone in the group gets a reminder 10 minutes before." });
      void queryClient.invalidateQueries({ queryKey: ["group-scheduled-calls", groupId] });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't schedule the call");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" overlayClassName="z-[90]" className="z-[100] mx-auto max-w-[560px] rounded-t-[28px] border-0 bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5">
        <SheetHeader className="p-0 pr-10 text-left">
          <SheetTitle className="font-display text-[20px] font-semibold">Schedule a call</SheetTitle>
          <p className="text-[13.5px] text-muted-foreground">Everyone in the group is notified now, reminded 10 minutes before, and told when it starts.</p>
        </SheetHeader>
        <div className="mt-5 space-y-4">
          <div role="radiogroup" aria-label="Call type" className="grid grid-cols-2 gap-1 rounded-full bg-foreground/[0.06] p-1">
            {([[true, "Video call", Video], [false, "Voice call", Phone]] as const).map(([value, label, Icon]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={video === value}
                onClick={() => setVideo(value)}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-full text-[13.5px] font-semibold transition ${video === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Weekly sync"
              className="h-11 w-full rounded-[12px] border border-foreground/15 bg-background px-3 text-[15px] outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Date</span>
              <input type="date" value={date} min={localDate(new Date())} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-[12px] border border-foreground/15 bg-background px-3 text-[15px] outline-none focus:border-foreground/40" />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Time</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 w-full rounded-[12px] border border-foreground/15 bg-background px-3 text-[15px] outline-none focus:border-foreground/40" />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="!mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#c3217e] text-[15.5px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarDays className="h-5 w-5" />}
            Schedule {video ? "video" : "voice"} call
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Every upcoming call, with Join when it's time and Cancel for whoever may. */
export function ScheduledCallsSheet({ open, onOpenChange, calls, myId, isAdmin, onJoin, onSchedule }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calls: ScheduledCall[];
  myId: string;
  isAdmin: boolean;
  onJoin: (video: boolean) => void;
  onSchedule: (() => void) | null;
}) {
  const queryClient = useQueryClient();
  const now = useNow();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const cancel = async (call: ScheduledCall) => {
    setCancelling(call.id);
    try {
      const { error } = await supabase.rpc("cancel_group_call_schedule" as never, { p_id: call.id } as never);
      if (error) throw error;
      toast.success("Scheduled call cancelled");
      void queryClient.invalidateQueries({ queryKey: ["group-scheduled-calls", call.group_id] });
    } catch (e) {
      toast.error((e as Error).message || "Couldn't cancel it");
    } finally {
      setCancelling(null);
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" overlayClassName="z-[90]" className="z-[100] mx-auto max-h-[85dvh] max-w-[560px] overflow-y-auto rounded-t-[28px] border-0 bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5">
        <SheetHeader className="p-0 pr-10 text-left">
          <SheetTitle className="font-display text-[20px] font-semibold">Scheduled calls</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2.5">
          {calls.length === 0 && <p className="py-6 text-center text-[13.5px] text-muted-foreground">No calls scheduled.</p>}
          {calls.map((call) => {
            const Icon = call.video ? Video : Phone;
            const canCancel = call.created_by === myId || isAdmin;
            return (
              <div key={call.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#c3217e]/10 text-[#c3217e]"><Icon className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{call.title}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{call.video ? "Video" : "Voice"} · {whenLabel(call.starts_at, now)} · {relative(call.starts_at, now)}</span>
                </span>
                {joinable(call.starts_at, now) && (
                  <button type="button" onClick={() => { onOpenChange(false); onJoin(call.video); }} className="shrink-0 rounded-full bg-[#16a34a] px-3.5 py-1.5 text-[12.5px] font-bold text-white">Join</button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    aria-label={`Cancel ${call.title}`}
                    disabled={cancelling === call.id}
                    onClick={() => void cancel(call)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-red-500 disabled:opacity-50"
                  >
                    {cancelling === call.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {onSchedule && (
          <button type="button" onClick={() => { onOpenChange(false); onSchedule(); }} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-[14px] font-semibold">
            <CalendarDays className="h-4 w-4" /> Schedule another call
          </button>
        )}
      </SheetContent>
    </Sheet>
  );
}
