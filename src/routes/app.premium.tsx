import { createFileRoute } from "@tanstack/react-router";
import { Zap, Check, Star } from "lucide-react";

export const Route = createFileRoute("/app/premium")({
  component: PremiumPage,
});

function PremiumPage() {
  const plans = [
    { name: "Pro", price: "₦5,000", period: "/mo", features: ["Unlimited storage", "Priority support", "Early access to bootcamps", "Exclusive club badge"] },
    { name: "Elite", price: "₦12,000", period: "/mo", features: ["All Pro features", "1-on-1 mentorship", "Ad-free experience", "Custom profile banners"], featured: true },
  ];

  return (
    <div className="px-5 pt-6 pb-24">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold">Zero Premium</h1>
        <p className="mt-2 text-muted-foreground text-sm">Supercharge your builder journey with elite perks.</p>
      </header>

      <div className="grid gap-6">
        {plans.map((p) => (
          <div key={p.name} className={`relative rounded-3xl p-6 border ${p.featured ? "border-primary bg-primary/5 shadow-glow" : "border-border bg-card/40"}`}>
            {p.featured && (
              <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground">MOST POPULAR</span>
            )}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">{p.name}</h3>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
              </div>
              <div className={`grid h-12 w-12 place-items-center rounded-2xl ${p.featured ? "bg-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"}`}>
                <Zap className="h-6 w-6" />
              </div>
            </div>

            <ul className="mt-6 space-y-3">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <div className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3" />
                  </div>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button className={`mt-8 w-full rounded-full py-3 font-bold transition active:scale-95 ${p.featured ? "bg-primary text-primary-foreground shadow-glow" : "bg-foreground text-background"}`}>
              Choose {p.name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
