import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";
import { ZERO_CLUB_MARK } from "./-ogMark";

/**
 * The preview card for every Zero Club link that does not draw its own.
 *
 * Drawn rather than stored, so it stays in step with the wording on the site
 * and there is no orphaned asset to lose track of.
 *
 * The composition is the landing page's dark hero: the same near-black base,
 * the same brand bloom falling from above, the same deeper magenta in the
 * bottom corner. Someone who has seen the site should recognise the card
 * before they read it.
 */

/* Pulled from the landing page's own values rather than approximated.
   #150710 -> #0a0409 -> #000000 is the noir veil's base; the two blooms are
   the brand pink from above and the deeper magenta from the corner. */
const BASE_TOP = "#150710";
const BASE_MID = "#0a0409";
const BASE_END = "#000000";
const PINK = "#cc208f";
const PINK_BRIGHT = "#ff3db0";

function renderDefaultCard() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(180deg, ${BASE_TOP} 0%, ${BASE_MID} 48%, ${BASE_END} 100%)`,
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/*
          The blooms are separate absolutely-positioned layers rather than a
          multi-stop background, because Satori — what draws this — renders one
          background per element. Layering them the way CSS would is the one
          thing it will not do.
        */}
        <div
          style={{
            position: "absolute",
            top: "-320px",
            left: "50%",
            marginLeft: "-700px",
            width: "1400px",
            height: "900px",
            display: "flex",
            background: `radial-gradient(circle at 50% 50%, ${PINK}66 0%, ${PINK}1f 34%, transparent 66%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-260px",
            right: "-200px",
            width: "820px",
            height: "620px",
            display: "flex",
            background: "radial-gradient(circle at 50% 50%, #a31a7659 0%, transparent 62%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* The real mark, not a letter in a box. */}
          <img src={ZERO_CLUB_MARK} width={148} height={148} alt="" />

          <div
            style={{
              display: "flex",
              marginTop: "34px",
              fontSize: "76px",
              fontWeight: 700,
              letterSpacing: "-2px",
              color: "#ffffff",
            }}
          >
            Zero
            <span style={{ color: PINK_BRIGHT, marginLeft: "20px" }}>Club</span>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "20px",
              fontSize: "30px",
              color: "rgba(255,255,255,0.62)",
              textAlign: "center",
            }}
          >
            Build skills. Build proof. Build opportunities.
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "40px",
              fontSize: "24px",
              letterSpacing: "3px",
              color: "rgba(255,255,255,0.38)",
            }}
          >
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
