import { createFileRoute } from "@tanstack/react-router";
import { zeroAIHandlers } from "@/features/zeroAI/server";

export const Route = createFileRoute("/api/zero-ai/chat")({
  server: { handlers: { POST: ({ request }) => zeroAIHandlers().chat(request) } },
});
