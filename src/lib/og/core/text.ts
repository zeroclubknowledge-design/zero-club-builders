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
    .replace(/\s+/g, " ")
    .trim();
}

export const naira = (n: unknown) => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;
export const plural = (n: number, word: string) => `${(Number(n) || 0).toLocaleString("en-NG")} ${word}${n === 1 ? "" : "s"}`;
export const initial = (s?: string | null) => (s || "Z").trim().charAt(0).toUpperCase() || "Z";
export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
