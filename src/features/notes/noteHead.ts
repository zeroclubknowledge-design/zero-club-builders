/**
 * Head tags for a note, shared by the two routes that render one.
 *
 * Kept apart from the reader component so the public /notes/$slug route can
 * build its meta tags without importing the route module that owns the reader.
 */
import { zeroNotePreviewImageUrl } from "@/lib/share";

export function buildNoteHead(note: any) {
  if (!note) return {};

  const title = note.title || "Note on Zero Club";
  const firstTextBlock = note.blocks?.find(
    (block: any) => block.type === "text" && block.content && block.content !== "<p></p>",
  );
  let description = "Read this note on Zero Club";
  if (firstTextBlock) {
    const stripped = firstTextBlock.content.replace(/(<([^>]+)>)/gi, "");
    description = stripped.substring(0, 160) + (stripped.length > 160 ? "..." : "");
  }

  const image =
    note.cover_url && note.slug
      ? zeroNotePreviewImageUrl(note.slug)
      : note.cover_url || "https://www.zeroclubs.xyz/api/og-default";
  const canonicalUrl = note.slug ? `https://www.zeroclubs.xyz/notes/${note.slug}` : null;

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: image },
      { property: "og:image:secure_url", content: image },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: `${title} cover` },
      { property: "og:type", content: "article" },
      ...(canonicalUrl ? [{ property: "og:url", content: canonicalUrl }] : []),
      { name: "twitter:card", content: note.cover_url ? "summary_large_image" : "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: canonicalUrl ? [{ rel: "canonical", href: canonicalUrl }] : [],
  };
}
