import { createFileRoute } from "@tanstack/react-router";
import { previewResponse } from "@/lib/og/core/respond";

/**
 * Every link preview in Zero Club, drawn by one design system.
 *
 *   /api/og/<kind>/<id>     kind: default | club | live | game | post |
 *                                 profile | note | product | form | fund | gift
 *
 * lib/og/core/specs gathers each kind's facts; lib/og/core/card draws the card.
 * In production vercel.json sends these URLs to the edge function api/og.ts.
 * A lookup that fails still returns a good card — never a blank preview.
 */
export const Route = createFileRoute("/api/og/$kind/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }: any) => {
        return previewResponse(String(params.kind || "default"), String(params.id || ""), new URL(request.url));
      },
    },
  },
});
