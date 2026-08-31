import { useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import type { Campaign, TestingTask } from "@/types";

/**
 * One form for creating a campaign and for editing one.
 *
 * They were going to be two screens with the same nine fields, which is two
 * places to add a field and one place to forget. The only real difference is
 * what the buttons say and what happens on save, so those are props and
 * everything else is shared.
 */

export interface DraftTask {
  key: string;
  id?: string;          // present once it exists in the database
  title: string;
  description: string;
  required: boolean;
}

export interface CampaignDraft {
  name: string;
  objective: string;
  testerLimit: number;
  zpReward: number;
  deadline: string;
  tasks: DraftTask[];
}

export const blankTask = (): DraftTask => ({
  key: Math.random().toString(36).slice(2), title: "", description: "", required: true,
});

/** A yyyy-mm-dd value for a date input, which will not accept a full ISO string. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function draftFromCampaign(campaign: Campaign, tasks: TestingTask[]): CampaignDraft {
  return {
    name: campaign.name,
    objective: campaign.objective || "",
    testerLimit: campaign.tester_limit,
    zpReward: campaign.zp_reward,
    deadline: toDateInput(campaign.deadline),
    tasks: [...tasks]
      .sort((a, b) => a.position - b.position)
      .map((t) => ({
        key: t.id, id: t.id, title: t.title,
        description: t.description || "", required: t.required,
      })),
  };
}

export const emptyDraft = (): CampaignDraft => ({
  name: "", objective: "", testerLimit: 20, zpReward: 50, deadline: "", tasks: [blankTask()],
});

export function filledTasks(draft: CampaignDraft) {
  return draft.tasks.filter((t) => t.title.trim().length >= 2);
}

export function isValid(draft: CampaignDraft) {
  return (
    draft.name.trim().length >= 2 &&
    draft.testerLimit >= 1 && draft.testerLimit <= 1000 &&
    draft.zpReward >= 1 && draft.zpReward <= 100000 &&
    filledTasks(draft).length > 0
  );
}

export interface CampaignFormProps {
  draft: CampaignDraft;
  onChange: (next: CampaignDraft) => void;
  /**
   * Seats already taken. Once anyone has joined, the reward cannot be lowered
   * and the limit cannot go below this — the database enforces both, and these
   * inputs simply stop offering the impossible.
   */
  seatsTaken?: number;
}

export function CampaignForm({ draft, onChange, seatsTaken = 0 }: CampaignFormProps) {
  const [taskError, setTaskError] = useState<string | null>(null);
  const set = (patch: Partial<CampaignDraft>) => onChange({ ...draft, ...patch });

  const updateTask = (key: string, patch: Partial<DraftTask>) =>
    set({ tasks: draft.tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)) });

  const removeTask = (task: DraftTask) => {
    // A saved task might have been completed by somebody, in which case the
    // database refuses the delete. Saying so here beats a failed save later.
    if (task.id && seatsTaken > 0) {
      setTaskError("Tasks can't be removed once testers have joined. Reword it instead.");
      return;
    }
    setTaskError(null);
    set({ tasks: draft.tasks.filter((t) => t.key !== task.key) });
  };

  const locked = seatsTaken > 0;

  return (
    <>
      <label className="mt-6 block">
        <span className="text-[13px] font-medium text-ink">Campaign name</span>
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Onboarding flow — first impressions"
          className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
        />
      </label>

      <label className="mt-5 block">
        <span className="text-[13px] font-medium text-ink">What are you trying to learn?</span>
        <textarea
          value={draft.objective}
          onChange={(e) => set({ objective: e.target.value })}
          rows={3}
          placeholder="The specific question this round should answer."
          className="mt-2 w-full resize-y rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
        />
      </label>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <NumberField
          label="Testers"
          value={draft.testerLimit}
          onChange={(v) => set({ testerLimit: v })}
          min={Math.max(1, seatsTaken)}
          max={1000}
          hint={locked ? `${seatsTaken} seat${seatsTaken === 1 ? "" : "s"} taken` : undefined}
        />
        <NumberField
          label="ZP each"
          value={draft.zpReward}
          onChange={(v) => set({ zpReward: v })}
          min={1}
          max={100000}
          hint={locked ? "Can only go up" : undefined}
        />
        <label className="block">
          <span className="text-[13px] font-medium text-ink">Deadline</span>
          <input
            type="date"
            value={draft.deadline}
            onChange={(e) => set({ deadline: e.target.value })}
            className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] text-ink outline-none transition focus:border-accent/50"
          />
        </label>
      </div>

      <p className="mt-3 text-[12px] text-ink-faint">
        Total if every seat fills:{" "}
        <span className="font-semibold text-ink-muted">
          {(draft.testerLimit * draft.zpReward).toLocaleString()} ZP
        </span>
      </p>

      <div className="mt-8">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink-faint">Tasks</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          Small, checkable steps. "Sign up and create your first project" beats "try the app".
        </p>

        <div className="mt-4 space-y-3">
          {draft.tasks.map((task, i) => (
            <div key={task.key} className="rounded-xl bg-ink/[0.03] p-3.5">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="text-[11px] font-bold text-ink-faint">{i + 1}</span>
                <input
                  value={task.title}
                  onChange={(e) => updateTask(task.key, { title: e.target.value })}
                  placeholder="What the tester should do"
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] font-medium text-ink outline-none placeholder:text-ink-faint"
                />
                {draft.tasks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTask(task)}
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

        {taskError && (
          <p className="mt-3 rounded-xl bg-warn/10 px-3.5 py-2.5 text-[12px] font-medium text-warn">
            {taskError}
          </p>
        )}

        <button
          type="button"
          onClick={() => set({ tasks: [...draft.tasks, blankTask()] })}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3.5 py-2 text-[12.5px] font-semibold text-ink-muted transition hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" /> Add task
        </button>
      </div>
    </>
  );
}

function NumberField({ label, value, onChange, min, max, hint }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; hint?: string;
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
      {hint && <span className="mt-1.5 block text-[11.5px] text-ink-faint">{hint}</span>}
    </label>
  );
}
