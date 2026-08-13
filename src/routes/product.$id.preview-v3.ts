import { createFileRoute } from "@tanstack/react-router";
import { socialProductImageUrl } from "@/lib/share";
import { supabase } from "@/lib/supabase";

async function productImageResponse(productId: string, headOnly = false) {
  const { data: product, error } = await supabase
    .from("store_items")
    .select("cover_url")
    .eq("id", productId)
    .maybeSingle();

  if (error || !product?.cover_url) {
    return new Response(headOnly ? null : "Product image not found", { status: 404 });
  }

  try {
    // The server performs the query-string request on the crawler's behalf.
    // To WhatsApp, Facebook, X, and other preview clients this is a simple
    // same-origin image path that is not blocked by robots.txt.
    const upstream = await fetch(socialProductImageUrl(product.cover_url), {
      headers: { accept: "image/jpeg,image/*" },
    });

    if (!upstream.ok || !upstream.body) {
      return Response.redirect(product.cover_url, 302);
    }

    const headers = new Headers({
      "content-type": upstream.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);

    return new Response(headOnly ? null : upstream.body, { status: 200, headers });
  } catch {
    return Response.redirect(product.cover_url, 302);
  }
}

export const Route = createFileRoute("/product/$id/preview-v3")({
  server: {
    handlers: {
      GET: async ({ params }) => productImageResponse(params.id),
      HEAD: async ({ params }) => productImageResponse(params.id, true),
    },
  },
});
