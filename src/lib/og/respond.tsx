import { renderPreview, type PreviewSpec } from "@/lib/og/previewCard";
import { buildPreviewSpec, DEFAULT_SPEC } from "@/lib/og/specs";

/** Draw the preview for one shared link. Never fails: falls back to the brand card. */
export async function previewResponse(kind: string, rawId: string, url: URL) {
  const id = rawId.replace(/\.(png|jpg|jpeg)$/i, "");
  let spec: PreviewSpec;
  try {
    spec = await buildPreviewSpec(kind, id, url);
  } catch {
    spec = DEFAULT_SPEC;
  }
  return renderPreview(spec, kind === "game" || kind === "live" ? 300 : 900);
}

