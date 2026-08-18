import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

/**
 * Clean SVG gift card endpoint.
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

function cardSvg(data: any): string {
  const t = TEMPLATES[data?.template_id] || TEMPLATES.signature;
  const walletBacked = data?.service === "support" || data?.service === "custom";
  const label = SERVICE_LABELS[data?.service] || String(data?.service || "Gift");
  const purpose = walletBacked ? label : `For ${label}`;
  const note = data?.custom_purpose || data?.message || "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${t.shell}"/>
  <circle cx="1120" cy="-40" r="230" fill="${t.ink}" opacity="0.05"/>
  <circle cx="90" cy="690" r="200" fill="${t.accent}" opacity="0.10"/>

  <text x="80" y="118" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="32" font-weight="700" fill="${t.ink}">Zero Card</text>
  <rect x="1010" y="74" width="110" height="52" rx="26" fill="${t.accent}"/>
  <text x="1065" y="108" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="800" fill="${t.accentInk}" letter-spacing="1">GIFT</text>

  <text x="80" y="310" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="3" fill="${t.muted}">${escapeXml(purpose.toUpperCase())}</text>
  <text x="80" y="440" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="120" font-weight="800" fill="${t.ink}" letter-spacing="-1">${escapeXml(formatNaira(data?.amount))}</text>

  ${note ? `<text x="80" y="505" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="28" font-weight="500" fill="${t.muted}">${escapeXml(String(note).slice(0, 60))}</text>` : ""}

  <line x1="80" y1="535" x2="1120" y2="535" stroke="${t.muted}" stroke-opacity="0.25" stroke-width="1.5"/>
  <text x="80" y="578" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="600" letter-spacing="2" fill="${t.muted}">${walletBacked ? "ZERO CLUB WALLET CREDIT" : "RESTRICTED GIFT CREDIT"}</text>
  <text x="1120" y="578" text-anchor="end" font-family="Consolas, Monaco, monospace" font-size="24" font-weight="600" fill="${t.muted}">${escapeXml(data?.code || "ZC-GIFT")}</text>
</svg>`;
}

async function renderSvg(code: string): Promise<Response> {
  let data: any = null;
  try {
    const result = await supabase.rpc("get_gift_card_public", { gift_code: code });
    if (result.data?.found) data = result.data;
  } catch {
    /* fall through to a generic card rather than failing the preview */
  }

  const cardData = data || { code, amount: 0, template_id: "signature", service: "support" };
  const svg = cardSvg(cardData);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export const Route = createFileRoute("/api/gift-card/$code")({
  server: {
    handlers: {
      GET: ({ params }: any) => renderSvg(String(params.code || "").replace(/\.(png|svg)$/i, "")),
      HEAD: ({ params }: any) => renderSvg(String(params.code || "").replace(/\.(png|svg)$/i, "")),
    },
  },
});
