import { buildPreviewSpec } from "./specs";

const ORIGIN = "https://www.zeroclubs.xyz";
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

/** Public metadata only: no sessions, private answers, balances or campaign earnings. */
export async function linkPreviewResponse(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "";
  const id = url.searchParams.get("id") || "";
  if (!["form", "gift", "campaign"].includes(kind) || !id || id.length > 200 || /[\x00-\x1f/\\]/.test(id)) {
    return new Response("Link not found", { status: 404 });
  }
  const spec = await buildPreviewSpec(kind, id, url);
  const canonical = kind === "form" ? `https://form.zeroclubs.xyz/form/${encodeURIComponent(id)}/info`
    : kind === "gift" ? `https://gifts.zeroclubs.xyz/gift/${encodeURIComponent(id)}`
    : `${ORIGIN}/signup?c=${encodeURIComponent(id)}`;
  const image = `${ORIGIN}/api/og/${kind}/${encodeURIComponent(id)}?v=8`;
  const meta = (key: string, content: unknown, name = false) => `<meta ${name ? "name" : "property"}="${key}" content="${escape(content)}">`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(spec.title)}</title>
${meta("description", spec.subtitle || spec.title, true)}
${meta("og:title", spec.title)}${meta("og:description", spec.subtitle || spec.title)}${meta("og:type", "website")}${meta("og:url", canonical)}
${meta("og:image", image)}${meta("og:image:secure_url", image)}${meta("og:image:type", "image/png")}${meta("og:image:width", "1200")}${meta("og:image:height", "630")}${meta("og:image:alt", spec.title)}
${meta("twitter:card", "summary_large_image", true)}${meta("twitter:title", spec.title, true)}${meta("twitter:description", spec.subtitle || spec.title, true)}${meta("twitter:image", image, true)}
<link rel="canonical" href="${escape(canonical)}"></head><body><h1>${escape(spec.title)}</h1><p>${escape(spec.subtitle)}</p><a href="${escape(canonical)}">Open ${escape(spec.kicker)}</a></body></html>`;
  return new Response(request.method === "HEAD" ? null : html, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
    "Vary": "User-Agent",
  } });
}
