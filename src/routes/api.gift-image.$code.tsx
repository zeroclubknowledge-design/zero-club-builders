import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";
import { supabase } from "@/lib/supabase";

/**
 * The real Zero Card card, rendered to PNG for link previews.
 *
 * Everything before this was a compromise. Static per-template PNGs could not
 * carry the amount or the code, so a shared gift previewed as generic artwork.
 * An SVG endpoint carried the data but depended on a third-party rasteriser to
 * turn it into something WhatsApp would accept, which is a link in the chain
 * that can fail silently and leave the preview text-only.
 *
 * This draws the card server-side and returns a PNG directly, so the image is
 * the card — right template, right amount, right code — with nothing between
 * the crawler and us.
 */

const TEMPLATES: Record<
  string,
  { shell: string; ink: string; muted: string; accent: string; accentInk: string }
> = {
  signature: { shell: "#171218", ink: "#ffffff", muted: "rgba(255,255,255,0.55)", accent: "#cc208f", accentInk: "#ffffff" },
  studio:    { shell: "#cc208f", ink: "#ffffff", muted: "rgba(255,255,255,0.70)", accent: "#ffffff", accentInk: "#cc208f" },
  paper:     { shell: "#f4f0e8", ink: "#171218", muted: "rgba(23,18,24,0.50)",   accent: "#171218", accentInk: "#ffffff" },
  signal:    { shell: "#184f3c", ink: "#ffffff", muted: "rgba(255,255,255,0.60)", accent: "#d6ff62", accentInk: "#173328" },
  cobalt:    { shell: "#2446a8", ink: "#ffffff", muted: "rgba(255,255,255,0.65)", accent: "#ffffff", accentInk: "#2446a8" },
  sun:       { shell: "#f2c84b", ink: "#201b12", muted: "rgba(32,27,18,0.55)",   accent: "#201b12", accentInk: "#ffffff" },
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

async function renderCard(rawCode: string) {
  const code = rawCode.replace(/\.(png|svg|jpg)$/i, "");

  let card: any = null;
  try {
    const { data } = await supabase.rpc("get_gift_card_public", { gift_code: code });
    if (data?.found) card = data;
  } catch {
    /* draw a plain card rather than fail the preview entirely */
  }

  const t = TEMPLATES[card?.template_id] || TEMPLATES.signature;
  const walletBacked = card?.service === "support" || card?.service === "custom";
  const label = SERVICE_LABELS[card?.service] || "Gift";
  const purpose = walletBacked ? label : `For ${label}`;
  const note = card?.custom_purpose || card?.message || "";
  const amount = "₦" + Math.round(Number(card?.amount) || 0).toLocaleString("en-NG");

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: t.shell,
          padding: "72px 80px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* The embossed rings the card carries in the app. */}
        <div
          style={{
            position: "absolute", top: "-160px", right: "-120px",
            width: "420px", height: "420px", borderRadius: "9999px",
            border: `70px solid ${t.ink}`, opacity: 0.05, display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: "30px", fontWeight: 600, color: t.ink }}>
            Zero Card
          </div>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: t.accent, color: t.accentInk, borderRadius: "9999px",
              padding: "12px 26px", fontSize: "22px", fontWeight: 700, letterSpacing: "1px",
            }}
          >
            GIFT
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "26px", fontWeight: 600, letterSpacing: "4px", color: t.muted }}>
            {purpose.toUpperCase()}
          </div>
          <div style={{ display: "flex", fontSize: "136px", fontWeight: 700, color: t.ink, marginTop: "14px", lineHeight: 1 }}>
            {amount}
          </div>
          {note ? (
            <div style={{ display: "flex", fontSize: "28px", color: t.muted, marginTop: "18px" }}>
              {String(note).slice(0, 64)}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "23px", color: t.muted, letterSpacing: "2px" }}>
          <div style={{ display: "flex" }}>
            {walletBacked ? "ZERO CLUB WALLET CREDIT" : "RESTRICTED GIFT CREDIT"}
          </div>
          <div style={{ display: "flex" }}>{card?.code || code}</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // A gift's face never changes once created, and crawlers refetch often.
        "Cache-Control": "public, max-age=3600, s-maxage=31536000, immutable",
      },
    },
  );
}

export const Route = createFileRoute("/api/gift-image/$code")({
  server: {
    handlers: {
      GET: ({ params }: any) => renderCard(String(params.code || "")),
    },
  },
});
