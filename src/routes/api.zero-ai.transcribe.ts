import { createFileRoute } from "@tanstack/react-router";
import { zeroAIHandlers } from "@/features/zeroAI/server";

export const Route = createFileRoute("/api/zero-ai/transcribe")({
  server: { handlers: { POST: ({ request }) => zeroAIHandlers().transcribe(request) } },
});
