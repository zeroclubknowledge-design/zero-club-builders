import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft, Plus, Loader2, Trash2, Edit3, UploadCloud, FileArchive,
  Tag, TicketPercent, Gift, ChevronDown, ExternalLink, X,
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { uploadFile } from "@/lib/storage";
import { useUser } from "@/hooks/useUser";
import { IconStore } from "@/components/icons";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";

export const Route = createFileRoute("/app/my-store")({
  component: MyStorePage,
});

const CATEGORIES = ["Template", "E-book", "Design kit", "Code", "Course asset", "Audio", "Other"];

interface ProductForm {
  name: string;
  description: string;
  category: string;
  price: string;
  priceType: "Coins" | "XP";
  discountPercent: string;
  couponEnabled: boolean;
  couponCode: string;
  couponPercent: string;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  description: "",
  category: "Template",
  price: "",
  priceType: "Coins",
  discountPercent: "0",
  couponEnabled: false,
  couponCode: "",
  couponPercent: "10",
};

const effectivePrice = (price: number, discount: number) =>
  discount > 0 ? Math.round(price * (100 - discount) / 100) : price;

const formatPrice = (n: number, type: string) =>
  type === "Coins" ? `₦${n.toLocaleString()}` : `${n.toLocaleString()} XP`;

function MyStorePage() {
  const { data: profile } = useUser();
  const queryClient = useQueryClient();

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
      category: item.category || "Template",
      price: String(item.price ?? ""),
      priceType: item.price_type === "XP" ? "XP" : "Coins",
      discountPercent: String(item.discount_percent ?? 0),
      couponEnabled: !!item.coupon_code,
      couponCode: item.coupon_code || "",
      couponPercent: String(item.coupon_discount_percent || 10),
    });
    setCoverFile(null);
    setCoverPreview(item.cover_url || null);
    setProductFile(null);
    setExistingFileUrl(item.file_url || null);
    setEditing(item);
  };

  const handleCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setCoverPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const numericPrice = Math.max(0, parseInt(form.price) || 0);
  const numericDiscount = Math.min(90, Math.max(0, parseInt(form.discountPercent) || 0));
  const numericCoupon = Math.min(90, Math.max(0, parseInt(form.couponPercent) || 0));
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
    "w-full bg-background ring-1 ring-border rounded-2xl px-4 py-3 text-[14px] font-medium outline-none focus:ring-2 focus:ring-primary/40 transition text-foreground placeholder:text-muted-foreground/50";
  const labelClass = "text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1";

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl backdrop-saturate-150 border-b hairline pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between px-4 py-3.5 max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04]"
            >
              <ChevronLeft className="h-[18px] w-[18px] text-foreground" />
            </Link>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight text-foreground">My Store</h1>
              <p className="text-[11px] text-muted-foreground">Your digital products on Zero Store</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[12.5px] font-semibold tracking-tight text-background tap hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New product
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 pt-5 space-y-5">
        {/* Seller summary — premium dark card */}
        <section className="relative overflow-hidden rounded-[28px] bg-[#141117] p-6 text-white shadow-lift ring-1 ring-white/[0.06]">
          <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#cc208f]/25 blur-[80px]" />
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/50">Seller dashboard</p>
              <IconStore className="h-5 w-5 text-white/40" />
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.08]">
              <div className="pr-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/60">Products</p>
                <p className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums leading-none">{products.length}</p>
              </div>
              <div className="px-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/60">Catalog value</p>
                <p className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums leading-none">
                  <span className="text-[15px] font-normal text-white/50 mr-0.5">₦</span>
                  {coinValue.toLocaleString()}
                </p>
              </div>
              <div className="pl-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/60">Coupons</p>
                <p className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums leading-none">{activeCoupons}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Product list */}
        <section>
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Your products</h2>
            <Link to="/app/store" className="flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
              View store <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-foreground/[0.05] shimmer" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl ring-1 ring-border bg-card p-12 text-center flex flex-col items-center">
              <div className="h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mb-5">
                <Gift className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
              </div>
              <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">Nothing for sale yet</h3>
              <p className="text-[13.5px] text-muted-foreground max-w-[280px] mb-7 leading-relaxed">
                Upload a template, e-book, design kit, or any digital file — set your price and start earning.
              </p>
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 rounded-full bg-foreground px-6 py-2.5 text-[13px] font-semibold tracking-tight text-background tap hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Upload your first product
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {products.map((item: any) => {
                const sale = effectivePrice(item.price, item.discount_percent || 0);
                return (
                  <div key={item.id} className="rounded-2xl ring-1 ring-border bg-card shadow-soft overflow-hidden">
                    <div className="flex gap-4 p-4">
                      <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-primary/8 ring-1 ring-primary/15 grid place-items-center text-primary relative">
                        {item.cover_url ? (
                          <img src={item.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <Gift className="h-6 w-6" strokeWidth={1.75} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-[15px] font-semibold tracking-tight text-foreground truncate">{item.name}</h3>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
                              {item.category || "Product"}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEdit(item)}
                              title="Edit product"
                              className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-border text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] tap"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleting(item)}
                              title="Delete product"
                              className="grid h-8 w-8 place-items-center rounded-full ring-1 ring-border text-muted-foreground hover:text-destructive hover:bg-destructive/5 tap"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-[14px] font-semibold tracking-tight text-foreground tabular-nums">
                            {formatPrice(sale, item.price_type)}
                          </span>
                          {(item.discount_percent || 0) > 0 && (
                            <>
                              <span className="text-[11.5px] text-muted-foreground line-through tabular-nums">
                                {formatPrice(item.price, item.price_type)}
                              </span>
                              <span className="flex items-center gap-1 rounded-full bg-success/10 ring-1 ring-success/20 px-2 py-0.5 text-[10px] font-semibold text-success">
                                <Tag className="h-2.5 w-2.5" /> {item.discount_percent}% off
                              </span>
                            </>
                          )}
                          {item.coupon_code && (
                            <span className="flex items-center gap-1 rounded-full bg-primary/8 ring-1 ring-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              <TicketPercent className="h-2.5 w-2.5" /> {item.coupon_code} · −{item.coupon_discount_percent}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ── Create / Edit drawer ── */}
      <Drawer open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DrawerContent className="border-none bg-background p-0 focus:ring-0 max-w-lg mx-auto max-h-[92dvh] flex flex-col">
          <div className="shrink-0 px-6 pt-5 pb-4 border-b hairline">
            <DrawerTitle className="text-[20px] font-semibold tracking-tight text-foreground">
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
                className="relative w-full h-36 rounded-2xl border border-dashed border-border-strong overflow-hidden grid place-items-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors group"
              >
                {coverPreview ? (
                  <>
                    <img src={coverPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
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
                className="w-full flex items-center gap-3 rounded-2xl ring-1 ring-border bg-card p-4 text-left hover:ring-primary/30 transition-all tap"
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className={labelClass}>Category</label>
                <div className="relative">
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className={`${inputClass} appearance-none pr-10 cursor-pointer`}
                  >
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Charge in</label>
                <div className="flex rounded-2xl ring-1 ring-border p-1 bg-background">
                  {(["Coins", "XP"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm({ ...form, priceType: t })}
                      className={`flex-1 rounded-xl py-2 text-[12.5px] font-semibold tracking-tight transition-colors ${form.priceType === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {t === "Coins" ? "₦ Cash" : "XP"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Price + discount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className={labelClass}>Price {form.priceType === "Coins" ? "(₦)" : "(XP)"}</label>
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
                    value={form.discountPercent}
                    onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                    className={`${inputClass} pr-8 tabular-nums`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            {/* Coupon */}
            <div className="rounded-2xl ring-1 ring-border bg-card p-4 space-y-4">
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
              <div className="rounded-2xl bg-primary/[0.04] ring-1 ring-primary/15 px-4 py-3.5 space-y-1.5">
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
          <div className="bg-background ring-1 ring-border rounded-3xl p-6 max-w-sm w-full shadow-lift animate-in zoom-in-95 duration-200">
            <h3 className="text-[19px] font-semibold mb-2 tracking-tight">Remove this product?</h3>
            <p className="text-[13.5px] text-muted-foreground mb-7 leading-relaxed">
              "{deleting.name}" will be taken off Zero Store. Buyers who already purchased keep their download.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleDelete}
                className="w-full py-3.5 bg-destructive text-destructive-foreground font-semibold tracking-tight rounded-full tap hover:opacity-90"
              >
                Yes, remove it
              </button>
              <button
                onClick={() => setDeleting(null)}
                className="w-full py-3.5 ring-1 ring-border text-foreground font-semibold tracking-tight rounded-full tap hover:bg-foreground/[0.03]"
              >
                Keep selling
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
