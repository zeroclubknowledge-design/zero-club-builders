import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";

/**
 * The preview card for every Zero Club link that does not draw its own.
 *
 * Until now that was a PNG exported from lovable.app, sitting on a third-party
 * R2 bucket — a build artefact from before the product had a brand, still
 * being served to everyone who pasted a link into WhatsApp. Clubs, products,
 * notes and gift cards all render their own card; the front door had none.
 *
 * Drawn rather than stored so it stays in step with the wording on the site,
 * and so there is no orphaned asset to lose track of.
 */

const SHELL = "#171218";
const PINK = "#cc208f";

function renderDefaultCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: SHELL,
          padding: "76px 84px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* The same off-canvas ring the club card uses, so a Zero Club preview
            is recognisable before the words are read. */}
        <div
          style={{
            position: "absolute", top: "-190px", right: "-150px",
            width: "480px", height: "480px", borderRadius: "9999px",
            border: "80px solid #ffffff", opacity: 0.05, display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "56px", height: "56px", borderRadius: "16px",
              background: PINK, color: "#ffffff", fontSize: "30px", fontWeight: 700,
            }}
          >
            Z
          </div>
          <div style={{ display: "flex", fontSize: "26px", fontWeight: 600, letterSpacing: "5px", color: "rgba(255,255,255,0.55)" }}>
            ZERO CLUB
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "82px", fontWeight: 700, color: "#ffffff", lineHeight: 1.05 }}>
            Build skills.
          </div>
          <div style={{ display: "flex", fontSize: "82px", fontWeight: 700, color: "#ffffff", lineHeight: 1.05 }}>
            Build proof.
          </div>
          <div style={{ display: "flex", fontSize: "82px", fontWeight: 700, color: PINK, lineHeight: 1.05 }}>
            Build opportunities.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: "28px", color: "rgba(255,255,255,0.6)", maxWidth: "760px" }}>
            Live bootcamps, work shipped in public, and communities that take it seriously.
          </div>
          <div style={{ display: "flex", fontSize: "24px", color: "rgba(255,255,255,0.4)", letterSpacing: "2px" }}>
            zeroclubs.xyz
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // The card only changes when this file does, so it can be cached hard.
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    },
  );
}

export const Route = createFileRoute("/api/og-default")({
  server: {
    handlers: {
      GET: () => renderDefaultCard(),
    },
  },
});
