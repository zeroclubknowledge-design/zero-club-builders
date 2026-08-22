import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Flame,
  Loader2,
  Plus,
  Trash2,
  X,
} from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { toast } from "sonner";

/**
 * What you owe yourself.
 *
 * The app is full of things other people are expecting from you — cohort
 * deadlines, club activity, briefs. This is the other list, and it is private:
 * no sharing, no assigning, nobody else can read it. A task list a tutor can
 * see stops being an honest one within a week.
 */

export const Route = createFileRoute("/app/tasks")({
  component: TasksPage,
});

type Task = {
  id: string;
  title: string;
  note: string | null;
  priority: "low" | "normal" | "high";
  due_on: string | null;
  done_at: string | null;
  position: number;
  created_at: string;
};

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  high: "High",
  normal: "Normal",
  low: "Low",
};

function dueLabel(due: string | null) {
  if (!due) return null;
  const date = new Date(`${due}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return { text: days === -1 ? "Yesterday" : `${Math.abs(days)} days ago`, overdue: true };
  if (days === 0) return { text: "Today", overdue: false, urgent: true };
  if (days === 1) return { text: "Tomorrow", overdue: false, urgent: true };
  if (days <= 6) return { text: date.toLocaleDateString(undefined, { weekday: "long" }), overdue: false };
  return { text: date.toLocaleDateString(undefined, { day: "numeric", month: "short" }), overdue: false };
}

function TasksPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useUser();

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [dueOn, setDueOn] = useState("");
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: ["user-tasks", profile?.id],
    enabled: Boolean(profile?.id),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_tasks")
        .select("*")
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  const { open, done } = useMemo(() => {
    const open: Task[] = [];
    const done: Task[] = [];
    for (const task of tasks) (task.done_at ? done : open).push(task);

    // Overdue first, then by how soon, then by priority. A list sorted only by
    // when it was written buries the thing that is due today.
    const weight = { high: 0, normal: 1, low: 2 } as const;
    open.sort((a, b) => {
      const aDue = a.due_on ? new Date(a.due_on).getTime() : Infinity;
      const bDue = b.due_on ? new Date(b.due_on).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return weight[a.priority] - weight[b.priority];
    });
    return { open, done };
  }, [tasks]);

  const addTask = async () => {
    const text = title.trim();
    if (!text) return;

    setAdding(true);
    try {
      const { error } = await supabase.from("user_tasks").insert({
        profile_id: profile!.id,
        title: text,
        priority,
        due_on: dueOn || null,
      });
      if (error) throw error;
      setTitle("");
      setDueOn("");
      setPriority("normal");
      queryClient.invalidateQueries({ queryKey: ["user-tasks"] });
    } catch (error: any) {
      toast.error(error?.message || "Could not add that task");
    } finally {
      setAdding(false);
    }
  };

  const toggleTask = async (task: Task) => {
    try {
      const { error } = await supabase
        .from("user_tasks")
        .update({ done_at: task.done_at ? null : new Date().toISOString() })
        .eq("id", task.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["user-tasks"] });
    } catch (error: any) {
      toast.error(error?.message || "Could not update that task");
    }
  };

  const removeTask = async (task: Task) => {
    try {
      const { error } = await supabase.from("user_tasks").delete().eq("id", task.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["user-tasks"] });
    } catch (error: any) {
      toast.error(error?.message || "Could not delete that task");
    }
  };

  const overdue = open.filter((task) => task.due_on && dueLabel(task.due_on)?.overdue).length;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-28 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <Link
            to="/app"
            aria-label="Back"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Club</p>
            <h1 className="truncate text-[18px] font-semibold tracking-tight">Tasks</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 py-5 md:px-7 md:py-7">
        {/* The state of play, before the list itself. */}
        <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#241a2b] via-[#17131b] to-[#0e0c10] p-5 text-white shadow-[0_28px_65px_-40px_rgba(20,12,19,0.85)] ring-1 ring-black/10 sm:p-6">
          <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-[#cc208f]/22 blur-[70px]" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border-[20px] border-white opacity-[0.045]" />

          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Today</p>
            <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
              {open.length === 0
                ? "Nothing outstanding"
                : `${open.length} thing${open.length === 1 ? "" : "s"} to do`}
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
              {overdue > 0
                ? `${overdue} past its date.`
                : open.length === 0
                  ? "Add the next one when it turns up."
                  : "Private to you — nobody else can see this list."}
            </p>
          </div>
        </section>

        {/* Composer. One line, because a task you have to fill a form to add is
            a task you do not add. */}
        <section className="mt-5 rounded-2xl bg-card p-4">
          <div className="flex items-center gap-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") addTask(); }}
              placeholder="What needs doing?"
              className="min-w-0 flex-1 rounded-lg bg-background px-3.5 py-3 text-[14px] outline-none transition focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={addTask}
              disabled={adding || !title.trim()}
              aria-label="Add task"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-foreground text-background transition active:scale-95 disabled:opacity-40"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["low", "normal", "high"] as const).map((level) => (
              <button
                key={level}
                onClick={() => setPriority(level)}
                className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
                  priority === level
                    ? level === "high"
                      ? "bg-[#cc208f] text-white"
                      : "bg-foreground text-background"
                    : "bg-background text-muted-foreground"
                }`}
              >
                {PRIORITY_LABEL[level]}
              </button>
            ))}

            <label className="ml-auto flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-[11.5px] text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <input
                type="date"
                value={dueOn}
                onChange={(event) => setDueOn(event.target.value)}
                className="bg-transparent text-[11.5px] text-foreground outline-none"
              />
              {dueOn && (
                <button onClick={() => setDueOn("")} aria-label="Clear date" className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </label>
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl bg-card p-8 text-center">
            <h2 className="text-[15px] font-semibold tracking-tight text-destructive">Tasks could not load</h2>
            <p className="mx-auto mt-2 max-w-[44ch] text-[12.5px] leading-relaxed text-muted-foreground">
              {(error as any)?.message || "Something went wrong."}
            </p>
            <p className="mx-auto mt-3 max-w-[44ch] text-[11.5px] leading-relaxed text-muted-foreground">
              If this mentions a missing table, the tasks migration has not been run yet.
            </p>
          </div>
        ) : isLoading ? (
          <div className="mt-8 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mt-5 space-y-2">
              {open.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                  Your list is clear.
                </p>
              ) : (
                open.map((task) => {
                  const due = dueLabel(task.due_on);
                  return (
                    <article key={task.id} className="group flex items-start gap-3 rounded-2xl bg-card p-4">
                      <button
                        onClick={() => toggleTask(task)}
                        aria-label={`Mark "${task.title}" done`}
                        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border transition hover:border-foreground/40"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-medium leading-snug">{task.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {task.priority === "high" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#cc208f]/12 px-2 py-0.5 text-[10.5px] font-semibold text-[#cc208f]">
                              <Flame className="h-3 w-3" /> High
                            </span>
                          )}
                          {due && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                                due.overdue
                                  ? "bg-destructive/10 text-destructive"
                                  : due.urgent
                                    ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                                    : "bg-foreground/[0.05] text-muted-foreground"
                              }`}
                            >
                              <CalendarDays className="h-3 w-3" /> {due.text}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => removeTask(task)}
                        aria-label={`Delete "${task.title}"`}
                        className="shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive focus:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </article>
                  );
                })
              )}
            </div>

            {done.length > 0 && (
              <section className="mt-6">
                <button
                  onClick={() => setShowDone((value) => !value)}
                  className="flex w-full items-center justify-between px-1 text-left"
                >
                  <span className="text-[12.5px] font-semibold text-muted-foreground">
                    Done · {done.length}
                  </span>
                  <span className="text-[11.5px] font-semibold text-primary">
                    {showDone ? "Hide" : "Show"}
                  </span>
                </button>

                {showDone && (
                  <div className="mt-2 space-y-2">
                    {done.map((task) => (
                      <article key={task.id} className="group flex items-center gap-3 rounded-2xl bg-card p-4 opacity-60">
                        <button
                          onClick={() => toggleTask(task)}
                          aria-label={`Mark "${task.title}" not done`}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </button>
                        <p className="min-w-0 flex-1 truncate text-[14px] line-through">{task.title}</p>
                        <button
                          onClick={() => removeTask(task)}
                          aria-label={`Delete "${task.title}"`}
                          className="shrink-0 text-muted-foreground transition hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
