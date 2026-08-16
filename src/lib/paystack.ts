/**
 * Paystack inline checkout helper.
 *
 * The browser only opens the payment popup. It never decides how much was
 * paid — the `paystack-verify` Edge Function asks Paystack directly and is
 * the only thing that credits a wallet.
 */

const PAYSTACK_SCRIPT = "https://js.paystack.co/v1/inline.js";

declare global {
  interface Window {
    PaystackPop?: any;
  }
}

/**
 * The Paystack public key, cleaned up before use.
 *
 * Pasting into a hosting dashboard often brings along quotes or stray spaces,
 * and it is easy to paste the secret key by mistake. Both produce Paystack's
 * unhelpful "Please enter a valid Key" screen, so they are caught here.
 */
const rawPaystackKey = ((import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY ?? "") as string;

const cleanedPaystackKey = String(rawPaystackKey)
  .trim()
  .replace(/^["']|["']$/g, "")   // quotes pasted around the value
  .replace(/\s+/g, "");           // spaces or line breaks inside it

/** Empty when unset or unusable, so callers can fall back gracefully. */
export const paystackPublicKey = cleanedPaystackKey.startsWith("pk_") ? cleanedPaystackKey : undefined;

/** Explains precisely why the key was rejected, for a helpful message. */
export function paystackKeyProblem(): string | null {
  if (!cleanedPaystackKey) {
    return "No Paystack public key is set. Add VITE_PAYSTACK_PUBLIC_KEY in Vercel, then redeploy.";
  }
  if (cleanedPaystackKey.startsWith("sk_")) {
    return "That is the secret key. Use the public key (starts with pk_) in the app; the secret key belongs in Supabase.";
  }
  if (!cleanedPaystackKey.startsWith("pk_")) {
    return "The Paystack public key looks wrong. It should start with pk_test_ or pk_live_.";
  }
  return null;
}

/**
 * Turns a failed `functions.invoke` into something a person can act on.
 *
 * supabase-js raises "Failed to send a request to the Edge Function" when the
 * fetch itself never completed — the function is not deployed, CORS rejected
 * the call, or the device is offline. It is not a payment failure, and showing
 * it verbatim reads as if the money went missing.
 *
 * The important part of the message is the reassurance: the Paystack webhook
 * credits wallets independently of the browser, so an unreachable verify
 * endpoint delays confirmation but never loses money.
 */
export function describeVerifyFailure(error: unknown): { message: string; description?: string } {
  const raw = (error as any)?.message || String(error || "");

  if (/failed to send a request|failed to fetch|networkerror|load failed/i.test(raw)) {
    return {
      message: navigator.onLine
        ? "We couldn't reach the payment checker"
        : "You appear to be offline",
      description:
        "Your payment is safe. If it went through, it will be added to your wallet automatically — try again in a moment.",
    };
  }

  if (/not successful/i.test(raw)) {
    return {
      message: "That payment hasn't arrived yet",
      description: "If you have just sent a transfer, give it a minute and check again.",
    };
  }

  return { message: raw || "We could not confirm that payment" };
}

let scriptPromise: Promise<void> | null = null;

export function loadPaystack(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Unavailable"));
  if (window.PaystackPop) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PAYSTACK_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load Paystack")));
      return;
    }
    const script = document.createElement("script");
    script.src = PAYSTACK_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load Paystack"));
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export function buildReference(userId: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `zc_${userId.slice(0, 8)}_${Date.now()}_${random}`;
}

type CheckoutOptions = {
  email: string;
  /** Amount in major units (naira, cedis, dollars) — converted to minor units here. */
  amount: number;
  currency: string;
  reference: string;
  profileId: string;
  displayName?: string;
};

/** Opens the Paystack popup. Resolves with the reference on success. */
export async function openPaystackCheckout(options: CheckoutOptions): Promise<string> {
  const problem = paystackKeyProblem();
  if (problem || !paystackPublicKey) {
    throw new Error(problem || "Payments are not configured yet.");
  }
  await loadPaystack();

  return new Promise<string>((resolve, reject) => {
    try {
      const handler = window.PaystackPop.setup({
        key: paystackPublicKey,
        email: options.email,
        amount: Math.round(options.amount * 100),
        currency: options.currency,
        ref: options.reference,
        metadata: {
          profile_id: options.profileId,
          custom_fields: [
            { display_name: "Zero Club member", variable_name: "member", value: options.displayName || options.email },
          ],
        },
        callback: (response: any) => resolve(response?.reference || options.reference),
        onClose: () => reject(new Error("Payment cancelled")),
      });
      handler.openIframe();
    } catch (error) {
      reject(error as Error);
    }
  });
}
