import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BarChart3, CalendarDays, Gift, Loader2, ShieldCheck, Sparkles, UsersRound } from "@/components/icons/glyphs";
import { useGoBack } from "@/hooks/useGoBack";
import { supabase } from "@/lib/supabase";
import { fallbackClubCapacity, isBootcampCohortClub } from "@/features/membership/plans";

export const Route = createFileRoute("/app/creator")({
  component: CreatorWorkspace,
  head: () => ({ meta: [{ title: "Creator Workspace - Zero Club" }] }),
});

function CreatorWorkspace() {
  const { data, isLoading } = useQuery({
    queryKey: ["creator-workspace"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in");
      const [{ data: profile, error: profileError }, { data: clubs }, { data: dashboard }, { data: rewards }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", session.user.id).single(),
        supabase.from("clubs").select("*").eq("creator_id", session.user.id).order("created_at", { ascending: false }),
        supabase.rpc("get_my_subscription_dashboard"),
        supabase.from("creator_reward_entries").select("*, period:period_id(period_start, period_end, status)").eq("profile_id", session.user.id).order("created_at", { ascending: false }).limit(12),
      ]);
      if (profileError) throw profileError;
      const permanentClubs = (clubs || []).filter((club: any) => !isBootcampCohortClub(club));
      const clubIds = permanentClubs.map((club: any) => club.id);
      let memberRows: any[] = [];
      let messageRows: any[] = [];
      if (clubIds.length) {
        const [{ data: members }, { data: messages }] = await Promise.all([
          supabase.from("club_members").select("club_id, profile_id").in("club_id", clubIds).eq("status", "active"),
          supabase.from("club_messages").select("club_id, created_at").in("club_id", clubIds).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
        ]);
        memberRows = members || [];
        messageRows = messages || [];
      }
      const capacity = dashboard?.club_capacity || fallbackClubCapacity(profile, permanentClubs.length);
      return { profile, permanentClubs, capacity, subscription: dashboard?.subscription, rewards: rewards || [], memberRows, messageRows };
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isCreator = data?.capacity?.plan_key === "creator";
  if (!isCreator) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas text-foreground">
        <Header />
        <main className="mx-auto mt-2 flex w-full max-w-[680px] flex-1 flex-col items-center bg-card px-6 pb-28 pt-12 text-center md:mb-6 md:flex-none md:rounded-xl md:border md:border-border md:pb-10">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]"><UsersRound className="h-7 w-7" /></span>
          <p className="mt-5 text-[12px] font-semibold text-[#a3186f]">Creator pathway</p>
          <h2 className="mt-1.5 max-w-[380px] font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.02em]">Build your own communities with Creator</h2>
          <p className="mt-2.5 max-w-[400px] text-[15px] leading-relaxed text-muted-foreground">
            Creator unlocks three permanent Clubs, community management, insight, Creator Rewards eligibility, and six months of premium Club experience for your first Club.
          </p>
          <Link to="/app/premium" className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-6 text-[15px] font-semibold text-background transition hover:opacity-90">
            View Creator plan <ArrowRight className="h-4 w-4" />
          </Link>
        </main>
      </div>
    );
  }

  const capacity = data.capacity;
  const memberCount = new Set(data.memberRows.map((member: any) => member.profile_id)).size;
  const benefitEnd = data.profile?.first_club_benefit_expires_at ? new Date(data.profile.first_club_benefit_expires_at) : null;
  const rewardTotal = data.rewards.filter((entry: any) => entry.status === "paid").reduce((sum: number, entry: any) => sum + Number(entry.reward_amount || 0), 0);
  const stats = [
    { label: "Active members", value: memberCount.toLocaleString(), Icon: UsersRound },
    { label: "Messages, 30 days", value: data.messageRows.length.toLocaleString(), Icon: BarChart3 },
    { label: "Rewards paid", value: rewardTotal.toLocaleString(), Icon: Gift },
  ];
  const used = Math.min(1, capacity.permanent_club_count / Math.max(1, capacity.permanent_club_limit));

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <Header
        action={
          <Link to="/app/clubs" className="mr-1 flex h-9 shrink-0 items-center rounded-full bg-foreground px-4 text-[14px] font-semibold text-background">
            Manage clubs
          </Link>
        }
      />

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[14px] font-semibold">Permanent club capacity</p>
            <p className="font-display text-[20px] font-semibold tabular-nums">
              {capacity.permanent_club_count}<span className="text-muted-foreground"> / {capacity.permanent_club_limit}</span>
            </p>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-foreground/[0.07]">
            <div className="h-full rounded-full bg-[#cc208f]" style={{ width: `${used * 100}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">{capacity.remaining} {capacity.remaining === 1 ? "club" : "clubs"} remaining on the Creator plan</p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {stats.map(({ label, value, Icon }) => (
              <div key={label} className="rounded-xl border border-foreground/10 p-3">
                <Icon className="h-[18px] w-[18px] text-[#cc208f]" />
                <p className="mt-2 font-display text-[22px] font-semibold leading-none tabular-nums">{value}</p>
                <p className="mt-1 text-[12px] leading-tight text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="font-display text-[18px] font-semibold">Your clubs</h2>
            <Link to="/app/clubs" className="text-[14px] font-semibold text-[#a3186f]">New club</Link>
          </div>
          {data.permanentClubs.length ? (
            data.permanentClubs.map((club: any) => {
              const clubMembers = data.memberRows.filter((member: any) => member.club_id === club.id).length;
              return (
                <Link
                  key={club.id}
                  to="/app/clubs/chat"
                  search={{ clubId: club.id, showRules: undefined }}
                  className="flex items-center gap-3 border-t border-border/60 px-4 py-3 hover:bg-foreground/[0.02]"
                >
                  <img src={club.logo_url || club.banner_url || "/logo.png"} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" loading="lazy" decoding="async" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{club.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {clubMembers} {clubMembers === 1 ? "member" : "members"} · {club.continuity_mode ? "Continuity mode" : "Active"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })
          ) : (
            <div className="border-t border-border/60 px-4 py-10 text-center">
              <p className="text-[15px] font-semibold">Your first club starts the clock</p>
              <p className="mx-auto mt-1 max-w-[340px] text-[13px] leading-relaxed text-muted-foreground">Create it when you're ready to use the six-month premium experience.</p>
              <Link to="/app/clubs" className="mt-4 inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background">Create your first club</Link>
            </div>
          )}
        </section>

        <section className="bg-[#171217] p-4 text-white md:rounded-xl">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-[#f28fd0]"><Sparkles className="h-5 w-5" /></span>
            <div>
              <p className="text-[12px] font-semibold text-[#f28fd0]">First club benefit</p>
              <h3 className="mt-0.5 text-[16px] font-semibold">Six months of premium club experience</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-white/60">
                {benefitEnd
                  ? `Activated once and available until ${benefitEnd.toLocaleDateString()}. Deleting the club does not reset this benefit.`
                  : "The six-month period starts when you create your first permanent club, not when you subscribe."}
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-start gap-3 bg-card p-4 md:rounded-xl md:border md:border-border">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1a7f4b]/10 text-[#1a7f4b]"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <p className="text-[15px] font-semibold">Community continuity</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              If a paid membership expires, communities and content remain available. Premium management tools can pause after the grace period and return on renewal.
            </p>
            {data.subscription?.renewal_date && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold">
                <CalendarDays className="h-4 w-4" /> Renews {new Date(data.subscription.renewal_date).toLocaleDateString()}
              </p>
            )}
          </div>
        </section>

        <section className="flex-1 bg-card pb-28 md:flex-none md:overflow-hidden md:rounded-xl md:border md:border-border md:pb-0">
          <div className="px-4 pb-2 pt-4">
            <h2 className="font-display text-[18px] font-semibold">Creator Rewards</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">Based on quality, activity, retention and verified value — never club count alone.</p>
          </div>
          {data.rewards.length ? (
            data.rewards.map((entry: any) => (
              <div key={entry.id} className="flex items-center gap-3 border-t border-border/60 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">Creator score {Number(entry.creator_score || 0).toLocaleString()}</p>
                  <p className="text-[13px] text-muted-foreground">{entry.period?.period_start} to {entry.period?.period_end}</p>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-semibold tabular-nums">{Number(entry.reward_amount || 0).toLocaleString()}</p>
                  <p className={`text-[12px] font-semibold capitalize ${entry.status === "paid" ? "text-[#1a7f4b]" : "text-muted-foreground"}`}>{entry.status}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="border-t border-border/60 px-4 py-9 text-center text-[13px] text-muted-foreground">Reward periods will appear here once approved by Zero Club.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function Header({ action }: { action?: React.ReactNode }) {
  const goBack = useGoBack("/app");
  return (
    <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
        <button onClick={goBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
          <ArrowLeft className="h-[22px] w-[22px]" />
        </button>
        <h1 className="flex-1 font-display text-[18px] font-semibold">Creator workspace</h1>
        {action}
      </div>
    </header>
  );
}
