import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Loader2, Trash2, Edit3, UploadCloud, FileArchive, TicketPercent, Gift, ChevronDown, Share2 } from "@/components/icons/glyphs";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadFile } from "@/lib/storage";
import { useUser } from "@/hooks/useUser";
import { clampPercent, formatPercent } from "@/lib/utils";
import { shareOrCopy, storeProductUrl } from "@/lib/share";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { STORE_CATEGORIES, CATEGORY_BY_ID, categoryIdFor, typeLabelFor } from "@/features/store/catalogue";
import { MediaCropper } from "@/components/MediaCropper";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useGoBack } from "@/hooks/useGoBack";

export const Route = createFileRoute("/app/my-store")({
  component: MyStorePage,
});

interface ProductForm {
  name: string;
  description: string;
  /** The broad group, e.g. "templates". */
  category: string;
  /** The specific thing, e.g. "Prompt pack". Optional; falls back to the group. */
  productType: string;
  price: string;
  priceType: "Coins" | "ZP";
  discountPercent: string;
  couponEnabled: boolean;
  couponCode: string;
  couponPercent: string;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  description: "",
  category: "templates",
  productType: "",
  price: "",
  priceType: "Coins",
  discountPercent: "0",
  couponEnabled: false,
  couponCode: "",
  couponPercent: "10",
};

const effectivePrice = (price: number, discount: number) =>
  discount > 0 ? Math.round(price * (100 - discount) / 100) : price;

function MyStorePage() {
  const { data: profile } = useUser();
  const { details: currencyDetails, format, toBaseAmount, fromBaseAmount } = useWalletCurrency();
  const formatPrice = (n: number, type: string) => type === "Coins" ? format(n) : `${n.toLocaleString()} ZP`;
  const queryClient = useQueryClient();
  const goBack = useGoBack("/app");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["my-store-items", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_items")
        .select("*")
        .eq("seller_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error && error.code !== "42P01") throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  /* ── Create / edit drawer ── */
  const [editing, setEditing] = useState<null | "new" | any>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setCoverFile(null);
    setCoverPreview(null);
    setProductFile(null);
    setExistingFileUrl(null);
    setEditing("new");
  };

  const openEdit = (item: any) => {
    setForm({
      name: item.name || "",
      description: item.description || "",
      category: categoryIdFor(item.category),
      productType: item.product_type || "",
      price: String(item.price_type === "Coins" ? fromBaseAmount(item.price ?? 0) : item.price ?? ""),
      priceType: item.price_type === "ZP" ? "ZP" : "Coins",
      // Round-trip through clampPercent so "66.6700" from Postgres becomes
      // "66.67". String(), not formatPercent — a number input needs a dot as
      // the decimal separator regardless of the device's locale.
      discountPercent: String(clampPercent(item.discount_percent ?? 0, 90)),
      couponEnabled: !!item.coupon_code,
      couponCode: item.coupon_code || "",
      couponPercent: String(clampPercent(item.coupon_discount_percent || 10, 90)),
    });
    setCoverFile(null);
    setCoverPreview(item.cover_url || null);
    setProductFile(null);
    setExistingFileUrl(item.file_url || null);
    setEditing(item);
  };

  /* Covers are shown at 16:9 on both the storefront and this page, so the
     seller chooses what gets kept rather than having the top and bottom
     trimmed off by object-fit after the fact. */
  const [cropSource, setCropSource] = useState<string | null>(null);

  const handleCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropSource(ev.target?.result as string);
    reader.readAsDataURL(file);
    // Cleared so picking the same file twice still opens the editor.
    e.target.value = "";
  };

  const applyCover = (blob: Blob) => {
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const file = new File([blob], `cover-${Date.now()}.${ext}`, { type: blob.type || "image/jpeg" });
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(blob));
    setCropSource(null);
  };

  const enteredPrice = Math.max(0, Number(form.price) || 0);
  const numericPrice = form.priceType === "Coins" ? toBaseAmount(enteredPrice) : enteredPrice;
  // parseFloat, not parseInt — a 66.67% discount is a legitimate price, and
  // parseInt silently turned it into 66, quietly overcharging the buyer.
  const numericDiscount = clampPercent(form.discountPercent, 90);
  const numericCoupon = clampPercent(form.couponPercent, 90);
  const salePrice = effectivePrice(numericPrice, numericDiscount);
  const couponPrice = effectivePrice(salePrice, form.couponEnabled ? numericCoupon : 0);

  const canSave =
    form.name.trim().length > 0 &&
    form.description.trim().length > 0 &&
    numericPrice > 0 &&
    (!!productFile || !!existingFileUrl) &&
    (!form.couponEnabled || form.couponCode.trim().length >= 3);

  const handleSave = async () => {
    if (!profile?.id || !canSave) return;
    setSaving(true);
    try {
      let coverUrl = editing !== "new" ? editing.cover_url : null;
      if (coverFile) {
        const ext = coverFile.name.split(".").pop();
        coverUrl = await uploadFile("store_products", coverFile, `${profile.id}/covers/${Date.now()}.${ext}`);
      }

      let fileUrl = existingFileUrl;
      if (productFile) {
        const safeName = productFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        fileUrl = await uploadFile("store_products", productFile, `${profile.id}/files/${Date.now()}_${safeName}`);
      }

      const payload = {
        seller_id: profile.id,
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        product_type: form.productType || null,
        price: numericPrice,
        price_type: form.priceType,
        cover_url: coverUrl,
        file_url: fileUrl,
        discount_percent: numericDiscount,
        coupon_code: form.couponEnabled && form.couponCode.trim() ? form.couponCode.trim().toUpperCase() : null,
        coupon_discount_percent: form.couponEnabled ? numericCoupon : 0,
      };

      if (editing === "new") {
        const { error } = await supabase.from("store_items").insert(payload);
        if (error) throw error;
        toast.success("Product listed on Zero Store!");
      } else {
        const { error } = await supabase.from("store_items").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Product updated");
      }

      queryClient.invalidateQueries({ queryKey: ["my-store-items", profile.id] });
      setEditing(null);
    } catch (err: any) {
      if (err?.message?.includes("discount_percent") || err?.message?.includes("coupon")) {
        toast.error("Your database is missing the discount columns. Run supabase/migrations/20260710120000_add_store_discounts_coupons.sql in the Supabase SQL editor.");
      } else {
        toast.error(err.message || "Failed to save product");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("store_items").delete().eq("id", deleting.id);
    if (error) {
      toast.error(error.message || "Failed to delete product");
    } else {
      toast.success("Product removed from the store");
      queryClient.invalidateQueries({ queryKey: ["my-store-items", profile?.id] });
    }
    setDeleting(null);
  };

  /* ── Stats ── */
  const coinValue = products
    .filter((p: any) => p.price_type === "Coins")
    .reduce((sum: number, p: any) => sum + effectivePrice(p.price, p.discount_percent || 0), 0);
  const activeCoupons = products.filter((p: any) => p.coupon_code).length;

  const inputClass =
    "w-full bg-card rounded-lg px-4 py-3 text-[14px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition text-foreground placeholder:text-muted-foreground/50";
  const labelClass = "text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1";

  const couponProducts = products.filter((item: any) => item.coupon_code);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[760px] items-center gap-1 px-2">
          <button type="button" onClick={goBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold text-foreground">My store</h1>
          <Link to="/app/store" className="flex h-9 items-center gap-1 rounded-full px-3 text-[14px] font-semibold text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground">
            View as buyer
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-[10px] bg-foreground/[0.04] px-1 py-2.5">
              <p className="text-[18px] font-semibold tabular-nums">{products.length}</p>
              <p className="text-[12px] text-muted-foreground">Products</p>
            </div>
            <div className="rounded-[10px] bg-foreground/[0.04] px-1 py-2.5">
              <p className="truncate text-[18px] font-semibold tabular-nums">
                <span className="text-[13px] font-normal text-muted-foreground">{currencyDetails.symbol}</span>{coinValue.toLocaleString()}
              </p>
              <p className="text-[12px] text-muted-foreground">Catalogue value</p>
            </div>
            <div className="rounded-[10px] bg-foreground/[0.04] px-1 py-2.5">
              <p className="text-[18px] font-semibold tabular-nums">{activeCoupons}</p>
              <p className="text-[12px] text-muted-foreground">Coupons</p>
            </div>
          </div>
        </section>

        <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="font-display text-[18px] font-semibold">Products</h2>
            <button
              onClick={openCreate}
              className="flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-[13px] font-semibold text-background tap hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Add product
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-2 px-4 pb-4">
              {[0, 1].map((i) => <div key={i} className="shimmer h-16 rounded-lg bg-foreground/[0.05]" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center border-t border-border/60 px-8 py-12 text-center">
              <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05]"><Gift className="h-5 w-5 text-muted-foreground" /></span>
              <h3 className="mb-1.5 font-display text-[18px] font-semibold">Nothing for sale yet</h3>
              <p className="mb-6 max-w-[300px] text-[14px] leading-relaxed text-muted-foreground">
                Templates, prompt packs, AI tool access, ebooks, code, design assets — set a price and start earning.
              </p>
              <button onClick={openCreate} className="flex h-10 items-center gap-1.5 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background tap hover:opacity-90">
                <Plus className="h-4 w-4" /> Add your first product
              </button>
            </div>
          ) : (
            products.map((item: any) => {
              const sale = effectivePrice(item.price, item.discount_percent || 0);
              return (
                <div key={item.id} className="flex items-center gap-3 border-t border-border/60 px-4 py-3">
                  <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[10px] bg-muted">
                    {item.cover_url ? (
                      <img src={item.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-muted-foreground/50"><Gift className="h-5 w-5" /></span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-semibold text-foreground">{item.name}</h3>
                    <p className="truncate text-[13px] text-muted-foreground">
                      <span className="font-semibold text-foreground tabular-nums">{formatPrice(sale, item.price_type)}</span>
                      {(item.discount_percent || 0) > 0 && <span className="ml-1 line-through tabular-nums">{formatPrice(item.price, item.price_type)}</span>}
                      {" · "}{typeLabelFor(item.category, item.product_type)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button
                      onClick={() => shareOrCopy({
                        title: item.name || "Zero Store",
                        text: `${item.name || "This product"} on Zero Store`,
                        url: storeProductUrl(item.id),
                        copiedMessage: "Product link copied",
                      })}
                      aria-label={`Share ${item.name}`}
                      className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground tap"
                    >
                      <Share2 className="h-[17px] w-[17px]" />
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      aria-label={`Edit ${item.name}`}
                      className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground tap"
                    >
                      <Edit3 className="h-[17px] w-[17px]" />
                    </button>
                    <button
                      onClick={() => setDeleting(item)}
                      aria-label={`Delete ${item.name}`}
                      className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive tap"
                    >
                      <Trash2 className="h-[17px] w-[17px]" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="flex-1 bg-card pb-28 md:flex-none md:overflow-hidden md:rounded-xl md:border md:border-border md:pb-2">
          <h2 className="px-4 pb-1 pt-4 font-display text-[18px] font-semibold">Coupons</h2>
          <p className="px-4 pb-2 text-[13px] text-muted-foreground">Each product can carry one coupon. Add or change it when you edit the product.</p>
          {couponProducts.length === 0 ? (
            <p className="border-t border-border/60 px-4 py-6 text-center text-[14px] text-muted-foreground">No coupons yet.</p>
          ) : (
            couponProducts.map((item: any) => (
              <button
                key={item.id}
                onClick={() => openEdit(item)}
                className="mx-4 mb-2 flex w-[calc(100%-2rem)] items-center gap-3 rounded-xl border-[1.5px] border-dashed border-[#cc208f]/40 px-3 py-2.5 text-left hover:bg-[#cc208f]/[0.03]"
              >
                <span className="font-mono text-[15px] font-bold text-[#a3186f]">{item.coupon_code}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                  {formatPercent(item.coupon_discount_percent)}% off · {item.name}
                </span>
                <TicketPercent className="h-4 w-4 shrink-0 text-[#cc208f]" />
              </button>
            ))
          )}
        </section>
      </main>

      {/* ── Create / Edit drawer ── */}
      <Drawer open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DrawerContent desktopVariant="panel" className="border-none bg-background p-0 focus:ring-0 max-w-lg mx-auto max-h-[92dvh] flex flex-col">
          <div className="shrink-0 border-b px-4 pb-3 pt-1 hairline sm:px-6 sm:pb-4 sm:pt-5">
            <DrawerTitle className="text-[17px] font-semibold tracking-tight text-foreground sm:text-[20px]">
              {editing === "new" ? "New product" : "Edit product"}
            </DrawerTitle>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {editing === "new" ? "Upload a digital file and set your price." : "Changes go live on Zero Store immediately."}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 no-scrollbar">
            {/* Cover */}
            <div className="space-y-2">
              <label className={labelClass}>Cover image</label>
              <button
                onClick={() => coverInputRef.current?.click()}
                className="group relative grid h-36 w-full place-items-center overflow-hidden rounded-lg border border-dashed border-border-strong text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {coverPreview ? (
                  <>
                    <img src={coverPreview} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
                    <span className="relative z-10 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      Change cover
                    </span>
                  </>
                ) : (
                  <span className="flex flex-col items-center gap-2 text-[12.5px] font-medium">
                    <UploadCloud className="h-6 w-6" strokeWidth={1.75} />
                    Add a cover image
                  </span>
                )}
              </button>
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverPick} />
            </div>

            {/* Product file */}
            <div className="space-y-2">
              <label className={labelClass}>Product file</label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-lg bg-card p-4 text-left ring-1 ring-border transition-all tap hover:ring-primary/30"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/8 ring-1 ring-primary/15 text-primary">
                  <FileArchive className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  {productFile ? (
                    <>
                      <p className="text-[13.5px] font-semibold tracking-tight text-foreground truncate">{productFile.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">{(productFile.size / 1024 / 1024).toFixed(1)} MB · ready to upload</p>
                    </>
                  ) : existingFileUrl ? (
                    <>
                      <p className="text-[13.5px] font-semibold tracking-tight text-foreground">File attached</p>
                      <p className="text-[11.5px] text-muted-foreground">Tap to replace the delivered file</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[13.5px] font-semibold tracking-tight text-foreground">Choose a file</p>
                      <p className="text-[11.5px] text-muted-foreground">ZIP, PDF, images, audio — delivered to buyers instantly</p>
                    </>
                  )}
                </div>
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setProductFile(e.target.files?.[0] || null)} />
            </div>

            {/* Name / description */}
            <div className="space-y-2">
              <label className={labelClass}>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Founder Pitch Deck Template"
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What does the buyer get?"
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Category + currency */}
            {/* Group first, then the specific type as chips.
                A single flat dropdown of forty options is slower to use than
                nine plus a handful, and it produced listings labelled
                "Template" that could have said "Prompt pack". */}
            <div className="space-y-2">
              <label className={labelClass}>What is it?</label>
              <div className="relative">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value, productType: "" })}
                  className={`${inputClass} appearance-none pr-10 cursor-pointer`}
                >
                  {STORE_CATEGORIES.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {(CATEGORY_BY_ID.get(form.category)?.types || []).map((type) => {
                  const active = form.productType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm({ ...form, productType: active ? "" : type })}
                      className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
                        active
                          ? "bg-foreground text-background"
                          : "bg-background text-muted-foreground ring-1 ring-border hover:text-foreground"
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* No longer sharing a row with the category dropdown, so it takes
                the full width rather than leaving half the row empty. */}
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <label className={labelClass}>Charge in</label>
                <div className="flex rounded-lg bg-background p-1 ring-1 ring-border">
                  {(["Coins", "ZP"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm({ ...form, priceType: t })}
                      className={`flex-1 rounded-xl py-2 text-[12.5px] font-semibold tracking-tight transition-colors ${form.priceType === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {t === "Coins" ? `${currencyDetails.symbol} Cash` : "ZP"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Price + discount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className={labelClass}>Price {form.priceType === "Coins" ? `(${currencyDetails.symbol})` : "(ZP)"}</label>
                <input
                  type="number"
                  min="1"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="5000"
                  className={`${inputClass} tabular-nums`}
                />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Discount %</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="90"
                    // step 0.01 and inputMode decimal so the browser accepts a
                    // fractional discount and a phone keypad offers the dot.
                    step="0.01"
                    inputMode="decimal"
                    value={form.discountPercent}
                    onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                    className={`${inputClass} pr-8 tabular-nums`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            {/* Coupon */}
            <div className="space-y-4 rounded-lg bg-card p-4 ring-1 ring-border">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13.5px] font-semibold tracking-tight text-foreground">Coupon code</p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">Buyers who enter this code get an extra discount.</p>
                </div>
                <button
                  onClick={() => setForm({ ...form, couponEnabled: !form.couponEnabled })}
                  className={`h-7 w-12 shrink-0 rounded-full p-1 transition ${form.couponEnabled ? "bg-primary" : "bg-foreground/[0.08]"}`}
                >
                  <span className={`block h-5 w-5 rounded-full bg-background shadow-sm transition ${form.couponEnabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
              {form.couponEnabled && (
                <div className="grid grid-cols-[1fr_88px] gap-3">
                  <input
                    value={form.couponCode}
                    onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })}
                    placeholder="LAUNCH20"
                    className={`${inputClass} tracking-[0.08em]`}
                  />
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="90"
                      step="0.01"
                      inputMode="decimal"
                      value={form.couponPercent}
                      onChange={(e) => setForm({ ...form, couponPercent: e.target.value })}
                      className={`${inputClass} pr-8 tabular-nums`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Buyer-pays preview */}
            {numericPrice > 0 && (
              <div className="space-y-1.5 rounded-lg bg-primary/[0.04] px-4 py-3.5 ring-1 ring-primary/15">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-muted-foreground">Buyers pay</span>
                  <span className="font-semibold tracking-tight text-foreground tabular-nums">
                    {formatPrice(salePrice, form.priceType)}
                    {numericDiscount > 0 && (
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground line-through">{formatPrice(numericPrice, form.priceType)}</span>
                    )}
                  </span>
                </div>
                {form.couponEnabled && form.couponCode.trim().length >= 3 && (
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="text-muted-foreground">With {form.couponCode.trim()}</span>
                    <span className="font-semibold tracking-tight text-primary tabular-nums">{formatPrice(couponPrice, form.priceType)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 px-6 py-4 border-t hairline flex gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => setEditing(null)}
              disabled={saving}
              className="flex-1 rounded-full ring-1 ring-border py-3 text-[13.5px] font-semibold tracking-tight text-foreground hover:bg-foreground/[0.03] tap disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex-1 rounded-full bg-foreground py-3 text-[13.5px] font-semibold tracking-tight text-background tap hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing === "new" ? "List product" : "Save changes"}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Delete confirmation ── */}
      {deleting && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm animate-in rounded-2xl bg-card p-6 shadow-2xl ring-1 ring-border duration-200 zoom-in-95">
            <h3 className="mb-2 text-[18px] font-semibold">Remove this product?</h3>
            <p className="mb-6 text-[14px] leading-relaxed text-muted-foreground">
              "{deleting.name}" will be taken off Zero Store. Buyers who already purchased keep their download.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleDelete}
                className="h-11 w-full rounded-full bg-destructive text-[15px] font-semibold text-destructive-foreground tap hover:opacity-90"
              >
                Yes, remove it
              </button>
              <button
                onClick={() => setDeleting(null)}
                className="h-11 w-full rounded-full border border-foreground/25 text-[15px] font-semibold text-foreground tap hover:bg-foreground/[0.03]"
              >
                Keep selling
              </button>
            </div>
          </div>
        </div>
      )}

      {cropSource && (
        <MediaCropper
          src={cropSource}
          aspect={16 / 9}
          title="Product cover"
          onDone={(result) => {
            if (result.kind === "image") applyCover(result.blob);
          }}
          onCancel={() => setCropSource(null)}
        />
      )}
    </div>
  );
}
