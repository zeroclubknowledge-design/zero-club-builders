/**
 * Renders a description that may contain formatting from the rich text editor.
 *
 * Two safeguards matter here:
 *   1. Descriptions written before the editor existed are plain text, so line
 *      breaks are preserved rather than collapsed.
 *   2. The HTML is sanitised before display. Even though only the bootcamp
 *      owner can write it, it is shown publicly on Zero Form pages, so scripts
 *      and event handlers are stripped rather than trusted.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li", "h2", "h3", "blockquote", "a", "code",
]);

function sanitize(html: string) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    // On the server, drop anything that looks like a tag we do not allow.
    return html.replace(/<\s*(script|iframe|object|embed|style)[\s\S]*?<\/\s*\1\s*>/gi, "");
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  root.querySelectorAll("*").forEach((element) => {
    const tag = element.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      // Keep the words, drop the tag.
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      const isSafeLink = tag === "a" && name === "href"
        && (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("mailto:"));
      if (!isSafeLink) element.removeAttribute(attribute.name);
    });

    if (tag === "a") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });

  return root.innerHTML;
}

const looksLikeHtml = (text: string) => /<(p|ul|ol|li|h2|h3|strong|em|br|blockquote)\b/i.test(text);

export function RichText({ content, className = "" }: { content?: string | null; className?: string }) {
  const text = (content || "").trim();
  if (!text) return null;

  // Plain text: keep the author's line breaks and paragraphs.
  if (!looksLikeHtml(text)) {
    return <p className={`whitespace-pre-line ${className}`}>{text}</p>;
  }

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-p:my-2.5 prose-ul:my-2.5 prose-ol:my-2.5 prose-li:my-1 prose-strong:font-semibold prose-a:text-primary ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitize(text) }}
    />
  );
}

/** Formatting stripped out, for previews, cards and social sharing. */
export function richTextToPlain(content?: string | null) {
  const text = (content || "").trim();
  if (!text) return "";
  if (!looksLikeHtml(text)) return text;

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const doc = new DOMParser().parseFromString(text, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}
