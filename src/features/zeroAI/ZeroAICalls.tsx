import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getCachedSession } from "@/lib/auth";
import { Loader2, Phone } from "@/components/icons/glyphs";

export function ZeroAICalls({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [brief, setBrief] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retryIdentity = useRef<{ fingerprint: string; id: string } | null>(null);
  const queryClient = useQueryClient();
  const key = ["zero-ai-calls", userId];
  const calls = useQuery({
    queryKey: key,
    enabled: open,
    staleTime: 15000,
    refetchInterval: open ? 30000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zero_ai_calls")
        .select("id,destination,brief,scheduled_at,status")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  async function schedule(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const {
        data: { session },
      } = await getCachedSession();
      if (!session) throw new Error("Please sign in again.");
      const fingerprint = JSON.stringify({ destination: destination.trim(), brief, scheduledAt });
      if (retryIdentity.current?.fingerprint !== fingerprint)
        retryIdentity.current = { fingerprint, id: crypto.randomUUID() };
      const response = await fetch("/api/zero-ai/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          destination: destination.trim(),
          brief,
          confirmed,
          requestId: retryIdentity.current.id,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't schedule the call.");
      setDestination("");
      setBrief("");
      setScheduledAt("");
      setConfirmed(false);
      retryIdentity.current = null;
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't schedule the call.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setError("");
    const { data, error } = await supabase.rpc("cancel_zero_ai_call", { p_id: id });
    if (error || !data)
      setError("This call can no longer be cancelled. Refresh to see its status.");
    await queryClient.invalidateQueries({ queryKey: key });
  }

  async function end(id: string) {
    setError("");
    try {
      const {
        data: { session },
      } = await getCachedSession();
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch("/api/zero-ai/calls/end", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't end the call.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't end the call.");
    }
    await queryClient.invalidateQueries({ queryKey: key });
  }

  return (
    <section className="mt-5 rounded-2xl border border-border bg-card/70">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
      >
        <Phone className="h-4 w-4" /> AI phone calls{" "}
        <span className="ml-auto text-xs text-muted-foreground">{open ? "Close" : "Schedule"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Choose a person and a purpose. Zero AI introduces itself as an AI assistant and calls
            automatically at your chosen time.
          </p>
          <form onSubmit={(event) => void schedule(event)} className="space-y-3">
            <label className="block text-sm">
              Phone number
              <input
                type="tel"
                autoComplete="tel"
                required
                pattern="\+[1-9][0-9]{7,14}"
                maxLength={16}
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="+2348012345678"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5"
              />
            </label>
            <label className="block text-sm">
              Call purpose
              <textarea
                required
                maxLength={2000}
                rows={3}
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="What should Zero AI discuss or ask?"
                className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5"
              />
            </label>
            <label className="block text-sm">
              When to call
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                className="mt-1 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Your local time. Leave empty to call as soon as possible.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm leading-5">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-1"
              />{" "}
              I confirm this recipient and purpose, and they agreed to receive this AI call.
            </label>
            <button
              type="submit"
              disabled={busy || !confirmed}
              className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Schedule AI call
            </button>
          </form>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {calls.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your calls…</p>
          ) : calls.isError ? (
            <p className="text-sm text-muted-foreground">Phone calling is being set up.</p>
          ) : (
            calls.data?.map((call: any) => (
              <article key={call.id} className="rounded-xl bg-foreground/[0.04] px-3 py-3 text-sm">
                <p className="font-semibold">{call.destination}</p>
                <p className="mt-1 break-words text-muted-foreground">{call.brief}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(call.scheduled_at).toLocaleString()} ·{" "}
                  {
                    (
                      {
                        scheduled: "Scheduled",
                        dispatching: "Requesting call",
                        requested: "Call requested",
                        failed: "Couldn't place call",
                        unknown: "Status unknown — no automatic redial",
                        cancelled: "Cancelled",
                        ended: "Ended",
                      } as Record<string, string>
                    )[call.status]
                  }
                </p>
                {call.status === "scheduled" && (
                  <button
                    type="button"
                    onClick={() => void cancel(call.id)}
                    className="mt-2 text-xs font-semibold underline"
                  >
                    Cancel call
                  </button>
                )}
                {call.status === "requested" && (
                  <button
                    type="button"
                    onClick={() => void end(call.id)}
                    className="mt-2 text-xs font-semibold underline"
                  >
                    End call
                  </button>
                )}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
