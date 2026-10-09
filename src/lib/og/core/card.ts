import { ImageResponse } from "@vercel/og";
import { ZERO_CLUB_MARK } from "../../../routes/-ogMark";
import { clip } from "./text";

/**
 * One design system for every Zero Club link preview.
 *
 * Each surface only describes WHAT to show (a PreviewSpec); this file decides
 * HOW it looks. Change the design here and every preview follows.
 *
 * Written without JSX on purpose: it is bundled into the standalone edge
 * function (api/og.ts) as well as the app server.
 *
 * Speed matters as much as looks. WhatsApp, Telegram and X give up on a
 * preview image after a few seconds, so fonts are cached per instance, every
 * outside fetch has a short timeout, and anything that fails falls back to
 * the brand card rather than leaving the link without a picture.
 */

export type PreviewSpec = {
  /** Small uppercase label top-right, e.g. "ZERO GAMES" or "CLUB". */
  kicker: string;
  title: string;
  subtitle?: string | null;
  /** Up to three short facts shown as pills, e.g. "Win ₦5,000". */
  chips?: (string | null | undefined | false)[];
  /** The button at the bottom left, e.g. "Join the tournament". */
  cta?: string;
  /** Optional highlight above the title, e.g. "Sponsored by Zero Club". */
  badge?: string | null;
  /** The visual on the right: a cover, logo, photo or avatar. */
  image?: string | null;
  imageShape?: "card" | "circle";
  /** Shown in the visual when there is no image (an initial). */
  monogram?: string | null;
  /** Brand light colours. Defaults to Zero Club pink. */
  accent?: string;
  accent2?: string;
  /** "portfolio" adds a drafting-grid backdrop and a ringed portrait. */
  variant?: "default" | "portfolio";
};

const W = 1200;
const H = 630;
const PINK = "#cc208f";

/* Tiny element builder: satori takes React-shaped objects, no React needed. */
type Style = Record<string, string | number>;
type Child = Node | string | null | undefined | false;
type Node = { type: string; props: Record<string, unknown> };
function h(type: string, props: Record<string, unknown> & { style?: Style }, ...children: (Child | Child[])[]): Node {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { ...props, children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids } };
}
const box = (style: Style, ...children: (Child | Child[])[]) => h("div", { style: { display: "flex", ...style } }, ...children);

/* ── Fonts: Montserrat, fetched once per server instance. ── */
type Font = { name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: "normal" };
let fontsPromise: Promise<Font[]> | null = null;

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadFonts(): Promise<Font[]> {
  const fonts = await withTimeout(3000, async (signal) => {
    // Without a browser user-agent Google serves TrueType, which the renderer needs.
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800", { signal })).text();
    const faces = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\(([^)]+)\)/g)];
    return Promise.all(
      faces.map(async ([, weight, url]) => ({
        name: "Montserrat",
        data: await (await fetch(url, { signal })).arrayBuffer(),
        weight: Number(weight) as Font["weight"],
        style: "normal" as const,
      })),
    );
  });
  return (fonts || []).filter((f) => [500, 700, 800].includes(f.weight));
}
export function fonts() {
  if (!fontsPromise) fontsPromise = loadFonts().then((f) => { if (!f.length) fontsPromise = null; return f; });
  return fontsPromise;
}

/* ── Images: resized to a small JPEG first, so they are quick to fetch and draw. ── */
function resized(url: string | null | undefined, size: number) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!/^https:\/\//i.test(url)) return null;
  const params = new URLSearchParams({ url, w: String(size), h: String(size), fit: "cover", output: "jpg", q: "80" });
  return `https://images.weserv.nl/?${params.toString()}`;
}

async function embed(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  return withTimeout(2500, async (signal) => {
    const response = await fetch(url, { signal });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !/^image\/(jpe?g|png)/.test(type)) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 1_500_000) return null;
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${type.split(";")[0]};base64,${btoa(binary)}`;
  });
}

/** Title size steps down as the title gets longer, so it always fits. */
const titleSize = (t: string) => (t.length <= 22 ? 72 : t.length <= 40 ? 62 : t.length <= 64 ? 52 : 44);

/** Start fetching the visual for a spec (call early, await in drawCard). */
export function visualFor(spec: PreviewSpec) {
  return embed(resized(spec.image, spec.imageShape === "circle" ? 520 : 720));
}

export function cardTree(spec: PreviewSpec, visual: string | null, family: string): Node {
  const accent = spec.accent || PINK;
  const accent2 = spec.accent2 || "#7a1e66";
  const title = clip(spec.title || "Zero Club", 90);
  const subtitle = spec.subtitle ? clip(spec.subtitle.replace(/\s+/g, " ").trim(), 120) : null;
  const chips = (spec.chips || []).filter(Boolean).slice(0, 3) as string[];
  const circle = spec.imageShape === "circle";
  const monogram = spec.monogram ? clip(spec.monogram, 2) : null;

  return box(
    { width: `${W}px`, height: `${H}px`, position: "relative", fontFamily: family, color: "#ffffff", background: "linear-gradient(160deg, #140a12 0%, #0a0609 55%, #050305 100%)" },
    // Brand light: one bloom behind the title, one deeper in the far corner.
    box({ position: "absolute", top: "-360px", left: "-260px", width: "1100px", height: "900px", background: `radial-gradient(circle at 50% 50%, ${accent}55 0%, ${accent}18 38%, transparent 68%)` }),
    box({ position: "absolute", bottom: "-380px", right: "-260px", width: "980px", height: "860px", background: `radial-gradient(circle at 50% 50%, ${accent2}66 0%, transparent 64%)` }),
    // A fine frame, like a card held in the light.
    box({ position: "absolute", top: "24px", left: "24px", right: "24px", bottom: "24px", borderRadius: "36px", border: "1px solid rgba(255,255,255,0.09)", background: "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.01) 100%)" }),
    // Portfolio: a faint drafting grid, so a portfolio link reads as a
    // personal site rather than another app screen.
    ...(spec.variant === "portfolio"
      ? [
          ...Array.from({ length: 11 }, (_, i) =>
            box({ position: "absolute", top: "0px", bottom: "0px", left: `${(i + 1) * 100}px`, width: "1px", background: "rgba(255,255,255,0.035)" }),
          ),
          ...Array.from({ length: 6 }, (_, i) =>
            box({ position: "absolute", left: "0px", right: "0px", top: `${(i + 1) * 90}px`, height: "1px", background: "rgba(255,255,255,0.035)" }),
          ),
        ]
      : []),
    // Watermark mark, barely there.
    h("img", { src: ZERO_CLUB_MARK, width: 520, height: 520, style: { position: "absolute", right: "-150px", top: "-120px", opacity: 0.05 } }),

    box(
      { position: "relative", flexDirection: "column", width: "100%", height: "100%", padding: "62px 72px" },
      // Header: brand + kicker
      box(
        { alignItems: "center", justifyContent: "space-between" },
        box(
          { alignItems: "center", gap: "14px" },
          h("img", { src: ZERO_CLUB_MARK, width: 44, height: 44 }),
          box({ fontSize: "30px", fontWeight: 800, letterSpacing: "-0.5px" }, h("span", {}, "Zero"), h("span", { style: { color: "#ff4fc3", marginLeft: "8px" } }, "Club")),
        ),
        box(
          { alignItems: "center", gap: "10px", padding: "10px 20px", borderRadius: "999px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", fontSize: "18px", fontWeight: 700, letterSpacing: "3px", color: "rgba(255,255,255,0.85)" },
          box({ width: "9px", height: "9px", borderRadius: "999px", background: accent }),
          clip(spec.kicker, 34).toUpperCase(),
        ),
      ),

      // Body: words left, visual right
      box(
        { flex: 1, alignItems: "center", justifyContent: "space-between", marginTop: "18px" },
        box(
          { flexDirection: "column", width: "650px" },
          spec.badge
            ? box(
                { alignSelf: "flex-start", alignItems: "center", gap: "10px", padding: "8px 18px", borderRadius: "999px", background: "#ffffff", color: accent, fontSize: "20px", fontWeight: 800, marginBottom: "20px" },
                box({ width: "10px", height: "10px", borderRadius: "999px", background: accent }),
                clip(spec.badge, 32),
              )
            : null,
          box({ fontSize: `${titleSize(title)}px`, fontWeight: 800, lineHeight: 1.06, letterSpacing: "-1.5px" }, title),
          subtitle ? box({ marginTop: "18px", fontSize: "26px", fontWeight: 500, lineHeight: 1.4, color: "rgba(255,255,255,0.66)" }, subtitle) : null,
          chips.length
            ? box(
                { gap: "12px", marginTop: "26px", flexWrap: "wrap" },
                chips.map((chip, i) =>
                  box(
                    { padding: "10px 18px", borderRadius: "14px", background: i === 0 ? `${accent}33` : "rgba(255,255,255,0.07)", border: `1px solid ${i === 0 ? `${accent}88` : "rgba(255,255,255,0.12)"}`, fontSize: "22px", fontWeight: 700, color: i === 0 ? "#ffffff" : "rgba(255,255,255,0.86)" },
                    clip(chip, 28),
                  ),
                ),
              )
            : null,
        ),

        // The visual, framed and lit from behind.
        box(
          { position: "relative", width: "340px", height: "340px", alignItems: "center", justifyContent: "center" },
          box({ position: "absolute", top: "-30px", left: "-30px", width: "400px", height: "400px", borderRadius: "999px", background: `radial-gradient(circle, ${accent}66 0%, transparent 66%)` }),
          visual
            ? spec.variant === "portfolio"
              ? box(
                  { width: "320px", height: "320px", borderRadius: "999px", alignItems: "center", justifyContent: "center", background: `linear-gradient(145deg, ${accent} 0%, ${accent2} 100%)` },
                  h("img", { src: visual, width: 300, height: 300, style: { borderRadius: "999px", objectFit: "cover", border: "6px solid #0a0609" } }),
                )
              : h("img", { src: visual, width: circle ? 300 : 330, height: circle ? 300 : 330, style: { borderRadius: circle ? "999px" : "40px", objectFit: "cover", border: "2px solid rgba(255,255,255,0.18)" } })
            : box(
                { width: "300px", height: "300px", borderRadius: circle ? "999px" : "48px", alignItems: "center", justifyContent: "center", background: `linear-gradient(145deg, ${accent} 0%, ${accent2} 100%)`, border: "2px solid rgba(255,255,255,0.18)", fontSize: "140px", fontWeight: 800 },
                monogram ? monogram : h("img", { src: ZERO_CLUB_MARK, width: 150, height: 150 }),
              ),
        ),
      ),

      // Footer: action + address
      box(
        { alignItems: "center", justifyContent: "space-between" },
        box({ padding: "16px 32px", borderRadius: "999px", background: `linear-gradient(90deg, ${accent} 0%, #ff4fc3 100%)`, fontSize: "24px", fontWeight: 800 }, `${clip(spec.cta || "Open on Zero Club", 30)} →`),
        box({ fontSize: "22px", fontWeight: 700, letterSpacing: "1px", color: "rgba(255,255,255,0.45)" }, "zeroclubs.xyz"),
      ),
    ),
  );
}

/** Draw a card to PNG bytes. Throws if the renderer fails (the caller falls back). */
export async function drawCard(spec: PreviewSpec, visual: string | null, loaded: Font[]): Promise<ArrayBuffer> {
  const image = new ImageResponse(cardTree(spec, visual, loaded.length ? "Montserrat" : "sans-serif") as any, {
    width: W,
    height: H,
    fonts: loaded.length ? loaded : undefined,
    // Posts and bios can carry emoji; draw them instead of empty boxes.
    emoji: "twemoji",
  });
  return image.arrayBuffer();
}
