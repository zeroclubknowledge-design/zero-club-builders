import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, Gift, ArrowUpRight, Search, Loader2, ShoppingBag, PackagePlus,
  TicketPercent, Check, ShieldCheck, Tag, Share2, Copy,
} from "@/components/icons/solar";
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
    <div className="min-h-screen bg-background pb-16 text-foreground">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-40 bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
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
        {/* On a phone this was a full screen of manifesto — a headline, a
            subtitle, a second panel and a button — before a single thing you
            could buy. The pitch is for desktop, where there is room beside the
            products; the phone gets one line and the sell button, and starts
            shopping immediately. */}
        <section className="grid overflow-hidden rounded-xl bg-[#171218] text-white md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex items-center gap-3 p-4 sm:p-7 md:block">
            <ShoppingBag className="h-6 w-6 shrink-0 text-[#f06ac3]" />
            <div className="min-w-0 md:mt-5">
              <p className="hidden text-[10px] font-semibold uppercase text-white/45 md:block">Built by the Zero Club network</p>
              <h2 className="max-w-xl text-[15px] font-semibold tracking-tight md:mt-2 md:text-[31px]">
                Tools, assets, and perks for people building real work.
              </h2>
              <p className="mt-3 hidden max-w-lg text-[13px] leading-relaxed text-white/60 md:block">Use your wallet or ZP to access useful products from builders across the Club.</p>
            </div>
          </div>
          <div className="border-t border-white/10 px-4 pb-4 md:border-l md:border-t-0 md:p-5">
            <p className="mt-4 hidden text-[10px] font-medium uppercase text-white/45 md:mt-0 md:block">Sell on Zero Store</p>
            <p className="mt-2 hidden text-[13px] leading-relaxed text-white/65 md:block">List templates, digital products, resources, and builder services.</p>
            <Link to="/app/my-store" className="mt-4 flex h-10 items-center justify-center gap-2 rounded-lg bg-white text-[12px] font-semibold text-black md:mt-5"><PackagePlus className="h-4 w-4" />Manage my store</Link>
          </div>
        </section>

        <section className="mt-4 space-y-3 md:mt-5">
          <div className="relative"><Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" /><input type="text" placeholder="Search tools, digital products, and perks" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-12 w-full rounded-lg border border-border bg-card pl-11 pr-4 text-[14px] outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10" /></div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">{categories.map((category) => <button key={category.id} onClick={() => setActiveCategory(category.id)} className={`h-9 shrink-0 rounded-lg px-3.5 text-[11.5px] font-semibold shadow-[var(--shadow-card)] transition ${activeCategory === category.id ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}>{category.short}</button>)}</div>
        </section>

        {/* There was a grid of all nine categories here, shown before any
            product. It was designed for a stocked shop and met an empty one:
            with three listings, seven cards read "Nothing yet" and a customer
            had to scroll a screen and a half of dead aisles to reach anything
            they could buy. A shop window shows stock, not a directory of
            departments — the chip row above already filters, and it only
            offers groups that actually have something in them. */}

        {/* Catalog */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full flex justify-center py-14">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            /* An early shop is mostly empty, so this is the screen people
               will actually see. It invites them to fill it rather than
               reporting a failed query. */
            <div className="col-span-full rounded-xl bg-card px-6 py-14 text-center shadow-[var(--shadow-card)]">
              <Gift className="mx-auto mb-3 h-10 w-10 text-primary/30" />
              <p className="text-[15px] font-semibold tracking-tight text-foreground">
                {searchQuery.trim() ? "Nothing matches that" : "Nothing here yet"}
              </p>
              <p className="mx-auto mt-1.5 max-w-[280px] text-[12.5px] leading-relaxed text-muted-foreground">
                {searchQuery.trim()
                  ? "Try another word, or clear the search to see everything on sale."
                  : "Be the first to sell here — templates, prompt packs, AI tool access, ebooks, anything you have made."}
              </p>
              <Link
                to="/app/my-store"
                className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background transition active:scale-[0.98]"
              >
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

              return (
                <ProductCard
                  key={item.id}
                  item={item}
                  onClick={() => openItem(item)}
                  price={
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[15px] font-semibold tabular-nums tracking-tight text-foreground">{fmt(effective)}</span>
                      {item.discount_percent > 0 && (
                        <span className="text-[11px] tabular-nums text-muted-foreground line-through">{fmt(item.price)}</span>
                      )}
                      {item.price_type !== "Coins" && (
                        <span className="text-[10px] font-semibold text-primary">{item.price_type}</span>
                      )}
                    </div>
                  }
                  action={
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold ${
                        mine ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {mine ? "Yours" : <>View <ArrowUpRight className="h-3 w-3" /></>}
                    </span>
                  }
                />
              );
            })
          )}
        </div>

        <p className="mt-10 text-center text-[11px] text-muted-foreground">
          Zero Store Marketplace
        </p>
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
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-primary/10">
                    {selected.cover_url ? (
                      <img src={selected.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-primary">
                        <Gift className="h-10 w-10" strokeWidth={1.5} />
                      </div>
                    )}
                    {(selected.discount_percent || 0) > 0 && (
                      <span className="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[10.5px] font-semibold text-white backdrop-blur-sm">
                        <Tag className="h-2.5 w-2.5" /> {formatPercent(selected.discount_percent)}% off
                      </span>
                    )}

                    {/* Share sits on the cover so it is reachable without
                        scrolling, whatever the description length. */}
                    <div className="absolute right-4 top-4 flex items-center gap-2">
                      <button
                        onClick={() => copyProductLink(selected)}
                        title="Copy link"
                        aria-label="Copy product link"
                        className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm tap hover:bg-black/70"
                      >
                        <Copy className="h-[15px] w-[15px]" />
                      </button>
                      <button
                        onClick={() => shareProduct(selected)}
                        title="Share product"
                        aria-label="Share product"
                        className="flex h-9 items-center gap-1.5 rounded-full bg-black/55 px-3.5 text-[12px] font-semibold text-white backdrop-blur-sm tap hover:bg-black/70"
                      >
                        <Share2 className="h-[14px] w-[14px]" /> Share
                      </button>
                    </div>
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
                            ? <img src={seller.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
                        Your {isCoins ? "wallet" : "balance"} has {formatMoney(balance, selected.price_type)} — add {formatMoney(walletDue - balance, selected.price_type)} to buy this.
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
                      onClick={() => navigate({ to: "/app/wallet" })}
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
