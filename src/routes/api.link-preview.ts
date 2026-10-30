import { createFileRoute } from "@tanstack/react-router";
import { linkPreviewResponse } from "@/lib/og/core/linkPreview";

export const Route = createFileRoute("/api/link-preview")({
  server: { handlers: {
    GET: ({ request }: any) => linkPreviewResponse(request),
    HEAD: ({ request }: any) => linkPreviewResponse(request),
  } },
});
