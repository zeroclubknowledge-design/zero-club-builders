/**
 * A stable, anonymous id for this phone or browser.
 *
 * Used for one thing: one Zero Club account per person. The id is kept in
 * both localStorage and a long-lived cookie so clearing one doesn't reset it.
 * It holds nothing about the person and never leaves Zero Club.
 */
const KEY = "zc-device-id";
const COOKIE = "zc_did";

function readCookie() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)zc_did=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  id = id || readCookie() || newId();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked */
  }
  try {
    document.cookie = `${COOKIE}=${encodeURIComponent(id)}; max-age=${60 * 60 * 24 * 400}; path=/; samesite=lax; secure`;
  } catch {
    /* cookies blocked */
  }
  return id;
}

export const ONE_ACCOUNT_MESSAGES: Record<string, (account?: string) => string> = {
  existing_account: () => "This email already has a Zero Club account. Sign in instead.",
  email_alias: (account) => `That's the same inbox as an existing account${account ? ` (${account})` : ""}. Sign in instead — each person can have one Zero Club account.`,
  device_has_account: (account) => `This device already has a Zero Club account${account ? ` (${account})` : ""}. Each person can have one account — sign in to it instead.`,
};

/** Maps the database's refusal to a clear sentence, when it is one of ours. */
export function oneAccountErrorMessage(message?: string) {
  if (/DUPLICATE_ACCOUNT/i.test(message || "")) return ONE_ACCOUNT_MESSAGES.email_alias();
  if (/DEVICE_HAS_ACCOUNT/i.test(message || "")) return ONE_ACCOUNT_MESSAGES.device_has_account();
  return null;
}
