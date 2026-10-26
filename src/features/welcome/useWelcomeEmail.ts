import { useEffect } from "react";

type SessionLike = {
  access_token?: string;
  user?: { id?: string; created_at?: string; email_confirmed_at?: string | null; confirmed_at?: string | null };
} | null;

/**
 * Asks the server to send the one-time welcome email once a new member is in
 * the app with a confirmed email. Only accounts created in the last 3 days
 * ask at all, and at most once per browser tab session; the server and
 * database make sure the email goes out exactly once.
 */
export function useWelcomeEmail(session: SessionLike) {
  const token = session?.access_token;
  const user = session?.user;
  useEffect(() => {
    if (!token || !user?.id) return;
    if (!(user.email_confirmed_at || user.confirmed_at)) return;
    const created = Date.parse(user.created_at || "");
    if (!Number.isFinite(created) || Date.now() - created > 3 * 86_400_000) return;
    const key = `zc-welcome-asked:${user.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
    } catch {
      /* storage blocked: the server still sends it only once */
    }
    const timer = window.setTimeout(() => {
      try { window.sessionStorage.setItem(key, "1"); } catch { /* see above */ }
      void fetch("/api/welcome-email", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [token, user?.id, user?.created_at, user?.email_confirmed_at, user?.confirmed_at]);
}
