import { ImageResponse } from "@vercel/og";
import { ZERO_CLUB_MARK } from "@/routes/-ogMark";

/**
 * One design system for every Zero Club link preview.
 *
 * Every shared link — a tournament, a club, a post, a profile, a note, a
 * product, a form, a fund link — is drawn by this one card so they look like
 * one premium product: the same dark stage, a soft brand light, Montserrat,
 * a framed visual on the right and a clear call to action.
 *
 * Each surface only describes WHAT to show (a PreviewSpec); this file decides
 * HOW it looks. Change the design here and every preview follows.
 */

export type PreviewSpec = {
  /** Small uppercase label top-right, e.g. "ZERO GAMES" or "CLUB". */
  kicker: string;
  title: string;
  subtitle?: string | null;
  /** Up to three short facts shown as pills, e.g. "₦5,000 prize". */
  chips?: (string | null | undefined | false)[];
  /** The button at the bottom left, e.g. "Join the tournament". */
  cta?: string;
  /** Optional highlight above the title, e.g. "Sponsored by Zero Club". */
  badge?: string | null;
  /** The visual on the right: a cover, logo, photo or avatar. */
  image?: string | null;
  imageShape?: "card" | "circle";
  /** Shown in the visual when there is no image (an initial or emoji). */
  monogram?: string | null;
  /** Brand light colours. Defaults to Zero Club pink. */
  accent?: string;
  accent2?: string;
};

const W = 1200;
const H = 630;
const PINK = "#cc208f";

/* ── Fonts: Montserrat from Google Fonts, cached per server instance. ── */
type Font = { name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: "normal" };
let fontsPromise: Promise<Font[]> | null = null;

async function loadFonts(): Promise<Font[]> {
  try {
    // Without a browser user-agent Google serves TrueType, which the renderer needs.
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800&display=swap")).text();
    const faces = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\(([^)]+)\)/g)];
    const fonts = await Promise.all(
      faces.map(async ([, weight, url]) => ({
        name: "Montserrat",
        data: await (await fetch(url)).arrayBuffer(),
        weight: Number(weight) as Font["weight"],
        style: "normal" as const,
      })),
    );
    return fonts.filter((f) => [500, 700, 800].includes(f.weight));
  } catch {
    return [];
  }
}
function fonts() {
  if (!fontsPromise) fontsPromise = loadFonts().then((f) => { if (!f.length) fontsPromise = null; return f; });
  return fontsPromise;
}

/* ── Images: only embed what can actually be fetched, as JPEG. ── */
export function previewImageUrl(url: string | null | undefined, size = 760) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  if (url.startsWith("data:")) return url;
  const params = new URLSearchParams({ url, w: String(size), h: String(size), fit: "cover", output: "jpg", q: "82" });
  return `https://images.weserv.nl/?${params.toString()}`;
}

async function usable(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok || !(response.headers.get("content-type") || "").startsWith("image/")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${response.headers.get("content-type")};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Title size steps down as the title gets longer, so it always fits two-three lines. */
const titleSize = (t: string) => (t.length <= 22 ? 72 : t.length <= 40 ? 62 : t.length <= 64 ? 52 : 44);

export async function renderPreview(spec: PreviewSpec, cacheSeconds = 600) {
  const accent = spec.accent || PINK;
  const accent2 = spec.accent2 || "#7a1e66";
  const [loadedFonts, visual] = await Promise.all([fonts(), usable(previewImageUrl(spec.image, spec.imageShape === "circle" ? 520 : 760))]);
  const title = clip(spec.title || "Zero Club", 90);
  const subtitle = spec.subtitle ? clip(spec.subtitle.replace(/\s+/g, " ").trim(), 120) : null;
  const chips = (spec.chips || []).filter(Boolean).slice(0, 3) as string[];
  const circle = spec.imageShape === "circle";
  const family = loadedFonts.length ? "Montserrat" : "sans-serif";

  return new ImageResponse(
    (
      <div style={{ width: `${W}px`, height: `${H}px`, display: "flex", position: "relative", fontFamily: family, color: "#ffffff", background: "linear-gradient(160deg, #140a12 0%, #0a0609 55%, #050305 100%)" }}>
        {/* Brand light: one bloom above the title, one deeper in the far corner. */}
        <div style={{ position: "absolute", top: "-360px", left: "-260px", width: "1100px", height: "900px", display: "flex", background: `radial-gradient(circle at 50% 50%, ${accent}55 0%, ${accent}18 38%, transparent 68%)` }} />
        <div style={{ position: "absolute", bottom: "-380px", right: "-260px", width: "980px", height: "860px", display: "flex", background: `radial-gradient(circle at 50% 50%, ${accent2}66 0%, transparent 64%)` }} />
        {/* A fine frame, like a card held in the light. */}
        <div style={{ position: "absolute", top: "24px", left: "24px", right: "24px", bottom: "24px", display: "flex", borderRadius: "36px", border: "1px solid rgba(255,255,255,0.09)", background: "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.01) 100%)" }} />
        {/* Watermark mark, barely there. */}
        <img src={ZERO_CLUB_MARK} width={520} height={520} style={{ position: "absolute", right: "-150px", top: "-120px", opacity: 0.05 }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "62px 72px" }}>
          {/* Header: brand + kicker */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <img src={ZERO_CLUB_MARK} width={44} height={44} />
              <div style={{ display: "flex", fontSize: "30px", fontWeight: 800, letterSpacing: "-0.5px" }}>
                <span>Zero</span><span style={{ color: "#ff4fc3", marginLeft: "8px" }}>Club</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 20px", borderRadius: "999px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", fontSize: "18px", fontWeight: 700, letterSpacing: "3px", color: "rgba(255,255,255,0.85)" }}>
              <div style={{ width: "9px", height: "9px", borderRadius: "999px", background: accent, display: "flex" }} />
              {spec.kicker.toUpperCase()}
            </div>
          </div>

          {/* Body: words left, visual right */}
          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", marginTop: "18px" }}>
            <div style={{ display: "flex", flexDirection: "column", width: "650px" }}>
              {spec.badge ? (
                <div style={{ display: "flex", alignSelf: "flex-start", padding: "8px 18px", borderRadius: "999px", background: "#ffffff", color: accent, fontSize: "20px", fontWeight: 800, marginBottom: "20px" }}>
                  {spec.badge}
                </div>
              ) : null}
              <div style={{ display: "flex", fontSize: `${titleSize(title)}px`, fontWeight: 800, lineHeight: 1.06, letterSpacing: "-1.5px" }}>{title}</div>
              {subtitle ? (
                <div style={{ display: "flex", marginTop: "18px", fontSize: "26px", fontWeight: 500, lineHeight: 1.4, color: "rgba(255,255,255,0.66)" }}>{subtitle}</div>
              ) : null}
              {chips.length ? (
                <div style={{ display: "flex", gap: "12px", marginTop: "26px", flexWrap: "wrap" }}>
                  {chips.map((chip, i) => (
                    <div key={i} style={{ display: "flex", padding: "10px 18px", borderRadius: "14px", background: i === 0 ? `${accent}33` : "rgba(255,255,255,0.07)", border: `1px solid ${i === 0 ? `${accent}88` : "rgba(255,255,255,0.12)"}`, fontSize: "22px", fontWeight: 700, color: i === 0 ? "#ffffff" : "rgba(255,255,255,0.86)" }}>
                      {clip(chip, 28)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* The visual, framed and lit from behind. */}
            <div style={{ display: "flex", position: "relative", width: "340px", height: "340px", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "absolute", width: "400px", height: "400px", borderRadius: "999px", display: "flex", background: `radial-gradient(circle, ${accent}66 0%, transparent 66%)` }} />
              {visual ? (
                <img src={visual} width={circle ? 300 : 330} height={circle ? 300 : 330} style={{ borderRadius: circle ? "999px" : "40px", objectFit: "cover", border: "2px solid rgba(255,255,255,0.18)" }} />
              ) : (
                <div style={{ display: "flex", width: "300px", height: "300px", borderRadius: circle ? "999px" : "48px", alignItems: "center", justifyContent: "center", background: `linear-gradient(145deg, ${accent} 0%, ${accent2} 100%)`, border: "2px solid rgba(255,255,255,0.18)", fontSize: "140px", fontWeight: 800 }}>
                  {spec.monogram ? clip(spec.monogram, 2) : <img src={ZERO_CLUB_MARK} width={150} height={150} />}
                </div>
              )}
            </div>
          </div>

          {/* Footer: action + address */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", padding: "16px 32px", borderRadius: "999px", background: `linear-gradient(90deg, ${accent} 0%, #ff4fc3 100%)`, fontSize: "24px", fontWeight: 800 }}>
              {spec.cta || "Open on Zero Club"} →
            </div>
            <div style={{ display: "flex", fontSize: "22px", fontWeight: 600, letterSpacing: "1px", color: "rgba(255,255,255,0.45)" }}>zeroclubs.xyz</div>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: loadedFonts.length ? loadedFonts : undefined,
      headers: { "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds * 6}, stale-while-revalidate=86400` },
    },
  );
}
