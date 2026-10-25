// Zero Club single sign-on handoff. (Deployed to Supabase as the "sso-handoff" edge function, verify_jwt on.)
//
// Called only by the bridge page on www.zeroclubs.xyz (public/sso-bridge.html)
// with the signed-in Zero Club user's access token. Returns a one-time sign-in
// code (a magic-link token hash; no email is sent) that the bridge passes to
// Zero Form or Zero Gifts, which exchange it with verifyOtp for their own,
// independent session. Refresh tokens are never shared between apps.
import { createClient } from "jsr:@supabase/supabase-js@2";

const BRIDGE_ORIGINS = ["https://www.zeroclubs.xyz", "https://zeroclubs.xyz"];
const TARGETS = ["https://form.zeroclubs.xyz", "https://gifts.zeroclubs.xyz"];

function cors(origin: string | null) {
  const allowed = origin && BRIDGE_ORIGINS.includes(origin) ? origin : BRIDGE_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = { ...cors(origin), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  if (!origin || !BRIDGE_ORIGINS.includes(origin)) return new Response(JSON.stringify({ error: "Not allowed" }), { status: 403, headers });

  let target = "";
  try { target = String((await req.json())?.target || ""); } catch { /* empty body */ }
  if (!TARGETS.includes(target)) return new Response(JSON.stringify({ error: "Unknown app" }), { status: 400, headers });

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user?.email) return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers });

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return new Response(JSON.stringify({ error: "Could not sign you in" }), { status: 500, headers });

  return new Response(JSON.stringify({ token_hash: tokenHash, email: user.email, user_id: user.id }), { headers });
});
