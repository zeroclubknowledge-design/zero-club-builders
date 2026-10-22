/**
 * "Bring me back here after I sign in."
 *
 * Kept in localStorage (not the URL) so it survives the whole trip: the sign
 * up page, an email code, Google's redirect, and onboarding. It expires after
 * two hours so a stale one never hijacks a later visit.
 */
const KEY = "zc-return-to";
const TTL = 2 * 60 * 60 * 1000;

export function setReturnTo(path: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    /* storage blocked: they land on the app home instead */
  }
}

export function peekReturnTo(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { path, at } = JSON.parse(raw);
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || Date.now() - Number(at) > TTL) {
      localStorage.removeItem(KEY);
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

export function takeReturnTo(): string | null {
  const path = peekReturnTo();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clean */
  }
  return path;
}
