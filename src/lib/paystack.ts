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

export const paystackPublicKey = (import.meta as any).env?.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;

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
  if (!paystackPublicKey) {
    throw new Error("Payments are not configured yet. Add VITE_PAYSTACK_PUBLIC_KEY.");
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
