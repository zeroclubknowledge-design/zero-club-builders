import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Gift, ArrowUpRight, Search, Loader2, PackagePlus, TicketPercent, Check, ShieldCheck, Tag, Share2, Copy } from "@/components/icons/glyphs";
import { useState, useEffect, useMemo, useRef } from "react";
import { STORE_CATEGORIES, categoryIdFor, categoryLabelFor } from "@/features/store/catalogue";
import { ProductCard } from "@/features/store/ProductCard";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { RequestFundsButton } from "@/components/RequestFundsButton";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { formatPercent } from "@/lib/utils";
import { copyToClipboard, shareOrCopy, storeProductUrl } from "@/lib/share";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  ZeroGiftPaymentOption,
  useZeroGiftBalance,
  zeroGiftBalanceQueryKey,
} from "@/components/ZeroGiftPaymentOption";

export const Route = createFileRoute("/app/store")({
  component: StorePage,
  // ?product=<id> is what makes a product shareable. The open product lives in
  // the URL rather than in component state alone, so the address bar always
  // holds a link worth sending, and Android's back button closes the sheet.
  validateSearch: (search: Record<string, unknown>): { product?: string } => ({
    product: search.product ? String(search.product) : undefined,
  }),
});

function StorePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [sellers, setSellers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  /* Product detail sheet — driven by ?product= in the URL */
  const { product: productParam } = Route.useSearch();
  const [selected, setSelected] = useState<any>(null);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [applyZeroGift, setApplyZeroGift] = useState(false);
  const missingWarned = useRef<string | null>(null);
  const { available: zeroStoreGiftBalance } = useZeroGiftBalance("zero-store", Boolean(profile));

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

  /* Browse by group rather than by whatever text sellers happened to type.
     A row built from distinct stored values grew a new tab every time somebody
     wrote "Templates" instead of "Template", and the shop looked disorganised
     because it was. Empty groups are left out: a tab that leads to nothing is
     worse than no tab. */
  const categories = useMemo(() => {
    const stocked = new Set(storeItems.map((item) => categoryIdFor(item.category)));
    return [
      { id: "All", short: "All" },
      ...STORE_CATEGORIES.filter((entry) => stocked.has(entry.id)).map((entry) => ({
        id: entry.id,
        short: entry.short,
      })),
    ];
  }, [storeItems]);

  const filteredItems = storeItems.filter((item) => {
    if (activeCategory !== "All" && categoryIdFor(item.category) !== activeCategory) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    // Every field is optional in the database, so coerce before lowercasing —
    // one product with a null description used to throw and blank the page.
    // The group name is searchable too, so "templates" finds a prompt pack.
    const haystack = [item.name, item.description, item.product_type, categoryLabelFor(item.category)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  // Opening and closing are just navigations. The effect below is the only
  // thing that sets `selected`, so a shared link, a tap on a card and the back
  // button all take the same path and cannot disagree with each other.
  const openItem = (item: any) =>
    navigate({ to: "/app/store", search: { product: item.id } });

  const closeItem = () =>
    navigate({ to: "/app/store", search: { product: undefined }, replace: true });

  useEffect(() => {
    if (loading) return;

    if (!productParam) {
      setSelected(null);
      return;
    }

    const match = storeItems.find((i: any) => i.id === productParam);
    if (match) {
      setSelected(match);
      setCouponInput("");
      setAppliedCoupon(null);
      setApplyZeroGift(false);
      missingWarned.current = null;
    } else {
      setSelected(null);
      // Only complain once per id, or the toast repeats on every re-render.
      if (missingWarned.current !== productParam) {
        missingWarned.current = productParam;
        toast.error("That product is no longer on Zero Store");
      }
    }
  }, [loading, productParam, storeItems]);

  /* ── Sharing ── */

  const copyProductLink = (item: any) =>
    copyToClipboard(storeProductUrl(item.id), "Product link copied");

  const shareProduct = (item: any) =>
    shareOrCopy({
      title: item.name || "Zero Store",
      text: `${item.name || "This product"} on Zero Store`,
      url: storeProductUrl(item.id),
      copiedMessage: "Product link copied",
      // LinkedIn gets the product's pitch and a link to it. Sharing someone
      // else's product earns 50 ZP.
      linkedin: {
        kind: "product",
        postId: item.id,
        body: [item.name, item.description].filter(Boolean).join("\n\n"),
        isOwn: item.seller_id === profile?.id,
        isShip: false,
      },
    });

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
      toast.success(`Coupon applied — ${formatPercent(selected.coupon_discount_percent)}% off`);
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
        p_apply_gift: applyZeroGift,
      });
      if (error) throw error;

      if (data?.status === "insufficient_funds") {
        const shortfall = Math.max(0, Number(data.shortfall) || 0);
        throw new Error(`Insufficient wallet balance. Add ${formatMoney(shortfall, "Coins")} to complete this purchase.`);
      }

      const giftApplied = Math.max(0, Number(data?.gift_applied) || 0);
      toast.success(giftApplied > 0
        ? `${formatMoney(giftApplied, "Coins")} Zero Gift applied. ${item.name} is yours.`
        : `Purchased ${item.name} successfully!`);
      queryClient.invalidateQueries({ queryKey: zeroGiftBalanceQueryKey("zero-store") });
      closeItem();
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
    <div className="min-h-screen bg-card pb-24 text-foreground">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[1180px] items-center gap-1 px-2 md:px-5">
          <Link to="/app/wallet" aria-label="Back to wallet" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </Link>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Zero Store</h1>
          <span className="mr-1 hidden items-center gap-2 text-[13px] text-muted-foreground sm:flex">
            <b className="font-semibold tabular-nums text-foreground">{Number(profile?.zp || 0).toLocaleString()}</b> ZP
            <span aria-hidden>·</span>
            <b className="font-semibold tabular-nums text-foreground">
              {currentCurrency.symbol}{((profile?.coins || 0) / currentCurrency.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </b>
          </span>
          <Link to="/app/my-store" className="mr-2 flex h-9 items-center rounded-full border-[1.5px] border-foreground px-4 text-[14px] font-semibold text-foreground tap hover:bg-foreground/[0.04]">
            Sell
          </Link>
        </div>
        <div className="zc-page-width mx-auto max-w-[1180px] px-4 pb-3 md:px-6">
          <label className="flex h-9 items-center gap-2 rounded-lg bg-foreground/[0.05] px-3">
            <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tools, templates and guides"
              aria-label="Search the store"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`h-8 shrink-0 rounded-full px-3.5 text-[14px] font-semibold tap ${
                  activeCategory === category.id ? "bg-foreground text-background" : "border border-foreground/30 text-foreground/75 hover:bg-foreground/[0.04]"
                }`}
              >
                {category.short}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="zc-page-width mx-auto w-full max-w-[1180px] px-4 pt-3 md:px-6">
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
          {loading ? (
            <div className="col-span-full flex justify-center py-14">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            /* An early shop is mostly empty, so this is the screen people
               will actually see. It invites them to fill it rather than
               reporting a failed query. */
            <div className="col-span-full px-6 py-14 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05]">
                <Gift className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="font-display text-[17px] font-semibold text-foreground">
                {searchQuery.trim() ? "Nothing matches that" : "Nothing here yet"}
              </p>
              <p className="mx-auto mt-1.5 max-w-[280px] text-[14px] leading-relaxed text-muted-foreground">
                {searchQuery.trim()
                  ? "Try another word, or clear the search to see everything on sale."
                  : "Be the first to sell here — templates, prompt packs, AI tool access, ebooks, anything you have made."}
              </p>
              <Link to="/app/my-store" className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background tap">
                <PackagePlus className="h-4 w-4" /> List a product
              </Link>
            </div>
          ) : (
            filteredItems.map((item) => {
              const effective = item.discount_percent > 0
                ? Math.round(item.price * (100 - item.discount_percent) / 100)
                : item.price;
              const fmt = (n: number) =>
                item.price_type === "Coins"
                  ? `${currentCurrency.symbol}${(n / currentCurrency.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : n.toLocaleString();
              const mine = item.seller_id === profile?.id;
              const seller = sellers[item.seller_id];

              return (
                <ProductCard
                  key={item.id}
                  item={item}
                  onClick={() => openItem(item)}
                  seller={seller ? <p className="truncate text-[12px] text-muted-foreground">{seller.full_name || seller.username}</p> : undefined}
                  price={
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[15px] font-semibold tabular-nums text-foreground">{fmt(effective)}</span>
                      {item.price_type !== "Coins" && <span className="text-[12px] font-semibold text-foreground">{item.price_type}</span>}
                      {item.discount_percent > 0 && (
                        <span className="text-[12px] tabular-nums text-muted-foreground line-through">{fmt(item.price)}</span>
                      )}
                    </div>
                  }
                  action={mine ? <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">Yours</span> : undefined}
                />
              );
            })
          )}
        </div>
      </div>

      {/* ── Product detail ── */}
      <Drawer open={selected !== null} onOpenChange={(open) => !open && closeItem()}>
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
            const isCoins = selected.price_type === "Coins";
            const balance = isCoins ? (profile?.coins || 0) : (profile?.zp || 0);
            const giftToApply = isCoins && applyZeroGift ? Math.min(payable, zeroStoreGiftBalance) : 0;
            const walletDue = isCoins ? Math.max(0, payable - giftToApply) : payable;
            const canAfford = balance >= walletDue;

            return (
              <>
                <div className="flex-1 overflow-y-auto no-scrollbar">
                  {/* Cover */}
                  <div className="px-5 pt-1">
                    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-foreground/[0.05]">
                      {selected.cover_url ? (
                        <img src={selected.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-muted-foreground">
                          <Gift className="h-10 w-10" strokeWidth={1.5} />
                        </div>
                      )}
                      {(selected.discount_percent || 0) > 0 && (
                        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-[#cc208f] px-2.5 py-0.5 text-[12px] font-semibold text-white">
                          <Tag className="h-3 w-3" /> {formatPercent(selected.discount_percent)}% off
                        </span>
                      )}

                      {/* Share sits on the cover so it is reachable without
                          scrolling, whatever the description length. */}
                      <div className="absolute right-3 top-3 flex items-center gap-2">
                        <button
                          onClick={() => copyProductLink(selected)}
                          title="Copy link"
                          aria-label="Copy product link"
                          className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm tap hover:bg-black/70"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => shareProduct(selected)}
                          title="Share product"
                          aria-label="Share product"
                          className="flex h-9 items-center gap-1.5 rounded-full bg-black/55 px-3.5 text-[13px] font-semibold text-white backdrop-blur-sm tap hover:bg-black/70"
                        >
                          <Share2 className="h-4 w-4" /> Share
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5 px-5 pb-5 pt-4">
                    <div>
                      <p className="text-[13px] font-semibold text-muted-foreground">
                        {selected.category || "Product"}
                      </p>
                      <DrawerTitle className="mt-1 font-display text-[20px] font-semibold leading-tight text-foreground sm:text-[20px]">
                        {selected.name}
                      </DrawerTitle>
                    </div>

                    {seller && (
                      <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground">
                          {seller.avatar_url
                            ? <img src={seller.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                            : (seller.full_name || seller.username || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-foreground">
                            {seller.full_name || seller.username}
                          </p>
                          <p className="text-[13px] text-muted-foreground">Seller on Zero Store</p>
                        </div>
                      </div>
                    )}

                    {selected.description && (
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/85">
                        {selected.description}
                      </p>
                    )}

                    <div className="flex items-start gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-3.5">
                      <ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#1a7f4b]" strokeWidth={1.9} />
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        Paid from your {selected.price_type === "Coins" ? "wallet" : "ZP"} balance. The file opens
                        immediately after purchase and stays yours.
                      </p>
                    </div>

                    {/* Coupon */}
                    {selected.coupon_code && !isOwn && (
                      <div>
                        <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                          Have a coupon?
                        </label>
                        {appliedCoupon ? (
                          <div className="flex h-11 items-center justify-between rounded-[10px] bg-[#1a7f4b]/[0.08] px-3">
                            <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[0.04em] text-[#1a7f4b]">
                              <Check className="h-4 w-4" /> {appliedCoupon}
                            </span>
                            <button
                              onClick={() => { setAppliedCoupon(null); setCouponInput(""); }}
                              className="text-[13px] font-semibold text-muted-foreground hover:text-foreground"
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
                              className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] font-medium tracking-[0.06em] outline-none placeholder:tracking-normal placeholder:text-muted-foreground focus:border-foreground/40"
                            />
                            <button
                              onClick={applyCoupon}
                              disabled={!couponInput.trim()}
                              className="flex h-11 items-center gap-1.5 rounded-full border-[1.5px] border-foreground/25 px-4 text-[14px] font-semibold text-foreground tap hover:bg-foreground/[0.04] disabled:opacity-40"
                            >
                              <TicketPercent className="h-4 w-4" /> Apply
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {isCoins && !isOwn && (
                      <ZeroGiftPaymentOption
                        service="zero-store"
                        amount={payable}
                        applied={applyZeroGift}
                        onAppliedChange={setApplyZeroGift}
                        formatAmount={(amount) => formatMoney(amount, "Coins")}
                      />
                    )}
                  </div>
                </div>

                {/* Price + buy */}
                <div className="shrink-0 border-t border-border/60 px-5 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <div className="mb-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[13px] font-semibold text-muted-foreground">
                        You pay
                      </span>
                      <span className="flex items-baseline gap-2">
                        {payable < selected.price && (
                          <span className="text-[13px] tabular-nums text-muted-foreground line-through">
                            {formatMoney(selected.price, selected.price_type)}
                          </span>
                        )}
                        <span className="font-display text-[22px] font-semibold tabular-nums text-foreground">
                          {formatMoney(payable, selected.price_type)}
                        </span>
                      </span>
                    </div>
                    {!isOwn && !canAfford && (
                      <p className="mt-1 text-right text-[13px] font-medium text-[#e0245e]">
                        Your {isCoins ? "wallet" : "balance"} has {formatMoney(balance, selected.price_type)} — add {formatMoney(walletDue - balance, selected.price_type)} to buy this.
                      </p>
                    )}
                  </div>

                  {isOwn ? (
                    <Link
                      to="/app/my-store"
                      className="flex h-12 w-full items-center justify-center rounded-full border-[1.5px] border-foreground/25 text-[16px] font-semibold text-foreground tap hover:bg-foreground/[0.04]"
                    >
                      This is your product — manage it
                    </Link>
                  ) : !canAfford ? (
                    <button
                      onClick={() => navigate({ to: "/app/wallet" })}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background tap hover:opacity-90"
                    >
                      Top up your wallet <ArrowUpRight className="h-[18px] w-[18px]" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePurchase(selected, appliedCoupon)}
                      disabled={purchasingId === selected.id}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[16px] font-semibold text-white tap hover:opacity-90 disabled:opacity-40"
                    >
                      {purchasingId === selected.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      Buy now
                    </button>
                  )}

                  {/* Offered whether or not they can afford it: somebody buying
                      a resource for a group asks for the money the same way. */}
                  {!isOwn && isCoins && payable > 0 && (
                    <div className="mt-2.5">
                      <RequestFundsButton
                        amount={payable}
                        purpose={`${selected.name} on Zero Store`}
                        label="Ask someone to cover this"
                      />
                    </div>
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
