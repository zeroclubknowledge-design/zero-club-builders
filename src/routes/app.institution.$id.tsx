import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Globe,
  Loader2,
  MapPin,
  Users,
} from "@/components/icons/glyphs";
import { useState } from "react";
import { toast } from "sonner";
import { useFollow } from "@/hooks/useFollow";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { useGoBack } from "@/hooks/useGoBack";

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

function InstitutionPage() {
  const { id } = Route.useParams();
  const goBack = useGoBack("/app");
  const { format } = useWalletCurrency();
  const [activeTab, setTab] = useState<"programmes" | "staff" | "communities">("programmes");

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
      <div className="grid min-h-screen place-items-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/30" />
        <div>
          <h1 className="font-display text-[18px] font-semibold">Institution not found</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">This page may have been removed.</p>
        </div>
        <Link to="/app" className="flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background">
          Back to the feed
        </Link>
      </div>
    );
  }

  const { institution, tutors, bootcamps, clubs, learners } = data;
  const name = institution.full_name || institution.username;
  const tabs = [
    { id: "programmes" as const, label: "Programmes", count: bootcamps.length },
    { id: "staff" as const, label: "Teaching staff", count: tutors.length },
    { id: "communities" as const, label: "Communities", count: clubs.length },
  ];

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-canvas text-foreground">
      <div className="mx-auto w-full max-w-[680px] md:pt-2">
        {/* The banner sits on its own band now, above the name rather than
            behind it, so busy artwork can never make the type unreadable. */}
        <section className="bg-card pb-4 md:overflow-hidden md:rounded-xl md:border md:border-border">
          <div className="relative h-[120px] w-full overflow-hidden bg-[#1d2b3a] pt-[env(safe-area-inset-top)] md:h-[140px]">
            {institution.banner_url ? (
              <img src={institution.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div className="absolute inset-0" style={{ background: "linear-gradient(120deg,#1d2b3a,#3b5a6b)" }} />
            )}
            <button
              onClick={goBack}
              aria-label="Back"
              className="absolute left-3 top-[calc(0.75rem+env(safe-area-inset-top))] grid h-[38px] w-[38px] place-items-center rounded-full bg-black/45 text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>
          <div className="-mt-9 px-4">
            <span className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-2xl border-4 border-card bg-muted">
              {institution.avatar_url ? (
                <img src={institution.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <Building2 className="h-7 w-7 text-muted-foreground" />
              )}
            </span>
          </div>
          <div className="px-4 pt-2">
            <div className="flex items-center gap-1.5">
              <h1 className="font-display text-[22px] font-semibold leading-tight">{name}</h1>
              <BadgeCheck className="h-[18px] w-[18px] shrink-0 fill-[#cc208f] text-white" />
            </div>
            {institution.bio && <p className="mt-1 text-[14px] leading-relaxed text-foreground/85">{institution.bio}</p>}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
              {institution.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{institution.location}</span>}
              {institution.location && <span aria-hidden>·</span>}
              <span>{learners.toLocaleString()} {learners === 1 ? "learner" : "learners"}</span>
              <span aria-hidden>·</span>
              <span>{tutors.length} {tutors.length === 1 ? "tutor" : "tutors"}</span>
              {institution.website && (
                <>
                  <span aria-hidden>·</span>
                  <a
                    href={institution.website.startsWith("http") ? institution.website : `https://${institution.website}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1 font-semibold text-foreground hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />{institution.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                </>
              )}
            </p>
            <InstitutionActions institutionId={institution.id} />
          </div>
        </section>

        <div className="no-scrollbar sticky top-0 z-30 flex gap-5 overflow-x-auto border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] text-[14px] font-semibold md:static md:mt-2 md:rounded-t-xl md:border md:pt-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex h-11 shrink-0 items-center gap-1 transition-colors ${activeTab === tab.id ? "text-foreground shadow-[inset_0_-2px_0_currentColor]" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab.label}
              <span className="tabular-nums text-muted-foreground">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col bg-card pb-28 md:mb-6 md:rounded-b-xl md:border md:border-t-0 md:border-border md:pb-2">
        {activeTab === "programmes" && (
          bootcamps.length === 0 ? (
            <p className="px-4 py-12 text-center text-[14px] text-muted-foreground">No programmes are open for enrolment right now.</p>
          ) : (
            bootcamps.map((bootcamp: any) => (
              <Link
                key={bootcamp.id}
                to="/app/bootcamps/$id"
                params={{ id: bootcamp.id }}
                className="flex gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-foreground/[0.02]"
              >
                <div className="h-[72px] w-24 shrink-0 overflow-hidden rounded-[10px] bg-[#221d22]">
                  {bootcamp.banner_url && <img src={bootcamp.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-[#a3186f]">{bootcamp.category || "Programme"}</p>
                  <h2 className="line-clamp-2 text-[15px] font-semibold leading-snug">{bootcamp.title}</h2>
                  <p className="mt-0.5 text-[13px] font-semibold tabular-nums">
                    {Number(bootcamp.price) > 0 ? format(Number(bootcamp.price)) : <span className="text-[#1a7f4b]">Free</span>}
                  </p>
                </div>
              </Link>
            ))
          )
        )}

        {activeTab === "staff" && (
          tutors.length === 0 ? (
            <p className="px-4 py-12 text-center text-[14px] text-muted-foreground">No tutors listed yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 px-4 py-4 sm:grid-cols-4">
              {tutors.map((tutor: any) => (
                <Link key={tutor.id} to="/app/profile/$id" params={{ id: tutor.username || tutor.id }} className="min-w-0 text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-muted text-[16px] font-semibold text-muted-foreground">
                    {tutor.avatar_url ? (
                      <img src={tutor.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      (tutor.full_name || tutor.username || "T")[0].toUpperCase()
                    )}
                  </span>
                  <p className="mt-1.5 truncate text-[13px] font-semibold">{(tutor.full_name || tutor.username || "").split(" ")[0]}</p>
                  <p className="truncate text-[12px] text-muted-foreground">@{tutor.username}</p>
                </Link>
              ))}
            </div>
          )
        )}

        {activeTab === "communities" && (
          clubs.length === 0 ? (
            <p className="px-4 py-12 text-center text-[14px] text-muted-foreground">No communities yet.</p>
          ) : (
            clubs.map((club: any) => (
              <Link
                key={club.id}
                to="/app/clubs/chat"
                search={{ clubId: club.id }}
                className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-foreground/[0.02]"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
                  {club.banner_url ? <img src={club.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <Users className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{club.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{club.category || "Community"}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))
          )
        )}
      </main>
    </div>
  );
}

/** Follow and message, through the same follow hook as every other profile. */
function InstitutionActions({ institutionId }: { institutionId: string }) {
  const navigate = useNavigate();
  const { isFollowing, isSelf, loading, toggleFollow, currentUser } = useFollow(institutionId);
  if (!currentUser || isSelf) return null;

  return (
    <div className="mt-3.5 flex gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          try {
            await toggleFollow();
          } catch (error: any) {
            toast.error(error?.message || "Could not update follow");
          }
        }}
        className={`flex h-10 flex-1 items-center justify-center rounded-full text-[15px] font-semibold transition disabled:opacity-60 ${isFollowing ? "border-[1.5px] border-foreground/30 text-foreground" : "bg-foreground text-background"}`}
      >
        {isFollowing ? "Following" : "Follow"}
      </button>
      <button
        type="button"
        onClick={() => navigate({ to: "/app/chat/$id", params: { id: institutionId } })}
        className="flex h-10 flex-1 items-center justify-center rounded-full border-[1.5px] border-foreground text-[15px] font-semibold text-foreground"
      >
        Message
      </button>
    </div>
  );
}
