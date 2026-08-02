import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, CalendarDays, ChevronLeft, Gift, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
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

  if (isLoading) return <div className="grid min-h-[60vh] place-items-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  const isCreator = data?.capacity?.plan_key === "creator";
  if (!isCreator) {
    return (
      <div className="min-h-screen bg-background px-4 py-12 md:px-8">
        <div className="mx-auto max-w-[720px] border-y border-border py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-primary/10 text-primary"><UsersRound className="h-5 w-5 fill-current" /></span>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.13em] text-primary">Creator pathway</p>
          <h1 className="mt-2 font-display text-[30px] font-semibold tracking-tight">Build your own communities with Creator.</h1>
          <p className="mx-auto mt-3 max-w-lg text-[12.5px] leading-6 text-muted-foreground">Creator unlocks three permanent Clubs, community management, insight, Creator Rewards eligibility, and six months of premium Club experience for your first Club.</p>
          <Link to="/app/premium" className="mt-7 inline-flex h-11 items-center gap-2 rounded-md bg-foreground px-5 text-[12px] font-semibold text-background">View Creator plan <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
    );
  }

  const capacity = data.capacity;
  const memberCount = new Set(data.memberRows.map((member: any) => member.profile_id)).size;
  const benefitEnd = data.profile?.first_club_benefit_expires_at ? new Date(data.profile.first_club_benefit_expires_at) : null;
  const rewardTotal = data.rewards.filter((entry: any) => entry.status === "paid").reduce((sum: number, entry: any) => sum + Number(entry.reward_amount || 0), 0);

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl md:px-8">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between">
          <div className="flex items-center gap-3"><Link to="/app" aria-label="Back" className="grid h-9 w-9 place-items-center rounded-md border border-border"><ChevronLeft className="h-4 w-4" /></Link><div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Community operations</p><h1 className="text-[18px] font-semibold tracking-tight">Creator Workspace</h1></div></div>
          <Link to="/app/clubs" className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-[10.5px] font-semibold text-background">Manage Clubs <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-7 md:px-8 md:py-10">
        <section className="grid gap-6 border-b border-border pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Creator plan</p><h2 className="mt-2 max-w-2xl font-display text-[31px] font-semibold leading-tight tracking-tight md:text-[42px]">Build communities people return to.</h2><p className="mt-3 max-w-xl text-[13px] leading-6 text-muted-foreground">Manage permanent Clubs, understand community health, and keep contribution quality visible.</p></div>
          <div className="flex items-center gap-3 border-l-2 border-primary pl-4"><div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Permanent Club capacity</p><p className="mt-1 text-[26px] font-semibold tabular-nums">{capacity.permanent_club_count} / {capacity.permanent_club_limit}</p></div></div>
        </section>

        <section className="mt-6 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
          {[{ label: "Active members", value: memberCount, Icon: UsersRound }, { label: "30-day activity", value: data.messageRows.length, Icon: BarChart3 }, { label: "Rewards paid", value: rewardTotal.toLocaleString(), Icon: Gift }].map((item) => <div key={item.label} className="bg-card p-5"><item.Icon className="h-4 w-4 fill-current text-primary" /><p className="mt-4 text-[25px] font-semibold tracking-tight tabular-nums">{item.value}</p><p className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{item.label}</p></div>)}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.72fr]">
          <div className="border-y border-border py-5">
            <div className="flex items-center justify-between"><div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Your communities</p><h3 className="mt-1 text-[18px] font-semibold">Permanent Clubs</h3></div><span className="text-[10px] text-muted-foreground">{capacity.remaining} remaining</span></div>
            <div className="mt-4 divide-y divide-border border-y border-border">
              {data.permanentClubs.length ? data.permanentClubs.map((club: any) => {
                const clubMembers = data.memberRows.filter((member: any) => member.club_id === club.id).length;
                return <Link key={club.id} to="/app/clubs/chat" search={{ clubId: club.id, showRules: undefined }} className="flex items-center gap-3 py-4"><img src={club.logo_url || club.banner_url || "/logo.png"} alt="" className="h-10 w-10 rounded-md object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-[12.5px] font-semibold">{club.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{clubMembers} members · {club.continuity_mode ? "Continuity mode" : "Active"}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>;
              }) : <div className="py-10 text-center"><p className="text-[12px] font-semibold">Your first Club starts the clock.</p><p className="mt-1 text-[10.5px] text-muted-foreground">Create it when you are ready to use the six-month premium experience.</p><Link to="/app/clubs" className="mt-4 inline-flex text-[11px] font-semibold text-primary">Create your first Club</Link></div>}
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-md bg-[#171217] p-5 text-white"><Sparkles className="h-5 w-5 fill-[#f28fd0] text-[#f28fd0]" /><p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#f28fd0]">First Club benefit</p><h3 className="mt-1 text-[17px] font-semibold">Six months of premium Club experience</h3><p className="mt-2 text-[11px] leading-5 text-white/55">{benefitEnd ? `Activated once and available until ${benefitEnd.toLocaleDateString()}. Deleting the Club does not reset this benefit.` : "The six-month period starts when you create your first permanent Club, not when you subscribe."}</p></section>
            <section className="rounded-md border border-border bg-card p-5"><ShieldCheck className="h-5 w-5 fill-current text-primary" /><p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Community continuity</p><p className="mt-2 text-[11px] leading-5 text-muted-foreground">If a paid membership expires, communities and content remain available. Premium management tools can pause after the grace period and return on renewal.</p>{data.subscription?.renewal_date && <p className="mt-3 flex items-center gap-2 text-[10px] font-semibold"><CalendarDays className="h-3.5 w-3.5" /> Renewal {new Date(data.subscription.renewal_date).toLocaleDateString()}</p>}</section>
          </div>
        </section>

        <section className="mt-8 border-t border-border pt-6"><div className="flex items-end justify-between gap-4"><div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Creator Rewards</p><h3 className="mt-1 text-[18px] font-semibold">Contribution history</h3><p className="mt-1 text-[10.5px] text-muted-foreground">Rewards are based on quality, activity, retention, and verified value, never Club count alone.</p></div></div><div className="mt-4 overflow-hidden rounded-md border border-border bg-card">{data.rewards.length ? data.rewards.map((entry: any) => <div key={entry.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-border px-4 py-3 last:border-0"><div><p className="text-[11.5px] font-semibold">Creator score {Number(entry.creator_score || 0).toLocaleString()}</p><p className="mt-0.5 text-[9.5px] text-muted-foreground">{entry.period?.period_start} to {entry.period?.period_end}</p></div><div className="text-right"><p className="text-[11.5px] font-semibold tabular-nums">{Number(entry.reward_amount || 0).toLocaleString()}</p><p className="mt-0.5 text-[9px] capitalize text-muted-foreground">{entry.status}</p></div></div>) : <div className="px-4 py-9 text-center text-[10.5px] text-muted-foreground">Reward periods will appear here once approved by Zero Club.</div>}</div></section>
      </main>
    </div>
  );
}
