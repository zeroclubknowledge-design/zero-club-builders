import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Gift, ArrowUpRight, Search, Loader2, ShoppingBag, PackagePlus } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

export const Route = createFileRoute("/app/store")({
  component: StorePage,
});

function StorePage() {
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const { details: currentCurrency } = useWalletCurrency();

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

  const categories = useMemo(() => ["All", ...Array.from(new Set(storeItems.map((item) => item.category).filter(Boolean)))], [storeItems]);

  const filteredItems = storeItems.filter(
    item => 
      (activeCategory === "All" || item.category === activeCategory) && (
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()))
      )
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
    <div className="min-h-screen bg-background pb-16 text-foreground">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto w-full max-w-[1180px]">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <Link
                to="/app/wallet"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground tap hover:bg-muted"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </Link>
              <div><p className="text-[10px] font-medium uppercase text-muted-foreground">Marketplace</p><h1 className="text-[19px] font-semibold tracking-tight text-foreground">Zero Store</h1></div>
            </div>

            {/* Balances capsule */}
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <span className="text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">ZP</span>
                <span className="text-[13px] font-semibold tracking-tight text-foreground tabular-nums">{Number(profile?.zp || 0).toLocaleString()}</span>
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

      <div className="mx-auto w-full max-w-[1180px] px-4 py-6 md:px-7 md:py-8">
        <section className="grid overflow-hidden rounded-lg bg-[#171218] text-white md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-5 sm:p-7">
            <ShoppingBag className="h-6 w-6 text-[#f06ac3]" />
            <p className="mt-5 text-[10px] font-semibold uppercase text-white/45">Built by the Zero Club network</p>
            <h2 className="mt-2 max-w-xl text-[25px] font-semibold tracking-tight sm:text-[31px]">Tools, assets, and perks for people building real work.</h2>
            <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-white/60">Use your wallet or ZP to access useful products from builders across the Club.</p>
          </div>
          <div className="border-t border-white/10 p-5 md:border-l md:border-t-0">
            <p className="text-[10px] font-medium uppercase text-white/45">Sell on Zero Store</p>
            <p className="mt-2 text-[13px] leading-relaxed text-white/65">List templates, digital products, resources, and builder services.</p>
            <Link to="/app/my-store" className="mt-5 flex h-10 items-center justify-center gap-2 rounded-lg bg-white text-[12px] font-semibold text-black"><PackagePlus className="h-4 w-4" />Manage my store</Link>
          </div>
        </section>

        <section className="mt-5 space-y-3">
          <div className="relative"><Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" /><input type="text" placeholder="Search tools, digital products, and perks" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-12 w-full rounded-lg border border-border bg-card pl-11 pr-4 text-[14px] outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10" /></div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">{categories.map((category) => <button key={String(category)} onClick={() => setActiveCategory(String(category))} className={`h-9 shrink-0 rounded-lg border px-3.5 text-[11.5px] font-semibold ${activeCategory === category ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>{String(category)}</button>)}</div>
        </section>

        {/* Catalog */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full flex justify-center py-14">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="col-span-full py-16 text-center">
              <Gift className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">No items found</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different search term or list a new product.</p>
            </div>
          ) : (
            filteredItems.map(item => {
              return (
                <div
                  key={item.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-primary/30 hover:shadow-soft"
                >
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {item.category || "Product"}
                      </span>
                      {item.badge && (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[9.5px] font-medium text-primary">
                          {item.badge}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex gap-3.5">
                      <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary/10 text-primary">
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
                      <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {item.discount_percent > 0 ? `Price · ${item.discount_percent}% off` : "Price"}
                      </p>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        {(() => {
                          const effective = item.discount_percent > 0
                            ? Math.round(item.price * (100 - item.discount_percent) / 100)
                            : item.price;
                          const fmt = (n: number) =>
                            item.price_type === "Coins"
                              ? `${currentCurrency.symbol}${(n / currentCurrency.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                              : n.toLocaleString();
                          return (
                            <>
                              <span className="text-[15px] font-semibold tracking-tight text-foreground tabular-nums">{fmt(effective)}</span>
                              {item.discount_percent > 0 && (
                                <span className="text-[11px] text-muted-foreground line-through tabular-nums">{fmt(item.price)}</span>
                              )}
                              {item.price_type !== "Coins" && (
                                <span className="text-[10px] font-semibold text-primary">{item.price_type}</span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <button
                      onClick={() => handlePurchase(item)}
                      disabled={purchasingId === item.id || item.seller_id === profile?.id}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground tap hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
