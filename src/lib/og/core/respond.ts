import { drawCard, drawPostPhoto, fonts, visualFor, type PreviewSpec } from "./card";
import { buildPreviewSpec, DEFAULT_SPEC } from "./specs";

/**
 * Draw the preview for one shared link. Never fails and never hangs: any
 * problem falls back to a simpler card, and finally the brand card.
 *
 * Cached at the CDN (s-maxage) and served stale while it refreshes, so after
 * the first share every crawler gets the image instantly.
 */
export async function previewResponse(kind: string, rawId: string, url: URL): Promise<Response> {
  const id = decodeURIComponent(rawId || "").replace(/\.(png|jpe?g)$/i, "");
  let spec: PreviewSpec;
  try {
    spec = await buildPreviewSpec(kind, id, url);
  } catch {
    spec = DEFAULT_SPEC;
  }
  // Serve the actual photo in a predictable format for social crawlers.
  if ((kind === "post" || kind === "form") && spec.variant === "photo" && spec.image) {
    try {
      const photo = await drawPostPhoto(spec.image);
      if (photo) return new Response(photo, { headers: {
        "Content-Type": "image/png", "Content-Length": String(photo.byteLength),
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
      } });
    } catch { /* A failed photo gets a short-lived fallback, then retries. */ }
  }
  const fontsReady = fonts();
  const [loaded, visual] = await Promise.all([fontsReady, visualFor(spec)]);

  let png: ArrayBuffer;
  try {
    png = await drawCard(spec, visual, loaded);
  } catch {
    try {
      png = await drawCard({ ...spec, image: null }, null, loaded);
    } catch {
      png = await drawCard(DEFAULT_SPEC, null, loaded);
    }
  }

  const fresh = kind === "game" || kind === "live" ? 600 : 3600;
  // The picture didn't arrive in time: serve this card, but don't let the CDN
  // keep it, so the next request tries again instead of repeating it for days.
  const missedImage = Boolean(spec.image) && (!visual || ((kind === "post" || kind === "form") && spec.variant === "photo"));
  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "Cache-Control": missedImage
        ? "public, max-age=0, s-maxage=30, stale-while-revalidate=30"
        : `public, max-age=300, s-maxage=${fresh}, stale-while-revalidate=604800`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
