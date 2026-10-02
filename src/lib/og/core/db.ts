/**
 * The few public reads a link preview needs, straight over Supabase REST.
 *
 * No supabase-js and no Vite env: this runs inside the standalone edge
 * function (api/og.ts) as well as the app server, and has to start fast.
 * Every call gives up after 2.5s and returns null, so a slow database still
 * produces a (generic) preview instead of no preview at all.
 */
const env: Record<string, string | undefined> = (globalThis as any).process?.env || {};

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "https://tiyifgfsuzhcvdvntjmp.supabase.co";
// The public anon key (the same one shipped in the app). It only reads what RLS lets anyone read.
const ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeWlmZ2ZzdXpoY3Zkdm50am1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MzMyMzYsImV4cCI6MjA5NDMwOTIzNn0.Gb2AcxgfArsdEOrnkHyfwRhJpyn44W0WrM3PW6TC69M";

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Call a public RPC. */
export function rpc(fn: string, args: Record<string, unknown>) {
  return call(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
}

/** First row of a table read, e.g. one("posts", "content", { id: "eq.<id>" }). */
export async function one(table: string, select: string, filters: Record<string, string>) {
  const query = new URLSearchParams({ select, ...filters, limit: "1" });
  const rows = await call(`/rest/v1/${table}?${query.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}
