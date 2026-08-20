import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";
import { supabase } from "@/lib/supabase";

/**
 * A club's link preview, drawn server-side.
 *
 * Pointing og:image straight at the club's logo in storage looks like it
 * should work and mostly does not. The image has to be fetched by a crawler
 * that is not signed in, from a bucket that may not be public; it is usually
 * square when the preview wants 1200×630; and a club that never set a picture
 * has nothing to point at, so the preview falls back to the generic Zero Club
 * card. All three failures look identical from the outside — no picture.
 *
 * So the preview is composed here instead. The club's own picture is used when
 * it can actually be loaded, and when it cannot the card still carries the
 * club's name and initial on the brand gradient. There is always an image.
 */

const SHELL = "#171218";
const PINK = "#cc208f";

/** A picture is only worth embedding if the crawler could have fetched it. */
async function usableImage(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    return type.startsWith("image/") ? url : null;
  } catch {
    return null;
  }
}

async function renderClubCard(rawId: string) {
  const id = rawId.replace(/\.(png|jpg|jpeg)$/i, "");

  let club: any = null;
  try {
    const { data } = await supabase.rpc("get_club_public", { club_id: id });
    if (data?.found) club = data;
  } catch {
    /* fall through to the unnamed card rather than failing the preview */
  }

  const name = club?.name || "A club on Zero Club";
  const description = String(club?.description || "").trim();
  const members = Number(club?.member_count) || 0;
  const picture = await usableImage(club?.logo_url || club?.banner_url);
  const initial = (name[0] || "Z").toUpperCase();

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
          padding: "72px 80px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute", top: "-170px", right: "-130px",
            width: "440px", height: "440px", borderRadius: "9999px",
            border: `72px solid #ffffff`, opacity: 0.05, display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          {picture ? (
            <img
              src={picture}
              width={132}
              height={132}
              style={{ width: "132px", height: "132px", borderRadius: "28px", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "132px", height: "132px", borderRadius: "28px",
                background: PINK, color: "#ffffff", fontSize: "64px", fontWeight: 700,
              }}
            >
              {initial}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "26px", fontWeight: 600, letterSpacing: "4px", color: "rgba(255,255,255,0.5)" }}>
              ZERO CLUB
            </div>
            <div style={{ display: "flex", fontSize: "30px", color: "rgba(255,255,255,0.55)", marginTop: "10px" }}>
              {members.toLocaleString()} {members === 1 ? "member" : "members"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "72px", fontWeight: 700, color: "#ffffff", lineHeight: 1.1 }}>
            {name.slice(0, 46)}
          </div>
          {description ? (
            <div style={{ display: "flex", fontSize: "30px", color: "rgba(255,255,255,0.6)", marginTop: "22px", lineHeight: 1.4 }}>
              {description.slice(0, 120)}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: PINK, color: "#ffffff", borderRadius: "9999px",
              padding: "16px 34px", fontSize: "26px", fontWeight: 700,
            }}
          >
            Join this club
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
        // Short at the edge so a renamed club or a new picture appears within
        // the hour, long at the CDN because crawlers refetch constantly.
        "Cache-Control": "public, max-age=600, s-maxage=3600",
      },
    },
  );
}

export const Route = createFileRoute("/api/club-image/$id")({
  server: {
    handlers: {
      GET: ({ params }: any) => renderClubCard(String(params.id || "")),
    },
  },
});
