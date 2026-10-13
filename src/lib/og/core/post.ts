import { plain } from "./text";

const ORIGIN = "https://www.zeroclubs.xyz";
const NON_IMAGE = /\.(mp4|mov|webm|m4v|og[gv]|mp3|wav|m4a|aac|pdf|docx?|xlsx?|pptx?|zip)$/i;

/** The first attached photo, without a branded frame or text overlay. */
export function postPreviewImage(post: { media_urls?: unknown } | null | undefined): string | null {
  if (!Array.isArray(post?.media_urls)) return null;
  for (const media of post.media_urls) {
    if (typeof media !== "string" || !/^(https?:\/\/|\/)/i.test(media.trim())) continue;
    try {
      const url = new URL(media.trim(), ORIGIN);
      if (!["https:", "http:"].includes(url.protocol) || NON_IMAGE.test(url.pathname)) continue;
      return url.href;
    } catch { /* A malformed attachment must not break the shared page. */ }
  }
  return null;
}

export function postPreviewHead(post: any) {
  if (!post) return {};
  const authorName = post.profiles?.full_name || post.profiles?.username || "Zero Club Builder";
  const title = `${authorName}'s ${post.is_build_post ? "Project" : "Post"} on Zero Club`;
  const text = plain(post.content) || "Check out this post on Zero Club";
  const description = text.substring(0, 160) + (text.length > 160 ? "..." : "");
  const photo = postPreviewImage(post);
  const image = photo || `${ORIGIN}/api/og/post/${encodeURIComponent(post.id)}?v=4`;
  return { meta: [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image },
    ...(image.startsWith("https:") ? [{ property: "og:image:secure_url", content: image }] : []),
    // Only the generated fallback is guaranteed to be a 1200x630 PNG.
    ...(!photo ? [
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/png" },
    ] : []),
    { property: "og:image:alt", content: title },
    { property: "og:type", content: "article" },
    { property: "og:url", content: `${ORIGIN}/app/post/${encodeURIComponent(post.id)}?preview=4` },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: title },
  ] };
}
