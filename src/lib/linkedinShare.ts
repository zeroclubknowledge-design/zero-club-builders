/**
 * Sharing a Zero Club post to LinkedIn, blog-style.
 *
 * LinkedIn gets the first half of the post as the person's own words, then
 * "Continue reading here" and the link back. LinkedIn does not allow a
 * clickable word in a post, so the link sits on its own line right after
 * "Continue reading here 👉", and LinkedIn draws the post's preview card
 * under it. Readers tap through to Zero Club for the rest.
 *
 * Sharing earns no ZP. (It used to; that was removed so rewards can't be
 * farmed by sharing, since LinkedIn never confirms that a post went out.)
 */

export type LinkedInPayload = {
  /** A post or shipped project, or a Zero Store product. */
  kind?: "post" | "product";
  /** The post id, or the store item id for a product. */
  postId: string;
  /** The full text, as stored. For a product: its name and description. */
  body: string;
  /** The sharer made this post or product. */
  isOwn: boolean;
  /** A shipped project on Zero Proofs. */
  isShip: boolean;
  /** A quote post. */
  isQuote?: boolean;
};

const MEDIA_MARKER = "$$MEDIA$$";
/** LinkedIn's limit is 3,000 characters. Leave room for the link. */
const MAX_EXCERPT = 1400;

/** Readable text with paragraphs kept, from stored post content. */
export function linkedInPlainText(content: string): string {
  let text = content || "";
  const marker = text.indexOf(MEDIA_MARKER);
  if (marker >= 0) text = text.slice(0, marker);
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** About the first half of the post, ending on a sentence where one is close. */
export function linkedInExcerpt(content: string): { excerpt: string; truncated: boolean } {
  const text = linkedInPlainText(content);
  if (!text) return { excerpt: "", truncated: false };
  const words = text.split(/(\s+)/);
  const wordCount = words.filter((w) => w.trim()).length;
  // Very short posts are shared whole: half of ten words reads like a typo.
  if (wordCount < 24 && text.length <= MAX_EXCERPT) return { excerpt: text, truncated: false };

  let target = Math.min(Math.ceil(text.length / 2), MAX_EXCERPT);
  // Prefer ending at a sentence or paragraph close to the halfway point.
  const window = text.slice(
    Math.floor(target * 0.75),
    Math.min(text.length, Math.ceil(target * 1.2)),
  );
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf("\n"),
  );
  if (sentenceEnd > 0) target = Math.floor(target * 0.75) + sentenceEnd + 1;
  else {
    const space = text.lastIndexOf(" ", target);
    if (space > target * 0.6) target = space;
  }
  const excerpt = text
    .slice(0, Math.min(target, MAX_EXCERPT))
    .trim()
    .replace(/[,;:\-–—]+$/, "");
  return { excerpt, truncated: excerpt.length < text.length };
}

export function linkedInShareText(payload: LinkedInPayload, url: string): string {
  const { excerpt, truncated } = linkedInExcerpt(payload.body);
  const head = excerpt
    ? `${excerpt}${truncated ? "…" : ""}`
    : payload.kind === "product"
      ? "Found this on Zero Store."
      : payload.isShip
        ? "A new project shipped on Zero Club."
        : "New on Zero Club.";
  return `${head}\n\nContinue reading here 👉 ${url}`;
}

/** Marks the link so Zero Club can tell visits that came from LinkedIn. */
export function linkedInUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "linkedin");
    u.searchParams.set("utm_medium", "social");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Hands the post to LinkedIn with the text already written.
 *
 * On phones it opens the phone's own share menu with the text in it; picking
 * LinkedIn opens the LinkedIn app's post screen, filled in. A web page can't
 * open the LinkedIn app's composer directly: Chrome blocks that kind of link
 * and falls back to linkedin.com, which is why the website kept opening.
 *
 * Desktops, and phones without a share menu, get LinkedIn's share box on the
 * web. The text is copied too, in case LinkedIn leaves the box empty.
 *
 * Resolves true when the share went ahead, false when it was cancelled.
 */
export async function openLinkedInComposer(text: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard is a fallback only */
  }
  const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isPhone && typeof navigator.share === "function") {
    try {
      // Text only: with a separate url, some apps drop the text and keep the link.
      await navigator.share({ text });
      return true;
    } catch (error) {
      // Dismissed: nothing was shared.
      if ((error as DOMException)?.name === "AbortError") return false;
      // Anything else (e.g. share not allowed here): fall through to the web.
    }
  }
  window.open(
    `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer",
  );
  return true;
}
