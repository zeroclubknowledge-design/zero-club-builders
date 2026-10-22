import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Gift, Loader2, Mail, ShieldCheck, User } from "@/components/icons/glyphs";
import { OtpInput, ResendRow } from "@/components/auth/OtpInput";
import { supabase } from "@/lib/supabase";
import { config } from "@/lib/config";
import { getDeviceId, ONE_ACCOUNT_MESSAGES, oneAccountErrorMessage } from "@/lib/device";
import { isTrustedEmail, isUntrustedEmailError, suggestEmailFix, UNTRUSTED_EMAIL_MESSAGE } from "@/lib/trustedEmail";

/**
 * Create a Zero Club account, or sign in to one, without leaving this app.
 *
 * Same rules as Zero Club's own sign-up, because it is the same account:
 * one-time email codes (no passwords), trusted email providers only, one
 * account per person and device (signup_precheck + the auth.users triggers),
 * a unique username, and an optional referral code. The profile row is made
 * by Zero Club's handle_new_user trigger; `signup_source` records which Zero
 * product brought the person in.
 *
 * Used full-page (/signup, /signin) and inline — inside a gift claim or right
 * after someone submits a form — so nobody is bounced to another site.
 */
export function AuthPanel({
  initialMode = "signup",
  initialEmail = "",
  initialName = "",
  heading,
  subheading,
  onDone,
  compact = false,
}: {
  initialMode?: "signup" | "signin";
  initialEmail?: string;
  initialName?: string;
  heading?: string;
  subheading?: string;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<"signup" | "signin">(initialMode);
  const [step, setStep] = useState<"details" | "code">("details");
  const [email, setEmail] = useState(initialEmail);
  const [username, setUsername] = useState(() => initialName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20));
  const [referral, setReferral] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("ref") || localStorage.getItem("zero_signup_ref") || ""; } catch { return ""; }
  });
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (initialEmail) setEmail(initialEmail); }, [initialEmail]);
  useEffect(() => { try { if (referral) localStorage.setItem("zero_signup_ref", referral); } catch { /* blocked */ } }, [referral]);

  const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, "");
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSend = validEmail && (mode === "signin" || (cleanUsername.length >= 3 && agreed));

  const sendCode = async () => {
    if (!canSend || busy) return;
    setBusy(true);
    try {
      const address = email.trim();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false } });
        if (error) {
          if (/signups? not allowed|user not found|not found/i.test(error.message || "")) {
            toast.error("No Zero Club account uses that email", { description: "Check the address, or create a free account instead." });
            setMode("signup");
          } else toast.error(error.message);
          return;
        }
      } else {
        if (!(await isTrustedEmail(address))) {
          const fix = suggestEmailFix(address);
          toast.error(fix ? `Did you mean ${fix}?` : "This email provider isn't accepted", { description: fix ? "That address looks mistyped." : UNTRUSTED_EMAIL_MESSAGE });
          return;
        }
        const deviceId = getDeviceId();
        const { data: precheck } = await supabase.rpc("signup_precheck", { p_email: address, p_device: deviceId });
        if (precheck && (precheck as any).ok === false) {
          const say = ONE_ACCOUNT_MESSAGES[(precheck as any).reason as string];
          toast.error("You already have a Zero Club account", { description: say ? say((precheck as any).account) : "Each person can have one Zero Club account. Sign in instead." });
          setMode("signin");
          return;
        }
        const { data: taken } = await supabase.from("profiles").select("id").eq("username", cleanUsername).maybeSingle();
        if (taken) { toast.error("That username is taken. Try another one."); return; }
        const ref = referral.trim();
        if (ref) {
          const { data: refOwner } = await supabase.from("profiles").select("id").eq("referral_code", ref).maybeSingle();
          if (!refOwner) { toast.error("That referral code isn't valid. Remove it or check it."); return; }
        }
        const { error } = await supabase.auth.signInWithOtp({
          email: address,
          options: {
            shouldCreateUser: true,
            data: {
              username: cleanUsername,
              full_name: initialName.trim() || username,
              device_id: deviceId,
              signup_source: config.productKey,
              ...(ref ? { referral_code_used: ref } : {}),
            },
          },
        });
        if (error) {
          const oneAccount = oneAccountErrorMessage(error.message);
          if (oneAccount) toast.error("You already have a Zero Club account", { description: oneAccount });
          else if (isUntrustedEmailError(error.message)) toast.error("This email provider isn't accepted", { description: UNTRUSTED_EMAIL_MESSAGE });
          else toast.error(error.message);
          return;
        }
      }
      setCode("");
      setStep("code");
      toast.success(`Code sent to ${address}`);
    } catch (error: any) {
      toast.error(error?.message || "Couldn't send the code. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length < 6 || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: value, type: "email" });
      if (error) throw error;
      try { localStorage.removeItem("zero_signup_ref"); } catch { /* blocked */ }
      toast.success(mode === "signup" ? "Welcome to Zero Club" : "Signed in");
      onDone?.();
    } catch (error: any) {
      toast.error(`That code didn't work. ${error?.message || ""}`.trim());
    } finally {
      setBusy(false);
    }
  };

  const input = "h-12 w-full rounded-xl border border-border bg-background px-4 pl-11 text-[15px] outline-none transition placeholder:text-muted-foreground/70 focus:border-[#cc208f]/50 focus:ring-4 focus:ring-[#cc208f]/10";

  if (step === "code") {
    return (
      <div className={compact ? "" : "mx-auto w-full max-w-[420px]"}>
        <h2 className="font-display text-[22px] font-bold tracking-tight">Check your email</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
          Enter the 6-digit code we sent to <b className="text-foreground">{email.trim()}</b>.
        </p>
        <div className="mt-5">
          <OtpInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={busy} />
        </div>
        <button
          type="button"
          onClick={() => void verify()}
          disabled={code.length < 6 || busy}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[15px] font-semibold text-white shadow-[0_14px_30px_-14px_rgba(204,32,143,0.9)] transition hover:bg-[#b01c7b] disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {mode === "signup" ? "Create my account" : "Sign in"}
        </button>
        <div className="mt-4">
          <ResendRow onResend={sendCode} onChangeEmail={() => { setStep("details"); setCode(""); }} disabled={busy} />
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "" : "mx-auto w-full max-w-[420px]"}>
      <h2 className="font-display text-[22px] font-bold tracking-tight">
        {heading || (mode === "signup" ? "Create your free Zero Club account" : "Sign in to Zero Club")}
      </h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
        {subheading ||
          (mode === "signup"
            ? `One account for ${config.appName}, Zero Club and every Zero product. No password, just a code by email.`
            : "Use the email on your Zero Club account. We'll send you a code.")}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-foreground/[0.05] p-1" role="tablist">
        {(["signup", "signin"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`h-9 rounded-full text-[13px] font-semibold transition ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {m === "signup" ? "New here" : "I have an account"}
          </button>
        ))}
      </div>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode();
        }}
      >
        <label className="relative block">
          <span className="sr-only">Email</span>
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={input} />
        </label>
        {mode === "signup" && (
          <>
            <label className="relative block">
              <span className="sr-only">Username</span>
              <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").slice(0, 24))}
                autoComplete="username"
                placeholder="Choose a username"
                className={input}
              />
            </label>
            {cleanUsername && cleanUsername.length < 3 && <p className="px-1 text-[12px] text-muted-foreground">At least 3 letters or numbers.</p>}
            <label className="relative block">
              <span className="sr-only">Referral code</span>
              <Gift className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={referral} onChange={(e) => setReferral(e.target.value.trim().toUpperCase())} placeholder="Referral code (optional)" className={input} />
            </label>
            <label className="flex items-start gap-2.5 px-1 pt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#cc208f]" />
              <span>
                I agree to Zero Club's{" "}
                <a href={`${config.zeroClubUrl}/terms`} target="_blank" rel="noreferrer" className="font-semibold text-foreground underline">Terms</a> and{" "}
                <a href={`${config.zeroClubUrl}/privacy`} target="_blank" rel="noreferrer" className="font-semibold text-foreground underline">Privacy Policy</a>.
              </span>
            </label>
          </>
        )}
        <button
          type="submit"
          disabled={!canSend || busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[15px] font-semibold text-white shadow-[0_14px_30px_-14px_rgba(204,32,143,0.9)] transition hover:bg-[#b01c7b] disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} {mode === "signup" ? "Send my code" : "Send sign-in code"}
        </button>
      </form>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" /> One-time email codes · No passwords stored
      </p>
    </div>
  );
}
