import { createFileRoute } from "@tanstack/react-router";
import { callHandlers } from "@/features/zeroAI/calls.server";
export const Route = createFileRoute("/api/zero-ai/calls/dispatch")({
  server: {
    handlers: {
      GET: ({ request }) => callHandlers().dispatch(request),
      POST: ({ request }) => callHandlers().dispatch(request),
    },
  },
});
