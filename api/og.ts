import { previewResponse } from "../src/lib/og/core/respond";

/**
 * Link-preview images, as a standalone EDGE function.
 *
 * Kept out of the main app server on purpose: that function has to boot the
 * whole app before it can answer, and the 6–9 seconds it took on a cold start
 * was longer than WhatsApp waits for a preview image, so shared links arrived
 * with no picture. An edge function starts in milliseconds.
 *
 * vercel.json rewrites every preview URL here:
 *   /api/og/<kind>/<id>  /api/og-default  /api/club-image/<id>
 *   /api/game-image/<id> /api/gift-image/<code>
 */
export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let kind = url.searchParams.get("kind") || "";
  let id = url.searchParams.get("id") || "";
  if (!kind) {
    const match = url.pathname.match(/\/api\/og\/([^/]+)\/([^/]+)/);
    if (match) [, kind, id] = match;
  }
  return previewResponse(kind || "default", id || "brand", url);
}
