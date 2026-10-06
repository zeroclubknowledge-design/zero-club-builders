import { createFileRoute } from "@tanstack/react-router";
import { vapiHandlers } from "@/features/zeroAI/vapi.server";

export const Route = createFileRoute("/api/zero-ai/vapi/session")({
  server: { handlers: { POST: ({ request }) => vapiHandlers().session(request) } },
});
