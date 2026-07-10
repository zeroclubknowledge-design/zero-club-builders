import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Store as StoreIcon, Bell, ArrowLeft, Gift, Sparkles, Laptop, Award, ArrowUpRight, ShieldCheck, Search, Loader2, Plus } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/app/store")({
  component: StorePage,
});

function StorePage() {
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

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

  useEffect(() => {
    async function fetchItems() {
      try {
        const { data, error } = await supabase.from("store_items").select("*").order("created_at", { ascending: false });
        if (error && error.code !== '42P01') throw error; // ignore if table doesn't exist yet
        setStoreItems(data || []);
      } catch (err: any) {
        console.error("Failed to load store items:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchItems();
  }, []);

  const filteredItems = storeItems.filter(
    item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handlePurchase = async (item: any) => {
    if (!profile) return toast.error("Please login to purchase");
    setPurchasingId(item.id);
    try {
      const { data, error } = await supabase.rpc("purchase_store_item", { item_id: item.id });
      if (error) throw error;
      
      toast.success(`Purchased ${item.name} successfully!`);
      if (data?.file_url) {
        window.open(data.file_url, '_blank');
      }
      
      // reload page to reflect new balances
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || "Failed to purchase item");
    } finally {
      setPurchasingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-6">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl backdrop-saturate-150 border-b hairline px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-4">
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

          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-[13.5px] leading-relaxed text-muted-foreground max-w-sm">
              Redeem your builder rewards for subscriptions, gear, and exclusive perks.
            </p>
            <Link 
              to="/app/store/new"
              className="shrink-0 flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-xs font-semibold tap hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" /> Sell Product
            </Link>
          </div>

          {/* Search Box */}
          <div className="mt-5 relative pb-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none pb-1">
              <Search className="h-[18px] w-[18px] text-muted-foreground" />
            </div>
            <input
              type="text"
              placeholder="Search for tools, digital products, perks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card ring-1 ring-border rounded-full pl-11 pr-4 py-3 text-[13.5px] font-medium outline-none focus:ring-primary/50 transition-all placeholder:text-muted-foreground/70"
            />
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl mx-auto px-5">
        {/* Catalog */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {loading ? (
            <div className="col-span-1 md:col-span-2 py-10 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="col-span-1 md:col-span-2 py-12 text-center">
              <Gift className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">No items found</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different search term or list a new product.</p>
            </div>
          ) : (
            filteredItems.map(item => {
              return (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-2xl bg-card ring-1 ring-border hover:ring-foreground/15 shadow-soft transition-all flex flex-col justify-between"
                >
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {item.category || "Product"}
                      </span>
                      {item.badge && (
                        <span className="text-[9.5px] font-medium text-primary ring-1 ring-primary/15 px-2 py-0.5 rounded-full bg-primary/5">
                          {item.badge}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex gap-3.5">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl overflow-hidden bg-primary/8 ring-1 ring-primary/15 text-primary relative">
                        {item.cover_url ? (
                          <img src={item.cover_url} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <Gift className="h-[20px] w-[20px]" strokeWidth={1.75} />
                        )}
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
                          {item.price_type === "Coins"
                            ? `${currentCurrency.symbol}${((item.price) / currentCurrency.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                            : `${item.price.toLocaleString()}`}
                        </span>
                        {item.price_type !== "Coins" && (
                          <span className="text-[10px] font-semibold text-primary">
                            {item.price_type}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handlePurchase(item)}
                      disabled={purchasingId === item.id || item.seller_id === profile?.id}
                      className="flex items-center justify-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[12px] font-semibold tracking-tight text-background tap hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {purchasingId === item.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : item.seller_id === profile?.id ? (
                        "Your Item"
                      ) : (
                        <>Buy Now <ArrowUpRight className="h-3 w-3" /></>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <p className="mt-10 text-center text-[11px] text-muted-foreground">
          Zero Store Marketplace
        </p>
      </div>
    </div>
  );
}
