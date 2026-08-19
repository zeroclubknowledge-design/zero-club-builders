import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronLeft,
  GraduationCap,
  Globe,
  Loader2,
  MapPin,
  Users,
} from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

/**
 * An institution's public page.
 *
 * Institutions are not individuals, and the ordinary profile page reads wrong
 * for one: it leads with a person's follower count and their posts. What
 * somebody wants from a university or an academy is what it teaches, who
 * teaches there, and whether it is real. So this page leads with the
 * programmes and the teaching staff, and treats the prose as supporting
 * material.
 */

export const Route = createFileRoute("/app/institution/$id")({
  component: InstitutionPage,
});

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/[0.055] p-4 ring-1 ring-white/10">
      <p className="text-[24px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      <p className="mt-1.5 text-[11px] text-white/55">{label}</p>
    </div>
  );
}

function InstitutionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { format } = useWalletCurrency();

  const { data, isLoading } = useQuery({
    queryKey: ["institution", id],
    queryFn: async () => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const { data: institution } = await (isUuid
        ? supabase.from("profiles").select("*").eq("id", id)
        : supabase.from("profiles").select("*").ilike("username", id)
      ).maybeSingle();

      if (!institution) return null;

      // Programmes run by the institution itself and by the tutors under it.
      const { data: tutorLinks } = await supabase
        .from("institution_tutors")
        .select("tutor_id, profiles:tutor_id(id, username, full_name, avatar_url)")
        .eq("institution_id", institution.id);

      const creatorIds = [institution.id, ...(tutorLinks || []).map((link: any) => link.tutor_id)];

      const [{ data: bootcamps }, { data: clubs }] = await Promise.all([
        supabase
          .from("bootcamps")
          .select("id, title, category, price, banner_url, status, created_at")
          .in("creator_id", creatorIds)
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        supabase
          .from("clubs")
          .select("id, name, category, banner_url")
          .in("creator_id", creatorIds)
          .limit(6),
      ]);

      const bootcampIds = (bootcamps || []).map((bootcamp: any) => bootcamp.id);
      const { count: learners } = bootcampIds.length
        ? await supabase
            .from("enrollments")
            .select("*", { count: "exact", head: true })
            .in("bootcamp_id", bootcampIds)
        : { count: 0 };

      return {
        institution,
        tutors: (tutorLinks || []).map((link: any) => link.profiles).filter(Boolean),
        bootcamps: bootcamps || [],
        clubs: clubs || [],
        learners: learners || 0,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/30" />
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight">Institution not found</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">This page may have been removed.</p>
        </div>
        <Link to="/app" className="rounded-full bg-foreground px-6 py-2.5 text-[13px] font-semibold text-background">
          Back to the feed
        </Link>
      </div>
    );
  }

  const { institution, tutors, bootcamps, clubs, learners } = data;
  const name = institution.full_name || institution.username;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[900px] items-center gap-3">
          <button
            onClick={() => navigate({ to: "/app" })}
            aria-label="Back"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Institution</p>
            <h1 className="truncate text-[18px] font-semibold tracking-tight">{name}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-4 py-5 md:px-7 md:py-7">
        {/* The hero carries the identity: the crest, the name, and the four
            numbers that say whether this place is actually running anything. */}
        <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#241a2b] via-[#17131b] to-[#0e0c10] p-5 text-white shadow-[0_28px_65px_-35px_rgba(20,12,19,0.85)] ring-1 ring-black/10 sm:p-7">
          {/* No banner behind this. A profile banner is arbitrary artwork —
              faces, logos, text of its own — and the name and stats sitting on
              top of it became unreadable on anything busy. The gradient is the
              only background here, so the type always has the same surface
              under it. The banner still belongs to the institution; it is just
              not load-bearing. */}
          <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[#cc208f]/22 blur-[72px]" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-52 w-52 rounded-full bg-[#713bff]/16 blur-[76px]" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border-[20px] border-white opacity-[0.045]" />

          <div className="relative">
            <div className="flex items-start gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/15 sm:h-20 sm:w-20">
                {institution.avatar_url ? (
                  <img src={institution.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-8 w-8 text-white/70" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[21px] font-semibold leading-tight tracking-tight sm:text-[25px]">{name}</h2>
                  <BadgeCheck className="h-5 w-5 shrink-0 text-[#f06ac3]" />
                </div>
                <p className="mt-1 text-[12.5px] text-white/55">@{institution.username}</p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-white/55">
                  {institution.location && (
                    <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{institution.location}</span>
                  )}
                  {institution.website && (
                    <a
                      href={institution.website.startsWith("http") ? institution.website : `https://${institution.website}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-1.5 underline underline-offset-2 hover:text-white"
                    >
                      <Globe className="h-3.5 w-3.5" />{institution.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {institution.bio && (
              <p className="mt-5 max-w-[62ch] text-[13px] leading-relaxed text-white/70">{institution.bio}</p>
            )}

            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat value={bootcamps.length} label="Programmes" />
              <Stat value={tutors.length} label="Tutors" />
              <Stat value={learners} label="Learners" />
              <Stat value={clubs.length} label="Communities" />
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h3 className="text-[15px] font-semibold tracking-tight">Programmes</h3>
            <span className="text-[11.5px] text-muted-foreground tabular-nums">{bootcamps.length}</span>
          </div>

          {bootcamps.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-[12.5px] text-muted-foreground">
              No programmes are open for enrolment right now.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {bootcamps.map((bootcamp: any) => (
                <Link
                  key={bootcamp.id}
                  to="/app/bootcamps/$id"
                  params={{ id: bootcamp.id }}
                  className="group min-w-0 overflow-hidden rounded-2xl border border-border bg-card transition hover:border-foreground/15"
                >
                  <div className="relative h-32 bg-foreground/[0.04]">
                    {bootcamp.banner_url && (
                      <img src={bootcamp.banner_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                      {bootcamp.category || "Programme"}
                    </p>
                    <h4 className="mt-1.5 line-clamp-2 text-[14.5px] font-semibold leading-snug tracking-tight">
                      {bootcamp.title}
                    </h4>
                    <p className="mt-2.5 text-[12.5px] font-semibold tabular-nums text-foreground">
                      {Number(bootcamp.price) > 0 ? format(Number(bootcamp.price)) : "Free"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {tutors.length > 0 && (
          <section className="mt-6">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 className="text-[15px] font-semibold tracking-tight">Teaching staff</h3>
              <span className="text-[11.5px] text-muted-foreground tabular-nums">{tutors.length}</span>
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {tutors.map((tutor: any) => (
                <Link
                  key={tutor.id}
                  to="/app/profile/$id"
                  params={{ id: tutor.username || tutor.id }}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition hover:border-foreground/15"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[13px] font-semibold text-muted-foreground ring-1 ring-border">
                    {tutor.avatar_url ? (
                      <img src={tutor.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (tutor.username || "T")[0].toUpperCase()
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold tracking-tight">{tutor.full_name || tutor.username}</p>
                    <p className="truncate text-[11.5px] text-muted-foreground">@{tutor.username}</p>
                  </div>
                  <GraduationCap className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {clubs.length > 0 && (
          <section className="mt-6">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 className="text-[15px] font-semibold tracking-tight">Communities</h3>
              <span className="text-[11.5px] text-muted-foreground tabular-nums">{clubs.length}</span>
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {clubs.map((club: any) => (
                <Link
                  key={club.id}
                  to="/app/clubs/chat"
                  search={{ clubId: club.id }}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition hover:border-foreground/15"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/[0.08] text-primary ring-1 ring-primary/15">
                    {club.banner_url ? (
                      <img src={club.banner_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Users className="h-5 w-5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold tracking-tight">{club.name}</p>
                    <p className="truncate text-[11.5px] text-muted-foreground">{club.category || "Community"}</p>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
