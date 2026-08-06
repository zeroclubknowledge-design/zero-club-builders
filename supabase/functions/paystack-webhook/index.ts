// Paystack webhook: Paystack calls this directly the moment a payment
// succeeds, so a wallet is credited even if the person closed the app,
// lost signal, or the browser callback never ran.
//
// Set the URL in Paystack -> Settings -> API Keys & Webhooks:
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook
//
// Required secret: PAYSTACK_SECRET_KEY
// Deploy with --no-verify-jwt so Paystack can reach it:
//   supabase functions deploy paystack-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Paystack signs the raw body with HMAC SHA512 using the secret key. */
async function isFromPaystack(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secretKey) {
    console.error("PAYSTACK_SECRET_KEY is not configured");
    return new Response("Not configured", { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!(await isFromPaystack(rawBody, signature, secretKey))) {
    console.warn("Rejected a webhook with an invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  // Only successful charges move money.
  if (event?.event !== "charge.success") {
    return new Response(JSON.stringify({ ignored: event?.event }), { status: 200 });
  }

  const tx = event.data;
  const reference: string = tx?.reference;
  const majorUnits = Number(tx?.amount || 0) / 100;

  if (!reference || !(majorUnits > 0)) {
    return new Response("Nothing to process", { status: 200 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // A Zero Form guest registration carries its registration id in metadata.
    const zeroFormRegistrationId = tx?.metadata?.zero_form_registration_id
      || (String(reference).startsWith("zf_") ? tx?.metadata?.profile_id : null);

    if (zeroFormRegistrationId) {
      const { error } = await admin.rpc("confirm_zero_form_payment", {
        target_registration_id: zeroFormRegistrationId,
        reference,
        paid_amount: majorUnits,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ handled: "zero_form" }), { status: 200 });
    }

    // Otherwise it is a wallet top-up. The wallet is resolved from the
    // top-up recorded before checkout, falling back to metadata.
    const { error } = await admin.rpc("credit_wallet_from_paystack", {
      p_profile_id: tx?.metadata?.profile_id ?? null,
      p_reference: reference,
      p_amount: majorUnits,
      p_currency: tx?.currency || "NGN",
      p_response: tx,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ handled: "wallet_topup" }), { status: 200 });
  } catch (error) {
    // A non-200 tells Paystack to retry, which is what we want on a transient
    // failure. Repeats are safe because crediting is idempotent.
    console.error("Webhook processing failed:", (error as Error).message);
    return new Response("Processing failed", { status: 500 });
  }
});
