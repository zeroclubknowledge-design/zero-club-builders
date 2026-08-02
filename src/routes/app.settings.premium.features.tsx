import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronLeft, UsersRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { CLUB_LIMITS, PLAN_NAMES, resolvePlanKey } from "@/features/membership/plans";

export const Route = createFileRoute("/app/settings/premium/features")({
  component: PlanFeatures,
});

const planFeatures: Record<string, string[]> = {
  learner_basic: ["Builder profile and Feed", "Join and participate in public Clubs", "ZeroNotes publishing", "Zero AI starter access", "2 rewarded Zero Games competitions weekly", "Standard XP earning"],
  learner_premium: ["Everything in Learner Basic", "Zero AI learning assistant", "5 rewarded Zero Games competitions weekly", "2x daily XP multiplier", "3% Bootcamp discount", "Post editing and longer posts", "Private Club access", "Premium profile badge"],
  creator: ["Relevant Learner Premium experience", "12 rewarded Zero Games competitions weekly, maximum 2 daily", "Create and manage 3 permanent Clubs", "Club customization and member management", "Moderation and analytics", "Community growth and activity insights", "First Club receives 6 months premium experience", "Creator Rewards eligibility"],
  tutor_basic: ["Create and sell Bootcamps", "2 rewarded Zero Games competitions weekly", "Temporary cohort Club for each Bootcamp", "Curriculum, learner, pricing, and coupon management", "Create 1 permanent Club", "Tutor profile, Feed, and community access"],
  tutor_premium: ["Everything in Tutor Basic", "8 rewarded Zero Games competitions weekly, maximum 2 daily", "Create up to 5 permanent Clubs", "Connect Bootcamps to existing Clubs", "Zero AI knowledge interview", "Approved Bootcamp verification", "Zero AI curriculum and teaching assistance"],
  tutor_premium_plus: ["Everything in Tutor Premium", "20 rewarded Zero Games competitions weekly, maximum 3 daily", "Create up to 10 permanent Clubs", "Advanced Zero AI cohort assistance", "Multi-Bootcamp verification support", "Unlimited existing-Club connections", "Priority interview access and tutor support"],
  institution: ["30-day Digital Hub trial", "21 to 84 rewarded Zero Games competitions weekly based on organisation plan", "Tutor and role management", "Multi-Bootcamp oversight", "Cohort participation analytics", "Organisation-specific Club capacity", "Priority onboarding and support"],
};

function PlanFeatures() {
  const { data: profile } = useQuery({
    queryKey: ['my_profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      return data;
    }
  });

  const planKey = resolvePlanKey(profile);
  const planName = planKey === "institution" ? "Institution" : PLAN_NAMES[planKey];
  const clubLimit = planKey === "institution" ? null : CLUB_LIMITS[planKey];
  const features = planFeatures[planKey] || planFeatures.learner_basic;

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <header className="sticky top-0 z-40 flex items-center border-b border-border bg-background/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl">
        <Link to="/app/settings/premium" className="mr-4 grid h-9 w-9 place-items-center rounded-md border border-border" aria-label="Back"><ChevronLeft className="h-4 w-4" /></Link>
        <div><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Membership</p><h1 className="text-[18px] font-semibold">Current plan features</h1></div>
      </header>

      <main className="mx-auto max-w-[760px] px-4 py-7 sm:px-6">
        <section className="border-b border-border pb-7">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-primary/10 text-primary"><UsersRound className="h-5 w-5 fill-current" /></span>
          <p className="mt-5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current plan</p>
          <h2 className="mt-1 font-display text-[29px] font-semibold tracking-tight">{planName}</h2>
          <p className="mt-2 text-[11.5px] text-muted-foreground">Permanent Club capacity: {clubLimit === null ? "organisation-specific" : clubLimit}</p>
        </section>

        <section className="mt-6 divide-y divide-border border-y border-border">
          {features.map((feature) => (
            <div key={feature} className="flex items-start gap-3 py-4">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Check className="h-3 w-3" strokeWidth={3} /></span>
              <p className="text-[12.5px] leading-5">{feature}</p>
            </div>
          ))}
        </section>

        {planKey === "creator" && (
          <Link to="/app/creator" className="mt-5 flex h-11 items-center justify-center gap-2 rounded-md border border-border text-[11.5px] font-semibold">Open Creator Workspace <ArrowRight className="h-4 w-4" /></Link>
        )}
        <Link to="/app/premium" className="mt-3 flex h-11 items-center justify-center gap-2 rounded-md bg-foreground text-[11.5px] font-semibold text-background">Compare all plans <ArrowRight className="h-4 w-4" /></Link>
      </main>
    </div>
  );
}
