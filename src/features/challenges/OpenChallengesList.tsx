import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2, Trophy, Users } from "@/components/icons/glyphs";
import { parseShip, postImages } from "@/features/portfolio/parse";
import { fetchOpenChallenges } from "./api";
import { durationLabel, formatPrize, taskLabel } from "./ui";

/** The "Challenges" filter in Zero Proofs: every challenge open for entries, closing soonest first. */
export function OpenChallengesList() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["open_challenges"],
    queryFn: () => fetchOpenChallenges(40, 0),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid flex-1 place-items-center bg-card py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-card px-8 pb-28 pt-16 text-center md:rounded-xl md:border md:border-border md:pb-16">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#c3217e]/10">
          <Trophy className="h-5 w-5 text-[#c3217e]" />
        </span>
        <h3 className="font-display text-[18px] font-semibold">No open challenges right now</h3>
        <p className="mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-muted-foreground">
          Shipped something? Put up a prize on it from My projects and let people improve it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-0 pb-28 md:pb-6">
      {data.map((c: any) => {
        const ship = parseShip(c.project_content || "");
        const cover = postImages({ media_urls: c.project_media })[0];
        const left = durationLabel(new Date(c.deadline).getTime() - Date.now());
        const soon = new Date(c.deadline).getTime() - Date.now() < 86_400_000;
        return (
          <Link
            key={c.id}
            to="/app/challenge/$id"
            params={{ id: c.id }}
            search={{ created: undefined }}
            className="block overflow-hidden bg-card transition active:scale-[0.995] md:rounded-xl md:border md:border-border"
          >
            <div className="relative">
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  loading="lazy"
                  className="aspect-[16/7] w-full object-cover"
                />
              ) : (
                <div className="aspect-[16/7] w-full bg-gradient-to-br from-[#721e4e] via-[#c3217e] to-[#fd49b0]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur">
                {taskLabel(c.task_type)}
              </span>
              <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
                <span className="rounded-xl bg-white px-3 py-1.5 font-display text-[18px] font-bold leading-none text-[#c3217e] shadow-lg">
                  {formatPrize(c.prize_total, c.prize_type)}
                </span>
                <span
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold backdrop-blur ${soon ? "bg-rose-500 text-white" : "bg-black/55 text-white"}`}
                >
                  <Clock className="h-3.5 w-3.5" /> {left} left
                </span>
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="font-display text-[16.5px] font-semibold leading-snug">{c.title}</p>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                on {ship.name || "a project"} by {c.owner?.full_name || c.owner?.username}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> {c.entries}{" "}
                  {Number(c.entries) === 1 ? "entry" : "entries"}
                </span>
                {(c.skills || []).slice(0, 3).map((s: string) => (
                  <span
                    key={s}
                    className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[12px]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
