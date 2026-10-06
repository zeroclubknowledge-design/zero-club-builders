import { createFileRoute } from "@tanstack/react-router";
import { callHandlers } from "@/features/zeroAI/calls.server";
export const Route = createFileRoute("/api/zero-ai/calls")({
  server: { handlers: { POST: ({ request }) => callHandlers().schedule(request) } },
});
