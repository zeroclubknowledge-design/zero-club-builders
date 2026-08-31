import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, GripVertical, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/primitives";

interface DraftTask { key: string; title: string; description: string; required: boolean }

const blankTask = (): DraftTask => ({
  key: Math.random().toString(36).slice(2), title: "", description: "", required: true,
});

/**
 * Creating a campaign, tasks and all.
 *
 * The campaign is written first and its tasks second, because the tasks need
 * its id. If the task insert fails the campaign is deleted rather than left
 * behind — a campaign with no tasks is worse than no campaign, since a tester
 * can join it and find nothing to do.
 */
export function NewCampaign() {
  const { mvpId } = useParams({ from: "/build/$mvpId/campaign" });
  const navigate = useNavigate();
  const { session } = useAuth();

  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [testerLimit, setTesterLimit] = useState(20);
  const [zpReward, setZpReward] = useState(50);
  const [deadline, setDeadline] = useState("");
  const [tasks, setTasks] = useState<DraftTask[]>([blankTask()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filledTasks = tasks.filter((t) => t.title.trim().length >= 2);
  const valid =
    name.trim().length >= 2 &&
    testerLimit >= 1 && testerLimit <= 1000 &&
    zpReward >= 1 && zpReward <= 100000 &&
    filledTasks.length > 0;

  const updateTask = (key: string, patch: Partial<DraftTask>) =>
    setTasks((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const create = async (goLive: boolean) => {
    if (!session) { navigate({ to: "/signin" }); return; }
    setSaving(true);
    setError(null);

    const { data: campaign, error: e1 } = await supabase
      .from("zs_campaigns")
      .insert({
        mvp_id: mvpId,
        builder_id: session.user.id,
        name: name.trim(),
        objective: objective.trim() || null,
        tester_limit: testerLimit,
        zp_reward: zpReward,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        status: goLive ? "live" : "draft",
      })
      .select("id")
      .single();

    if (e1 || !campaign) { setSaving(false); setError(e1?.message || "Could not create the campaign."); return; }

    const { error: e2 } = await supabase.from("zs_tasks").insert(
      filledTasks.map((t, i) => ({
        campaign_id: campaign.id,
        title: t.title.trim(),
        description: t.description.trim() || null,
        position: i,
        required: t.required,
      }))
    );

    if (e2) {
      // Don't leave a joinable campaign with nothing in it.
      await supabase.from("zs_campaigns").delete().eq("id", campaign.id);
      setSaving(false);
      setError(e2.message);
      return;
    }

    setSaving(false);
    navigate({ to: "/build" });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/build" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Build
      </Link>

      <Card className="p-6 sm:p-8">
        <h1 className="text-[22px] font-bold text-ink">New campaign</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          Decide what you want tested, how many people you want, and what their time is worth.
        </p>

        <label className="mt-6 block">
          <span className="text-[13px] font-medium text-ink">Campaign name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Onboarding flow — first impressions"
            className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
          />
        </label>

        <label className="mt-5 block">
          <span className="text-[13px] font-medium text-ink">What are you trying to learn?</span>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            placeholder="The specific question this round should answer."
            className="mt-2 w-full resize-y rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
          />
        </label>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Number label="Testers" value={testerLimit} onChange={setTesterLimit} min={1} max={1000} />
          <Number label="ZP each" value={zpReward} onChange={setZpReward} min={1} max={100000} />
          <label className="block">
            <span className="text-[13px] font-medium text-ink">Deadline</span>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] text-ink outline-none transition focus:border-accent/50"
            />
          </label>
        </div>

        <p className="mt-3 text-[12px] text-ink-faint">
          Total if every seat fills: <span className="font-semibold text-ink-muted">
            {(testerLimit * zpReward).toLocaleString()} ZP
          </span>
        </p>

        <div className="mt-8">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">Tasks</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
            Small, checkable steps. "Sign up and create your first project" beats "try the app".
          </p>

          <div className="mt-4 space-y-3">
            {tasks.map((task, i) => (
              <div key={task.key} className="rounded-xl bg-white/[0.03] p-3.5">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="text-[11px] font-bold text-ink-faint">{i + 1}</span>
                  <input
                    value={task.title}
                    onChange={(e) => updateTask(task.key, { title: e.target.value })}
                    placeholder="What the tester should do"
                    className="min-w-0 flex-1 bg-transparent text-[13.5px] font-medium text-ink outline-none placeholder:text-ink-faint"
                  />
                  {tasks.length > 1 && (
                    <button
                      onClick={() => setTasks((p) => p.filter((t) => t.key !== task.key))}
                      className="shrink-0 rounded-lg p-1 text-ink-faint transition hover:text-bad"
                      aria-label="Remove task"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <input
                  value={task.description}
                  onChange={(e) => updateTask(task.key, { description: e.target.value })}
                  placeholder="Extra detail (optional)"
                  className="mt-2 w-full bg-transparent pl-[26px] text-[12.5px] text-ink-muted outline-none placeholder:text-ink-faint"
                />
                <label className="mt-2 flex cursor-pointer items-center gap-2 pl-[26px]">
                  <input
                    type="checkbox"
                    checked={task.required}
                    onChange={(e) => updateTask(task.key, { required: e.target.checked })}
                    className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                  />
                  <span className="text-[11.5px] text-ink-faint">Required to submit</span>
                </label>
              </div>
            ))}
          </div>

          <button
            onClick={() => setTasks((p) => [...p, blankTask()])}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/6 px-3.5 py-2 text-[12.5px] font-semibold text-ink-muted transition hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" /> Add task
          </button>
        </div>

        {error && (
          <p className="mt-5 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => create(true)}
            disabled={!valid || saving}
            className="zs-glow h-12 w-full shrink-0 rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1"
          >
            {saving ? "Creating…" : "Create and go live"}
          </button>
          <button
            onClick={() => create(false)}
            disabled={!valid || saving}
            className="h-12 w-full shrink-0 rounded-full bg-white/8 text-[14px] font-semibold text-ink transition hover:bg-white/12 disabled:opacity-40 sm:flex-1"
          >
            Save as draft
          </button>
        </div>
      </Card>
    </div>
  );
}

function Number({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min)))}
        className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] text-ink outline-none transition focus:border-accent/50"
      />
    </label>
  );
}
