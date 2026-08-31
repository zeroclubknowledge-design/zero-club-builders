import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/primitives";

/**
 * Sign-in, on the Zero account people already have.
 *
 * A magic link rather than a password field: ZeroStart holds no credential of
 * its own, and asking someone to invent a second password for the same account
 * is how you end up with two accounts.
 */
export function SignIn() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) { navigate({ to: "/" }); return null; }

  const send = async () => {
    setSending(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (e) { setError(e.message); return; }
    setSent(true);
  };

  return (
    <div className="mx-auto max-w-md pt-10">
      <Card className="p-7 sm:p-8">
        <h1 className="text-[24px] font-bold text-ink">Sign in</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
          Same account as Zero Club, same ZP balance. If you have one there, you already
          have one here.
        </p>

        {sent ? (
          <div className="mt-6 rounded-xl bg-ok/10 px-4 py-4">
            <p className="text-[13.5px] font-semibold text-ok">Check your email</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              We sent a sign-in link to {email.trim()}. Open it on this device.
            </p>
          </div>
        ) : (
          <>
            <label className="mt-6 block">
              <span className="text-[13px] font-medium text-ink">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && email.includes("@")) send(); }}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
              />
            </label>

            {error && (
              <p className="mt-4 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>
            )}

            <button
              onClick={send}
              disabled={!email.includes("@") || sending}
              className="mt-5 h-12 w-full rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? "Sending…" : "Email me a sign-in link"}
            </button>
          </>
        )}

        <p className="mt-6 text-[12px] leading-relaxed text-ink-faint">
          New to the ecosystem?{" "}
          <a href={config.zeroClubUrl} target="_blank" rel="noreferrer noopener" className="font-semibold text-accent">
            Join Zero Club
          </a>{" "}
          first — one account covers both.
        </p>
      </Card>
    </div>
  );
}
