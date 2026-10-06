import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useVapiVoice } from "./useVapiVoice";
import { VoiceWaveform, VoiceControls } from "./VoiceOverlay";
import { Loader2, Mic, Check } from "@/components/icons/glyphs";
import type { PublicationAttempt, PublicationPayload } from "./publication.types";
export type { PublicationAttempt } from "./publication.types";

export async function preparePublication(
  payload: Partial<PublicationPayload>,
  targetId: string | null,
) {
  const { data, error } = await supabase.rpc("prepare_project_publication", {
    p_payload: payload,
    p_target_id: targetId,
  });
  if (error) throw new Error(error.message);
  return data as PublicationAttempt;
}

/** Browser events only control the overlay. Approval always comes from the DB. */
export function ProjectPublishConfirmation({
  attempt,
  onReplace,
  onClose,
  onPublished,
}: {
  attempt: PublicationAttempt;
  onReplace: (attempt: PublicationAttempt) => void;
  onClose: () => void;
  onPublished: (id: string, attempt: PublicationAttempt) => void | Promise<void>;
}) {
  const voice = useVapiVoice();
  const queryClient = useQueryClient();
  const [textMode, setTextMode] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(() => Date.parse(attempt.expires_at) <= Date.now());
  const action = useRef(false);
  const mounted = useRef(true);
  const queryKey = ["project-confirmation", attempt.id];
  const result = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_publish_verifications")
        .select("id,status,expires_at,post_id")
        .eq("id", attempt.id)
        .single();
      if (error) throw error;
      return data as Pick<PublicationAttempt, "id" | "status" | "expires_at" | "post_id">;
    },
    refetchInterval: 1500,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const status = result.data?.status || attempt.status;
  const expiresAt = result.data?.expires_at || attempt.expires_at;
  const approved = status === "approved" && !expired && !result.isError;
  const terminal = ["denied", "cancelled", "published"].includes(status) || expired;

  // A structurally unchanged polling result need not rerender React Query.
  // Expire the UI explicitly so an old approval never stays visibly unlocked.
  useEffect(() => {
    const delay = Date.parse(expiresAt) - Date.now();
    setExpired(delay <= 0);
    const timer = setTimeout(() => setExpired(true), Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [attempt.id, expiresAt]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const channel = supabase
      .channel(`project-confirmation:${attempt.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "project_publish_verifications",
          filter: `id=eq.${attempt.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["project-confirmation", attempt.id] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [attempt.id, queryClient]);
  useEffect(() => {
    if (status !== "pending" || expired) voice.stop();
  }, [status, expired]);

  async function run(work: () => Promise<void>) {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "Couldn't complete confirmation. Try again.",
        );
    } finally {
      action.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function close() {
    voice.stop();
    await run(async () => {
      const { error } = await supabase.rpc("cancel_project_publication", { p_id: attempt.id });
      if (error) throw new Error("Couldn't cancel confirmation. Please try again.");
      onClose();
    });
  }
  async function useText() {
    voice.stop();
    await run(async () => {
      const { error } = await supabase.rpc("cancel_project_publication", { p_id: attempt.id });
      if (error) throw new Error(error.message);
      // Fresh attempt prevents delayed voice events from approving/denying a text fallback.
      const next = await preparePublication(attempt.payload, attempt.target_id);
      if (!mounted.current) return;
      setPhrase("");
      setTextMode(true);
      onReplace(next);
    });
  }
  async function confirmText() {
    await run(async () => {
      const { error } = await supabase.rpc("confirm_project_publication_text", {
        p_id: attempt.id,
        p_phrase: phrase,
      });
      if (error) throw new Error(error.message);
      await result.refetch();
    });
  }
  async function publish() {
    await run(async () => {
      const { data, error } = await supabase.rpc("publish_confirmed_project", { p_id: attempt.id });
      if (error) throw new Error(error.message);
      // Publication is atomic and idempotent; completion is never inferred from voice.
      await onPublished(data.id, attempt);
    });
  }
  const stateLabel = result.isError
    ? "Couldn't check confirmation"
    : status === "published"
      ? "Project published"
      : expired
        ? "Confirmation expired"
        : approved
          ? "Project authorized!"
          : status === "denied"
            ? "Publication declined"
            : status === "cancelled"
              ? "Confirmation cancelled"
              : voice.status === "connecting"
                ? "Connecting…"
                : voice.status === "connected"
                  ? "Confirm with Zero AI"
                  : voice.ended
                    ? "Checking confirmation…"
                    : "Confirm your project";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) void close();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-3xl border-border p-6 sm:rounded-3xl"
        closeClassName={busy ? "hidden" : undefined}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogTitle
          className={`text-center text-xl ${approved ? "text-green-600" : status === "denied" ? "text-destructive" : ""}`}
        >
          {stateLabel}
        </DialogTitle>
        <DialogDescription className="text-center">
          {attempt.target_id ? "Authorize updating" : "Authorize publishing"} this specific project.
          Voice confirms your intent using your signed-in account.
        </DialogDescription>
        <div className="rounded-2xl bg-muted/50 p-4 text-sm">
          <p className="font-semibold break-words">{attempt.project_name}</p>
          <p className="mt-1 text-muted-foreground">
            Version {attempt.payload.version_label} ·{" "}
            {attempt.payload.audience === "club" ? "Bootcamp club only" : "Public"}
          </p>
          {attempt.payload.available_for_use && (
            <p className="mt-1 text-muted-foreground">
              Available for use · {attempt.payload.license_type.replaceAll("_", " ")} license ·{" "}
              {attempt.payload.license_price.toLocaleString()} ZP
            </p>
          )}
        </div>
        {voice.status !== "idle" ? (
          <>
            <VoiceWaveform voice={voice} />
            <p role="status" className="text-center text-sm text-muted-foreground">
              {voice.status === "connecting"
                ? "Connecting your microphone…"
                : voice.muted
                  ? "Microphone muted"
                  : voice.assistantSpeaking
                    ? "Zero AI is speaking"
                    : "Listening to you"}
            </p>
            <VoiceControls voice={voice} onEnd={voice.stop} />
          </>
        ) : approved || status === "published" ? (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-500/10 text-green-600">
              <Check className="h-7 w-7" />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void publish()}
              className="rounded-full bg-green-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? "Publishing…"
                : status === "published"
                  ? "Continue to project"
                  : attempt.target_id
                    ? "Save authorized update"
                    : "Publish authorized project"}
            </button>
          </>
        ) : textMode && !terminal ? (
          <>
            <label className="text-sm" htmlFor="publish-confirmation-phrase">
              Type <strong className="break-words">PUBLISH {attempt.project_name}</strong> to
              authorize this project.
            </label>
            <input
              id="publish-confirmation-phrase"
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
              disabled={busy}
              autoComplete="off"
              className="min-w-0 rounded-xl border border-border bg-background p-3 text-sm"
            />
            <button
              type="button"
              disabled={busy || phrase !== `PUBLISH ${attempt.project_name}`}
              onClick={() => void confirmText()}
              className="rounded-full bg-[#cc208f] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Confirm publication
            </button>
          </>
        ) : (
          <>
            {!terminal && !voice.error && !voice.ended && (
              <button
                type="button"
                disabled={busy || result.isError}
                onClick={() =>
                  void voice.start({ purpose: "verification", verificationId: attempt.id })
                }
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#cc208f] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                <Mic className="h-4 w-4" />
                Start voice confirmation
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void useText()}
              className="rounded-full border border-border px-5 py-3 text-sm font-semibold disabled:opacity-40"
            >
              {terminal ? "Start a new text confirmation" : "Use text confirmation"}
            </button>
          </>
        )}
        {(error || voice.error || result.isError) && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error ||
              voice.error ||
              "Can't check the server's confirmation. Your project remains unpublished."}
          </p>
        )}
        {busy && (
          <p role="status" className="flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void close()}
          className="text-sm text-muted-foreground disabled:opacity-40"
        >
          {status === "published" ? "Close" : "Cancel publication"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
