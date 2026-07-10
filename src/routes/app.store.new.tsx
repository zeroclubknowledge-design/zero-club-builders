import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Upload, File, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";

export const Route = createFileRoute("/app/store/new")({
  component: NewStoreItem,
});

function NewStoreItem() {
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState<"XP" | "Coins">("Coins");
  const [category, setCategory] = useState("Developer Tools");
  const [badge, setBadge] = useState("");

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [productFile, setProductFile] = useState<File | null>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  const CATEGORIES = ["Merch", "Developer Tools", "Perks", "Education", "Digital Art", "Templates"];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return toast.error("Not authenticated");
    if (!name || !description || !price) return toast.error("Please fill all required fields");
    if (!productFile) return toast.error("Please upload the digital product file");

    setLoading(true);

    try {
      let coverUrl = "";
      let fileUrl = "";

      // Upload Cover
      if (coverFile) {
        const coverExt = coverFile.name.split('.').pop();
        const coverPath = `covers/${profile.id}_${Date.now()}.${coverExt}`;
        const { error: coverErr } = await supabase.storage
          .from("store_products")
          .upload(coverPath, coverFile);
        if (coverErr) throw coverErr;
        const { data: coverData } = supabase.storage.from("store_products").getPublicUrl(coverPath);
        coverUrl = coverData.publicUrl;
      }

      // Upload Product
      const prodExt = productFile.name.split('.').pop();
      const prodPath = `files/${profile.id}_${Date.now()}.${prodExt}`;
      const { error: prodErr } = await supabase.storage
        .from("store_products")
        .upload(prodPath, productFile);
      if (prodErr) throw prodErr;
      const { data: prodData } = supabase.storage.from("store_products").getPublicUrl(prodPath);
      fileUrl = prodData.publicUrl;

      const { error } = await supabase.from("store_items").insert({
        seller_id: profile.id,
        name,
        description,
        price: Number(price),
        price_type: priceType,
        category,
        cover_url: coverUrl,
        file_url: fileUrl,
        badge: badge || null,
      });

      if (error) throw error;

      toast.success("Product listed successfully!");
      navigate({ to: "/app/store" });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b hairline px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-4">
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/app/store"
              className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04] text-foreground shrink-0"
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </Link>
            <h1 className="text-[17px] font-display font-semibold tracking-tight text-foreground">List a Product</h1>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-5 mt-8">
        <form onSubmit={handleCreate} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Product Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Next.js Boilerplate"
                className="w-full bg-card ring-1 ring-border rounded-xl px-4 py-3 text-sm font-semibold tracking-tight outline-none focus:ring-primary/50 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Description *</label>
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your digital product or tool..."
                rows={4}
                className="w-full bg-card ring-1 ring-border rounded-xl px-4 py-3 text-sm font-semibold tracking-tight outline-none focus:ring-primary/50 transition-all resize-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Price *</label>
              <input
                type="number"
                required
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className="w-full bg-card ring-1 ring-border rounded-xl px-4 py-3 text-sm font-semibold tracking-tight outline-none focus:ring-primary/50 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Currency *</label>
              <select
                value={priceType}
                onChange={(e) => setPriceType(e.target.value as "XP" | "Coins")}
                className="w-full bg-card ring-1 ring-border rounded-xl px-4 py-3 text-sm font-semibold tracking-tight outline-none focus:ring-primary/50 transition-all appearance-none"
              >
                <option value="Coins">Coins</option>
                <option value="XP">XP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-card ring-1 ring-border rounded-xl px-4 py-3 text-sm font-semibold tracking-tight outline-none focus:ring-primary/50 transition-all appearance-none"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Badge (Optional)</label>
              <input
                type="text"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                placeholder="e.g. Best Seller"
                className="w-full bg-card ring-1 ring-border rounded-xl px-4 py-3 text-sm font-semibold tracking-tight outline-none focus:ring-primary/50 transition-all"
              />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Cover Image (Optional)</label>
              <input type="file" accept="image/*" className="hidden" ref={coverInputRef} onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="w-full bg-card ring-1 ring-border border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/50 transition-all"
              >
                {coverFile ? (
                  <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">{coverFile.name}</span>
                ) : (
                  <>
                    <ImageIcon className="w-6 h-6" />
                    <span className="text-xs font-semibold">Upload Cover Image</span>
                  </>
                )}
              </button>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Digital File *</label>
              <input type="file" className="hidden" ref={productInputRef} onChange={(e) => setProductFile(e.target.files?.[0] || null)} />
              <button
                type="button"
                onClick={() => productInputRef.current?.click()}
                className="w-full bg-primary/10 ring-1 ring-primary/20 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-primary hover:bg-primary/15 transition-all"
              >
                {productFile ? (
                  <span className="text-sm font-semibold text-primary truncate max-w-[200px]">{productFile.name}</span>
                ) : (
                  <>
                    <File className="w-6 h-6" />
                    <span className="text-xs font-bold">Upload Product (.zip, .pdf, etc)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-foreground text-background font-bold text-sm tracking-wide transition tap flex items-center justify-center gap-2 mt-4"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>
                <Upload className="w-4 h-4" />
                List Product
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
