import { createFileRoute } from "@tanstack/react-router";
import { wordsHandlers } from "@/features/games/words/extract.server";

export const Route = createFileRoute("/api/zero-words/extract")({
  server: { handlers: { POST: ({ request }) => wordsHandlers().extract(request) } },
});
