import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Zap, Star, Shield, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/boost")({
  component: BoostPage,
});

function BoostPage() {
  const navigate = useNavigate();

  const packages = [
    {
      id: "basic",
      name: "Basic Boost",
      reach: "1,000",
      coins: 500,
      price: "$5.00",
      icon: <Zap className="h-6 w-6 text-blue-500" />,
      color: "border-blue-500/30 bg-blue-500/5",
      benefits: ["Reach 1,000 extra users", "Appears in Discovery feed"],
    },
    {
      id: "pro",
      name: "Pro Boost",
      reach: "5,000",
      coins: 1500,
      price: "$15.00",
      icon: <Star className="h-6 w-6 text-amber-500" />,
      color: "border-amber-500/50 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.15)]",
      popular: true,
      benefits: ["Reach 5,000 extra users", "Priority Placement", "Analytics Dashboard"],
    },
    {
      id: "max",
      name: "Max Boost",
      reach: "20,000",
      coins: 5000,
      price: "$50.00",
      icon: <Shield className="h-6 w-6 text-primary" />,
      color: "border-primary/50 bg-primary/10 shadow-[0_0_20px_rgba(204,32,143,0.2)]",
      benefits: ["Reach 20,000 extra users", "Pinned to Top of Community", "Dedicated Support", "Advanced Analytics"],
    }
  ];

  const handlePurchase = (pkgName: string) => {
    // In a real app, this would deduct coins or trigger a Stripe checkout
    toast.success(`Purchased ${pkgName}! Your post will be boosted.`);
    navigate({ to: "/app" });
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background overflow-y-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sticky top-0 bg-background/80 backdrop-blur-lg z-50 border-b border-border/50">
        <button 
          onClick={() => navigate({ to: "/app/compose" })}
          className="h-10 w-10 bg-card rounded-full grid place-items-center shadow-sm border border-border/50 transition hover:bg-accent active:scale-95"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <span className="font-bold absolute left-1/2 -translate-x-1/2 text-foreground text-lg">
          Boost Post
        </span>
        <div className="w-10" /> {/* Spacer */}
      </header>

      <div className="px-6 py-8 flex flex-col items-center flex-1 justify-center -mt-20">
        <div className="w-full max-w-md">
          <div className="rounded-[32px] border border-border/50 bg-card p-10 flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-amber-500 to-blue-500" />
            
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(204,32,143,0.2)">
              <Zap className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-black mb-3">Coming Soon!</h2>
            <p className="text-muted-foreground leading-relaxed">
              We are working hard to bring you the best tools to supercharge your content. Post boosting will be available in a future update!
            </p>
            <button 
              onClick={() => navigate({ to: "/app/compose" })}
              className="mt-8 px-8 py-3 w-full bg-foreground text-background rounded-full font-bold shadow-xl transition active:scale-95 hover:bg-foreground/90"
            >
              Return to Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
