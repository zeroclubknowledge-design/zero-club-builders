import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Check,
  ArrowLeft,
  Loader2,
  Rocket,
  Share2,
  Star,
  Trophy,
  Users,
  Zap,
} from "@/components/icons/glyphs";
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

  const QuestRow = ({ quest }: { quest: any }) => {
    const Icon = QUEST_ICONS[quest.icon_name] || Rocket;
    const target = Math.max(1, Number(quest.criteria_count) || 1);
    const progress = Math.min(Number(quest.progress) || 0, target);
    const percent = Math.round((progress / target) * 100);
    const isReady = quest.isCompleted && !quest.isClaimed;

    return (
      <article className={`border-t border-border/60 px-4 py-3.5 ${quest.isClaimed ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${
              quest.isClaimed
                ? "bg-[#1a7f4b]/10 text-[#1a7f4b]"
                : isReady
                  ? "bg-[#cc208f] text-white"
                  : "bg-foreground/[0.05] text-foreground"
            }`}
          >
            {quest.isClaimed ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className={`text-[15px] font-medium leading-snug ${quest.isClaimed ? "line-through" : ""}`}>{quest.title}</h3>
            {quest.description && <p className="text-[13px] leading-snug text-muted-foreground">{quest.description}</p>}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold tabular-nums ${quest.isClaimed ? "bg-[#1a7f4b]/10 text-[#1a7f4b]" : "bg-[#cc208f]/10 text-[#a3186f]"}`}>
            +{quest.reward_xp}
          </span>
        </div>

        {/* The bar is the honest part: it shows what the database counted,
            not what anybody claims to have done. */}
        {target > 1 && !quest.isClaimed && !isReady && (
          <div className="ml-[52px] mt-2">
            <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
              <div className="h-full rounded-full bg-[#cc208f] transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground tabular-nums">{progress} of {target}</p>
          </div>
        )}

        {isReady && (
          <button
            onClick={() => claim(quest)}
            disabled={claiming === quest.id}
            className="ml-[52px] mt-2.5 flex h-9 w-[calc(100%-52px)] items-center justify-center gap-2 rounded-full bg-foreground text-[14px] font-semibold text-background transition active:scale-[0.98] disabled:opacity-60"
          >
            {claiming === quest.id ? <Loader2 className="h-4 w-4 animate-spin" /> : `Claim ${quest.reward_xp} ZP`}
          </button>
        )}
      </article>
    );
  };

  const group = (title: string, items: any[], tone = "text-muted-foreground", last = false) =>
    items.length > 0 && (
      <section className={`bg-card md:overflow-hidden md:rounded-xl md:border md:border-border ${last ? "flex-1 pb-28 md:flex-none md:pb-0" : ""}`}>
        <h2 className={`px-4 pb-2 pt-4 text-[13px] font-semibold uppercase tracking-[0.04em] ${tone}`}>{title} · {items.length}</h2>
        {items.map((quest) => <QuestRow key={quest.id} quest={quest} />)}
      </section>
    );

  const lastGroup = done.length ? "done" : active.length ? "active" : "ready";

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-canvas text-foreground">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button type="button" onClick={goBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Tasks</h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        {/* ZP, not XP. XP is the record of what someone has done and is
            deliberately not spendable; ZP is the balance tasks pay into. */}
        <section className="flex items-center gap-3 bg-card p-4 md:rounded-xl md:border md:border-border">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted-foreground">Zero Points</p>
            <p className="font-display text-[30px] font-semibold leading-tight tabular-nums">
              {Number(profile?.zp || 0).toLocaleString()} <span className="text-[16px] text-[#a3186f]">ZP</span>
            </p>
            <p className="text-[13px] text-muted-foreground">
              {claimable > 0
                ? `${claimable} ZP waiting to be claimed`
                : active.length > 0
                  ? "Finish a task below to earn more"
                  : "Nothing outstanding right now"}
            </p>
          </div>
          <Link to="/app/wallet/add-money" className="flex h-9 shrink-0 items-center rounded-full border-[1.5px] border-foreground px-3.5 text-[14px] font-semibold hover:bg-foreground/[0.04]">
            Convert
          </Link>
        </section>

        {error ? (
          <div className="flex-1 bg-card px-6 py-14 text-center md:rounded-xl md:border md:border-border">
            <h2 className="text-[16px] font-semibold text-destructive">Tasks could not load</h2>
            <p className="mx-auto mt-2 max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
              {(error as any)?.message || "Something went wrong."}
            </p>
          </div>
        ) : isLoading ? (
          <div className="grid flex-1 place-items-center bg-card py-14">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : quests.length === 0 ? (
          <p className="flex-1 bg-card px-4 py-14 text-center text-[14px] text-muted-foreground md:rounded-xl md:border md:border-border">
            No tasks are set at the moment. Check back soon.
          </p>
        ) : (
          <>
            {group("Ready to claim", ready, "text-[#cc208f]", lastGroup === "ready")}
            {group("In progress", active, "text-muted-foreground", lastGroup === "active")}
            {group("Claimed", done, "text-muted-foreground", lastGroup === "done")}
          </>
        )}
      </main>
    </div>
  );
}
