import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  Check,
  ArrowLeft,
  Crown,
  GraduationCap,
  LifeBuoy,
  Loader2,
  PenLine,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "@/components/icons/glyphs";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { RequestFundsButton } from "@/components/RequestFundsButton";
import { toast } from "sonner";
import { InstitutionOnboardingDrawer } from "@/components/InstitutionOnboardingDrawer";
import { formatNaira, membershipAudience, planForMode, planMatchesMode, PLAN_AUDIENCE, PLAN_NAMES } from "@/features/membership/plans";
import { useUser } from "@/hooks/useUser";
import { ZeroGiftPaymentOption, zeroGiftBalanceQueryKey } from "@/components/ZeroGiftPaymentOption";
import { useGoBack } from "@/hooks/useGoBack";
import { Switch } from "@/components/ui/switch";
import { MembershipGiftInbox } from "@/features/membership/MembershipGifts";

export const Route = createFileRoute("/app/premium")({
  component: MembershipPage,
  // ?institution=1 opens the Digital Hub application straight away — used by
  // onboarding for people setting up a school, academy or company.
  validateSearch: (search: Record<string, unknown>): { institution?: number } => ({
    institution: Number(search.institution) === 1 ? 1 : undefined,
  }),
});

type Audience = "Learner" | "Creator" | "Tutor" | "Institution";

type Plan = {
  id: string;
  planKey?: string;
  name: string;
  eyebrow: string;
  priceValue: number | null;
  description: string;
  audiences: Audience[];
  features: string[];
  limitations?: string[];
  recommendedFor: Audience;
  storedTier?: "Basic" | "Premium" | "Premium+";
  featured?: boolean;
  billingLabel: string;
  pricingNote?: string;
};

const plans: Plan[] = [
  {
    id: "learner-basic",
    planKey: "learner_basic",
    name: "Basic",
    eyebrow: "Learner essentials",
    priceValue: 0,
    description: "A complete starting point for learning in public and building a proof-backed profile.",
    audiences: ["Learner"],
    recommendedFor: "Learner",
    storedTier: "Basic",
    billingLabel: "forever",
    features: ["Builder profile and feed", "Public clubs and communities", "ZeroNotes publishing", "Zero AI starter access", "2 rewarded Zero Games competitions weekly", "Standard XP earning"],
  },
  {
    id: "learner-premium",
    planKey: "learner_premium",
    name: "Premium",
    eyebrow: "Learner growth",
    priceValue: 3000,
    description: "More visibility, flexibility, and learning value for builders moving with intent.",
    audiences: ["Learner"],
    recommendedFor: "Learner",
    storedTier: "Premium",
    billingLabel: "/ month",
    featured: true,
    features: ["Zero AI learning assistant", "5 rewarded Zero Games competitions weekly", "2x daily XP multiplier", "3% bootcamp discount", "Post editing and longer posts", "Private club access", "Premium profile badge"],
  },
  {
    id: "creator",
    planKey: "creator",
    name: "Creator PRO",
    eyebrow: "Build communities",
    priceValue: 3000,
    description: "For learners ready to build, manage, and grow permanent communities on Zero Club.",
    audiences: ["Creator"],
    recommendedFor: "Creator",
    storedTier: undefined,
    featured: true,
    billingLabel: "/ month",
    features: ["12 rewarded Zero Games competitions weekly, maximum 2 daily", "Create up to 3 permanent Clubs", "Club customization and member management", "Moderation tools and Club analytics", "Community growth and activity insights", "6 months premium experience for your first Club", "Creator Rewards eligibility"],
    limitations: ["Creator Zero AI assistance is available with Creator Max"],
  },
  {
    id: "creator-max", planKey: "creator_max", name: "Creator Max", eyebrow: "Create with Zero AI",
    priceValue: 5000, description: "Everything in Creator PRO, with Zero AI for content, communities, and launches.",
    audiences: ["Creator"], recommendedFor: "Creator", billingLabel: "/ month",
    features: ["Everything in Creator PRO", "Create up to 3 permanent Clubs", "Zero AI creator assistant", "AI content, community, and launch planning", "Zero AI voice conversations"],
  },
  {
    id: "tutor-basic",
    planKey: "tutor_basic",
    name: "Basic",
    eyebrow: "Teach for free",
    priceValue: 0,
    description: "Create, launch, and sell bootcamps without paying for a tutor subscription.",
    audiences: ["Tutor"],
    recommendedFor: "Tutor",
    storedTier: "Basic",
    billingLabel: "forever",
    features: ["Create and sell bootcamps", "3 rewarded Zero Games competitions weekly", "Temporary cohort club for every bootcamp", "Curriculum and learner management", "Bootcamp pricing and coupons", "1 permanent Club", "Tutor profile, feed, and community access"],
    limitations: ["No Zero AI teaching assistance", "No verified bootcamp badge", "Cannot connect a bootcamp to an existing club"],
  },
  {
    id: "tutor-premium",
    planKey: "tutor_premium",
    name: "Tutor Pro",
    eyebrow: "Teach with confidence",
    priceValue: 7000,
    description: "Add trusted verification and connect each cohort to the community you already lead.",
    audiences: ["Tutor"],
    recommendedFor: "Tutor",
    storedTier: "Premium",
    billingLabel: "/ month",
    featured: true,
    features: ["Everything in Tutor Basic", "8 rewarded Zero Games competitions weekly, maximum 2 daily", "Create up to 5 permanent Clubs", "Connect bootcamps to existing clubs", "Verified badge for approved bootcamps"],
    limitations: ["Zero AI teaching assistance is available with Tutor Max"],
  },
  {
    id: "tutor-premium-plus",
    planKey: "tutor_premium_plus",
    name: "Tutor Max",
    eyebrow: "Scale your teaching",
    priceValue: 12000,
    description: "Advanced Zero AI and verification support for tutors running multiple programs and communities.",
    audiences: ["Tutor"],
    recommendedFor: "Tutor",
    storedTier: "Premium+",
    billingLabel: "/ month",
    features: ["Everything in Tutor Pro", "20 rewarded Zero Games competitions weekly, maximum 3 daily", "Create up to 10 permanent Clubs", "Zero AI curriculum, assessment, and teaching assistance", "Zero AI voice conversations", "Advanced Zero AI cohort assistance", "Multi-bootcamp verification support", "Unlimited existing-club connections", "Priority tutor support"],
  },
  {
    id: "institution-small",
    planKey: "institution_small",
    name: "Small Organisation",
    eyebrow: "Up to 500 learners",
    priceValue: 150000,
    description: "A Digital Hub for focused institutions coordinating tutors, programmes, and learner outcomes.",
    audiences: ["Institution"],
    recommendedFor: "Institution",
    billingLabel: "/ year",
    features: ["30-day free trial", "21 rewarded Zero Games competitions weekly, maximum 3 daily", "Digital Hub", "Tutor and role management", "Multi-bootcamp oversight", "Cohort participation analytics", "Priority onboarding and support"],
  },
  {
    id: "institution-large",
    planKey: "institution_large",
    name: "Large Organisation",
    eyebrow: "More than 500 learners",
    priceValue: 400000,
    description: "Organisation-wide learning operations with support for multiple campuses.",
    audiences: ["Institution"],
    recommendedFor: "Institution",
    featured: true,
    billingLabel: "/ year",
    features: ["30-day free trial", "56 rewarded Zero Games competitions weekly, maximum 8 daily", "Multiple-campus support", "Digital Hub", "Tutor and role management", "Multi-bootcamp oversight", "Cohort participation analytics", "Priority onboarding and support"],
  },
  {
    id: "institution-custom",
    planKey: "institution_custom",
    name: "Custom",
    eyebrow: "Designed together",
    priceValue: null,
    description: "A guided arrangement for institutions with specialised structure, scale, or support needs.",
    audiences: ["Institution"],
    recommendedFor: "Institution",
    billingLabel: "contact Zero Club",
    features: ["84 rewarded Zero Games competitions weekly, maximum 12 daily", "Custom Digital Hub scope", "Guided onboarding", "Organisation-specific Club capacity", "Programme and role configuration", "Priority implementation support"],
  },
];

const audienceCopy: Record<Audience, { title: string; description: string }> = {
  Learner: {
    title: "Don’t learn in silence",
    description: "Learn, publish progress, join focused communities, and make your work easier to discover.",
  },
  Creator: {
    title: "Build communities that compound",
    description: "Operate up to three permanent Clubs with management, insight, and a first-Club premium runway.",
  },
  Tutor: {
    title: "Turn expertise into outcomes",
    description: "Package knowledge, run structured cohorts, support learners, and earn from your teaching.",
  },
  Institution: {
    title: "Coordinate learning at scale",
    description: "Bring tutors, bootcamps, communities, and learner signals into one accountable workspace.",
  },
};

/*
 * A feature line deserves its own icon, the way the reference does it — a
 * column of identical ticks tells you nothing about what you are getting.
 * First match wins, so the list is ordered from most specific to least.
 */
const FEATURE_ICONS: Array<[RegExp, typeof Check]> = [
  [/zero ai|ai (assistance|curriculum|cohort|interview)|assistant/i, Bot],
  [/game|competition/i, Trophy],
  [/verified|badge/i, BadgeCheck],
  [/analytic|insight|oversight|signal/i, BarChart3],
  [/club|community|member|moderation|campus/i, Users],
  [/xp|multiplier|reward|earn/i, Zap],
  [/trial|6 months|renewal/i, CalendarDays],
  [/bootcamp|curriculum|cohort|learner|programme|program/i, GraduationCap],
  [/post|profile|feed|publish|edit|note/i, PenLine],
  [/discount|pricing|coupon|wallet|sell/i, Wallet],
  [/support|onboarding|priority|implementation/i, LifeBuoy],
  [/hub|organisation|organization|role/i, Building2],
];

function featureIcon(text: string) {
  for (const [pattern, Icon] of FEATURE_ICONS) if (pattern.test(text)) return Icon;
  return Check;
}

function MembershipPage() {
  const queryClient = useQueryClient();
  const goBack = useGoBack("/app");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showInstitutionForm, setShowInstitutionForm] = useState(Route.useSearch().institution === 1);
  const [applyZeroGift, setApplyZeroGift] = useState(false);

  const { data: profile, isLoading } = useUser();

  const { data: membershipDashboard } = useQuery({
    queryKey: ["membership-dashboard", profile?.id, profile?.account_type, profile?.active_mode, profile?.tier, profile?.is_admin],
    enabled: Boolean(profile?.id),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_subscription_dashboard");
      if (error) {
        console.warn("Membership lifecycle is not available yet:", error.message);
        return null;
      }
      return data as any;
    },
  });

  /*
   * Each account sees only its own plans: Learner plans in Learner mode,
   * Creator in Creator mode, Tutor for tutors, Institution for institutions.
   * Derived from the profile, so switching mode elsewhere changes it here.
   */
  const audience: Audience = membershipAudience(profile);

  const visiblePlans = useMemo(
    () => plans.filter((plan) => plan.audiences.includes(audience)),
    [audience]
  );

  /*
   * Derived, not synced. Storing the selection and then correcting it from an
   * effect when the audience changes is the classic way to end up with a
   * render loop; falling back here means switching audience simply lands on
   * that audience's headline plan with nothing to keep in step.
   */
  const selectedPlan =
    visiblePlans.find((plan) => plan.id === selectedPlanId) ||
    visiblePlans.find((plan) => plan.featured) ||
    visiblePlans[0];

  const subscribeMutation = useMutation({
    mutationFn: async (plan: Plan) => {
      if (!profile) throw new Error("Please sign in to manage your membership.");
      if (plan.id.startsWith("institution-")) return { plan, payment: null };
      if (plan.storedTier === "Basic") {
        const { data, error } = await supabase.rpc("downgrade_to_basic");
        if (error) throw error;
        return { plan, payment: data };
      }

      const { data, error } = await supabase.rpc("activate_membership", {
        requested_plan: plan.planKey,
        enable_auto_renew: false,
        p_apply_gift: applyZeroGift,
      });
      if (error) throw error;
      const payment = data as any;
      if (payment?.status === "insufficient_funds") {
        throw new Error(`Insufficient wallet balance. Add ${formatNaira(Number(payment.shortfall) || 0)} to continue.`);
      }
      return { plan, payment };
    },
    onSuccess: ({ plan, payment }) => {
      if (plan.id.startsWith("institution-")) {
        setShowInstitutionForm(true);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["my_profile"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["membership-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["clubs_data"] });
      queryClient.invalidateQueries({ queryKey: zeroGiftBalanceQueryKey("membership") });
      const giftApplied = Math.max(0, Number((payment as any)?.gift_applied) || 0);
      toast.success(
        plan.storedTier === "Basic"
          ? "Switched to Basic."
          : giftApplied > 0
            ? `${formatNaira(giftApplied)} Zero Card applied. ${plan.name} is now active.`
            : `${plan.name} is now active.`
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const renewMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("renew_my_membership", {
        p_apply_gift: applyZeroGift,
      });
      if (error) throw error;
      const payment = data as any;
      if (payment?.status === "insufficient_funds") {
        throw new Error(`Insufficient wallet balance. Add ${formatNaira(Number(payment.shortfall) || 0)} to renew.`);
      }
      return payment;
    },
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: ["membership-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["my_profile"] });
      queryClient.invalidateQueries({ queryKey: zeroGiftBalanceQueryKey("membership") });
      const giftApplied = Math.max(0, Number(payment?.gift_applied) || 0);
      toast.success(giftApplied > 0 ? `${formatNaira(giftApplied)} Zero Card applied. Membership renewed.` : "Membership renewed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const autoRenewMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.rpc("set_membership_auto_renew", { enabled });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["membership-dashboard"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  // Each account type shows its own plan: a Creator PRO (bought or gifted)
  // appears in Creator mode only, not on the Learner or Tutor side.
  const serverPlanKey: string | null = membershipDashboard?.plan_key ?? null;
  const currentPlanKey = planForMode(profile, serverPlanKey);
  const subscriptionHere = planMatchesMode(profile, serverPlanKey);
  const activeSubscription = subscriptionHere ? membershipDashboard?.subscription : null;
  const elsewhereAudience =
    !subscriptionHere && serverPlanKey && membershipDashboard?.subscription && PLAN_AUDIENCE[serverPlanKey]
      ? PLAN_AUDIENCE[serverPlanKey]
      : null;
  const elsewherePlanName = elsewhereAudience
    ? membershipDashboard?.plan?.name || (PLAN_NAMES as Record<string, string>)[serverPlanKey!] || "Your membership"
    : null;

  const isCurrentPlan = (plan?: Plan) => Boolean(plan?.planKey && plan.planKey === currentPlanKey);

  const handlePlanAction = (plan?: Plan) => {
    if (!plan) return;
    if (isCurrentPlan(plan) && !plan.id.startsWith("institution-")) return;
    // Institutions go through onboarding rather than a one-click purchase.
    if (plan.id.startsWith("institution-")) {
      setShowInstitutionForm(true);
      return;
    }
    subscribeMutation.mutate(plan);
  };

  const copy = audienceCopy[audience];
  const selectedIsCurrent = isCurrentPlan(selectedPlan);
  const selectedIsInstitution = Boolean(selectedPlan?.id.startsWith("institution-"));
  const priceText =
    selectedPlan?.priceValue === null
      ? "Custom"
      : selectedPlan?.priceValue === 0
        ? "Free"
        : formatNaira(selectedPlan?.priceValue || 0);

  const ctaBusy = subscribeMutation.isPending && subscribeMutation.variables?.id === selectedPlan?.id;

  if (isLoading) return <div className="grid min-h-[60dvh] place-items-center" role="status"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Loading account access</span></div>;

  if (profile?.is_admin) return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="flex items-center gap-3 px-4 py-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <button onClick={goBack} aria-label="Back" className="grid h-11 w-11 place-items-center"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-lg font-semibold">Administrator access</h1>
      </header>
      <main className="zc-page-width mx-auto w-full max-w-[680px] px-5 py-8">
        <Crown className="h-10 w-10 text-primary" />
        <h2 className="mt-5 text-3xl font-semibold">Everything is already unlocked</h2>
        <p className="mt-3 text-muted-foreground">Your Zero Club administrator account has full access for free. No subscription, renewal, or expiry.</p>
        <ul className="mt-7 space-y-4">
          {["All Learner, Creator, Tutor, and Institution features", "Zero AI chat and voice", "Unlimited Clubs and competition creation", "All portfolio designs and display themes", "Administration and moderation tools"].map(feature => <li key={feature} className="flex items-start gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />{feature}</li>)}
        </ul>
        <Link to="/app/admin" className="mt-8 block rounded-full bg-primary px-5 py-3 text-center font-semibold text-primary-foreground">Open Admin Control Center</Link>
        <Link to="/app/zero-ai" className="mt-3 block rounded-full border border-border px-5 py-3 text-center font-semibold">Open Zero AI</Link>
      </main>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f1e6] text-foreground dark:bg-background">
      <header className="sticky top-0 z-40 bg-[#f6f1e6]/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl dark:bg-background/95">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button type="button" onClick={goBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.05]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Go PRO</h1>
          <span className="flex items-center gap-1.5 pr-3 text-[13px] text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <strong className="font-semibold tabular-nums text-foreground">{Number(profile?.coins || 0).toLocaleString()}</strong> coins
          </span>
        </div>
      </header>

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col px-4 pb-28 pt-2 md:pb-10">
        <span className="inline-flex h-[26px] w-fit items-center gap-1.5 rounded-full bg-foreground px-2.5 text-[12px] font-bold tracking-[0.04em] text-[#e9c46a]">
          <Crown className="h-3.5 w-3.5" /> MEMBERSHIP
        </span>
        <h2 className="mt-3 font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.02em]">{copy.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{copy.description}</p>
        <MembershipGiftInbox userId={profile?.id} />

        <span className="mt-4 inline-flex h-7 w-fit items-center rounded-full bg-foreground/[0.06] px-3 text-[12.5px] font-semibold text-foreground">
          {audience} plans
        </span>

        <div className="mt-5 flex flex-col gap-3">
          {visiblePlans.map((plan) => {
            const active = plan.id === selectedPlan?.id;
            const current = isCurrentPlan(plan);
            return (
              <div
                key={plan.id}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                onClick={() => setSelectedPlanId(plan.id)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedPlanId(plan.id); } }}
                className={`relative cursor-pointer rounded-2xl bg-card p-4 text-left transition ${active ? "border-2 border-foreground" : "border border-foreground/12 hover:border-foreground/30"}`}
              >
                {(current || plan.featured) && (
                  <span className={`absolute -top-[11px] right-4 flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold ${current ? "bg-[#1a7f4b] text-white" : "bg-[#cc208f] text-white"}`}>
                    {current ? "CURRENT" : "POPULAR"}
                  </span>
                )}
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-[20px] font-semibold">{plan.name}</span>
                  <span className="shrink-0 text-[20px] font-semibold tabular-nums">
                    {plan.priceValue === null ? "Custom" : plan.priceValue === 0 ? "Free" : formatNaira(plan.priceValue)}
                    {plan.priceValue !== null && plan.priceValue > 0 && (
                      <span className="ml-0.5 text-[13px] font-medium text-muted-foreground">{plan.billingLabel}</span>
                    )}
                  </span>
                </div>
                <p className="mt-0.5 text-[14px] text-muted-foreground">{plan.eyebrow}</p>
                {active && (
                  <>
                    <ul className="mt-3 grid gap-2 border-t border-foreground/10 pt-3 text-[14px]">
                      {plan.features.map((feature) => {
                        const Icon = featureIcon(feature);
                        return (
                          <li key={feature} className="flex items-start gap-2.5">
                            <Icon className="mt-px h-[18px] w-[18px] shrink-0 text-[#1a7f4b]" />
                            <span className="leading-snug">{feature}</span>
                          </li>
                        );
                      })}
                    </ul>
                    {plan.limitations && plan.limitations.length > 0 && (
                      <div className="mt-3 border-t border-foreground/10 pt-3">
                        <p className="mb-1.5 text-[12px] font-semibold text-muted-foreground">Not included</p>
                        <ul className="grid gap-1.5 text-[13px] text-muted-foreground">
                          {plan.limitations.map((limitation) => (
                            <li key={limitation} className="flex items-start gap-2.5">
                              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current" />
                              <span>{limitation}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Zero Card credit, if any is waiting. Hides itself when there is
            none, so this space is normally empty. */}
        <div className="mt-3">
          <ZeroGiftPaymentOption
            service="membership"
            amount={selectedPlan?.priceValue || 0}
            applied={applyZeroGift}
            onAppliedChange={setApplyZeroGift}
            formatAmount={formatNaira}
          />
        </div>

        <button
          type="button"
          onClick={() => handlePlanAction(selectedPlan)}
          disabled={ctaBusy || isLoading || (selectedIsCurrent && !selectedIsInstitution)}
          className="mt-4 flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background transition hover:opacity-90 active:scale-[0.985] disabled:cursor-default disabled:opacity-40"
        >
          {ctaBusy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : selectedIsCurrent && !selectedIsInstitution ? (
            "Your current membership"
          ) : selectedIsInstitution ? (
            <>Start institution onboarding <ArrowRight className="h-4 w-4" /></>
          ) : selectedPlan?.priceValue === 0 ? (
            "Switch to Basic"
          ) : (
            `Get ${selectedPlan?.name}`
          )}
        </button>

        {/* Membership is the payment people most often come back to later
            because they were short on the day. */}
        {!selectedIsCurrent && !selectedIsInstitution && (selectedPlan?.priceValue || 0) > 0 && (
          <div className="mt-2">
            <RequestFundsButton
              amount={selectedPlan!.priceValue as number}
              purpose={`Zero Club ${selectedPlan?.name} membership`}
              label="Ask someone to cover this"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-foreground/25 text-[14px] font-semibold text-foreground transition hover:bg-foreground/[0.04] active:scale-[0.99]"
            />
          </div>
        )}

        <p className="mt-3 text-center text-[13px] text-muted-foreground">
          {selectedIsInstitution
            ? "A 30-day trial starts once your organisation is verified."
            : selectedPlan?.priceValue === 0
              ? "No payment needed. Basic stays free."
              : `${priceText} ${selectedPlan?.billingLabel}, paid from your Zero Club wallet.`}
        </p>

        {elsewhereAudience && (
          <section className="mt-5 rounded-2xl border border-foreground/10 bg-card p-4">
            <p className="text-[13px] text-muted-foreground">On your {elsewhereAudience} account</p>
            <p className="mt-0.5 text-[15px] font-semibold">{elsewherePlanName} is active in {elsewhereAudience} mode</p>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              Switch to {elsewhereAudience} mode to see and manage it. Plans above are for your {audience} account.
            </p>
          </section>
        )}

        {activeSubscription && (
          <section className="mt-5 rounded-2xl bg-card p-4">
            <p className="text-[13px] text-muted-foreground">Current membership</p>
            <p className="mt-0.5 text-[16px] font-semibold">{membershipDashboard?.plan?.name || String(currentPlanKey).replaceAll("_", " ")}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              <span className="capitalize">{String(activeSubscription.status).replaceAll("_", " ")}</span>
              {activeSubscription.renewal_date && <> · Renews {new Date(activeSubscription.renewal_date).toLocaleDateString()}</>}
            </p>
            <div className="mt-3 flex items-center gap-3 border-t border-foreground/10 pt-3">
              <span className="flex-1 text-[15px] font-medium">Auto-renew</span>
              <Switch checked={Boolean(activeSubscription.auto_renew)} onCheckedChange={(checked) => autoRenewMutation.mutate(checked)} disabled={autoRenewMutation.isPending} />
            </div>
            <button type="button" onClick={() => renewMutation.mutate()} disabled={renewMutation.isPending} className="mt-3 h-10 w-full rounded-full border-[1.5px] border-foreground text-[14px] font-semibold disabled:opacity-50">
              {renewMutation.isPending ? "Renewing…" : "Renew now"}
            </button>
          </section>
        )}

        {audience !== "Institution" && (
          <button
            type="button"
            onClick={() => setShowInstitutionForm(true)}
            className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-foreground/12 bg-card p-4 text-left transition hover:border-foreground/30"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground/[0.05]"><Building2 className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">Registering a school, academy or company?</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">Set up a Digital Hub for your institution with a free 30-day trial.</span>
            </span>
          </button>
        )}

        <p className="mt-5 text-[12px] leading-relaxed text-muted-foreground">
          By subscribing you agree to the Zero Club <Link to="/docs" className="underline underline-offset-2 hover:text-foreground">Terms</Link>.
          Membership is charged from your Zero Club wallet and does not renew by itself unless you switch auto-renew on.
          You can change plan or cancel at any time; prices are subject to change.
        </p>
      </main>

      <InstitutionOnboardingDrawer
        open={showInstitutionForm}
        onOpenChange={setShowInstitutionForm}
        profile={profile}
        onActivated={() => queryClient.invalidateQueries({ queryKey: ["my_profile"] })}
      />
    </div>
  );
}
