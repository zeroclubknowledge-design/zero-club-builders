import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useStickyState } from "@/lib/useStickyState";
import { Card } from "@/components/ui/primitives";

/**
 * Sign-in with a confirmation code, on the Zero account people already have.
 *
 * A code rather than a magic link, matching Zero Club exactly. The practical
 * reason is that a link opens in whichever browser the mail app prefers, which
 * on a phone is routinely not the one the person was using — so they land
 * signed in somewhere they weren't, and signed out where they were. A code
 * they can read and type keeps them in the tab they started in.
 *
 * Both products send the same email from the same Supabase project, so no
 * template change is needed here: Zero Club already configured it to include
 * the token.
 */
export function SignIn() {
  const navigate = useNavigate();
  const { session } = useAuth();

  /*
   * Step and email survive a reload, because getting the code means leaving
   * this tab — and on a phone the browser routinely discards the page while
   * you are in your mail app. Without this, coming back with the code in hand
   * lands you on a blank email form with nowhere to type it.
   *
   * The code itself is deliberately *not* stored. It is a live credential, it
   * is about to be typed anyway, and there is no version of this where writing
   * it to disk is the right trade.
   */
  const [step, setStep, clearStep] = useStickyState<"email" | "code">("zs_signin_step", "email");
  const [email, setEmail, clearEmail] = useStickyState("zs_signin_email", "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resentAt, setResentAt] = useState<number | null>(null);

  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  const sendCode = async (resending = false) => {
    setBusy(true);
    setError(null);
    try {
      /*
       * Sign in, never sign up.
       *
       * signInWithOtp creates an account for an unknown address by default,
       * which would make this page a silent second registration route — type
       * any email, get a code, and you are in with no profile and no agreement
       * to anything. Enforced by the auth server rather than by a check here.
       */
      const { error: e } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });

      if (e) {
        // Supabase words this as "Signups not allowed for otp", which reads as
        // a fault on our side rather than "we don't know this address".
        const unknown = /signups? not allowed|user not found|not found/i.test(e.message || "");
        setError(
          unknown
            ? "No Zero account uses that email. Check the address, or join Zero Club first."
            : e.message
        );
        return;
      }

      setStep("code");
      if (resending) setResentAt(Date.now());
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });

      if (e) { setError(`That code didn't work. ${e.message}`); return; }
      if (!data.session) { setError("Verified, but no session came back. Try again."); return; }

      clearStep();
      clearEmail();
      navigate({ to: "/" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md pt-10">
      <Card className="p-7 sm:p-8">
        {step === "email" ? (
          <>
            <h1 className="text-[24px] font-bold text-ink">Sign in</h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
              Same account as Zero Club, same ZP balance. If you have one there, you already
              have one here.
            </p>

            <label className="mt-6 block">
              <span className="text-[13px] font-medium text-ink">Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && email.includes("@")) sendCode(); }}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[13.5px] text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50"
              />
            </label>

            {error && (
              <p className="mt-4 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>
            )}

            <button
              onClick={() => sendCode()}
              disabled={!email.includes("@") || busy}
              className="zs-glow mt-5 h-12 w-full rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send confirmation code"}
            </button>

            <p className="mt-6 text-[12px] leading-relaxed text-ink-faint">
              New to the ecosystem?{" "}
              <a href={config.zeroClubUrl} target="_blank" rel="noreferrer noopener" className="font-semibold text-accent">
                Join Zero Club
              </a>{" "}
              first — one account covers both.
            </p>
          </>
        ) : (
          <>
            <button
              onClick={() => { setStep("email"); setCode(""); setError(null); clearStep(); }}
              className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted transition hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>

            <h1 className="text-[24px] font-bold text-ink">Enter your code</h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
              We sent a 6-digit confirmation code to{" "}
              <span className="font-semibold text-ink">{email.trim()}</span>.
            </p>

            <label className="mt-6 block">
              <span className="text-[13px] font-medium text-ink">Confirmation code</span>
              <input
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                /* Strip anything that isn't a digit: people paste the code with
                   a stray space from the email, and a silent failure on an
                   invisible character is a maddening thing to debug. */
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) verify(); }}
                placeholder="000000"
                className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3.5 text-center font-display text-[24px] font-bold tracking-[0.4em] text-ink outline-none transition placeholder:text-ink-faint/40 focus:border-accent/50"
              />
            </label>

            {error && (
              <p className="mt-4 rounded-xl bg-bad/12 px-4 py-3 text-[13px] font-medium text-bad">{error}</p>
            )}

            <button
              onClick={verify}
              disabled={code.length !== 6 || busy}
              className="zs-glow mt-5 h-12 w-full rounded-full bg-accent text-[14px] font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Checking…" : "Verify and sign in"}
            </button>

            <div className="mt-5 text-center">
              {resentAt ? (
                <p className="text-[12px] text-ok">A new code is on its way.</p>
              ) : (
                <button
                  onClick={() => sendCode(true)}
                  disabled={busy}
                  className="text-[12px] font-semibold text-ink-muted transition hover:text-ink disabled:opacity-40"
                >
                  Didn't get it? Send another code
                </button>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
