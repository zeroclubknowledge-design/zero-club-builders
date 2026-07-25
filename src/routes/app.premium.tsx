import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
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

export const Route = createFileRoute("/app/premium")({
  component: MembershipPage,
});

type Audience = "Learner" | "Tutor" | "Institution";

type Plan = {
  id: "basic" | "premium" | "premium-plus" | "institution";
  name: string;
  eyebrow: string;
  price: string;
  priceValue: number | null;
  description: string;
  audiences: Audience[];
  features: string[];
  recommendedFor: Audience;
  storedTier?: "Basic" | "Premium" | "Premium+";
  featured?: boolean;
};

const plans: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    eyebrow: "Start building",
    price: "₦0",
    priceValue: 0,
    description: "A complete starting point for learning in public and building a proof-backed profile.",
    audiences: ["Learner"],
    recommendedFor: "Learner",
    storedTier: "Basic",
    features: ["Builder profile and feed", "Public clubs and communities", "ZeroNotes publishing", "Standard XP earning"],
  },
  {
    id: "premium",
    name: "Premium",
    eyebrow: "Grow your proof",
    price: "₦5,000",
    priceValue: 5000,
    description: "More visibility, flexibility, and learning value for builders moving with intent.",
    audiences: ["Learner", "Tutor"],
    recommendedFor: "Learner",
    storedTier: "Premium",
    featured: true,
    features: ["2x daily XP multiplier", "30% bootcamp discount", "Post editing and longer posts", "Private club access", "Premium profile badge"],
  },
  {
    id: "premium-plus",
    name: "Premium+",
    eyebrow: "Run your studio",
    price: "₦12,000",
    priceValue: 12000,
    description: "The creator workspace for tutors who teach, manage cohorts, and earn on Zero Club.",
    audiences: ["Tutor", "Learner"],
    recommendedFor: "Tutor",
    storedTier: "Premium+",
    features: ["Everything in Premium", "Tutor Studio access", "Bootcamp creation and sales", "Learner and cohort analytics", "50% bootcamp discount"],
  },
  {
    id: "institution",
    name: "Institution",
    eyebrow: "Operate at scale",
    price: "Custom",
    priceValue: null,
    description: "A managed workspace for institutions coordinating tutors, programs, and learner outcomes.",
    audiences: ["Institution"],
    recommendedFor: "Institution",
    features: ["Institution Hub", "Tutor and role management", "Multi-bootcamp oversight", "Cohort participation analytics", "Priority onboarding and support"],
  },
];

const audienceCopy: Record<Audience, { title: string; description: string; icon: typeof GraduationCap }> = {
  Learner: {
    title: "Build proof that opens doors",
    description: "Learn, publish progress, join focused communities, and make your work easier to discover.",
    icon: GraduationCap,
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<Audience>("Learner");

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

  useEffect(() => {
    const accountType = String(profile?.account_type || "").toLowerCase();
    if (accountType === "institution") setAudience("Institution");
    else if (accountType === "tutor") setAudience("Tutor");
  }, [profile?.account_type]);

  const visiblePlans = useMemo(
    () => plans.filter((plan) => plan.audiences.includes(audience)),
    [audience]
  );

  const subscribeMutation = useMutation({
    mutationFn: async (plan: Plan) => {
      if (!profile) throw new Error("Please sign in to manage your membership.");
      if (plan.id === "institution") return plan;

      if (plan.id === "basic") {
        if (profile.tier !== "Basic") {
          const { error } = await supabase.from("profiles").update({ tier: "Basic" }).eq("id", profile.id);
          if (error) throw error;
        }
        return plan;
      }

      if ((profile.coins || 0) < (plan.priceValue || 0)) {
        throw new Error("Your wallet balance is too low for this membership.");
      }

      const { error } = await supabase
        .from("profiles")
        .update({ tier: plan.storedTier, coins: (profile.coins || 0) - (plan.priceValue || 0) })
        .eq("id", profile.id);
      if (error) throw error;
      return plan;
    },
    onSuccess: (plan) => {
      if (plan.id === "institution") {
        const isInstitution = String(profile?.account_type || "").toLowerCase() === "institution";
        if (isInstitution) router.navigate({ to: "/app/institution-studio" });
        else toast.info("Institution membership is available to verified institution accounts.");
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["my_profile"] });
      toast.success(plan.id === "basic" ? "Switched to Basic." : `${plan.name} is now active.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isCurrentPlan = (plan: Plan) => {
    if (plan.id === "institution") {
      return String(profile?.account_type || "").toLowerCase() === "institution";
    }
    return String(profile?.tier || "").toLowerCase() === String(plan.storedTier || "").toLowerCase();
  };

  const handlePlanAction = (plan: Plan) => {
    if (isCurrentPlan(plan) && plan.id !== "institution") return;
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

          <div className="grid grid-cols-3 rounded-lg border border-border bg-card p-1" aria-label="Choose your account type">
            {(["Learner", "Tutor", "Institution"] as Audience[]).map((item) => (
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

        <section className={`mt-6 grid gap-4 ${visiblePlans.length === 1 ? "max-w-xl" : "lg:grid-cols-2"}`}>
          {visiblePlans.map((plan) => {
            const current = isCurrentPlan(plan);
            const institutional = plan.id === "institution";
            const isRecommended = plan.recommendedFor === audience;
            return (
              <article key={plan.id} className={`relative overflow-hidden rounded-lg border p-5 sm:p-6 ${plan.featured || institutional ? "border-primary/35 bg-[#171218] text-white" : "border-border bg-card"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`text-[10px] font-semibold uppercase ${plan.featured || institutional ? "text-[#f06ac3]" : "text-primary"}`}>{plan.eyebrow}</p>
                    <h3 className="mt-2 text-[22px] font-semibold tracking-tight">{plan.name}</h3>
                  </div>
                  {(current || isRecommended) && (
                    <span className={`rounded-md px-2 py-1 text-[9px] font-semibold uppercase ${current ? "bg-emerald-500/15 text-emerald-400" : "bg-primary/15 text-[#f06ac3]"}`}>
                      {current ? "Current" : "Recommended"}
                    </span>
                  )}
                </div>

                <div className="mt-5 flex items-end gap-1.5">
                  <span className="text-[29px] font-semibold tracking-tight tabular-nums">{plan.price}</span>
                  {!institutional && <span className={`pb-1 text-[11px] ${plan.featured ? "text-white/50" : "text-muted-foreground"}`}>/ month</span>}
                </div>
                <p className={`mt-3 text-[13px] leading-relaxed ${plan.featured || institutional ? "text-white/60" : "text-muted-foreground"}`}>{plan.description}</p>

                <div className={`my-5 h-px ${plan.featured || institutional ? "bg-white/10" : "bg-border"}`} />
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-[12.5px]">
                      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${plan.featured || institutional ? "bg-[#cc208f] text-white" : "bg-primary/10 text-primary"}`}>
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                      <span className={plan.featured || institutional ? "text-white/78" : "text-foreground/80"}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handlePlanAction(plan)}
                  disabled={subscribeMutation.isPending || isLoading || (current && !institutional)}
                  className={`mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition disabled:cursor-default disabled:opacity-60 ${plan.featured || institutional ? "bg-white text-black hover:bg-white/90" : "bg-primary text-primary-foreground hover:opacity-90"}`}
                >
                  {subscribeMutation.isPending && subscribeMutation.variables?.id === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : current && !institutional ? (
                    "Current membership"
                  ) : institutional ? (
                    <>{current ? "Open Institution Hub" : "Institution access"}<ArrowRight className="h-4 w-4" /></>
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
    </div>
  );
}
