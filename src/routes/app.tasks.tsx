import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  Loader2,
  Rocket,
  Share2,
  Star,
  Trophy,
  Users,
  Zap,
} from "@/components/icons/solar";
import { getQuests, claimQuestRewardAction } from "@/services/api";
import { useUser } from "@/hooks/useUser";
import { toast } from "sonner";
import { useGoBack } from "@/hooks/useGoBack";

/**
 * Tasks — the quests Zero Club sets, and the ZP for finishing them.
 *
 * The whole mechanism already existed in the database: admins write quests in
 * the admin dashboard, `getQuests` works out how far each person has got, and
 * `claim_daily_xp_quest` re-checks the criteria server-side before awarding
 * anything. What was missing was the screen where a learner sees them, so this
 * page is a view over that and invents no rules of its own.
 *
 * Progress is measured, never entered. You do not tick a task off here — you
 * post, or comment, or build the club, and the task notices.
 */

export const Route = createFileRoute("/app/tasks")({
  component: TasksPage,
});

/** Admins pick an icon by name in the dashboard; this is the other half. */
const QUEST_ICONS: Record<string, typeof Rocket> = {
  Rocket,
  Share2,
  Users,
  Star,
  Trophy,
  Zap,
};

function TasksPage() {
  const queryClient = useQueryClient();
  const goBack = useGoBack("/app");
  const { data: profile } = useUser();
  const [claiming, setClaiming] = useState<string | null>(null);

  const { data: quests = [], isLoading, error } = useQuery({
    queryKey: ["xp-quests", profile?.id],
    enabled: Boolean(profile?.id),
    retry: false,
    queryFn: getQuests,
  });

  const { ready, active, done } = useMemo(() => {
    const ready: any[] = [];
    const active: any[] = [];
    const done: any[] = [];
    for (const quest of quests as any[]) {
      if (quest.isClaimed) done.push(quest);
      else if (quest.isCompleted) ready.push(quest);
      else active.push(quest);
    }
    return { ready, active, done };
  }, [quests]);

  const claimable = ready.reduce((total, quest) => total + (Number(quest.reward_xp) || 0), 0);

  const claim = async (quest: any) => {
    setClaiming(quest.id);
    try {
      const result = await claimQuestRewardAction({ data: quest.id });
      toast.success(`+${result.reward || quest.reward_xp} ZP`, { description: quest.title });
      queryClient.invalidateQueries({ queryKey: ["xp-quests"] });
      queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
    } catch (error: any) {
      toast.error(error?.message || "Could not claim that task");
    } finally {
      setClaiming(null);
    }
  };

  const QuestCard = ({ quest }: { quest: any }) => {
    const Icon = QUEST_ICONS[quest.icon_name] || Rocket;
    const target = Math.max(1, Number(quest.criteria_count) || 1);
    const progress = Math.min(Number(quest.progress) || 0, target);
    const percent = Math.round((progress / target) * 100);
    const isReady = quest.isCompleted && !quest.isClaimed;

    return (
      <article className={`rounded-2xl p-4 transition ${quest.isClaimed ? "bg-card opacity-60" : "bg-card"}`}>
        <div className="flex items-start gap-3.5">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
              quest.isClaimed
                ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                : isReady
                  ? "bg-[#cc208f] text-white"
                  : "bg-primary/[0.08] text-primary"
            }`}
          >
            {quest.isClaimed ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Icon className="h-5 w-5" />}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[14.5px] font-semibold leading-snug tracking-tight">{quest.title}</h3>
              <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                +{quest.reward_xp} ZP
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{quest.description}</p>

            {/* The bar is the honest part: it shows what the database counted,
                not what anybody claims to have done. */}
            {target > 1 && !quest.isClaimed && (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10.5px] text-muted-foreground tabular-nums">
                  {progress} of {target}
                </p>
              </div>
            )}

            {isReady && (
              <button
                onClick={() => claim(quest)}
                disabled={claiming === quest.id}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-[13px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-60"
              >
                {claiming === quest.id ? <Loader2 className="h-4 w-4 animate-spin" /> : `Claim ${quest.reward_xp} ZP`}
              </button>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-28 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <button type="button" onClick={goBack}
            aria-label="Back"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Club</p>
            <h1 className="truncate text-[18px] font-semibold tracking-tight">Tasks</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 py-5 md:px-7 md:py-7">
        <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#241a2b] via-[#17131b] to-[#0e0c10] p-5 text-white shadow-[0_28px_65px_-40px_rgba(20,12,19,0.85)] ring-1 ring-black/10 sm:p-6">
          <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-[#cc208f]/22 blur-[70px]" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border-[20px] border-white opacity-[0.045]" />

          <div className="relative">
            {/* ZP, not XP. XP is the record of what someone has done and is
                deliberately not spendable; ZP is the balance quests pay into,
                which is why it is the number worth showing here. */}
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Your ZP</p>
            <h2 className="mt-2 text-[34px] font-semibold leading-none tracking-tight tabular-nums">
              {Number(profile?.zp || 0).toLocaleString()}
            </h2>
            <p className="mt-3 text-[12.5px] leading-relaxed text-white/55">
              {claimable > 0
                ? `${claimable} ZP waiting to be claimed.`
                : active.length > 0
                  ? "Finish a task below to earn more."
                  : "Nothing outstanding right now."}
            </p>
          </div>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl bg-card p-8 text-center">
            <h2 className="text-[15px] font-semibold tracking-tight text-destructive">Tasks could not load</h2>
            <p className="mx-auto mt-2 max-w-[44ch] text-[12.5px] leading-relaxed text-muted-foreground">
              {(error as any)?.message || "Something went wrong."}
            </p>
          </div>
        ) : isLoading ? (
          <div className="mt-8 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : quests.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-card px-4 py-12 text-center text-[12.5px] text-muted-foreground">
            No tasks are set at the moment. Check back.
          </p>
        ) : (
          <>
            {ready.length > 0 && (
              <section className="mt-6">
                <h3 className="px-1 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-[#cc208f]">
                  Ready to claim · {ready.length}
                </h3>
                <div className="mt-2.5 space-y-2.5">
                  {ready.map((quest) => <QuestCard key={quest.id} quest={quest} />)}
                </div>
              </section>
            )}

            {active.length > 0 && (
              <section className="mt-6">
                <h3 className="px-1 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  In progress · {active.length}
                </h3>
                <div className="mt-2.5 space-y-2.5">
                  {active.map((quest) => <QuestCard key={quest.id} quest={quest} />)}
                </div>
              </section>
            )}

            {done.length > 0 && (
              <section className="mt-6">
                <h3 className="px-1 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Claimed · {done.length}
                </h3>
                <div className="mt-2.5 space-y-2.5">
                  {done.map((quest) => <QuestCard key={quest.id} quest={quest} />)}
                </div>
              </section>
            )}
          </>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Tasks are set by Zero Club. Progress is counted from what you actually do.
        </p>
      </main>
    </div>
  );
}
