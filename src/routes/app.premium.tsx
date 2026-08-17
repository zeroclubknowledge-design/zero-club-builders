import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
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

const audienceCopy: Record<Audience, { title: string; description: string; icon: typeof GraduationCap }> = {
  Learner: {
    title: "Build proof that opens doors",
    description: "Learn, publish progress, join focused communities, and make your work easier to discover.",
    icon: GraduationCap,
  },
  Creator: {
    title: "Build communities that compound",
    description: "Move beyond participation and operate up to three permanent Clubs with management, insight, and a first-Club premium runway.",
    icon: Users,
  },
  Tutor: {
    title: "Turn expertise into outcomes",
    description: "Package knowledge, run structured cohorts, support learners, and earn from your teaching.",
    icon: BookOpen,
  },
  Institution: {
    title: "Coordinate learning at scale",
    description: "Bring tutors, bootcamps, communities, and learner signals into one accountable workspace.",
    icon: Building2,
  },
};

function MembershipPage() {
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<Audience>("Learner");
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
            ? `${formatNaira(giftApplied)} Zero Gift applied. ${plan.name} is now active.`
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
      toast.success(giftApplied > 0 ? `${formatNaira(giftApplied)} Zero Gift applied. Membership renewed.` : "Membership renewed.");
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

  const isCurrentPlan = (plan: Plan) => {
    return Boolean(plan.planKey && plan.planKey === currentPlanKey);
  };

  const handlePlanAction = (plan: Plan) => {
    if (isCurrentPlan(plan) && !plan.id.startsWith("institution-")) return;
    // Institutions go through onboarding rather than a one-click purchase.
    if (plan.id.startsWith("institution-")) {
      setShowInstitutionForm(true);
      return;
    }
    subscribeMutation.mutate(plan);
  };

  const selectedAudience = audienceCopy[audience];
  const AudienceIcon = selectedAudience.icon;

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/app" aria-label="Back" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">Zero Club</p>
              <h1 className="truncate text-[19px] font-semibold tracking-tight">Membership</h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-[12px] text-muted-foreground sm:flex">
            <Wallet className="h-4 w-4 text-primary" />
            <span>Balance</span>
            <strong className="font-semibold tabular-nums text-foreground">{Number(profile?.coins || 0).toLocaleString()} coins</strong>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-6 md:px-7 md:py-9">
        <section className="grid gap-6 border-b border-border pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase text-primary">
              <Sparkles className="h-4 w-4 fill-current" /> Membership built around your work
            </span>
            <h2 className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-tight sm:text-[40px]">
              Choose what helps you move forward.
            </h2>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
              Zero Club memberships support the different ways people learn, teach, build communities, and operate programs.
            </p>
          </div>

          <div className="grid grid-cols-2 rounded-lg border border-border bg-card p-1 sm:grid-cols-4" aria-label="Choose your plan pathway">
            {(["Learner", "Creator", "Tutor", "Institution"] as Audience[]).map((item) => (
              <button
                key={item}
                onClick={() => setAudience(item)}
                className={`min-w-0 rounded-md px-3 py-2.5 text-[12px] font-semibold transition sm:px-4 ${audience === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 flex items-start gap-4 rounded-lg border border-primary/20 bg-primary/[0.045] p-4 sm:p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <AudienceIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight">{selectedAudience.title}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{selectedAudience.description}</p>
          </div>
        </section>

        <section className="mt-4 max-w-xl">
          <ZeroGiftPaymentOption
            service="membership"
            amount={0}
            applied={applyZeroGift}
            onAppliedChange={setApplyZeroGift}
            formatAmount={formatNaira}
          />
        </section>

        {activeSubscription && (
          <section className="mt-6 grid gap-4 border-y border-border bg-card px-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Current membership</p>
                <p className="mt-1 text-[14px] font-semibold">{membershipDashboard?.plan?.name || currentPlanKey.replaceAll("_", " ")}</p>
                <p className="mt-1 text-[10.5px] text-muted-foreground">
                  Status: <span className="capitalize text-foreground">{String(activeSubscription.status).replaceAll("_", " ")}</span>
                  {activeSubscription.renewal_date && <> · Renewal {new Date(activeSubscription.renewal_date).toLocaleDateString()}</>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => autoRenewMutation.mutate(!activeSubscription.auto_renew)} disabled={autoRenewMutation.isPending} className={`h-9 rounded-md border px-3 text-[10.5px] font-semibold ${activeSubscription.auto_renew ? "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground"}`}>
                Auto-renew {activeSubscription.auto_renew ? "On" : "Off"}
              </button>
              <button type="button" onClick={() => renewMutation.mutate()} disabled={renewMutation.isPending} className="h-9 rounded-md bg-foreground px-3 text-[10.5px] font-semibold text-background disabled:opacity-50">
                {renewMutation.isPending ? "Renewing..." : "Renew now"}
              </button>
            </div>
          </section>
        )}

        <section className={`mt-6 grid gap-4 ${visiblePlans.length === 1 ? "max-w-xl" : visiblePlans.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {visiblePlans.map((plan) => {
            const current = isCurrentPlan(plan);
            const institutional = plan.id.startsWith("institution-");
            const isRecommended = plan.recommendedFor === audience;
            const darkCard = Boolean(plan.featured);
            return (
              <article key={plan.id} className={`relative overflow-hidden rounded-lg border p-5 sm:p-6 ${darkCard ? "border-primary/35 bg-[#171218] text-white" : "border-border bg-card"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`text-[10px] font-semibold uppercase ${darkCard ? "text-[#f06ac3]" : "text-primary"}`}>{plan.eyebrow}</p>
                    <h3 className="mt-2 text-[22px] font-semibold tracking-tight">{plan.name}</h3>
                  </div>
                  {(current || isRecommended) && (
                    <span className={`rounded-md px-2 py-1 text-[9px] font-semibold uppercase ${current ? "bg-emerald-500/15 text-emerald-400" : "bg-primary/15 text-[#f06ac3]"}`}>
                      {current ? "Current" : "Recommended"}
                    </span>
                  )}
                </div>

                <div className="mt-5 flex items-end gap-1.5">
                  <span className="text-[29px] font-semibold tracking-tight tabular-nums">{plan.priceValue === null ? "Custom" : plan.priceValue === 0 ? "Free" : formatNaira(plan.priceValue)}</span>
                  <span className={`pb-1 text-[11px] ${darkCard ? "text-white/50" : "text-muted-foreground"}`}>{plan.billingLabel}</span>
                </div>
                {plan.pricingNote && <p className={`mt-2 text-[10.5px] ${plan.featured ? "text-[#f28fd0]" : "text-primary"}`}>{plan.pricingNote}</p>}
                <p className={`mt-3 text-[13px] leading-relaxed ${darkCard ? "text-white/60" : "text-muted-foreground"}`}>{plan.description}</p>

                <div className={`my-5 h-px ${darkCard ? "bg-white/10" : "bg-border"}`} />
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-[12.5px]">
                      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${darkCard ? "bg-[#cc208f] text-white" : "bg-primary/10 text-primary"}`}>
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                      <span className={darkCard ? "text-white/78" : "text-foreground/80"}>{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.limitations && plan.limitations.length > 0 && (
                  <div className={`mt-5 border-t pt-4 ${darkCard ? "border-white/10" : "border-border"}`}>
                    <p className={`mb-2.5 text-[10px] font-semibold uppercase ${darkCard ? "text-white/45" : "text-muted-foreground"}`}>Not included</p>
                    <ul className="space-y-2.5">
                      {plan.limitations.map((limitation) => (
                        <li key={limitation} className={`flex items-start gap-2.5 text-[12px] ${darkCard ? "text-white/50" : "text-muted-foreground"}`}>
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current" />
                          <span>{limitation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handlePlanAction(plan)}
                  disabled={subscribeMutation.isPending || isLoading || (current && !institutional)}
                  className={`mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition disabled:cursor-default disabled:opacity-60 ${darkCard ? "bg-white text-black hover:bg-white/90" : "bg-primary text-primary-foreground hover:opacity-90"}`}
                >
                  {subscribeMutation.isPending && subscribeMutation.variables?.id === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : current && !institutional ? (
                    "Current membership"
                  ) : institutional ? (
                    <>Start institution onboarding<ArrowRight className="h-4 w-4" /></>
                  ) : (
                    <>Choose {plan.name}<ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </article>
            );
          })}
        </section>

        <section className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Secure membership", copy: "Membership payments use your protected Zero Club wallet balance." },
            { icon: BarChart3, title: "Real outcomes", copy: "Plans unlock tools for proof, learning, teaching, and cohort insight." },
            { icon: Users, title: "Built for every role", copy: "Personal and institutional workspaces stay purposefully separate." },
          ].map((item) => (
            <div key={item.title} className="bg-card p-5">
              <item.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 text-[13px] font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{item.copy}</p>
            </div>
          ))}
        </section>
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
