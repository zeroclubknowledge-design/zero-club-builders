import { supabase } from "@/lib/supabase";

const pending = new Map<string, Promise<string>>();
const sharePath = /^\/(?:app\/(?:post|profile|bootcamps|notes|live|challenge|games\/t)\/[^/]+|product\/[^/]+|s\/[0-9a-f]{12})$/i;

/** Keep the complete destination (including referral attribution) behind a stable name. */
export async function readableShareUrl(value: string, title?: string): Promise<string> {
  if (typeof window === "undefined") return value;
  let url: URL;
  try { url = new URL(value); } catch { return value; }
  if (![window.location.origin, "https://www.zeroclubs.xyz", "https://zeroclubs.xyz"].includes(url.origin)) return value;
  if (!sharePath.test(url.pathname) || url.searchParams.has("code")) return value;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return value;
  const destination = url.pathname + url.search + url.hash;
  const key = session.user.id + destination;
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      const { data, error } = await supabase.rpc("create_named_share", {
        p_destination: destination,
        p_title: title || null,
      });
      if (error || !data) throw new Error("Couldn't prepare the share link. Please try again.");
      return `${url.origin}${data}`;
    })().catch((error) => { pending.delete(key); throw error; }));
  }
  return pending.get(key)!;
}

/** Also handles the short message followed by a URL used by profile sharing. */
export async function readableShareText(text: string): Promise<string> {
  const urls = [...new Set(text.match(/https?:\/\/[^\s]+/g) || [])];
  for (const url of urls) text = text.split(url).join(await readableShareUrl(url));
  return text;
}
