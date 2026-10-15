import { createFileRoute } from "@tanstack/react-router";

/*
 * Link previews for chat messages: GET /api/unfurl?url=https://…
 *
 * Fetches the page server-side (browsers can't, because of CORS) and returns
 * only its preview metadata — title, description, image, site name. It never
 * returns the page itself, follows at most a few redirects, reads at most
 * 600 KB, gives up after 6 seconds, and refuses private and local addresses
 * so it can't be used to reach anything inside a network.
 */

const MAX_BYTES = 600_000;
const TIMEOUT_MS = 6000;
const UA = "Mozilla/5.0 (compatible; ZeroClubBot/1.0; +https://www.zeroclubs.xyz)";

type Preview = { url: string; title: string | null; description: string | null; image: string | null; siteName: string | null; favicon: string | null };

function blockedHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) return true;
  if (h === "metadata.google.internal") return true;
  // IPv4 literals in private, loopback, link-local and reserved ranges.
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  // IPv6 literals: refuse them all (loopback, ULA, link-local and mapped forms).
  if (h.includes(":")) return true;
  // Bare numbers (decimal/hex IP encodings).
  if (/^(0x[0-9a-f]+|\d+)$/i.test(h)) return true;
  return false;
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, keys: string[]) {
  for (const key of keys) {
    const k = key.replace(/[:.]/g, "\\$&");
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i"));
    if (a?.[1]) return decode(a[1]);
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
    if (b?.[1]) return decode(b[1]);
  }
  return null;
}

function absolute(value: string | null, base: string) {
  if (!value) return null;
  try {
    const u = new URL(value, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

async function readLimited(res: Response) {
  if (!res.body) return (await res.text()).slice(0, MAX_BYTES);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
    // The head is all we need.
    if (new TextDecoder().decode(value).toLowerCase().includes("</head>")) break;
  }
  void reader.cancel().catch(() => undefined);
  const all = new Uint8Array(Math.min(total, MAX_BYTES));
  let offset = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.max(0, all.length - offset));
    all.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder().decode(all);
}

async function unfurl(raw: string): Promise<Preview | null> {
  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    return null;
  }
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(current.protocol) || blockedHost(current.hostname) || (current.port && !["80", "443"].includes(current.port))) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "en" },
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return null;
      current = new URL(next, current);
      continue;
    }
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (type.startsWith("image/")) {
      return { url: current.toString(), title: null, description: null, image: current.toString(), siteName: current.hostname.replace(/^www\./, ""), favicon: null };
    }
    if (!type.includes("html")) return null;
    const html = await readLimited(res);
    const base = current.toString();
    const title = meta(html, ["og:title", "twitter:title"]) || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "") || null;
    const description = meta(html, ["og:description", "twitter:description", "description"]);
    const image = absolute(meta(html, ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]), base);
    const siteName = meta(html, ["og:site_name", "application-name"]) || current.hostname.replace(/^www\./, "");
    const iconHref = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1] || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*icon[^"']*["']/i)?.[1] || "/favicon.ico";
    if (!title && !image && !description) return null;
    return {
      url: base,
      title: title ? title.slice(0, 200) : null,
      description: description ? description.slice(0, 300) : null,
      image,
      siteName: siteName ? siteName.slice(0, 80) : null,
      favicon: absolute(decode(iconHref), base),
    };
  }
  return null;
}

export const Route = createFileRoute("/api/unfurl")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url") || "";
        if (!target || target.length > 2048) return Response.json({ preview: null }, { status: 400 });
        let preview: Preview | null = null;
        try {
          preview = await unfurl(target);
        } catch {
          preview = null;
        }
        return Response.json(
          { preview },
          // Previews rarely change; let the CDN keep them for a day.
          { headers: { "Cache-Control": preview ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=300, s-maxage=3600" } },
        );
      },
    },
  },
});
