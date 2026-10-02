import { createFileRoute } from "@tanstack/react-router";
import { previewResponse } from "@/lib/og/respond";

/**
 * Every link preview in Zero Club, drawn by one design system.
 *
 *   /api/og/<kind>/<id>     kind: default | club | live | game | post |
 *                                 profile | note | product | form | fund | gift
 *
 * lib/og/specs gathers each kind's facts; lib/og/previewCard draws the card.
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
