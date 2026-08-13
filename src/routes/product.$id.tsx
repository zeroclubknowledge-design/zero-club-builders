import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Gift, ShieldCheck, Tag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatWalletAmount, useWalletCurrency } from "@/hooks/useWalletCurrency";
import { formatPercent } from "@/lib/utils";
import { PRODUCT_PREVIEW_VERSION, socialProductImageUrl } from "@/lib/share";

/**
 * Public landing page for a shared Zero Store product link.
 *
 * Product links used to point at /app/store?product=<id>. That is fine for
 * someone already signed in, but a link preview is built by a crawler that is
 * signed out and does not run JavaScript, so every product previewed as the
 * generic "Zero Club — A private club for builders" card with the site logo.
 *
 * This page exists so the product's own name, description and cover image are
 * in the HTML the moment it is served. Anyone who clicks through is sent
 * straight on into the store.
 *
 * Deliberately never selects file_url. The preview must not be a route to the
 * paid file.
 */
export const Route = createFileRoute("/product/$id")({
  component: ProductLinkPage,

  // Never allowed to throw: a failed lookup should still render a page.
  loader: async ({ params }) => {
    try {
      const { data, error } = await supabase
        .from("store_items")
        .select("id, name, description, category, cover_url, price, price_type, discount_percent")
        .eq("id", params.id)
        .maybeSingle();
      if (error || !data) return null;
      return data as {
        id: string;
        name: string;
        description: string | null;
        category: string | null;
        cover_url: string | null;
        price: number;
        price_type: string;
        discount_percent: number | null;
      };
    } catch {
      return null;
    }
  },

  head: ({ loaderData }) => {
    if (!loaderData?.name) return {};

    const discount = Number(loaderData.discount_percent) || 0;
    const sale =
      discount > 0
        ? Math.round(Number(loaderData.price) * (100 - discount) / 100)
        : Number(loaderData.price);

    // The crawler has no localStorage, so there is no way to know the reader's
    // currency here. NGN is the default the app itself falls back to.
    const price =
      loaderData.price_type === "Coins"
        ? formatWalletAmount(sale, "NGN")
        : `${sale.toLocaleString()} ZP`;

    const title = `${loaderData.name} — Zero Store`;
    const description =
      loaderData.description?.slice(0, 200).trim() ||
      `${loaderData.name} on Zero Store for ${price}.`;

    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "product" },
      // Hardcoded rather than derived from the request: the head runs where
      // there is no window, and this is the only origin these links are shared
      // from. It is what WhatsApp shows as the source under the card.
      { property: "og:url", content: `https://www.zeroclubs.xyz/product/${loaderData.id}?preview=${PRODUCT_PREVIEW_VERSION}` },
      { property: "og:site_name", content: "Zero Club" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];

    // Only override the site-wide preview image when this product has a cover
    // of its own, otherwise the generic logo is still better than nothing.
    if (loaderData.cover_url) {
      const previewImage = socialProductImageUrl(loaderData.cover_url);
      meta.push(
        { property: "og:image", content: previewImage },
        { property: "og:image:secure_url", content: previewImage },
        { property: "og:image:type", content: "image/jpeg" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: `${loaderData.name} product cover` },
        { name: "twitter:image", content: previewImage },
        { name: "twitter:image:alt", content: `${loaderData.name} product cover` },
        { name: "twitter:card", content: "summary_large_image" },
      );
    }

    return { meta };
  },
});

function ProductLinkPage() {
  const product = Route.useLoaderData();
  const { id } = Route.useParams();
  const { format } = useWalletCurrency();
  const target = `/app/store?product=${id}`;

  // Anyone already signed in should not have to look at this page at all.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) window.location.replace(target);
    });
    return () => { cancelled = true; };
  }, [target]);

  const discount = Number(product?.discount_percent) || 0;
  const sale =
    product && discount > 0
      ? Math.round(Number(product.price) * (100 - discount) / 100)
      : Number(product?.price || 0);

  const showPrice = (amount: number) =>
    product?.price_type === "Coins" ? format(amount) : `${amount.toLocaleString()} ZP`;

  return (
    <div className="min-h-screen bg-[#f8f7f5] text-foreground dark:bg-background">
      <header className="border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] max-w-[720px] items-center px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
            <span className="font-display text-[16px] font-semibold tracking-tight">
              Zero <span className="text-primary">Club</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[520px] px-5 py-14 text-center">
        <div className="mx-auto mb-7 grid h-28 w-28 place-items-center overflow-hidden rounded-2xl border border-border bg-primary/10 text-primary">
          {product?.cover_url ? (
            <img src={product.cover_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Gift className="h-9 w-9" strokeWidth={1.5} />
          )}
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          {product?.category || "On Zero Store"}
        </p>
        <h1 className="mt-3 font-display text-[28px] font-semibold leading-tight tracking-tight">
          {product?.name || "This product"}
        </h1>

        {product?.description && (
          <p className="mt-3 text-[14px] leading-7 text-muted-foreground">{product.description}</p>
        )}

        {product && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="text-[22px] font-semibold tracking-tight tabular-nums">
              {showPrice(sale)}
            </span>
            {discount > 0 && (
              <>
                <span className="text-[14px] text-muted-foreground/70 line-through tabular-nums">
                  {showPrice(Number(product.price))}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success ring-1 ring-success/20">
                  <Tag className="h-2.5 w-2.5" /> {formatPercent(discount)}% off
                </span>
              </>
            )}
          </div>
        )}

        <a
          href={target}
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-8 text-[14.5px] font-semibold text-background transition hover:opacity-90"
        >
          Open in Zero Club <ArrowRight className="h-4 w-4" />
        </a>

        {product ? (
          <p className="mt-6 flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Delivered instantly after payment
          </p>
        ) : (
          <p className="mt-6 text-[12.5px] text-muted-foreground">
            We could not load this product. It may have been removed from Zero Store.
          </p>
        )}
      </main>
    </div>
  );
}
