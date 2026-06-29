import { createFileRoute, Link } from "@tanstack/react-router";
import { Store as StoreIcon, Bell, ArrowLeft, Gift, Sparkles, Laptop, Award, ArrowUpRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";

export const Route = createFileRoute("/app/store")({
  component: StorePage,
});

const STORE_ITEMS = [
  {
    id: 1,
    name: "Zero Club Premium Hoodie",
    category: "Merch",
    description: "Limited edition heavyweight cotton hoodie with custom holographic embroidery.",
    price: 5000,
    priceType: "XP",
    icon: Gift,
    badge: "Limited Run",
  },
  {
    id: 2,
    name: "Cursor Pro (1 Month)",
    category: "Developer Tools",
    description: "Full license for the premier AI-powered code editor to accelerate your ships.",
    price: 2500,
    priceType: "Coins",
    icon: Laptop,
    badge: "Popular",
  },
  {
    id: 3,
    name: "Golden Profile Badge",
    category: "Perks",
    description: "An exclusive, glowing profile crest showing your elite status to the community.",
    price: 1500,
    priceType: "XP",
    icon: Award,
    badge: "Exclusive",
  },
  {
    id: 4,
    name: "1-on-1 Mentor Review",
    category: "Education",
    description: "45-minute live screen share review of your system architecture with an elite tech lead.",
    price: 4000,
    priceType: "Coins",
    icon: ShieldCheck,
    badge: "High Value",
  },
  {
    id: 5,
    name: "ChatGPT Plus (1 Month)",
    category: "Developer Tools",
    description: "Premium subscription to OpenAI's flagship model with advanced tools and GPT-4o.",
    price: 3000,
    priceType: "Coins",
    icon: Sparkles,
    badge: "Utilities",
  }
];

function StorePage() {
  const { data: profile } = useUser();
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [notified, setNotified] = useState(false);

  const [currency, setCurrency] = useState<"NGN" | "GHS" | "USD">(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem("wallet_currency") as "NGN" | "GHS" | "USD") || "NGN";
    }
    return "NGN";
  });

  const getCurrencyDetails = () => {
    switch (currency) {
      case "USD": return { symbol: "$", rate: 1500 };
      case "GHS": return { symbol: "GH₵", rate: 100 };
      case "NGN":
      default: return { symbol: "₦", rate: 1 };
    }
  };

  const currentCurrency = getCurrencyDetails();

  const categories = ["All", "Merch", "Developer Tools", "Perks", "Education"];

  const filteredItems = STORE_ITEMS.filter(
    item => activeCategory === "All" || item.category === activeCategory
  );

  const handleNotify = () => {
    setNotified(true);
    toast.success("We will notify you as soon as this feature is live!");
  };

  const handlePreorder = (itemName: string) => {
    toast.success(`Pre-registered interest for "${itemName}"!`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-6 pt-20 pb-24 relative flex flex-col items-center text-center">
      {/* Premium Background Blurs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-10%] h-[50vh] w-[50vw] rounded-full bg-primary/20 blur-[100px" />
        <div className="absolute bottom-[-10%] left-[-10%] h-[50vh] w-[50vw] rounded-full bg-purple-600/15 blur-[100px" />
      </div>

      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/40 px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-4">
        <div className="max-w-2xl mx-auto w-full flex flex-col gap-5">
          {/* Top Bar: Action & Balances */}
          <div className="flex items-center justify-between w-full">
            <Link 
              to="/app/wallet" 
              className="grid h-10 w-10 place-items-center rounded-full bg-accent/20 border border-border text-foreground hover:bg-accent/40 transition active:scale-90 shadow-soft shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            {/* Sleek Combined Balances Capsule */}
            <div className="flex items-center bg-card/80 border border-border/80 rounded-full p-1 shadow-soft backdrop-blur-md">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full">
                <span className="text-[9px] text-muted-foreground">XP</span>
                <span className="text-sm font-black text-primary">{profile?.xp || 0}</span>
              </div>
              <div className="w-[1px] h-4 bg-border/80 mx-1" />
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full">
                <span className="text-sm font-black text-emerald-500">
                  {currentCurrency.symbol}{((profile?.coins || 0) / currentCurrency.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
          
          {/* Title & Subtext Group */}
          <div className="flex flex-col gap-1.5">
            <h1 className="text-3xl sm:text-4xl font-display font-black tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-primary bg-clip-text text-transparent">
              Zero Store
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-md">
              Redeem your hard-earned builder rewards, subscriptions, and exclusive gear.
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center pt-24">

      {/* Category Tabs */}
      <div className="mt-10 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none w-full max-w-md mx-auto justify-start sm:justify-center">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold transition duration-300 border ${
              activeCategory === cat
                ?"bg-primary border-primary text-white shadow-glow"
                : "bg-card border-border hover:bg-accent/50 text-muted-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Interactive Catalog Grid */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl mx-auto">
        {filteredItems.map(item => {
          const Icon = item.icon;
          return (
            <div 
              key={item.id} 
              className="relative overflow-hidden rounded-3xl bg-card border border-border/80 hover:border-primary/40 hover:shadow-soft transition-all duration-300 group flex flex-col justify-between"
            >
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/25 border border-border/50 px-2.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                    {item.category}
                  </div>
                  {item.badge && (
                    <span className="text-[8px] text-primary border border-primary/20 px-2 py-0.5 rounded-full bg-primary/5">
                      {item.badge}
                    </span>
                  )}
                </div>
                
                <div className="mt-4 flex gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/25 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-base font-bold text-foreground group-hover:text-primary transition duration-300">
                      {item.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="border-t border-border/50 bg-accent/5 px-6 py-4 flex items-center justify-between gap-4">
                <div className="text-left">
                  <p className="text-[9px] text-muted-foreground">PRICE</p>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-base font-black text-foreground">
                      {item.priceType === "Coins" 
                        ? `${currentCurrency.symbol}${((item.price) / currentCurrency.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}` 
                        : `${item.price.toLocaleString()}`}
                    </span>
                    {item.priceType !== "Coins" && (
                      <span className="text-[10px] font-bold text-primary">
                        {item.priceType}
                      </span>
                    )}
                  </div>
                </div>
                
                <button 
                  onClick={() => handlePreorder(item.name)}
                  className="flex items-center gap-1 rounded-xl bg-foreground hover:bg-foreground/90 px-4 py-2 text-xs font-bold text-background transition active:scale-95 shadow-soft"
                >
                  Pre-order <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Early Access Notification Container */}
      <div className="mt-12 w-full max-w-md rounded-3xl bg-card border border-border p-8 backdrop-blur-md mx-auto shadow-soft">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary mx-auto mb-4 border border-primary/20">
          <Bell className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Get Early Access</h3>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          We are rolling out items gradually to top builders. Join the priority waitlist to unlock early VIP redemptions!
        </p>
        <button 
          onClick={handleNotify}
          disabled={notified}
          className={`mt-6 w-full rounded-2xl py-4 font-bold transition active:scale-95 shadow-soft border ${
            notified 
              ?"bg-accent/20 text-muted-foreground border-border cursor-not-allowed" 
              : "bg-primary border-primary text-white hover:bg-primary/95"
          }`}
        >
          {notified ? "You are on the list! 🚀" : "Notify Me"}
        </button>
      </div>

      <p className="mt-12 text-[10px] text-muted-foreground">
        Launch Target: Q3 2026
      </p>
      </div>
    </div>
  );
}
