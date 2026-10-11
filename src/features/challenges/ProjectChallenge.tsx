import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Trophy } from "@/components/icons/glyphs";
import { fetchChallengeBadges } from "./api";
import { formatPrize, durationLabel } from "./ui";

/** Running challenges for a set of projects, in one request. */
export function useChallengeBadges(projectIds: string[]) {
  const key = [...projectIds].sort().join(",");
  return useQuery({
    queryKey: ["challenge_badges", key],
    enabled: projectIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const rows = await fetchChallengeBadges(projectIds);
      return new Map(rows.map((r: any) => [r.project_id as string, r]));
    },
  });
}

/**
 * The strip on a project that says a challenge is running, or offers the owner
 * to start one. Lives inside Zero Proofs; there is no separate challenges area.
 */
export function ProjectChallengeStrip({
  projectId,
  badge,
  isOwner,
}: {
  projectId: string;
  badge?: any;
  isOwner: boolean;
}) {
  if (badge) {
    const open = badge.status === "open";
    const left = durationLabel(new Date(badge.deadline).getTime() - Date.now());
    return (
      <Link
        to="/app/challenge/$id"
        params={{ id: badge.challenge_id }}
        search={{ created: undefined }}
        className="group relative flex items-center gap-3 overflow-hidden border-t border-border/60 px-4 py-3"
      >
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-[#cc208f]/12 via-[#cc208f]/5 to-transparent"
        />
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#cc208f] text-white shadow-[0_6px_16px_-8px_#cc208f]">
          <Trophy className="h-4.5 w-4.5" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">
            {formatPrize(badge.prize_total, badge.prize_type)} challenge
          </span>
          <span className="block text-[12.5px] text-muted-foreground">
            {open
              ? `${left} left`
              : badge.status === "judging"
                ? "Judging"
                : badge.status === "result_posted"
                  ? "Winner announced"
                  : "In review"}
            {" · "}
            {Number(badge.entries)} {Number(badge.entries) === 1 ? "entry" : "entries"}
          </span>
        </span>
        <span className="relative text-[13px] font-semibold text-[#cc208f]">
          {isOwner ? "Manage" : open ? "Enter" : "View"}
        </span>
        <ChevronRight className="relative h-4 w-4 text-[#cc208f]" />
      </Link>
    );
  }
  if (!isOwner) return null;
  return (
    <Link
      to="/app/challenge/new"
      search={{ project: projectId }}
      className="flex items-center gap-3 border-t border-border/60 px-4 py-3 transition hover:bg-foreground/[0.02]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-foreground/[0.06]">
        <Trophy className="h-4.5 w-4.5 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">Create a challenge</span>
        <span className="block text-[12.5px] text-muted-foreground">
          Put up a prize for the best improvement
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
