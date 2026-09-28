import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, Building2, ArrowLeft, GraduationCap, ThumbsUp, Loader2, MessageSquare, Repeat2, Rocket, Sparkles, Users } from "@/components/icons/glyphs";
import { useMemo, useState, type ElementType } from "react";
import { IconClubs, IconLearn } from "@/components/icons/nav";
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
}: {
  label: string;
  value: string;
  detail: string;
  Icon?: ElementType;
  tone?: string;
}) {
  // A change reads green when it went up and pink when it went down; plain
  // context lines stay grey.
  const trend = /^\+\d/.test(detail) ? "up" : /^-\d/.test(detail) ? "down" : null;
  return (
    <article className="min-w-0 rounded-xl border border-foreground/10 p-3">
      <p className="truncate text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-[24px] font-semibold leading-tight text-foreground tabular-nums">{value}</p>
      <p className={`mt-0.5 line-clamp-2 text-[12px] font-medium leading-4 ${trend === "up" ? "text-[#1a7f4b]" : trend === "down" ? "text-[#cc208f]" : "text-muted-foreground"}`}>
        {trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}{detail}
      </p>
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
      <div className="flex min-h-[70vh] items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-canvas">
      <header className="sticky top-0 z-30 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button type="button" onClick={goBack} className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]" aria-label="Back">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold text-foreground">Your metrics</h1>
          <span className="mr-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${isFetching ? "animate-pulse bg-amber-500" : "bg-[#1a7f4b]"}`} />
            Live
          </span>
        </div>
        <div className="zc-page-width mx-auto flex w-full max-w-[680px] gap-2 px-3 pb-3">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setPeriod(option.value)}
              className={`h-8 rounded-full px-3.5 text-[14px] font-semibold transition ${period === option.value ? "bg-foreground text-background" : "border border-foreground/30 text-muted-foreground hover:border-foreground/50"}`}
            >
              {option.value} days
            </button>
          ))}
        </div>
      </header>

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        <section className={SECTION}>
          <p className="text-[12px] font-semibold text-[#a3186f]">{roleView.eyebrow}</p>
          <h2 className="mt-1 font-display text-[20px] font-semibold leading-tight text-foreground">{roleView.title}</h2>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {insights.isInstitution ? (
              <>
                <MetricCard label="Tutors" value={compact(data?.institutionTutors.length || 0)} detail="Faculty connected" />
                <MetricCard label="Programmes" value={compact(data?.managedBootcamps.length || 0)} detail={`${insights.activePrograms.length} currently active`} />
                <MetricCard label="Learners" value={compact(data?.managedEnrollments.length || 0)} detail={insights.enrollmentChange === 0 ? "Across all cohorts" : `${insights.enrollmentChange > 0 ? "+" : ""}${insights.enrollmentChange}% in this period`} />
                <MetricCard label="Programme value" value={currency(insights.estimatedProgramValue)} detail="Gross value of enrolments" />
              </>
            ) : insights.isTutor ? (
              <>
                <MetricCard label="Bootcamps" value={compact(data?.managedBootcamps.length || 0)} detail={`${insights.activePrograms.length} active, ${insights.draftPrograms.length} draft`} />
                <MetricCard label="Learners" value={compact(data?.managedEnrollments.length || 0)} detail={insights.enrollmentChange === 0 ? "Across your teaching" : `${insights.enrollmentChange > 0 ? "+" : ""}${insights.enrollmentChange}% in this period`} />
                <MetricCard label="Teaching reach" value={compact(insights.totalEngagement)} detail="Engagement on your work" />
                <MetricCard label="Portfolio value" value={currency(insights.estimatedProgramValue)} detail="Gross value of enrolments" />
              </>
            ) : (
              <>
                <MetricCard label="XP earned" value={compact(data?.profile?.xp || 0)} detail="Total on your record" />
                <MetricCard label="Proofs shipped" value={compact(insights.proofPosts.length)} detail={insights.buildChange === 0 ? "No change this period" : `${insights.buildChange > 0 ? "+" : ""}${insights.buildChange}% vs previous`} />
                <MetricCard label="Engagement" value={compact(insights.totalEngagement)} detail={insights.engagementChange === 0 ? "Across all your work" : `${insights.engagementChange > 0 ? "+" : ""}${insights.engagementChange}% in this period`} />
                <MetricCard label="Followers" value={compact(data?.followers.length || 0)} detail={insights.networkChange === 0 ? `You follow ${compact(data?.following.length || 0)}` : `${insights.networkChange > 0 ? "+" : ""}${insights.networkChange}% new followers`} />
              </>
            )}
          </div>
        </section>

        <section className={SECTION}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[18px] font-semibold">Momentum</h2>
            <span className="text-[13px] text-muted-foreground">{insights.totalActivity} actions · last 7 days</span>
          </div>
          <div className="mt-4 flex h-[150px] items-end gap-3 border-b border-foreground/10 px-1">
            {insights.activity.map((day, index) => {
              const height = day.value === 0 ? 4 : Math.max(12, Math.round((day.value / insights.activityMax) * 100));
              const isToday = index === insights.activity.length - 1;
              return (
                <div
                  key={`${day.label}-${index}`}
                  className={`flex-1 rounded-t-md transition-all duration-500 ${isToday ? "bg-[#cc208f]" : "bg-foreground/15"}`}
                  style={{ height: `${height}%` }}
                  title={`${day.value} ${day.value === 1 ? "action" : "actions"}`}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-3 px-1 text-center text-[11px] text-muted-foreground">
            {insights.activity.map((day, index) => (
              <span key={`${day.label}-${index}-l`} className={`flex-1 ${index === insights.activity.length - 1 ? "font-semibold text-foreground" : ""}`}>{day.label}</span>
            ))}
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            {insights.isOperator ? "Learner enrolments, programmes and publishing." : "Posts, builds, learning and new connections."}
          </p>
        </section>

        <section className={SECTION}>
          <h2 className="font-display text-[18px] font-semibold">{portfolioHeading}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {portfolioStats.map((stat) => (
              <div key={stat.label} className="rounded-[10px] bg-foreground/[0.04] px-3 py-2.5">
                <p className="text-[18px] font-semibold tabular-nums">{compact(stat.value)}</p>
                <p className="text-[12px] text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={SECTION}>
          <h2 className="font-display text-[18px] font-semibold">
            {insights.isInstitution ? "Latest programme" : insights.isTutor ? "Latest bootcamp" : "Top content"}
          </h2>
          {insights.isOperator && featuredProgram ? (
            <div className="mt-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{featuredProgram.title}</p>
                <p className="text-[13px] text-muted-foreground">
                  {featuredProgramLearners} learners · {currency(Number(featuredProgram.price || 0))}
                </p>
              </div>
              <span className="rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[12px] font-semibold capitalize text-foreground/75">{featuredProgram.status}</span>
            </div>
          ) : !insights.isOperator && insights.topPost ? (
            <Link to="/app/post/$id" params={{ id: insights.topPost.id }} className="mt-3 block">
              <p className="line-clamp-2 text-[15px] leading-snug text-foreground">
                {String(insights.topPost.content || "").replace(/<[^>]*>/g, " ").replace(/\*\*/g, "")}
              </p>
              <p className="mt-1.5 flex items-center gap-3 text-[13px] text-muted-foreground">
                <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" />{insights.topPost.likes_count || 0}</span>
                <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{insights.topPost.comments_count || 0}</span>
                <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" />{insights.topPost.reposts_count || 0}</span>
                <span className="ml-auto font-semibold text-foreground">{compact(insights.topPostEngagement)} total</span>
              </p>
            </Link>
          ) : (
            <p className="mt-2 text-[14px] text-muted-foreground">
              {insights.isOperator ? "Your programme data appears here after you create a bootcamp." : "Your published work appears here once it starts gathering signal."}
            </p>
          )}
        </section>

        <section className={SECTION}>
          <h2 className="font-display text-[18px] font-semibold">This period</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {insights.isInstitution ? (
              <>
                <MetricCard label="Active programmes" value={compact(insights.activePrograms.length)} detail={`${insights.draftPrograms.length} drafts to launch`} />
                <MetricCard label="New enrolments" value={compact(insights.currentManagedEnrollments.length)} detail={`Last ${period} days`} />
                <MetricCard label="Learning clubs" value={compact(data?.managedClubs.length || 0)} detail="Institution and tutor clubs" />
                <MetricCard label="Published" value={compact(insights.activePrograms.length + insights.completedPrograms.length)} detail="Active and completed" />
              </>
            ) : insights.isTutor ? (
              <>
                <MetricCard label="Published" value={compact(insights.activePrograms.length + insights.completedPrograms.length)} detail={`${insights.draftPrograms.length} still in draft`} />
                <MetricCard label="New learners" value={compact(insights.currentManagedEnrollments.length)} detail={`Last ${period} days`} />
                <MetricCard label="Teaching clubs" value={compact(data?.managedClubs.length || 0)} detail="Clubs you lead" />
                <MetricCard label="Posts" value={compact(data?.posts.length || 0)} detail="Teaching and proof updates" />
              </>
            ) : (
              <>
                <MetricCard label="Posts" value={compact(data?.posts.length || 0)} detail={insights.postChange === 0 ? "Published so far" : `${insights.postChange > 0 ? "+" : ""}${insights.postChange}% in this period`} />
                <MetricCard label="Learning" value={compact(data?.enrollments.length || 0)} detail={insights.learningChange === 0 ? "Bootcamps joined" : `${insights.learningChange > 0 ? "+" : ""}${insights.learningChange}% enrolments`} />
                <MetricCard label="Clubs" value={compact(data?.clubs.length || 0)} detail="Communities joined" />
                <MetricCard label="Activity" value={compact(insights.currentPosts.length + insights.currentLearning.length + insights.currentNetwork.length)} detail={`Last ${period} days`} />
              </>
            )}
          </div>
        </section>

        <section className={`${SECTION} flex-1 pb-28 md:flex-none md:pb-4`}>
          <h2 className="font-display text-[18px] font-semibold">Next move</h2>
          <Link to={insights.nextAction.to} className="mt-3 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#cc208f]/10 text-[#cc208f]">
              <insights.nextAction.Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-foreground">{insights.nextAction.label}</span>
              <span className="block text-[13px] text-muted-foreground">{insights.nextAction.detail}</span>
            </span>
            <span className="flex h-8 shrink-0 items-center rounded-full bg-foreground px-3.5 text-[14px] font-semibold text-background">Go</span>
          </Link>
        </section>
      </main>
    </div>
  );
}

const SECTION = "bg-card p-4 md:rounded-xl md:border md:border-border";
