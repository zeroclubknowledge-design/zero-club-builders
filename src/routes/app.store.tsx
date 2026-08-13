import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, Gift, ArrowUpRight, Search, Loader2, ShoppingBag, PackagePlus,
  TicketPercent, Check, ShieldCheck, Tag,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";

export const Route = createFileRoute("/app/store")({
  component: StorePage,
});

function StorePage() {
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [sellers, setSellers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  /* Product detail sheet */
  const [selected, setSelected] = useState<any>(null);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);

  const { details: currentCurrency } = useWalletCurrency();

  useEffect(() => {
    async function fetchItems() {
      try {
        const { data, error } = await supabase.from("store_items").select("*").order("created_at", { ascending: false });
        if (error && error.code !== '42P01') throw error; // ignore if table doesn't exist yet
        const items = data || [];
        setStoreItems(items);

        // Seller names are a nice-to-have, so they load separately. A failure
        // here (or a schema that has drifted) must not blank out the catalog.
        const sellerIds = Array.from(new Set(items.map((i: any) => i.seller_id).filter(Boolean)));
        if (sellerIds.length > 0) {
          const { data: people } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url")
            .in("id", sellerIds);
          if (people) {
            setSellers(Object.fromEntries(people.map((p: any) => [p.id, p])));
          }
        }
      } catch (err: any) {
        console.error("Failed to load store items:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchItems();
  }, []);

  const categories = useMemo(() => ["All", ...Array.from(new Set(storeItems.map((item) => item.category).filter(Boolean)))], [storeItems]);

  const filteredItems = storeItems.filter((item) => {
    if (activeCategory !== "All" && item.category !== activeCategory) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    // Every field is optional in the database, so coerce before lowercasing —
    // one product with a null description used to throw and blank the page.
    const haystack = [item.name, item.description, item.category]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const openItem = (item: any) => {
    setSelected(item);
    setCouponInput("");
    setAppliedCoupon(null);
  };

  const priceOf = (item: any) =>
    (item.discount_percent || 0) > 0
      ? Math.round(item.price * (100 - item.discount_percent) / 100)
      : item.price;

  const formatMoney = (n: number, priceType: string) =>
    priceType === "Coins"
      ? `${currentCurrency.symbol}${(n / currentCurrency.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : `${n.toLocaleString()} ZP`;

  const applyCoupon = () => {
    if (!selected) return;
    const entered = couponInput.trim().toUpperCase();
    if (!entered) return;
    if (
      selected.coupon_code &&
      entered === String(selected.coupon_code).toUpperCase() &&
      (selected.coupon_discount_percent || 0) > 0
    ) {
      setAppliedCoupon(entered);
      toast.success(`Coupon applied — ${selected.coupon_discount_percent}% off`);
    } else {
      setAppliedCoupon(null);
      toast.error("That coupon code isn't valid for this product");
    }
  };

  const handlePurchase = async (item: any, coupon?: string | null) => {
    if (!profile) return toast.error("Please login to purchase");
    setPurchasingId(item.id);
    try {
      // The database function has always accepted a coupon; the store never
      // sent one, so every code a seller created did nothing.
      const { data, error } = await supabase.rpc("purchase_store_item", {
        item_id: item.id,
        coupon: coupon || null,
      });
      if (error) throw error;

      toast.success(`Purchased ${item.name} successfully!`);
      setSelected(null);
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
                  role="button"
                  tabIndex={0}
                  onClick={() => openItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openItem(item);
                    }
                  }}
                  className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-lg border border-border bg-card text-left transition-all tap hover:border-primary/30 hover:shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
                      onClick={(e) => {
                        // The whole card opens the product now, so the button
                        // must not also trigger it.
                        e.stopPropagation();
                        if (item.seller_id === profile?.id) return;
                        openItem(item);
                      }}
                      disabled={item.seller_id === profile?.id}
                      className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground tap hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {item.seller_id === profile?.id ? (
                        "Your Item"
                      ) : (
                        <>View <ArrowUpRight className="h-3 w-3" /></>
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

      {/* ── Product detail ── */}
      <Drawer open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DrawerContent
          desktopVariant="panel"
          className="border-none bg-background p-0 focus:ring-0 max-w-lg mx-auto max-h-[92dvh] flex flex-col"
        >
          {selected && (() => {
            const isOwn = selected.seller_id === profile?.id;
            const seller = sellers[selected.seller_id];
            const sale = priceOf(selected);
            const couponPct = appliedCoupon ? (selected.coupon_discount_percent || 0) : 0;
            const payable = couponPct > 0 ? Math.round(sale * (100 - couponPct) / 100) : sale;
            const balance = selected.price_type === "Coins" ? (profile?.coins || 0) : (profile?.zp || 0);
            const canAfford = balance >= payable;

            return (
              <>
                <div className="flex-1 overflow-y-auto no-scrollbar">
                  {/* Cover */}
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-primary/10">
                    {selected.cover_url ? (
                      <img src={selected.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-primary">
                        <Gift className="h-10 w-10" strokeWidth={1.5} />
                      </div>
                    )}
                    {(selected.discount_percent || 0) > 0 && (
                      <span className="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[10.5px] font-semibold text-white backdrop-blur-sm">
                        <Tag className="h-2.5 w-2.5" /> {selected.discount_percent}% off
                      </span>
                    )}
                  </div>

                  <div className="space-y-5 px-6 py-5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {selected.category || "Product"}
                      </p>
                      <DrawerTitle className="mt-1.5 text-[21px] font-semibold leading-tight tracking-tight text-foreground">
                        {selected.name}
                      </DrawerTitle>
                    </div>

                    {seller && (
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                          {seller.avatar_url
                            ? <img src={seller.avatar_url} alt="" className="h-full w-full object-cover" />
                            : (seller.full_name || seller.username || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                            {seller.full_name || seller.username}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Seller on Zero Store</p>
                        </div>
                      </div>
                    )}

                    {selected.description && (
                      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted-foreground">
                        {selected.description}
                      </p>
                    )}

                    <div className="flex items-start gap-2.5 rounded-lg bg-card px-4 py-3 ring-1 ring-border">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={1.9} />
                      <p className="text-[12px] leading-relaxed text-muted-foreground">
                        Paid from your {selected.price_type === "Coins" ? "wallet" : "ZP"} balance. The file opens
                        immediately after purchase and stays yours.
                      </p>
                    </div>

                    {/* Coupon */}
                    {selected.coupon_code && !isOwn && (
                      <div className="space-y-2">
                        <label className="ml-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Have a coupon?
                        </label>
                        {appliedCoupon ? (
                          <div className="flex items-center justify-between rounded-lg bg-success/[0.07] px-4 py-3 ring-1 ring-success/20">
                            <span className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.06em] text-success">
                              <Check className="h-3.5 w-3.5" /> {appliedCoupon}
                            </span>
                            <button
                              onClick={() => { setAppliedCoupon(null); setCouponInput(""); }}
                              className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                            <input
                              value={couponInput}
                              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                              onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                              placeholder="Enter code"
                              className="h-11 w-full rounded-lg bg-background px-4 text-[13.5px] font-medium tracking-[0.08em] outline-none ring-1 ring-border placeholder:tracking-normal placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-primary/40"
                            />
                            <button
                              onClick={applyCoupon}
                              disabled={!couponInput.trim()}
                              className="flex h-11 items-center gap-1.5 rounded-lg px-4 text-[12.5px] font-semibold text-foreground ring-1 ring-border tap hover:bg-foreground/[0.04] disabled:opacity-40"
                            >
                              <TicketPercent className="h-3.5 w-3.5" /> Apply
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Price + buy */}
                <div className="shrink-0 border-t hairline px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <div className="mb-3 space-y-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        You pay
                      </span>
                      <span className="flex items-baseline gap-2">
                        {payable < selected.price && (
                          <span className="text-[12px] text-muted-foreground line-through tabular-nums">
                            {formatMoney(selected.price, selected.price_type)}
                          </span>
                        )}
                        <span className="text-[20px] font-semibold tracking-tight text-foreground tabular-nums">
                          {formatMoney(payable, selected.price_type)}
                        </span>
                      </span>
                    </div>
                    {!isOwn && !canAfford && (
                      <p className="text-right text-[11.5px] font-medium text-destructive">
                        Your balance is {formatMoney(balance, selected.price_type)} — top up to buy this.
                      </p>
                    )}
                  </div>

                  {isOwn ? (
                    <Link
                      to="/app/my-store"
                      className="flex h-12 w-full items-center justify-center rounded-full ring-1 ring-border text-[13.5px] font-semibold tracking-tight text-foreground tap hover:bg-foreground/[0.03]"
                    >
                      This is your product — manage it
                    </Link>
                  ) : !canAfford ? (
                    <button
                      onClick={() => { setSelected(null); navigate({ to: "/app/wallet" }); }}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[13.5px] font-semibold tracking-tight text-background tap hover:opacity-90"
                    >
                      Top up your wallet <ArrowUpRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePurchase(selected, appliedCoupon)}
                      disabled={purchasingId === selected.id}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[13.5px] font-semibold tracking-tight text-primary-foreground tap hover:opacity-90 disabled:opacity-50"
                    >
                      {purchasingId === selected.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      Buy now
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
