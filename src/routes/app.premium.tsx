import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  GraduationCap,
  LifeBuoy,
  Loader2,
  PenLine,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "@/components/icons/solar";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { InstitutionOnboardingDrawer } from "@/components/InstitutionOnboardingDrawer";
import { formatNaira, resolvePlanKey } from "@/features/membership/plans";
import { ZeroGiftPaymentOption, zeroGiftBalanceQueryKey } from "@/components/ZeroGiftPaymentOption";

export const Route = createFileRoute("/app/premium")({
  component: MembershipPage,
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
    name: "Creator",
    eyebrow: "Build communities",
    priceValue: 7000,
    description: "For learners ready to build, manage, and grow permanent communities on Zero Club.",
    audiences: ["Creator"],
    recommendedFor: "Creator",
    storedTier: undefined,
    featured: true,
    billingLabel: "/ month",
    features: ["Relevant Learner Premium experience", "12 rewarded Zero Games competitions weekly, maximum 2 daily", "Create up to 3 permanent Clubs", "Club customization and member management", "Moderation tools and Club analytics", "Community growth and activity insights", "6 months premium experience for your first Club", "Creator Rewards eligibility"],
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
    name: "Premium",
    eyebrow: "Teach with confidence",
    priceValue: 5000,
    description: "Add trusted verification and connect each cohort to the community you already lead.",
    audiences: ["Tutor"],
    recommendedFor: "Tutor",
    storedTier: "Premium",
    billingLabel: "/ month",
    featured: true,
    features: ["Everything in Tutor Basic", "8 rewarded Zero Games competitions weekly, maximum 2 daily", "Create up to 5 permanent Clubs", "Connect bootcamps to existing clubs", "Zero AI tutor knowledge interview", "Verified badge for approved bootcamps", "Zero AI curriculum and teaching assistance"],
  },
  {
    id: "tutor-premium-plus",
    planKey: "tutor_premium_plus",
    name: "Premium+",
    eyebrow: "Scale your teaching",
    priceValue: 12000,
    description: "Advanced Zero AI and verification support for tutors running multiple programs and communities.",
    audiences: ["Tutor"],
    recommendedFor: "Tutor",
    storedTier: "Premium+",
    billingLabel: "/ month",
    features: ["Everything in Tutor Premium", "20 rewarded Zero Games competitions weekly, maximum 3 daily", "Create up to 10 permanent Clubs", "Advanced Zero AI cohort assistance", "Multi-bootcamp verification support", "Unlimited existing-club connections", "Priority Zero AI interview access", "Priority tutor support"],
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

/** Fixed positions, so the field is the same every render — no re-layout flicker. */
const STARS = [
  { top: "12%", left: "9%", size: 3, delay: "0s" },
  { top: "22%", left: "84%", size: 4, delay: "0.7s" },
  { top: "38%", left: "16%", size: 2, delay: "1.4s" },
  { top: "8%", left: "62%", size: 2, delay: "2.1s" },
  { top: "44%", left: "91%", size: 3, delay: "0.4s" },
  { top: "30%", left: "44%", size: 2, delay: "1.8s" },
  { top: "17%", left: "31%", size: 2, delay: "2.6s" },
];

function AnimatedBrandMark() {
  return (
    <div className="relative mx-auto grid h-[118px] w-[118px] place-items-center">
      {/* Glow first, so the mark sits inside its own light. */}
      <span
        aria-hidden
        className="zc-pro-halo absolute inset-[-14px] rounded-full bg-[radial-gradient(circle,rgba(204,32,143,0.55)_0%,rgba(204,32,143,0.12)_45%,transparent_70%)] blur-[10px]"
      />

      {/* A bare rotating ring reads as a spinner; the travelling dot is what
          makes it read as an orbit. */}
      <span aria-hidden className="zc-pro-spin absolute inset-0 rounded-full border border-white/12">
        <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f06ac3] shadow-[0_0_12px_rgba(240,106,195,0.95)]" />
      </span>
      <span aria-hidden className="zc-pro-spin-reverse absolute inset-[13px] rounded-full border border-dashed border-white/[0.09]">
        <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
      </span>

      <img
        src="/logo.png"
        alt="Zero Club"
        className="zc-pro-float relative h-[54px] w-[54px] object-contain drop-shadow-[0_12px_30px_rgba(204,32,143,0.55)]"
      />
    </div>
  );
}

function MembershipPage() {
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<Audience>("Learner");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showInstitutionForm, setShowInstitutionForm] = useState(false);
  const [applyZeroGift, setApplyZeroGift] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my_profile"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: membershipDashboard } = useQuery({
    queryKey: ["membership-dashboard", profile?.id],
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

  useEffect(() => {
    const accountType = String(profile?.account_type || "").toLowerCase();
    if (accountType === "institution") setAudience("Institution");
    else if (accountType === "tutor") setAudience("Tutor");
    else if (String(profile?.tier || "").toLowerCase() === "creator") setAudience("Creator");
  }, [profile?.account_type, profile?.tier]);

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

  const currentPlanKey = membershipDashboard?.plan_key || resolvePlanKey(profile);
  const activeSubscription = membershipDashboard?.subscription;

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

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[680px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/app" aria-label="Back" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">Zero Club</p>
              <h1 className="truncate text-[19px] font-semibold tracking-tight">Go PRO</h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-[12px] text-muted-foreground sm:flex">
            <Wallet className="h-4 w-4 text-primary" />
            <span>Balance</span>
            <strong className="font-semibold tabular-nums text-foreground">{Number(profile?.coins || 0).toLocaleString()} coins</strong>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[680px] px-4 py-5 md:px-7 md:py-8">
        {/* One committed dark stage, whichever theme the app is in — the same
            decision the wallet card makes. Membership should feel like the
            expensive room, not another settings page. */}
        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(125%_95%_at_50%_-15%,#33203a_0%,#1b1520_42%,#0c0a0e_100%)] px-4 pb-6 pt-8 text-white shadow-[0_30px_80px_-40px_rgba(0,0,0,0.85)] sm:px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {STARS.map((star, index) => (
              <span
                key={index}
                className="zc-pro-twinkle absolute rounded-full bg-[#7cc8ff]"
                style={{ top: star.top, left: star.left, height: star.size, width: star.size, animationDelay: star.delay }}
              />
            ))}
            <span className="absolute -right-24 -top-28 h-72 w-72 rounded-full border-[64px] border-white/[0.03]" />
          </div>

          <div className="relative">
            <AnimatedBrandMark />

            <h2 className="mx-auto mt-5 max-w-[19ch] text-center font-display text-[25px] font-semibold leading-[1.15] tracking-tight sm:text-[29px]">
              {copy.title.split(" ").slice(0, -1).join(" ")}{" "}
              <span className="text-[#f06ac3]">{copy.title.split(" ").slice(-1)}</span>
            </h2>
            <p className="mx-auto mt-2.5 max-w-[36ch] text-center text-[12.5px] leading-relaxed text-white/55">
              {copy.description}
            </p>

            {/* Audience tabs — underlined, one row, scrollable rather than
                wrapping, so the row never changes height. */}
            <div
              role="tablist"
              aria-label="Choose your pathway"
              className="no-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-white/10"
            >
              {(["Learner", "Creator", "Tutor", "Institution"] as Audience[]).map((item) => {
                const active = audience === item;
                return (
                  <button
                    key={item}
                    role="tab"
                    aria-selected={active}
                    onClick={() => { setAudience(item); setSelectedPlanId(null); }}
                    className={`relative shrink-0 px-4 pb-3 pt-1 text-[14px] font-semibold tracking-tight transition-colors ${active ? "text-white" : "text-white/45 hover:text-white/75"}`}
                  >
                    {item}
                    <span
                      className={`absolute inset-x-2 bottom-0 h-[2.5px] rounded-full bg-white transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
                    />
                  </button>
                );
              })}
            </div>

            {/* What you get. */}
            <div className="mt-5 rounded-xl bg-white/[0.045] p-4 ring-1 ring-white/[0.08] sm:p-5">
              <ul className="space-y-[15px]">
                {selectedPlan?.features.map((feature) => {
                  const Icon = featureIcon(feature);
                  return (
                    <li key={feature} className="flex items-start gap-3.5">
                      <Icon className="mt-[1px] h-[18px] w-[18px] shrink-0 text-white/85" strokeWidth={1.8} />
                      <span className="text-[13.5px] leading-snug text-white/90">{feature}</span>
                    </li>
                  );
                })}
              </ul>

              {selectedPlan?.limitations && selectedPlan.limitations.length > 0 && (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Not included</p>
                  <ul className="space-y-2.5">
                    {selectedPlan.limitations.map((limitation) => (
                      <li key={limitation} className="flex items-start gap-3.5 text-[12.5px] text-white/45">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current" />
                        <span>{limitation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Price selector. The chosen tile is outlined in white and the
                others recede — the same read as the reference. */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {visiblePlans.map((plan, index) => {
                const active = plan.id === selectedPlan?.id;
                const current = isCurrentPlan(plan);
                const spanFull = visiblePlans.length % 2 === 1 && index === visiblePlans.length - 1;
                return (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    aria-pressed={active}
                    className={`${spanFull ? "col-span-2" : ""} rounded-xl border p-3.5 text-left transition ${
                      active
                        ? "border-white bg-white/[0.07] shadow-[0_0_0_1px_rgba(255,255,255,0.35)]"
                        : "border-white/12 hover:border-white/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[14px] font-semibold tracking-tight ${active ? "text-white" : "text-white/55"}`}>
                        {plan.name}
                      </span>
                      {current ? (
                        <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-300">Current</span>
                      ) : plan.featured ? (
                        <span className={`text-[11px] font-semibold ${active ? "text-[#f06ac3]" : "text-[#f06ac3]/55"}`}>Popular</span>
                      ) : null}
                    </div>
                    <p className={`mt-1.5 text-[17px] font-semibold tracking-tight tabular-nums ${active ? "text-white" : "text-white/45"}`}>
                      {plan.priceValue === null ? "Custom" : plan.priceValue === 0 ? "Free" : formatNaira(plan.priceValue)}
                      <span className={`ml-1 text-[11px] font-medium ${active ? "text-white/50" : "text-white/30"}`}>{plan.billingLabel}</span>
                    </p>
                    <p className={`mt-1 text-[11px] leading-snug ${active ? "text-white/50" : "text-white/30"}`}>{plan.eyebrow}</p>
                  </button>
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
                dark
              />
            </div>

            <button
              type="button"
              onClick={() => handlePlanAction(selectedPlan)}
              disabled={ctaBusy || isLoading || (selectedIsCurrent && !selectedIsInstitution)}
              className="mt-4 flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold tracking-tight text-[#12101a] transition hover:bg-white/92 active:scale-[0.985] disabled:cursor-default disabled:bg-white/25 disabled:text-white/60"
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
                <>Subscribe &amp; Pay</>
              )}
            </button>

            <p className="mt-3 text-center text-[11.5px] text-white/45">
              {selectedIsInstitution
                ? "A 30-day trial starts once your organisation is verified."
                : selectedPlan?.priceValue === 0
                  ? "No payment needed. Basic stays free."
                  : `${priceText} ${selectedPlan?.billingLabel}, paid from your Zero Club wallet.`}
            </p>

            <p className="mt-4 rounded-lg border border-white/10 p-3 text-[10.5px] italic leading-relaxed text-white/40">
              By subscribing you agree to the Zero Club <Link to="/docs" className="underline underline-offset-2 hover:text-white/70">Terms</Link>.
              Membership is charged from your Zero Club wallet and does not renew by itself unless you switch auto-renew on.
              You can change plan or cancel at any time; prices are subject to change.
            </p>
          </div>
        </section>

        {activeSubscription && (
          <section className="mt-4 grid gap-4 rounded-xl border border-border bg-card px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Current membership</p>
                <p className="mt-1 text-[14px] font-semibold">{membershipDashboard?.plan?.name || String(currentPlanKey).replaceAll("_", " ")}</p>
                <p className="mt-1 text-[10.5px] text-muted-foreground">
                  Status: <span className="capitalize text-foreground">{String(activeSubscription.status).replaceAll("_", " ")}</span>
                  {activeSubscription.renewal_date && <> · Renewal {new Date(activeSubscription.renewal_date).toLocaleDateString()}</>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => autoRenewMutation.mutate(!activeSubscription.auto_renew)} disabled={autoRenewMutation.isPending} className={`h-9 rounded-lg border px-3 text-[10.5px] font-semibold ${activeSubscription.auto_renew ? "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground"}`}>
                Auto-renew {activeSubscription.auto_renew ? "On" : "Off"}
              </button>
              <button type="button" onClick={() => renewMutation.mutate()} disabled={renewMutation.isPending} className="h-9 rounded-lg bg-foreground px-3 text-[10.5px] font-semibold text-background disabled:opacity-50">
                {renewMutation.isPending ? "Renewing..." : "Renew now"}
              </button>
            </div>
          </section>
        )}

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
