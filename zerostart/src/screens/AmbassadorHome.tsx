import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Clock, MapPin, X } from "lucide-react";
import { getMe, listFocusAreas, listTasks, submitTask } from "@/lib/ambassadorApi";
import { useAuth } from "@/lib/auth";
import type { AmbassadorMe, AmbassadorTask, FocusArea } from "@/types/ambassador";
import { nextLevel } from "@/types/ambassador";
import { Card, EmptyState, ErrorState, Skeleton, ZpBadge } from "@/components/ui/primitives";

/**
 * What an ambassador sees: where they stand, and what to do next.
 *
 * The old home page was a board of other people's products to test. This one
 * is about the person looking at it — their level, their levers, and the tasks
 * that move them up.
 */
export function AmbassadorHome() {
  const { session, loading: authLoading } = useAuth();
  const [me, setMe] = useState<AmbassadorMe | null>(null);
  const [tasks, setTasks] = useState<AmbassadorTask[] | null>(null);
  const [areas, setAreas] = useState<FocusArea[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!session) return;
    setError(null);
    getMe().then(setMe).catch((e) => setError(e.message || "Could not load your profile."));
    listTasks().then(setTasks).catch(() => setTasks([]));
    listFocusAreas().then(setAreas).catch(() => setAreas([]));
  };

  useEffect(load, [session?.user?.id]);

  if (authLoading) return <Skeleton className="h-[420px] rounded-[18px]" />;

  if (!session) {
    return (
      <EmptyState
        title="Sign in to get started"
        body="Zero Ambassadors grow Zero Club where they are — on campus, in their city, in their community — and earn ZP for the work."
        action={
          <Link to="/signin" className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-ink">
            Sign in
          </Link>
        }
      />
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!me) return <Skeleton className="h-[420px] rounded-[18px]" />;

  if (!me.found) {
    return (
      <EmptyState
        title="Become a Zero Ambassador"
        body="Pick where you represent and what you'll push. Complete tasks set by the Zero Club team, earn ZP, and climb the levels."
        action={
          <Link to="/join" className="zs-glow rounded-full bg-accent px-6 py-3 text-[13.5px] font-semibold text-accent-ink">
            Get started
          </Link>
        }
      />
    );
  }

  const approved = me.tasks_approved ?? 0;
  const next = nextLevel(approved);
  const labelFor = (slug: string) => areas.find((a) => a.slug === slug)?.label ?? slug;

  return (
    <div>
      <Card className="p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">{me.level}</p>
            <h1 className="mt-1.5 text-[24px] font-bold leading-tight text-ink sm:text-[28px]">
              Your ambassador work
            </h1>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
              <MapPin className="h-3.5 w-3.5" /> {me.location}
              {me.country ? `, ${me.country}` : ""}
            </p>
          </div>
          <Link
            to="/join"
            className="rounded-full bg-ink/[0.06] px-4 py-2 text-[12.5px] font-semibold text-ink transition hover:bg-ink/10"
          >
            Edit
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="Tasks approved" value={String(approved)} />
          <Stat label="Awaiting review" value={String(me.tasks_submitted ?? 0)} />
          <Stat label="ZP earned" value={(me.zp_earned ?? 0).toLocaleString()} accent />
        </div>

        {/* Progress is shown as "how many more", not a percentage. A person
            wants to know what it takes, not how far along a bar they are. */}
        {next && (
          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="text-ink-muted">
                <span className="font-semibold text-ink">{next.approved - approved}</span> more
                approved {next.approved - approved === 1 ? "task" : "tasks"} to reach{" "}
                <span className="font-semibold text-ink">{next.level}</span>
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${Math.min(100, (approved / next.approved) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {(me.focus || []).length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {(me.focus || []).map((slug) => (
              <span key={slug} className="zs-inset rounded-full px-3 py-1.5 text-[11.5px] font-semibold text-ink-muted">
                {labelFor(slug)}
              </span>
            ))}
          </div>
        )}
      </Card>

      <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-wider text-ink-faint">
        Tasks from Zero Club
      </h2>

      {!tasks && <Skeleton className="h-[160px] rounded-[18px]" />}

      {tasks && tasks.length === 0 && (
        <EmptyState
          title="No tasks yet"
          body="The Zero Club team sets tasks for ambassadors. When one is published it appears here."
        />
      )}

      {tasks && tasks.length > 0 && (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard key={task.quest_id} task={task} onDone={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="zs-inset rounded-xl p-3.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-1.5 font-display text-[19px] font-bold ${accent ? "text-accent" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

const REFUSAL: Record<string, string> = {
  not_an_ambassador: "Finish setting up your ambassador profile first.",
  task_unavailable: "This task is no longer open.",
  already_submitted: "You've already sent this one in.",
};

function TaskCard({ task, onDone }: { task: AmbassadorTask; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await submitTask(task.quest_id, evidence.trim() || undefined, url.trim() || undefined);
      if (!result.ok) {
        setError(REFUSAL[result.reason || ""] || "Could not send that.");
        return;
      }
      setOpen(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const state = task.my_status;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-semibold text-ink">{task.title}</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{task.description}</p>
        </div>
        <ZpBadge amount={task.reward} />
      </div>

      {state === "approved" && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ok">
          <Check className="h-3.5 w-3.5" /> Approved — {task.reward} ZP paid
        </p>
      )}

      {state === "submitted" && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-warn">
          <Clock className="h-3.5 w-3.5" /> Waiting on the Zero Club team
        </p>
      )}

      {state === "rejected" && (
        <div className="mt-4">
          <p className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-bad">
            <X className="h-3.5 w-3.5" /> Not approved
          </p>
          {task.note && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">{task.note}</p>
          )}
        </div>
      )}

      {state === "available" && !open && (
        <button
          onClick={() => setOpen(true)}
          className="zs-glow mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-5 text-[12.5px] font-semibold text-accent-ink transition hover:opacity-90"
        >
          I've done this <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      )}

      {state === "available" && open && (
        <div className="mt-4 border-t border-line pt-4">
          {/* Evidence, because nothing in the database can prove a meetup
              happened — a person has to look at something. */}
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            rows={3}
            placeholder="What did you do? Numbers help — how many people, where, when."
            className="w-full resize-y rounded-lg border border-line bg-bg px-3.5 py-3 text-[13px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link to a post, photo, or screenshot (optional)"
            className="mt-2.5 h-11 w-full rounded-lg border border-line bg-bg px-3.5 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
          />

          {error && (
            <p className="mt-3 rounded-lg bg-bad/12 px-3.5 py-2.5 text-[12.5px] font-medium text-bad">{error}</p>
          )}

          <div className="mt-3 flex gap-2.5">
            <button
              onClick={send}
              disabled={busy || evidence.trim().length < 10}
              className="h-10 flex-1 rounded-full bg-accent text-[12.5px] font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send for review"}
            </button>
            <button
              onClick={() => { setOpen(false); setError(null); }}
              className="h-10 rounded-full bg-ink/[0.06] px-5 text-[12.5px] font-semibold text-ink-muted transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
          {evidence.trim().length < 10 && !busy && (
            <p className="mt-2 text-[11.5px] text-ink-faint">
              Say what you did — the team needs something to go on.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
