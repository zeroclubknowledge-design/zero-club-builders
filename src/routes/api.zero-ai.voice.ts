import { createFileRoute } from "@tanstack/react-router";
import { zeroAIHandlers } from "@/features/zeroAI/server";

export const Route = createFileRoute("/api/zero-ai/voice")({
  server: { handlers: { POST: ({ request }) => zeroAIHandlers().voice(request) } },
});
