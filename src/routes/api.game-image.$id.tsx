import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";
import { ZERO_GAMES, isZeroGameKey } from "@/features/games/v2/catalog";
import { previewPrizeLine, tournamentPreview } from "@/features/games/v2/api";

/**
 * A Zero Games tournament's link preview, drawn server-side.
 *
 * Shared tournament links used to preview as the generic Zero Club card. This
 * draws the game itself: its name and colours, the tournament title, the prize
 * and how long is left — what someone needs to decide whether to tap.
 */
async function renderGameCard(rawId: string, code?: string) {
  const id = rawId.replace(/\.(png|jpg|jpeg)$/i, "");
  let preview: Awaited<ReturnType<typeof tournamentPreview>> | null = null;
  try {
    preview = await tournamentPreview(id, code);
  } catch {
    /* fall back to the plain game card */
  }

  const gameKey = preview && preview.found && isZeroGameKey(preview.game_type) ? preview.game_type : "space";
  const game = ZERO_GAMES[gameKey];
  const open = preview && preview.found && !preview.locked ? preview : null;
  const title = open?.title || (preview && preview.found ? `A private ${game.name} tournament` : game.name);
  const prize = open ? previewPrizeLine(open) : game.tagline;
  const status = open?.status;
  const ends = open ? new Date(open.ends_at) : null;
  const daysLeft = ends ? Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86400000)) : 0;
  const timing = !open ? "Invite only" : status === "ended" ? "Tournament ended"
    : status === "upcoming" ? "Starting soon" : daysLeft > 1 ? `${daysLeft} days left` : "Ends today";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px", height: "630px", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "64px 80px", fontFamily: "sans-serif", color: "#ffffff", position: "relative",
          background: `radial-gradient(120% 90% at 85% 10%, ${game.to}, ${game.from} 70%)`,
        }}
      >
        <div style={{ position: "absolute", top: "70px", right: "90px", width: "220px", height: "220px", borderRadius: "9999px", background: game.accent, opacity: 0.18, display: "flex" }} />
        <div style={{ position: "absolute", top: "150px", right: "170px", width: "60px", height: "60px", borderRadius: "9999px", background: game.accent, display: "flex" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div style={{ display: "flex", fontSize: "26px", fontWeight: 700, letterSpacing: "5px", color: "rgba(255,255,255,0.6)" }}>ZERO GAMES</div>
          <div style={{ display: "flex", padding: "8px 20px", borderRadius: "9999px", background: game.accent, color: "#140a1c", fontSize: "24px", fontWeight: 700 }}>
            {game.name}
          </div>
          {open?.sponsored ? (
            <div style={{ display: "flex", padding: "8px 20px", borderRadius: "9999px", background: "#ffffff", color: "#cc208f", fontSize: "22px", fontWeight: 700 }}>
              Sponsored by Zero Club
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: "900px" }}>
          <div style={{ display: "flex", fontSize: "70px", fontWeight: 800, lineHeight: 1.08 }}>{title.slice(0, 60)}</div>
          <div style={{ display: "flex", fontSize: "38px", fontWeight: 700, color: game.accent, marginTop: "22px" }}>{prize}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            <div style={{ display: "flex", padding: "16px 34px", borderRadius: "9999px", background: "#ffffff", color: "#140a1c", fontSize: "26px", fontWeight: 700 }}>
              {status === "ended" ? "See the winners" : "Join the tournament"}
            </div>
            <div style={{ display: "flex", alignItems: "center", fontSize: "26px", color: "rgba(255,255,255,0.75)" }}>
              {timing}{open ? ` · ${open.players} player${open.players === 1 ? "" : "s"}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: "24px", color: "rgba(255,255,255,0.45)", letterSpacing: "2px" }}>zeroclubs.xyz</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=300, s-maxage=900" } },
  );
}

export const Route = createFileRoute("/api/game-image/$id")({
  server: {
    handlers: {
      GET: ({ params, request }: any) => {
        const code = new URL(request.url).searchParams.get("code") || undefined;
        return renderGameCard(String(params.id || ""), code);
      },
    },
  },
});
