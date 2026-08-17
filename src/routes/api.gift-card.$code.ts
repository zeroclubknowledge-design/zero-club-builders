import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

/**
 * The gift card, drawn as an image, for link previews.
 *
 * Messaging apps will not render HTML into a preview and will not accept SVG
 * as an og:image — they want a raster. So this endpoint draws the card as SVG,
 * and the page that references it passes this URL through images.weserv.nl,
 * which fetches the SVG and returns a JPEG at the social-card size. That is
 * the whole trick, and it means a real card image with real numbers without
 * adding a headless browser or an image-rendering dependency.
 *
 * Sized 1200x630, the standard social card canvas.
 */

const TEMPLATES: Record<string, { shell: string; ink: string; muted: string; accent: string; accentInk: string }> = {
  signature: { shell: "#171218", ink: "#ffffff", muted: "#ffffff8c", accent: "#cc208f", accentInk: "#ffffff" },
  studio:    { shell: "#cc208f", ink: "#ffffff", muted: "#ffffffb3", accent: "#ffffff", accentInk: "#cc208f" },
  paper:     { shell: "#f4f0e8", ink: "#171218", muted: "#17121880", accent: "#171218", accentInk: "#ffffff" },
  signal:    { shell: "#184f3c", ink: "#ffffff", muted: "#ffffff99", accent: "#d6ff62", accentInk: "#173328" },
  cobalt:    { shell: "#2446a8", ink: "#ffffff", muted: "#ffffffa6", accent: "#ffffff", accentInk: "#2446a8" },
  sun:       { shell: "#f2c84b", ink: "#201b12", muted: "#201b128c", accent: "#201b12", accentInk: "#ffffff" },
};

const SERVICE_LABELS: Record<string, string> = {
  support: "Support",
  custom: "Custom",
  bootcamps: "Bootcamps",
  membership: "Membership",
  "zero-ai": "Zero AI",
  "tutor-session": "Tutor session",
  "zero-store": "Zero Store",
};

/** Anything placed inside SVG text has to be escaped or one apostrophe breaks the document. */
function escapeXml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatNaira(amount: number): string {
  return "₦" + Math.round(Number(amount) || 0).toLocaleString("en-NG");
}

function card(data: any): string {
  const t = TEMPLATES[data?.template_id] || TEMPLATES.signature;
  const walletBacked = data?.service === "support" || data?.service === "custom";
  const label = SERVICE_LABELS[data?.service] || String(data?.service || "Gift");
  const purpose = walletBacked ? label : `For ${label}`;
  const note = data?.custom_purpose || data?.message || "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Zero Club Gift">
  <rect width="1200" height="630" fill="${t.shell}"/>
  <circle cx="1120" cy="-40" r="230" fill="${t.ink}" opacity="0.05"/>
  <circle cx="90" cy="690" r="200" fill="${t.accent}" opacity="0.10"/>

  <text x="80" y="118" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="30" font-weight="600" fill="${t.ink}">Zero Club Gift</text>
  <rect x="1020" y="76" width="100" height="52" rx="26" fill="${t.accent}"/>
  <text x="1070" y="110" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="${t.accentInk}">GIFT</text>

  <text x="80" y="330" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="26" font-weight="600" letter-spacing="3" fill="${t.muted}">${escapeXml(purpose.toUpperCase())}</text>
  <text x="80" y="452" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="132" font-weight="700" fill="${t.ink}">${escapeXml(formatNaira(data?.amount))}</text>

  ${note ? `<text x="80" y="512" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="28" fill="${t.muted}">${escapeXml(String(note).slice(0, 64))}</text>` : ""}

  <text x="80" y="574" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="24" letter-spacing="2" fill="${t.muted}">${walletBacked ? "ZERO CLUB WALLET CREDIT" : "RESTRICTED GIFT CREDIT"}</text>
  <text x="1120" y="574" text-anchor="end" font-family="Consolas, Menlo, monospace" font-size="24" fill="${t.muted}">${escapeXml(data?.code || "ZC-GIFT")}</text>
</svg>`;
}

async function render(code: string): Promise<Response> {
  let data: any = null;
  try {
    const result = await supabase.rpc("get_gift_card_public", { gift_code: code });
    if (result.data?.found) data = result.data;
  } catch {
    /* fall through to a generic card rather than failing the preview */
  }

  return new Response(card(data || { code, amount: 0, template_id: "signature", service: "support" }), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Cached hard: a gift's face never changes once created, and the
      // rasteriser will fetch this repeatedly.
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

/*
 * No .svg extension in the path.
 *
 * The first version was api.gift-card.$code[.]svg.ts, hoping the escape would
 * give a literal dot. It produced a route whose parameter was effectively
 * named "code.svg", so /api/gift-card/ZC-XXXX.svg never matched and the
 * rasteriser got nothing to convert — the preview kept its text and lost its
 * image. The content type is what identifies an SVG, not the filename.
 */
export const Route = createFileRoute("/api/gift-card/$code")({
  server: {
    handlers: {
      // Tolerates a trailing .svg so any link already shared still resolves.
      GET: ({ params }: any) => render(String(params.code || "").replace(/\.svg$/i, "")),
    },
  },
});
