import { drawCard, fonts, visualFor, type PreviewSpec } from "./card";
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
  const fontsReady = fonts();
  let spec: PreviewSpec;
  try {
    spec = await buildPreviewSpec(kind, id, url);
  } catch {
    spec = DEFAULT_SPEC;
  }
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
  return new Response(png, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "Cache-Control": `public, max-age=300, s-maxage=${fresh}, stale-while-revalidate=604800`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
