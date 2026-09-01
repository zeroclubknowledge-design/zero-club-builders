import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Award,
  Banknote,
  BookOpenCheck,
  Building2,
  ChevronLeft,
  Flame,
  GraduationCap,
  ThumbsUp,
  Loader2,
  MessageSquare,
  Repeat2,
  Rocket,
  Sparkles,
  Users,
  Zap,
} from "@/components/icons/solar";
import { useMemo, useState, type ElementType } from "react";
import { IconClubs, IconLearn, IconMetrics, IconProfile } from "@/components/icons/nav";
import { supabase } from "@/lib/supabase";
import { displayName } from "@/lib/utils";
import { useGoBack } from "@/hooks/useGoBack";

export const Route = createFileRoute("/app/metrics")({
  component: MetricsPage,
  head: () => ({
    meta: [{ title: "Metrics - Zero Club" }],
  }),
});

type Period = 7 | 30 | 90;

const periodOptions: { label: string; value: Period }[] = [
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
];

const compact = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
};

const currency = (value: number) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
}).format(value || 0);

const percentage = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

const dateForDaysAgo = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
};

function isWithin(dateValue: string, start: Date, end: Date) {
  const date = new Date(dateValue);
  return date >= start && date < end;
}

async function getMetricsData() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const userId = session.user.id;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, full_name, xp, account_type, created_at")
    .eq("id", userId)
    .single();

  if (profileError) throw profileError;

  const [postsResult, followersResult, followingResult, enrollmentResult, clubResult, questResult] = await Promise.all([
    supabase
      .from("posts")
      .select("id, content, created_at, is_build_post, is_verified_build, likes_count, comments_count, reposts_count")
      .eq("author_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("follows").select("following_id, created_at").eq("following_id", userId),
    supabase.from("follows").select("following_id, created_at").eq("follower_id", userId),
    supabase.from("enrollments").select("bootcamp_id, enrolled_at, bootcamps(title, category)").eq("profile_id", userId),
    supabase.from("club_members").select("club_id, joined_at, clubs(name, category)").eq("profile_id", userId),
    supabase.from("quest_completions").select("quest_id, claimed_at").eq("profile_id", userId),
  ]);

  let managedBootcamps: any[] = [];
  let managedEnrollments: any[] = [];
  let managedClubs: any[] = [];
  let institutionTutors: any[] = [];

  if (profile.account_type === "Tutor") {
    const { data: bootcamps, error } = await supabase
      .from("bootcamps")
      .select("id, title, category, price, status, creator_id, assigned_tutor_id, created_at")
      .or(`creator_id.eq.${userId},assigned_tutor_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    managedBootcamps = bootcamps || [];

    const bootcampIds = managedBootcamps.map((bootcamp) => bootcamp.id);
    const [managedEnrollmentResult, managedClubResult] = await Promise.all([
      bootcampIds.length
        ? supabase.from("enrollments").select("bootcamp_id, profile_id, enrolled_at").in("bootcamp_id", bootcampIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      supabase.from("clubs").select("id, name, category, created_at").eq("creator_id", userId),
    ]);
    if (managedEnrollmentResult.error) throw managedEnrollmentResult.error;
    if (managedClubResult.error) throw managedClubResult.error;
    managedEnrollments = managedEnrollmentResult.data || [];
    managedClubs = managedClubResult.data || [];
  }

  if (profile.account_type === "Institution") {
    const { data: tutorLinks, error: tutorError } = await supabase
      .from("institution_tutors")
      .select("tutor_id")
      .eq("institution_id", userId);
    if (tutorError) throw tutorError;
    institutionTutors = tutorLinks || [];

    const creatorIds = [userId, ...institutionTutors.map((link) => link.tutor_id)];
    const { data: bootcamps, error: bootcampError } = await supabase
      .from("bootcamps")
      .select("id, title, category, price, status, creator_id, assigned_tutor_id, created_at")
      .in("creator_id", creatorIds)
      .order("created_at", { ascending: false });
    if (bootcampError) throw bootcampError;
    managedBootcamps = bootcamps || [];

    const bootcampIds = managedBootcamps.map((bootcamp) => bootcamp.id);
    const [managedEnrollmentResult, managedClubResult] = await Promise.all([
      bootcampIds.length
        ? supabase.from("enrollments").select("bootcamp_id, profile_id, enrolled_at").in("bootcamp_id", bootcampIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      supabase.from("clubs").select("id, name, category, creator_id, created_at").in("creator_id", creatorIds),
    ]);
    if (managedEnrollmentResult.error) throw managedEnrollmentResult.error;
    if (managedClubResult.error) throw managedClubResult.error;
    managedEnrollments = managedEnrollmentResult.data || [];
    managedClubs = managedClubResult.data || [];
  }

  return {
    profile,
    posts: postsResult.data || [],
    followers: followersResult.data || [],
    following: followingResult.data || [],
    enrollments: enrollmentResult.data || [],
    clubs: clubResult.data || [],
    quests: questResult.data || [],
    managedBootcamps,
    managedEnrollments,
    managedClubs,
    institutionTutors,
  };
}

function MetricCard({
  label,
  value,
  detail,
  Icon,
  tone = "text-[#cc208f] bg-[#cc208f]/10 ring-[#cc208f]/15",
}: {
  label: string;
  value: string;
  detail: string;
  Icon: ElementType;
  tone?: string;
}) {
  return (
    <article className="min-w-0 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-border md:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-5 text-[27px] font-semibold leading-none tracking-tight text-foreground tabular-nums md:text-[30px]">{value}</p>
      <p className="mt-2 min-h-4 text-[11px] font-medium leading-4 text-muted-foreground">{detail}</p>
    </article>
  );
}

function MetricsPage() {
  const goBack = useGoBack("/app");
  const [period, setPeriod] = useState<Period>(30);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetricsData,
    refetchInterval: 60000,
  });

  const insights = useMemo(() => {
    if (!data) return null;

    const now = new Date();
    const currentStart = dateForDaysAgo(period - 1);
    const previousStart = dateForDaysAgo((period * 2) - 1);
    const previousEnd = currentStart;
    const accountType = data.profile?.account_type || "Learner";
    const isTutor = accountType === "Tutor";
    const isInstitution = accountType === "Institution";
    const isOperator = isTutor || isInstitution;
    const inCurrent = (value?: string | null) => Boolean(value && isWithin(value, currentStart, now));
    const inPrevious = (value?: string | null) => Boolean(value && isWithin(value, previousStart, previousEnd));

    const totalEngagement = data.posts.reduce(
      (total: number, post: any) => total + (post.likes_count || 0) + (post.comments_count || 0) + (post.reposts_count || 0),
      0,
    );
    const proofPosts = data.posts.filter((post: any) => post.is_build_post);
    const verifiedBuilds = data.posts.filter((post: any) => post.is_verified_build);
    const currentPosts = data.posts.filter((post: any) => inCurrent(post.created_at));
    const previousPosts = data.posts.filter((post: any) => inPrevious(post.created_at));
    const currentBuilds = proofPosts.filter((post: any) => inCurrent(post.created_at));
    const previousBuilds = proofPosts.filter((post: any) => inPrevious(post.created_at));
    const currentEngagement = currentPosts.reduce(
      (total: number, post: any) => total + (post.likes_count || 0) + (post.comments_count || 0) + (post.reposts_count || 0),
      0,
    );
    const previousEngagement = previousPosts.reduce(
      (total: number, post: any) => total + (post.likes_count || 0) + (post.comments_count || 0) + (post.reposts_count || 0),
      0,
    );
    const currentLearning = data.enrollments.filter((item: any) => inCurrent(item.enrolled_at));
    const previousLearning = data.enrollments.filter((item: any) => inPrevious(item.enrolled_at));
    const currentNetwork = data.followers.filter((item: any) => inCurrent(item.created_at));
    const previousNetwork = data.followers.filter((item: any) => inPrevious(item.created_at));
    const currentManagedEnrollments = data.managedEnrollments.filter((item: any) => inCurrent(item.enrolled_at));
    const previousManagedEnrollments = data.managedEnrollments.filter((item: any) => inPrevious(item.enrolled_at));
    const currentPrograms = data.managedBootcamps.filter((item: any) => inCurrent(item.created_at));
    const previousPrograms = data.managedBootcamps.filter((item: any) => inPrevious(item.created_at));
    const activePrograms = data.managedBootcamps.filter((item: any) => item.status === "active");
    const draftPrograms = data.managedBootcamps.filter((item: any) => item.status === "draft");
    const completedPrograms = data.managedBootcamps.filter((item: any) => item.status === "completed");
    const estimatedProgramValue = data.managedBootcamps.reduce((total: number, bootcamp: any) => {
      const enrollments = data.managedEnrollments.filter((item: any) => item.bootcamp_id === bootcamp.id).length;
      return total + Number(bootcamp.price || 0) * enrollments;
    }, 0);

    const activity = Array.from({ length: 7 }, (_, index) => {
      const day = dateForDaysAgo(6 - index);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const posts = data.posts.filter((post: any) => isWithin(post.created_at, day, nextDay)).length;
      const builds = proofPosts.filter((post: any) => isWithin(post.created_at, day, nextDay)).length;
      const learning = data.enrollments.filter((item: any) => isWithin(item.enrolled_at, day, nextDay)).length;
      const connections = data.followers.filter((item: any) => isWithin(item.created_at, day, nextDay)).length;
      const learnerJoins = data.managedEnrollments.filter((item: any) => isWithin(item.enrolled_at, day, nextDay)).length;
      const programs = data.managedBootcamps.filter((item: any) => isWithin(item.created_at, day, nextDay)).length;
      return {
        label: day.toLocaleDateString("en-US", { weekday: "narrow" }),
        value: isOperator ? learnerJoins + programs + posts : posts + builds + learning + connections,
      };
    });

    const topPost = [...data.posts].sort(
      (a: any, b: any) => ((b.likes_count || 0) + (b.comments_count || 0) + (b.reposts_count || 0)) - ((a.likes_count || 0) + (a.comments_count || 0) + (a.reposts_count || 0)),
    )[0];
    const topPostEngagement = topPost ? (topPost.likes_count || 0) + (topPost.comments_count || 0) + (topPost.reposts_count || 0) : 0;
    const totalActivity = activity.reduce((total, item) => total + item.value, 0);
    const nextAction = isInstitution
      ? data.institutionTutors.length === 0
        ? { label: "Build your faculty", detail: "Invite tutors into your institution workspace.", to: "/app/institution-studio" as const, Icon: Users }
        : activePrograms.length === 0
          ? { label: "Launch a programme", detail: "Turn your curriculum into an active cohort.", to: "/app/institution-studio" as const, Icon: Building2 }
          : { label: "Review cohort delivery", detail: "Open your institution hub to manage outcomes.", to: "/app/institution-studio" as const, Icon: BookOpenCheck }
      : isTutor
        ? data.managedBootcamps.length === 0
          ? { label: "Create your first bootcamp", detail: "Package your expertise into a focused learning experience.", to: "/app/tutor-studio/create" as const, Icon: GraduationCap }
          : draftPrograms.length > 0
            ? { label: "Prepare your next launch", detail: "Finish a draft curriculum and open enrolment.", to: "/app/tutor-studio" as const, Icon: Rocket }
            : { label: "Review learner progress", detail: "Use Tutor Studio to keep your cohorts moving.", to: "/app/tutor-studio" as const, Icon: BookOpenCheck }
        : proofPosts.length === 0
          ? { label: "Ship your first proof", detail: "Turn your work into a visible build.", to: "/app/ship" as const, Icon: Rocket }
          : data.enrollments.length === 0
            ? { label: "Join a bootcamp", detail: "Add a learning signal to your record.", to: "/app/bootcamps" as const, Icon: IconLearn }
            : data.clubs.length === 0
              ? { label: "Find a focused club", detail: "Keep momentum with the right people.", to: "/app/clubs" as const, Icon: IconClubs }
              : { label: "Publish a progress update", detail: "Keep your proof of work current.", to: "/app/compose" as const, Icon: Sparkles };

    return {
      totalEngagement,
      proofPosts,
      verifiedBuilds,
      currentPosts,
      currentBuilds,
      currentLearning,
      currentNetwork,
      accountType,
      isTutor,
      isInstitution,
      isOperator,
      currentManagedEnrollments,
      currentPrograms,
      activePrograms,
      draftPrograms,
      completedPrograms,
      estimatedProgramValue,
      postChange: percentage(currentPosts.length, previousPosts.length),
      buildChange: percentage(currentBuilds.length, previousBuilds.length),
      engagementChange: percentage(currentEngagement, previousEngagement),
      learningChange: percentage(currentLearning.length, previousLearning.length),
      networkChange: percentage(currentNetwork.length, previousNetwork.length),
      enrollmentChange: percentage(currentManagedEnrollments.length, previousManagedEnrollments.length),
      programChange: percentage(currentPrograms.length, previousPrograms.length),
      activity,
      activityMax: Math.max(1, ...activity.map((item) => item.value)),
      totalActivity,
      topPost,
      topPostEngagement,
      nextAction,
    };
  }, [data, period]);

  if (isLoading || !insights) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const profileName = displayName(data?.profile, "you");
  // The header is just "Metrics" now, so the per-role subtitle that used to sit
  // under it is gone with it. The eyebrow and title still lead the page body.
  const roleView = insights.isInstitution
    ? {
        eyebrow: "Institution intelligence",
        title: `See your learning network clearly, ${profileName.split(" ")[0]}.`,
      }
    : insights.isTutor
      ? {
          eyebrow: "Teaching performance",
          title: `Turn expertise into learner outcomes, ${profileName.split(" ")[0]}.`,
        }
      : {
          eyebrow: "Builder record",
          title: `Keep the signal moving, ${profileName.split(" ")[0]}.`,
        };
  const portfolioStats = insights.isInstitution
    ? [
        { value: insights.activePrograms.length, label: "Active programmes" },
        { value: data?.institutionTutors.length || 0, label: "Connected tutors" },
        { value: data?.managedEnrollments.length || 0, label: "Learner seats" },
        { value: data?.managedClubs.length || 0, label: "Learning clubs" },
      ]
    : insights.isTutor
      ? [
          { value: insights.activePrograms.length, label: "Active bootcamps" },
          { value: insights.draftPrograms.length, label: "Draft programmes" },
          { value: data?.managedEnrollments.length || 0, label: "Learners reached" },
          { value: insights.completedPrograms.length, label: "Completed cohorts" },
        ]
      : [
          { value: insights.verifiedBuilds.length, label: "Verified builds" },
          { value: data?.quests.length || 0, label: "Quests claimed" },
          { value: data?.enrollments.length || 0, label: "Bootcamps joined" },
          { value: data?.clubs.length || 0, label: "Active clubs" },
        ];
  const portfolioHeading = insights.isInstitution
    ? "Institution delivery record"
    : insights.isTutor
      ? "Teaching portfolio"
      : "Your builder record";
  const featuredProgram = data?.managedBootcamps[0];
  const featuredProgramLearners = featuredProgram
    ? data?.managedEnrollments.filter((item: any) => item.bootcamp_id === featuredProgram.id).length || 0
    : 0;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background pb-28 md:pb-10">
      <header className="sticky top-0 z-30 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-[calc(4rem+env(safe-area-inset-top))] max-w-6xl items-end justify-between gap-3 px-4 pb-3 pt-[env(safe-area-inset-top)] md:px-7">
          <div className="flex items-center gap-3">
            <button type="button" onClick={goBack} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground tap" aria-label="Back to feed">
              <ChevronLeft className="h-[19px] w-[19px]" />
            </button>
            <h1 className="font-display text-[19px] font-semibold tracking-tight text-foreground">Metrics</h1>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
            <span className={`h-1.5 w-1.5 rounded-full ${isFetching ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
            Live
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-7 md:py-8">
        <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{roleView.eyebrow}</p>
            <h2 className="mt-2 font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground md:text-[38px]">
              {roleView.title}
            </h2>
          </div>
          <div className="inline-flex w-fit rounded-xl bg-card p-1 ring-1 ring-border">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setPeriod(option.value)}
                className={`h-8 min-w-11 rounded-lg px-2.5 text-[11px] font-semibold transition ${period === option.value ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {insights.isInstitution ? (
            <>
              <MetricCard label="Tutors" value={compact(data?.institutionTutors.length || 0)} detail="Faculty connected to this institution" Icon={Users} tone="text-sky-700 bg-sky-500/10 ring-sky-500/15" />
              <MetricCard label="Programmes" value={compact(data?.managedBootcamps.length || 0)} detail={`${insights.activePrograms.length} currently active`} Icon={Building2} />
              <MetricCard label="Learners" value={compact(data?.managedEnrollments.length || 0)} detail={insights.enrollmentChange === 0 ? "Across all cohorts" : `${insights.enrollmentChange > 0 ? "+" : ""}${insights.enrollmentChange}% in this period`} Icon={GraduationCap} tone="text-emerald-700 bg-emerald-500/10 ring-emerald-500/15" />
              <MetricCard label="Programme value" value={currency(insights.estimatedProgramValue)} detail="Gross value of recorded enrolments" Icon={Banknote} tone="text-amber-700 bg-amber-500/10 ring-amber-500/15" />
            </>
          ) : insights.isTutor ? (
            <>
              <MetricCard label="Bootcamps" value={compact(data?.managedBootcamps.length || 0)} detail={`${insights.activePrograms.length} active, ${insights.draftPrograms.length} draft`} Icon={BookOpenCheck} />
              <MetricCard label="Learners" value={compact(data?.managedEnrollments.length || 0)} detail={insights.enrollmentChange === 0 ? "Across your teaching portfolio" : `${insights.enrollmentChange > 0 ? "+" : ""}${insights.enrollmentChange}% in this period`} Icon={GraduationCap} tone="text-emerald-700 bg-emerald-500/10 ring-emerald-500/15" />
              <MetricCard label="Teaching reach" value={compact(insights.totalEngagement)} detail="Engagement across your published work" Icon={ThumbsUp} tone="text-[#9d176d] bg-[#cc208f]/10 ring-[#cc208f]/15" />
              <MetricCard label="Portfolio value" value={currency(insights.estimatedProgramValue)} detail="Gross value of recorded enrolments" Icon={Banknote} tone="text-amber-700 bg-amber-500/10 ring-amber-500/15" />
            </>
          ) : (
            <>
              <MetricCard label="XP earned" value={compact(data?.profile?.xp || 0)} detail={`Level progress in ${period} days`} Icon={Zap} tone="text-amber-600 bg-amber-500/10 ring-amber-500/15" />
              <MetricCard label="Proofs shipped" value={compact(insights.proofPosts.length)} detail={insights.buildChange === 0 ? "No change in this period" : `${insights.buildChange > 0 ? "+" : ""}${insights.buildChange}% vs previous`} Icon={Rocket} />
              <MetricCard label="Engagement" value={compact(insights.totalEngagement)} detail={insights.engagementChange === 0 ? "Across all published work" : `${insights.engagementChange > 0 ? "+" : ""}${insights.engagementChange}% in this period`} Icon={ThumbsUp} tone="text-[#9d176d] bg-[#cc208f]/10 ring-[#cc208f]/15" />
              <MetricCard label="Network" value={compact(data?.followers.length || 0)} detail={insights.networkChange === 0 ? `${compact(data?.following.length || 0)} people followed` : `${insights.networkChange > 0 ? "+" : ""}${insights.networkChange}% new followers`} Icon={Users} tone="text-sky-700 bg-sky-500/10 ring-sky-500/15" />
            </>
          )}
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <article className="min-w-0 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Momentum</p>
                <h3 className="mt-1.5 text-[18px] font-semibold tracking-tight text-foreground">
                  {insights.isInstitution ? "Network activity, last 7 days" : insights.isTutor ? "Teaching activity, last 7 days" : "Your last 7 days"}
                </h3>
              </div>
              <span className="rounded-full bg-primary/8 px-2.5 py-1 text-[10px] font-semibold text-primary ring-1 ring-primary/15">{insights.totalActivity} actions</span>
            </div>
            <div className="mt-8 flex h-36 items-end justify-between gap-2 sm:gap-3">
              {insights.activity.map((day, index) => {
                const height = day.value === 0 ? 7 : Math.max(16, Math.round((day.value / insights.activityMax) * 100));
                return (
                  <div key={`${day.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-28 w-full items-end rounded-lg bg-foreground/[0.035] px-1.5 sm:px-2">
                      <div className="w-full rounded-md bg-primary transition-all duration-500" style={{ height: `${height}%` }} />
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground">{day.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{insights.isOperator ? "Learner enrolments" : "Posts and builds"}</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary/55" />{insights.isOperator ? "Programmes and publishing" : "Learning and connections"}</span>
            </div>
          </article>

          <article className="min-w-0 overflow-hidden rounded-2xl bg-[#171417] p-5 text-white shadow-lift md:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-[#f2a8dc] ring-1 ring-white/10"><Award className="h-5 w-5" /></span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/50">{insights.isOperator ? "Delivery quality" : "Proof quality"}</p>
                <h3 className="mt-1 text-[18px] font-semibold tracking-tight">{portfolioHeading}</h3>
              </div>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-3">
              {portfolioStats.map((stat) => (
                <div key={stat.label} className="rounded-xl bg-white/[0.07] p-3 ring-1 ring-white/10">
                  <p className="text-[23px] font-semibold tabular-nums">{compact(stat.value)}</p>
                  <p className="mt-1 text-[10px] text-white/55">{stat.label}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-2">
          <article className="min-w-0 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{insights.isOperator ? "Programme pulse" : "Top proof"}</p>
                <h3 className="mt-1.5 text-[18px] font-semibold tracking-tight text-foreground">{insights.isInstitution ? "Latest institution programme" : insights.isTutor ? "Latest teaching programme" : "Your strongest published work"}</h3>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/8 text-primary"><IconMetrics className="h-4.5 w-4.5" active /></span>
            </div>
            {insights.isOperator && featuredProgram ? (
              <div className="mt-6 rounded-xl bg-foreground/[0.03] p-4 ring-1 ring-border">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold tracking-tight text-foreground">{featuredProgram.title}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{featuredProgram.category || "Learning programme"}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[9px] font-semibold capitalize text-primary ring-1 ring-primary/15">{featuredProgram.status}</span>
                </div>
                <div className="mt-4 flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" />{featuredProgramLearners} learners</span>
                  <span className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5" />{currency(Number(featuredProgram.price || 0))}</span>
                </div>
              </div>
            ) : !insights.isOperator && insights.topPost ? (
              <div className="mt-6 rounded-xl bg-foreground/[0.03] p-4 ring-1 ring-border">
                <p className="line-clamp-2 text-[13px] leading-6 text-foreground">{insights.topPost.content}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5"><ThumbsUp className="h-3.5 w-3.5" />{insights.topPost.likes_count || 0}</span>
                  <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />{insights.topPost.comments_count || 0}</span>
                  <span className="flex items-center gap-1.5"><Repeat2 className="h-3.5 w-3.5" />{insights.topPost.reposts_count || 0}</span>
                  <span className="ml-auto text-primary">{compact(insights.topPostEngagement)} total</span>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-xl bg-foreground/[0.03] p-4 text-[13px] leading-6 text-muted-foreground ring-1 ring-border">
                {insights.isOperator ? "Your programme data will appear here after you create a bootcamp." : "Your published work will appear here once it starts gathering signal."}
              </div>
            )}
          </article>

          <Link to={insights.nextAction.to} className="group min-w-0 rounded-2xl bg-primary p-5 text-primary-foreground shadow-[0_18px_38px_-24px_rgba(204,32,143,0.8)] transition hover:bg-[#ad1b79] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20"><insights.nextAction.Icon className="h-5 w-5" /></span>
              <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.13em] text-white/70">Next move</p>
            <h3 className="mt-2 text-[22px] font-semibold tracking-tight">{insights.nextAction.label}</h3>
            <p className="mt-2 text-[13px] leading-6 text-white/75">{insights.nextAction.detail}</p>
          </Link>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {insights.isInstitution ? (
            <>
              <MetricCard label="Active programmes" value={compact(insights.activePrograms.length)} detail={`${insights.draftPrograms.length} drafts awaiting launch`} Icon={BookOpenCheck} />
              <MetricCard label="New enrolments" value={compact(insights.currentManagedEnrollments.length)} detail={`${period}-day cohort growth`} Icon={GraduationCap} tone="text-emerald-700 bg-emerald-500/10 ring-emerald-500/15" />
              <MetricCard label="Learning clubs" value={compact(data?.managedClubs.length || 0)} detail="Institution and tutor communities" Icon={IconClubs} tone="text-violet-700 bg-violet-500/10 ring-violet-500/15" />
              <MetricCard label="Published programmes" value={compact(insights.activePrograms.length + insights.completedPrograms.length)} detail="Active and completed delivery" Icon={Building2} tone="text-orange-700 bg-orange-500/10 ring-orange-500/15" />
            </>
          ) : insights.isTutor ? (
            <>
              <MetricCard label="Published programmes" value={compact(insights.activePrograms.length + insights.completedPrograms.length)} detail={`${insights.draftPrograms.length} still in draft`} Icon={BookOpenCheck} />
              <MetricCard label="New learners" value={compact(insights.currentManagedEnrollments.length)} detail={`${period}-day enrolment activity`} Icon={GraduationCap} tone="text-emerald-700 bg-emerald-500/10 ring-emerald-500/15" />
              <MetricCard label="Teaching clubs" value={compact(data?.managedClubs.length || 0)} detail="Communities you lead" Icon={IconClubs} tone="text-violet-700 bg-violet-500/10 ring-violet-500/15" />
              <MetricCard label="Creator posts" value={compact(data?.posts.length || 0)} detail="Published teaching and proof updates" Icon={IconProfile} tone="text-orange-700 bg-orange-500/10 ring-orange-500/15" />
            </>
          ) : (
            <>
              <MetricCard label="Posts" value={compact(data?.posts.length || 0)} detail={insights.postChange === 0 ? "Published so far" : `${insights.postChange > 0 ? "+" : ""}${insights.postChange}% in this period`} Icon={IconProfile} />
              <MetricCard label="Learning" value={compact(data?.enrollments.length || 0)} detail={insights.learningChange === 0 ? "Bootcamps joined" : `${insights.learningChange > 0 ? "+" : ""}${insights.learningChange}% enrolments`} Icon={IconLearn} tone="text-emerald-700 bg-emerald-500/10 ring-emerald-500/15" />
              <MetricCard label="Clubs" value={compact(data?.clubs.length || 0)} detail="Communities joined" Icon={IconClubs} tone="text-violet-700 bg-violet-500/10 ring-violet-500/15" />
              <MetricCard label="Momentum" value={compact(insights.currentPosts.length + insights.currentLearning.length + insights.currentNetwork.length)} detail={`${period}-day activity`} Icon={Flame} tone="text-orange-700 bg-orange-500/10 ring-orange-500/15" />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
