/** Small text helpers for previews (no app imports, so the edge function stays light). */

export function plain(value: unknown): string {
  if (!value) return "";
  const text = String(value);
  // Chat cards and media messages are not readable text.
  if (text.startsWith("::ZEROCLUB_") || text.startsWith("$$MEDIA$$")) return "";
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    // Strip markdown formatting for preview cards
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")  // links
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")     // code
    .replace(/\*\*([^*]+)\*\*/g, "$1")        // **bold**
    .replace(/\*([^*]+)\*/g, "$1")            // *italic*
    .replace(/__([^_]+)__/g, "$1")            // __bold__
    .replace(/_([^_]+)_/g, "$1")              // _italic_
    .replace(/~~([^~]+)~~/g, "$1")            // ~~strikethrough~~
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")       // headers #
    .replace(/^\s{0,3}>\s+/gm, "")            // blockquotes >
    .replace(/\*{1,3}/g, "")                  // any remaining asterisks
    .replace(/_/g, "")                        // any remaining underscores
    .replace(/~/g, "")                        // any remaining tildes
    .replace(/\s+/g, " ")
    .trim();
}

export const naira = (n: unknown) => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;
export const plural = (n: number, word: string) => `${(Number(n) || 0).toLocaleString("en-NG")} ${word}${n === 1 ? "" : "s"}`;
export const initial = (s?: string | null) => (s || "Z").trim().charAt(0).toUpperCase() || "Z";
export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
