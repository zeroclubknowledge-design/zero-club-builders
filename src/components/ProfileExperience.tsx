import { Award } from "@/components/icons/solar";
import { getLevelFromXp, getLevelProgress } from "@/lib/utils";

type ProfileExperienceProps = {
  xp?: number | null;
  accountType?: string | null;
};

export function ProfileExperience({ xp = 0, accountType }: ProfileExperienceProps) {
  const totalXp = Math.max(0, Number(xp || 0));
  const level = getLevelFromXp(totalXp);
  const progress = getLevelProgress(totalXp);
  const normalizedRole = String(accountType || "learner").toLowerCase();
  const role = normalizedRole === "institution" ? "Institution" : normalizedRole === "tutor" ? "Tutor" : "Builder";

  return (
    <div className="mt-4 w-full border-y border-border/70 py-3.5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Award className="h-[18px] w-[18px] fill-current" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{role} experience</p>
              <p className="mt-0.5 text-[12.5px] font-semibold">Level {level}</p>
            </div>
            <p className="shrink-0 text-[12px] font-semibold tabular-nums">{totalXp.toLocaleString()} <span className="text-[9px] text-muted-foreground">XP</span></p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="mt-1 text-[8.5px] text-muted-foreground tabular-nums">{progress.currentXP.toLocaleString()} of {progress.maxXP.toLocaleString()} XP to the next level</p>
        </div>
      </div>
    </div>
  );
}
