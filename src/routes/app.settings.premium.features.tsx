import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Check, Lock, Sparkles, ShieldCheck, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/app/settings/premium/features")({
  component: PlanFeatures,
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

  const tier = profile?.tier || "Basic";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground pb-20">
      <header className="sticky top-0 z-50 flex items-center bg-background/80 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-md border-b border-border">
        <Link to="/app/settings/premium" className="mr-4">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-xl font-bold">Plan Features</h1>
      </header>

      <div className="p-5">
        <div className="rounded-3xl bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20 p-6 mb-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary flex items-center justify-center shadow-glow mb-4">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl text-foreground">{tier}</h2>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Everything included in your current plan</p>
        </div>

        <div className="space-y-8">
          {categories.map((cat) => (
            <section key={cat.title} className="rounded-2xl bg-card border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-accent/10">
                <h3 className="text-muted-foreground text-[11px]">{cat.title}</h3>
              </div>
              <div className="divide-y divide-border">
                {cat.features.map((f) => {
                  const isLocked = f.locked?.includes(tier);
                  const value = f.values?.[tier as keyof typeof f.values];

                  return (
                    <div key={f.name} className="flex flex-col px-5 py-4 gap-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-[14px] font-bold ${isLocked ?"text-muted-foreground/50" : "text-foreground"}`}>{f.name}</span>
                        <div className="flex items-center gap-3">
                          {value ? (
                            <span className={`text-[13px] font-bold ${isLocked ?"text-muted-foreground/50" : "text-primary"}`}>{value}</span>
                          ) : isLocked ? (
                            <Lock className="h-4 w-4 text-muted-foreground/20" />
                          ) : (
                            <Check className="h-4 w-4 text-primary" strokeWidth={3} />
                          )}
                        </div>
                      </div>
                      <p className={`text-[11px] ${isLocked ?"text-muted-foreground/30" : "text-muted-foreground"}`}>{f.desc}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
