import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Check, ExternalLink, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { submitTest } from "@/lib/api";
import { externalUrl, readableError } from "@/lib/links";
import { clearSticky, useStickyState } from "@/lib/useStickyState";
import type { Campaign, Participation } from "@/types";
import { Card, ErrorState, Skeleton } from "@/components/ui/primitives";

/**
 * The tester's working screen: the tasks, then the feedback.
 *
 * Task ticks are written straight to the participation row as they happen
 * rather than held until submit, because testing a product means leaving this
 * tab — and progress that only exists in React state is progress lost the
 * moment someone comes back through a fresh page load.
 */

const REFUSAL: Record<string, string> = {
  rating_required: "Give the product a rating before submitting.",
  already_submitted: "You've already submitted this test.",
  not_yours: "This test isn't yours.",
  not_authenticated: "Your session expired — sign in again.",
};

export function TestFlow() {
  const { participationId } = useParams({ from: "/test/$participationId" });
  const navigate = useNavigate();

  const [participation, setParticipation] = useState<Participation | null | undefined>(undefined);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  /*
   * The written feedback survives a reload.
   *
   * This screen tells the tester to open the product, which means leaving the
   * tab — and on a phone that routinely gets the page discarded. Losing a
   * paragraph of considered feedback because we asked someone to go and look
   * at something is the single most annoying thing this app could do to the
   * people it depends on.
   *
   * Keyed per participation, so two tests in progress cannot overwrite each
   * other's notes.
   */
  const draftKey = `zs_draft_${participationId}`;
  const [rating, setRating] = useStickyState(`${draftKey}_rating`, 0);
  const [liked, setLiked] = useStickyState(`${draftKey}_liked`, "");
  const [confusing, setConfusing] = useStickyState(`${draftKey}_confusing`, "");
  const [suggestions, setSuggestions] = useStickyState(`${draftKey}_suggestions`, "");
  const [additional, setAdditional] = useStickyState(`${draftKey}_additional`, "");
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const load = () => {
    setError(null);
    supabase
      .from("zs_participations")
      .select(`*, campaign:zs_campaigns (*, mvp:zs_mvps (*), tasks:zs_tasks (*))`)
      .eq("id", participationId)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e) { setError(readableError(e.message)); return; }
        const row = data as unknown as Participation | null;
        setParticipation(row);
        const c = (row?.campaign as Campaign) || null;
        if (c?.tasks) c.tasks.sort((a, b) => a.position - b.position);
        setCampaign(c);
        setDone(new Set(row?.completed_task_ids || []));
      });
  };

  useEffect(load, [participationId]);

  /* Persist immediately, and optimistically: a tick that waits for the network
     feels broken, and the write is small enough that a failure can simply
     restore the previous set. */
  const toggleTask = async (taskId: string) => {
    const next = new Set(done);
    next.has(taskId) ? next.delete(taskId) : next.add(taskId);
    const previous = done;
    setDone(next);

    const { error: e } = await supabase
      .from("zs_participations")
      .update({ completed_task_ids: [...next] })
      .eq("id", participationId);

    if (e) setDone(previous);
  };

  const submit = async () => {
    setSubmitting(true);
    setRefusal(null);
    try {
      const result = await submitTest({
        participationId,
        rating,
        liked: liked.trim() || undefined,
        confusing: confusing.trim() || undefined,
        suggestions: suggestions.trim() || undefined,
        additional: additional.trim() || undefined,
      });
      if (!result.ok) {
        setRefusal(REFUSAL[result.reason || ""] || "Could not submit this test.");
        return;
      }
      ["rating", "liked", "confusing", "suggestions", "additional"]
        .forEach((field) => clearSticky(`${draftKey}_${field}`));
      navigate({ to: "/tests" });
    } catch (e) {
      setRefusal((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (participation === undefined) return <Skeleton className="h-[600px] rounded-[18px]" />;
  if (!participation || !campaign) return <ErrorState message="This test could not be found." />;

  const mvp = campaign.mvp;
  const link = externalUrl(mvp?.zerohub_url) || externalUrl(mvp?.website_url);
  const tasks = campaign.tasks || [];
  const requiredLeft = tasks.filter((t) => t.required && !done.has(t.id)).length;
  const alreadySubmitted = participation.status !== "started";
  const canSubmit = rating > 0 && requiredLeft === 0 && !submitting && !alreadySubmitted;

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/tests" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> My tests
      </Link>

      <Card className="p-6 sm:p-7">
        <h1 className="text-[20px] font-bold text-ink">{mvp?.name}</h1>
        <p className="mt-1 text-[13px] text-ink-muted">{campaign.name}</p>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-ink transition hover:opacity-90"
          >
            Open the product <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </Card>

      {alreadySubmitted && (
        <Card className="mt-4 p-5">
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            You've submitted this test. The builder will review it, and your ZP arrives once
            they approve.
          </p>
        </Card>
      )}

      {tasks.length > 0 && (
        <Card className="mt-4 p-6 sm:p-7">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">
            Tasks · {done.size} of {tasks.length}
          </h2>
          <div className="mt-4 space-y-2">
            {tasks.map((task) => {
              const checked = done.has(task.id);
              return (
                <button
                  key={task.id}
                  onClick={() => !alreadySubmitted && toggleTask(task.id)}
                  disabled={alreadySubmitted}
                  className={`flex w-full gap-3 rounded-xl p-3 text-left transition ${
                    alreadySubmitted ? "cursor-default" : "hover:bg-ink/[0.04]"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                      checked ? "border-accent bg-accent text-accent-ink" : "border-ink/25"
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[13.5px] font-medium ${checked ? "text-ink-faint line-through" : "text-ink"}`}>
                      {task.title}
                      {!task.required && <span className="ml-2 text-[11px] font-normal text-ink-faint">optional</span>}
                    </span>
                    {task.description && (
                      <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-muted">
                        {task.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {!alreadySubmitted && (
        <Card className="mt-4 p-6 sm:p-7">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">Your feedback</h2>

          <div className="mt-4">
            <p className="text-[13px] font-medium text-ink">Overall, how is it?</p>
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} aria-label={`${n} out of 5`} className="p-1">
                  <Star
                    className={`h-7 w-7 transition ${n <= rating ? "fill-accent text-accent" : "text-ink/15"}`}
                  />
                </button>
              ))}
            </div>
          </div>

          <Field label="What worked well?" value={liked} onChange={setLiked}
            placeholder="The part that felt good to use…" />
          <Field label="What was confusing?" value={confusing} onChange={setConfusing}
            placeholder="Where you got stuck, or had to guess…" />
          <Field label="What would you change?" value={suggestions} onChange={setSuggestions}
            placeholder="One concrete change you'd make…" />
          <Field label="Anything else?" value={additional} onChange={setAdditional}
            placeholder="Optional." />

          {refusal && (
            <p className="mt-5 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{refusal}</p>
          )}

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="zs-glow mt-6 h-12 w-full rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </button>

          {/* Say why the button is off rather than leaving it mysteriously dim. */}
          {!canSubmit && !submitting && (
            <p className="mt-3 text-center text-[12px] text-ink-faint">
              {rating === 0
                ? "Add a rating to submit."
                : requiredLeft > 0
                ? `${requiredLeft} required ${requiredLeft === 1 ? "task" : "tasks"} left.`
                : ""}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="mt-2 w-full resize-y rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
      />
    </label>
  );
}
