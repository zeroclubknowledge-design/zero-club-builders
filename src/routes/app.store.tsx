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
    <div className="min-h-screen bg-background text-foreground pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/85 backdrop-blur-xl backdrop-saturate-150 border-b hairline px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-4">
        <div className="max-w-2xl mx-auto w-full">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <Link
                to="/app/wallet"
                className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04] text-foreground shrink-0"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </Link>
              <h1 className="text-[17px] font-display font-semibold tracking-tight text-foreground">Zero Store</h1>
            </div>

            {/* Balances capsule */}
            <div className="flex items-center bg-card ring-1 ring-border rounded-full p-0.5">
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <span className="text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">XP</span>
                <span className="text-[13px] font-semibold tracking-tight text-foreground tabular-nums">{(profile?.xp || 0).toLocaleString()}</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <span className="text-[13px] font-semibold tracking-tight text-foreground tabular-nums">
                  {currentCurrency.symbol}{((profile?.coins || 0) / currentCurrency.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto px-5">
        {/* Intro */}
        <p className="mt-6 text-[13.5px] leading-relaxed text-muted-foreground max-w-md">
          Redeem your builder rewards for subscriptions, gear, and exclusive perks.
        </p>

        {/* Category Tabs */}
        <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-[12.5px] font-semibold tracking-tight tap transition-colors ${
                activeCategory === cat
                  ? "bg-foreground text-background"
                  : "ring-1 ring-border text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Catalog */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredItems.map(item => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-2xl bg-card ring-1 ring-border hover:ring-foreground/15 shadow-soft transition-all flex flex-col justify-between"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {item.category}
                    </span>
                    {item.badge && (
                      <span className="text-[9.5px] font-medium text-primary ring-1 ring-primary/15 px-2 py-0.5 rounded-full bg-primary/5">
                        {item.badge}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex gap-3.5">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/8 ring-1 ring-primary/15 text-primary">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </div>
                    <div className="text-left min-w-0">
                      <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                        {item.name}
                      </h3>
                      <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t hairline px-5 py-3.5 flex items-center justify-between gap-4">
                  <div className="text-left">
                    <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Price</p>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-[15px] font-semibold tracking-tight text-foreground tabular-nums">
                        {item.priceType === "Coins"
                          ? `${currentCurrency.symbol}${((item.price) / currentCurrency.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                          : `${item.price.toLocaleString()}`}
                      </span>
                      {item.priceType !== "Coins" && (
                        <span className="text-[10px] font-semibold text-primary">
                          {item.priceType}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handlePreorder(item.name)}
                    className="flex items-center gap-1 rounded-full bg-foreground px-4 py-2 text-[12px] font-semibold tracking-tight text-background tap hover:opacity-90"
                  >
                    Pre-order <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Early access */}
        <div className="mt-10 w-full max-w-md rounded-2xl ring-1 ring-border bg-card p-6 mx-auto shadow-soft text-center">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/8 ring-1 ring-primary/15 text-primary mx-auto mb-4">
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
          <h3 className="text-[16px] font-semibold tracking-tight text-foreground">Get early access</h3>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed">
            Items roll out gradually to top builders. Join the priority waitlist for early redemptions.
          </p>
          <button
            onClick={handleNotify}
            disabled={notified}
            className={`mt-5 w-full rounded-full py-3 text-[13.5px] font-semibold tracking-tight tap transition-colors ${
              notified
                ? "ring-1 ring-border text-muted-foreground cursor-not-allowed"
                : "bg-foreground text-background hover:opacity-90"
            }`}
          >
            {notified ? "You're on the list" : "Notify me"}
          </button>
        </div>

        <p className="mt-10 text-center text-[11px] text-muted-foreground">
          Launch target · Q3 2026
        </p>
      </div>
    </div>
  );
}
