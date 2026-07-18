import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Check, Lock, Info, Sparkles, ShieldCheck, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/app/premium")({
  component: PremiumPage,
});

const categories = [
  {
    title: "Builder Experience",
    features: [
      { name: "Daily XP Multiplier", desc: "Earn more for every post", values: { Basic: "1x", Premium: "2x", "Premium+": "5x" } },
      { name: "Post Boost", desc: "Get more visibility", values: { Basic: "None", Premium: "Large", "Premium+": "Largest" } },
      { name: "Bootcamp Discounts", desc: "Every time you pay for a bootcamp", values: { Basic: "0%", Premium: "30%", "Premium+": "50%" } },
      { name: "Edit Posts", desc: "Up to 1 hour after posting", locked: ["Basic"] },
      { name: "Longer Posts", desc: "Up to 25,000 characters", locked: ["Basic"] },
      { name: "Verified Badge", desc: "Blue checkmark on profile", locked: ["Basic"] },
    ]
  },
  {
    title: "Elite Perks",
    features: [
      { name: "Private Clubs", desc: "Access high-signal channels", locked: ["Basic"] },
      { name: "Direct Mentor Access", desc: "Chat with top builders", locked: ["Basic", "Premium"] },
      { name: "Custom Banners", desc: "Personalize your studio", locked: ["Basic", "Premium"] },
    ]
  },
  {
    title: "Creator Hub",
    features: [
      { name: "Tutor Studio", desc: "Launch your own bootcamps", locked: ["Basic", "Premium"] },
      { name: "Revenue Share", desc: "Get paid for your content", locked: ["Basic", "Premium"] },
      { name: "Analytics Pro", desc: "Advanced student insights", locked: ["Basic", "Premium"] },
    ]
  }
];

const plans = [
  { id: "free", name: "Basic", price: "₦0", priceValue: 0, tagline: "Start building", color: "bg-card ring-1 ring-border", textColor: "text-foreground", subColor: "text-muted-foreground" },
  { id: "pro", name: "Premium", price: "₦5,000", priceValue: 5000, tagline: "For serious builders", color: "bg-[#141117] ring-1 ring-white/[0.06]", glow: "bg-[#cc208f]/30", textColor: "text-white", subColor: "text-white/60" },
  { id: "elite", name: "Premium+", price: "₦12,000", priceValue: 12000, tagline: "The complete studio", color: "bg-[#141117] ring-1 ring-[#ffcf00]/20", glow: "bg-[#ffcf00]/20", textColor: "text-white", subColor: "text-white/60" },
];

function PremiumPage() {
  const [activePlanIdx, setActivePlanIdx] = useState(0); 
  const activePlan = plans[activePlanIdx];
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my_profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      return data;
    }
  });

  const subscribeMutation = useMutation({
    mutationFn: async (plan: typeof plans[0]) => {
      if (!profile) throw new Error("Please sign in");
      
      // Allow downgrading to basic for free
      if (plan.id === "free") {
        if (profile.tier !== "Basic") {
          const { error } = await supabase.from('profiles').update({ tier: "Basic" }).eq('id', profile.id);
          if (error) throw error;
        }
        return plan;
      }

      if ((profile.coins || 0) < plan.priceValue) {
        throw new Error("No enough funds to make this transaction.");
      }

      const { error } = await supabase
        .from('profiles')
        .update({ 
          tier: plan.name,
          coins: (profile.coins || 0) - plan.priceValue
        })
        .eq('id', profile.id);

      if (error) throw error;
      return plan;
    },
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: ['my_profile'] });
      if (plan && plan.id !== "free") {
        toast.success(`Successfully subscribed to ${plan.name}!`);
      } else if (plan && plan.id === "free") {
        toast.success(`Switched to Basic plan.`);
      }
      setTimeout(() => router.navigate({ to: "/app/profile" }), 1500);
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  // Ensure scroll is at 0 on mount to avoid incorrect activePlanIdx calculation
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }, []);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    
    // Prevent scroll logic from running if the page is still initializing
    const scrollLeft = scrollRef.current.scrollLeft;
    if (scrollLeft < 10 && activePlanIdx !== 0) {
      setActivePlanIdx(0);
      return;
    }

    const width = scrollRef.current.offsetWidth * 0.85; 
    const idx = Math.round(scrollLeft / (width + 16)); 
    if (idx >= 0 && idx < plans.length && idx !== activePlanIdx) {
      setActivePlanIdx(idx);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center bg-background/85 px-4 pb-3.5 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-xl backdrop-saturate-150 border-b hairline">
        <Link to="/app" className="mr-3 grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04]">
          <ChevronLeft className="h-[18px] w-[18px]" />
        </Link>
        <h1 className="text-[17px] font-semibold tracking-tight">Membership</h1>
      </header>

      {/* Plan Selector Carousel */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="mt-6 flex gap-4 overflow-x-auto px-4 snap-x snap-mandatory no-scrollbar"
      >
        {plans.map((p, idx) => (
          <div
            key={p.id}
            onClick={() => {
              setActivePlanIdx(idx);
              scrollRef.current?.scrollTo({ left: idx * (scrollRef.current.offsetWidth * 0.85 + 16), behavior: 'smooth' });
            }}
            className={`relative shrink-0 w-[85%] snap-center overflow-hidden rounded-3xl p-6 h-36 flex flex-col justify-between cursor-pointer transition-all duration-300 ${
              activePlanIdx === idx ? "scale-100 opacity-100 shadow-lift" : "opacity-45 scale-[0.96]"
            } ${p.color}`}
          >
            {p.glow && (
              <div className={`pointer-events-none absolute -top-20 -right-12 h-52 w-52 rounded-full blur-[70px] ${p.glow}`} />
            )}
            <div className="relative z-10 flex items-start justify-between">
              <span className={`font-display text-[22px] font-semibold tracking-tight ${p.textColor}`}>{p.name}</span>
              {activePlanIdx === idx && (
                <span className={`grid h-6 w-6 place-items-center rounded-full ${idx === 0 ? "bg-foreground text-background" : "bg-white text-black"}`}>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              )}
            </div>
            <div className="relative z-10">
              <div className={`text-[15px] font-semibold tabular-nums ${p.textColor}`}>{p.price}<span className={`text-[11px] font-normal ml-1 ${p.subColor}`}>/ month</span></div>
              <div className={`text-[11.5px] mt-0.5 ${p.subColor}`}>{p.tagline}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Features Content */}
      <div className="mt-8 px-4 space-y-8">
        {categories.map((cat) => (
          <section key={cat.title} className="rounded-2xl bg-card ring-1 ring-border overflow-hidden shadow-soft">
            <div className="px-5 py-3.5 border-b hairline">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{cat.title}</h3>
            </div>
            <div className="divide-y divide-hairline">
              {cat.features.map((f) => {
                const isLocked = f.locked?.includes(activePlan.name);
                const value = f.values?.[activePlan.name as keyof typeof f.values];

                return (
                  <div key={f.name} className="flex items-center justify-between px-5 py-3.5">
                    <div className="min-w-0 pr-4">
                      <span className={`text-[13.5px] font-medium tracking-tight ${isLocked ? "text-muted-foreground/70" : "text-foreground"}`}>{f.name}</span>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">{f.desc}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {value ? (
                        <span className={`text-[13px] font-semibold tabular-nums ${isLocked ? "text-muted-foreground/70" : "text-foreground"}`}>{value}</span>
                      ) : isLocked ? (
                        <Lock className="h-4 w-4 text-muted-foreground/40" />
                      ) : (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/10">
                          <Check className="h-3 w-3 text-primary" strokeWidth={2.5} />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Safe & Secure Info */}
      <div className="px-6 py-10 opacity-50">
        <div className="flex items-center gap-3 justify-center text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-[10px] font-medium">Secure Checkout via Paystack</span>
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-0 left-0 z-50 w-full p-4 bg-gradient-to-t from-background via-background/95 to-transparent">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => subscribeMutation.mutate(activePlan)}
            disabled={subscribeMutation.isPending || isLoading}
            className="w-full flex justify-center items-center gap-2 rounded-full bg-foreground py-4 text-center text-[15px] font-semibold tracking-tight text-background tap shadow-lift disabled:opacity-50"
          >
            {subscribeMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
               profile?.tier === activePlan.name ? "Current plan" : `Continue with ${activePlan.name} · ${activePlan.price}`
            )}
          </button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Price excludes VAT. Cancel anytime in settings.
          </p>
        </div>
      </div>
    </div>
  );
}
