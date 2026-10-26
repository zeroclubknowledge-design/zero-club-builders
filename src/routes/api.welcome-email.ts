import { createFileRoute } from "@tanstack/react-router";
import { welcomeEmail } from "@/features/welcome/welcomeEmail";

/**
 * Sends the one-time welcome email. Called by the app (signed in) on load; the
 * database decides whether this person should get it (claim_welcome_email:
 * confirmed email, new account, not sent before), so calling it again is
 * harmless. If Resend fails, the claim is released and the next visit retries.
 */
async function sendWelcome(request: Request) {
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ") || token.length > 8192) return Response.json({ sent: false }, { status: 401 });

  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!base || !anon || !resendApiKey) {
    console.error("Welcome email is not configured (SUPABASE_URL, SUPABASE_ANON_KEY or RESEND_API_KEY missing).");
    return Response.json({ sent: false }, { status: 503 });
  }

  const headers = { Authorization: token, apikey: anon, "Content-Type": "application/json" };
  const rpc = (name: string) => fetch(`${base}/rest/v1/rpc/${name}`, { method: "POST", headers, body: "{}", signal: AbortSignal.timeout(10000) });

  const claim = await rpc("claim_welcome_email");
  if (!claim.ok) return Response.json({ sent: false }, { status: claim.status === 401 ? 401 : 502 });
  const who = (await claim.json()) as { email?: string; name?: string } | null;
  if (!who?.email) return Response.json({ sent: false });

  const { subject, html, text } = welcomeEmail({ name: who.name || "" });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.WELCOME_FROM_EMAIL || "Zero Club <noreply@zeroclubs.xyz>",
      to: [who.email],
      reply_to: process.env.WELCOME_REPLY_TO || "contact@zeroclubs.xyz",
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.error("Welcome email failed:", res.status, await res.text());
    await rpc("release_welcome_email").catch(() => undefined);
    return Response.json({ sent: false }, { status: 502 });
  }
  return Response.json({ sent: true });
}

export const Route = createFileRoute("/api/welcome-email")({
  server: { handlers: { POST: ({ request }) => sendWelcome(request) } },
});
