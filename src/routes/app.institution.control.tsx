import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Building2,
  ChevronLeft,
  GraduationCap,
  LayoutGrid,
  Loader2,
  Search,
  Users,
} from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useGoBack } from "@/hooks/useGoBack";

/**
 * The institution's control panel.
 *
 * Tutor Studio answers "how are my programmes doing"; the studio's own tabs
 * cover tutors, bootcamps and analytics. What none of them show is the two
 * things an institution is actually accountable for day to day: who is
 * enrolled, and which communities are running under its name. Both existed
 * only as a count on a card, which is enough to report and not enough to act
 * on — you cannot email a number or open a club from it.
 */

export const Route = createFileRoute("/app/institution/control")({
  component: InstitutionControlPanel,
});

function Summary({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-2xl bg-card p-4">
      <Icon className="h-[18px] w-[18px] text-primary" />
      <p className="mt-2.5 text-[24px] font-semibold leading-none tracking-tight tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function InstitutionControlPanel() {
  const navigate = useNavigate();
  const goBack = useGoBack("/app/institution-studio");
  const { data: profile } = useUser();
  const [tab, setTab] = useState<"learners" | "communities">("learners");
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["institution-control", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const institutionId = profile!.id;

      const { data: tutorLinks } = await supabase
        .from("institution_tutors")
        .select("tutor_id")
        .eq("institution_id", institutionId);

      const creatorIds = [institutionId, ...(tutorLinks || []).map((row: any) => row.tutor_id)];

      const [{ data: bootcamps }, { data: clubs }] = await Promise.all([
        supabase
          .from("bootcamps")
          .select("id, title, category, status")
          .in("creator_id", creatorIds),
        supabase
          .from("clubs")
          .select("id, name, category, club_type, created_at")
          .in("creator_id", creatorIds)
          .order("created_at", { ascending: false }),
      ]);

      const bootcampIds = (bootcamps || []).map((b: any) => b.id);
      const clubIds = (clubs || []).map((c: any) => c.id);

      /* One query for every enrolment, joined to the learner. The alternative
         is a request per programme, which on an institution with forty of them
         is forty round trips to build one list. */
      const [{ data: enrolments }, { data: memberships }] = await Promise.all([
        bootcampIds.length
          ? supabase
              .from("enrollments")
              .select("bootcamp_id, enrolled_at, profiles:profile_id(id, username, full_name, avatar_url)")
              .in("bootcamp_id", bootcampIds)
              .order("enrolled_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        clubIds.length
          ? supabase.from("club_members").select("club_id").in("club_id", clubIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const programmeById = new Map((bootcamps || []).map((b: any) => [b.id, b]));
      const memberCounts = new Map<string, number>();
      for (const row of memberships || []) {
        memberCounts.set(row.club_id, (memberCounts.get(row.club_id) || 0) + 1);
      }

      const learners = (enrolments || [])
        .filter((row: any) => row.profiles)
        .map((row: any) => ({
          ...row.profiles,
          programme: programmeById.get(row.bootcamp_id)?.title || "Programme",
          enrolled_at: row.enrolled_at,
        }));

      // A learner on three programmes is one learner in the headline number.
      const uniqueLearners = new Set(learners.map((l: any) => l.id)).size;

      return {
        learners,
        uniqueLearners,
        clubs: (clubs || []).map((club: any) => ({ ...club, members: memberCounts.get(club.id) || 0 })),
        programmeCount: (bootcamps || []).length,
        tutorCount: (tutorLinks || []).length,
      };
    },
  });

  const learners = data?.learners || [];
  const clubs = data?.clubs || [];

  const filteredLearners = useMemo(() => {
    const term = query.trim().replace(/^@+/, "").toLowerCase();
    if (!term) return learners;
    return learners.filter((learner: any) =>
      `${learner.full_name || ""} ${learner.username || ""} ${learner.programme || ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [learners, query]);

  const filteredClubs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return clubs;
    return clubs.filter((club: any) => (club.name || "").toLowerCase().includes(term));
  }, [clubs, query]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            aria-label="Back to the studio"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Institution</p>
            <h1 className="truncate text-[18px] font-semibold tracking-tight">Control panel</h1>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-5 md:px-8">
        {isLoading ? (
          <div className="grid min-h-40 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Summary icon={GraduationCap} label="Learners" value={data?.uniqueLearners || 0} />
              <Summary icon={LayoutGrid} label="Programmes" value={data?.programmeCount || 0} />
              <Summary icon={Users} label="Tutors" value={data?.tutorCount || 0} />
              <Summary icon={Building2} label="Communities" value={clubs.length} />
            </section>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex gap-1 rounded-full bg-card p-1">
                {(["learners", "communities"] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`rounded-full px-4 py-2 text-[12.5px] font-semibold capitalize transition ${
                      tab === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tab === "learners" ? "Search a learner or programme" : "Search a community"}
                  className="h-11 w-full rounded-full bg-card pl-10 pr-4 text-[13.5px] outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {tab === "learners" ? (
              filteredLearners.length === 0 ? (
                <p className="mt-4 rounded-2xl bg-card px-4 py-12 text-center text-[12.5px] text-muted-foreground">
                  {learners.length === 0 ? "No one has enrolled on a programme yet." : "Nobody matches that search."}
                </p>
              ) : (
                <div className="mt-4 grid gap-2.5 lg:grid-cols-2 xl:grid-cols-3">
                  {filteredLearners.map((learner: any, index: number) => (
                    <Link
                      key={`${learner.id}-${learner.programme}-${index}`}
                      to="/app/profile/$id"
                      params={{ id: learner.username || learner.id }}
                      className="flex min-w-0 items-center gap-3 rounded-2xl bg-card p-3.5 transition hover:opacity-90"
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[13px] font-semibold text-muted-foreground">
                        {learner.avatar_url ? (
                          <img src={learner.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          (learner.full_name || learner.username || "?")[0].toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold tracking-tight">
                          {learner.full_name || learner.username}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          {learner.programme}
                        </span>
                      </span>
                      {learner.enrolled_at && (
                        <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">
                          {new Date(learner.enrolled_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )
            ) : filteredClubs.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-card px-4 py-12 text-center text-[12.5px] text-muted-foreground">
                {clubs.length === 0 ? "No communities are running under this institution." : "Nothing matches that search."}
              </p>
            ) : (
              <div className="mt-4 grid gap-2.5 lg:grid-cols-2 xl:grid-cols-3">
                {filteredClubs.map((club: any) => (
                  <Link
                    key={club.id}
                    to="/app/clubs/chat"
                    search={{ clubId: club.id }}
                    className="flex min-w-0 items-center gap-3 rounded-2xl bg-card p-4 transition hover:opacity-90"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/[0.08] text-primary">
                      <Users className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold tracking-tight">{club.name}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {club.members} {club.members === 1 ? "member" : "members"}
                        {club.club_type === "temporary" && " · cohort club"}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
