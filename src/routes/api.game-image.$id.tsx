import { createFileRoute } from "@tanstack/react-router";
import { previewResponse } from "@/lib/og/respond";

/**
 * Kept at its old address so links already shared keep their picture. The
 * card itself now comes from the shared preview design system (lib/og).
 */
export const Route = createFileRoute("/api/game-image/$id")({
  server: {
    handlers: {
      GET: ({ params, request }: any) => previewResponse("game", String(params.id || ""), new URL(request.url)),
    },
  },
});
