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
