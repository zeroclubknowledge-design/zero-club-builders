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
  { id: "free", name: "Basic", price: "₦0", priceValue: 0, color: "bg-accent/40 border-border" },
  { id: "pro", name: "Premium", price: "₦5,000", priceValue: 5000, color: "bg-gradient-to-br from-[#cc208f] to-[#801050]" },
  { id: "elite", name: "Premium+", price: "₦12,000", priceValue: 12000, color: "bg-gradient-to-br from-[#ffcf00] to-[#b08000]", textColor: "text-black" },
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
      setTimeout(() => router.navigate({ to: "/app/profile/" }), 1500);
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
      <header className="sticky top-0 z-50 flex items-center bg-background/80 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-md border-b border-border">
        <Link to="/app" className="mr-4">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold">Subscribe</h1>
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
            className={`relative shrink-0 w-[85%] snap-center rounded-xl p-6 h-32 flex flex-col justify-center items-center cursor-pointer transition-all duration-300 border ${
              activePlanIdx === idx ?"scale-100 opacity-100 border-primary/40 ring-1 ring-primary/20" : "opacity-40 scale-95 border-transparent"
            } ${p.color}`}
          >
            <span className={`text-2xl ${p.textColor || (idx === 0 ?"text-foreground" : "text-white")}`}>{p.name}</span>
          </div>
        ))}
      </div>

      {/* Features Content */}
      <div className="mt-8 px-4 space-y-8">
        {categories.map((cat) => (
          <section key={cat.title} className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-accent/10">
              <h3 className="text-muted-foreground text-[11px]">{cat.title}</h3>
            </div>
            <div className="divide-y divide-border">
              {cat.features.map((f) => {
                const isLocked = f.locked?.includes(activePlan.name);
                const value = f.values?.[activePlan.name as keyof typeof f.values];

                return (
                  <div key={f.name} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-medium ${isLocked ?"text-muted-foreground" : "text-foreground"}`}>{f.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {value ? (
                        <span className="text-[13px] font-bold text-foreground">{value}</span>
                      ) : isLocked ? (
                        <Lock className="h-4 w-4 text-muted-foreground/30" />
                      ) : (
                        <Check className="h-4 w-4 text-[#cc208f" />
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
            className="w-full flex justify-center items-center gap-2 rounded-full bg-foreground py-4 text-center font-black text-background transition active:scale-95 shadow-xl disabled:opacity-50"
          >
            {subscribeMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
               profile?.tier === activePlan.name ? "Current Plan" : `Starting at ${activePlan.price}`
            )}
          </button>
          <p className="mt-3 text-center text-[10px] text-muted-foreground font-medium">
            Price excludes VAT. Cancel anytime in settings.
          </p>
        </div>
      </div>
    </div>
  );
}
