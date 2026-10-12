/**
 * An ambassador's links, stored as one line per link — "Label: value" — in the
 * existing `links` text column. Older applications saved a free-form list of
 * URLs; those still parse, each becoming an unlabelled "Link".
 */

export const SOCIALS = ["WhatsApp", "LinkedIn", "X", "Instagram", "Facebook"] as const;
export type Social = (typeof SOCIALS)[number];

export const OTHER_KINDS = ["Community", "Portfolio", "Website", "YouTube", "TikTok", "GitHub", "Other"] as const;

export const SOCIAL_PLACEHOLDER: Record<Social, string> = {
  WhatsApp: "wa.me/234… or group invite link",
  LinkedIn: "linkedin.com/in/you",
  X: "x.com/you",
  Instagram: "instagram.com/you",
  Facebook: "facebook.com/you",
};

export interface LinkEntry { label: string; value: string }

const LINE = /^([A-Za-z][A-Za-z ]{0,23}):\s*(.+)$/;

export function parseLinks(raw: string | null | undefined): LinkEntry[] {
  const text = (raw || "").trim();
  if (!text) return [];
  const out: LinkEntry[] = [];
  for (const line of text.split(/\n+/)) {
    const m = line.trim().match(LINE);
    // A URL scheme ("https:") is never a label.
    if (m && !/^https?$/i.test(m[1].trim())) {
      out.push({ label: m[1].trim(), value: m[2].trim() });
    } else {
      for (const piece of line.split(/[\s,]+/)) if (piece.trim()) out.push({ label: "Link", value: piece.trim() });
    }
  }
  return out;
}

export function serializeLinks(entries: LinkEntry[]): string {
  return entries
    .map((e) => ({ label: e.label.trim().replace(/[:\n]/g, "") || "Link", value: e.value.trim().replace(/\n/g, " ") }))
    .filter((e) => e.value)
    .map((e) => `${e.label}: ${e.value}`)
    .join("\n");
}
