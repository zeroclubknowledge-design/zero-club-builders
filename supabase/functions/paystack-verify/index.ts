// Verifies a Paystack transaction server-side and credits the member's wallet.
//
// The browser never decides how much was paid — it only sends the reference.
// This function asks Paystack what actually happened, then credits the wallet
// once (repeat calls with the same reference are ignored).
//
// Required secrets (Supabase → Edge Functions → Secrets):
//   PAYSTACK_SECRET_KEY   sk_live_... or sk_test_...
// Provided automatically by Supabase:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secretKey) return json({ error: "PAYSTACK_SECRET_KEY is not configured" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Not authenticated" }, 401);

    const { reference } = await req.json();
    if (!reference || typeof reference !== "string") {
      return json({ error: "A payment reference is required" }, 400);
    }

    // Identify the caller from their access token — the wallet credited is
    // always the signed-in user's, never one supplied by the browser.
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await anonClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    // Ask Paystack what really happened.
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );
    const verifyBody = await verifyRes.json();

    if (!verifyRes.ok || !verifyBody?.status) {
      return json({ error: verifyBody?.message || "Could not verify this payment" }, 400);
    }

    const tx = verifyBody.data;
    if (tx?.status !== "success") {
      return json({ error: `Payment not successful (${tx?.status || "unknown"})` }, 400);
    }

    // Paystack reports amounts in kobo/pesewas/cents.
    const majorUnits = Number(tx.amount || 0) / 100;
    if (!(majorUnits > 0)) return json({ error: "Invalid payment amount" }, 400);

    // The reference was created for a specific member; reject mismatches.
    const intendedUser = tx?.metadata?.profile_id;
    if (intendedUser && intendedUser !== userId) {
      return json({ error: "This payment belongs to another account" }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await admin.rpc("credit_wallet_from_paystack", {
      p_profile_id: userId,
      p_reference: reference,
      p_amount: majorUnits,
      p_currency: tx.currency || "NGN",
      p_response: tx,
    });

    if (error) return json({ error: error.message }, 500);

    return json({ success: true, amount: majorUnits, currency: tx.currency || "NGN", ...data });
  } catch (error) {
    return json({ error: (error as Error).message || "Verification failed" }, 500);
  }
});
