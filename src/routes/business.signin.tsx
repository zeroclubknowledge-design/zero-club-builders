import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2, Mail, ShieldCheck } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { OtpInput, ResendRow } from "@/components/auth/OtpInput";
import { BusinessAuthShell, BusinessFormMark, businessInput, businessLabel, businessMuted, businessPrimary, businessStrong, businessTopLink } from "@/features/business/BusinessAuthShell";

export const Route = createFileRoute("/business/signin")({
  component: BusinessSignIn,
  head: () => ({ meta: [{ title: "Business sign in — Zero Club" }] }),
});

function BusinessSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem("biz_signin_email") || ""; } catch { return ""; }
  });
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const codeFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try { localStorage.setItem("biz_signin_email", email); } catch { /* storage off */ }
  }, [email]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const adding = new URLSearchParams(window.location.search).get("add_account") === "true";
      if (session && !adding) router.navigate({ to: "/app" });
    });
  }, [router]);

  const sendCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!email.trim()) return toast.error("Enter your work email.");
    setLoading(true);
    try {
      // Sign in only — never creates an account.
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
      if (error) {
        if (/signups? not allowed|not found/i.test(error.message || "")) {
          toast.error("No Zero Club account uses that email", {
            description: "Check the address, or create a business account.",
            action: { label: "Create", onClick: () => router.navigate({ to: "/business/signup" as never }) },
          });
          return;
        }
        throw error;
      }
      setStep("code");
      toast.success("We sent a code to your email.");
    } catch (error: any) {
      toast.error(error?.message || "Could not send the code");
    } finally {
      setLoading(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length < 6) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
      if (error) throw error;
      const { data: me } = await supabase.from("profiles").select("account_kind, business_mode, business_onboarded_at").eq("id", data.user!.id).maybeSingle();
      try { localStorage.removeItem("biz_signin_email"); } catch { /* storage off */ }
      const row = me as any;
      if (row?.account_kind !== "business") {
        toast.message("That's a personal account", { description: "You're signed in to your personal Zero Club." });
        router.navigate({ to: "/app" });
        return;
      }
      toast.success("Welcome back.");
      if (!row.business_onboarded_at) router.navigate({ to: "/business/welcome" as never });
      else router.navigate({ to: (row.business_mode === "institutional" ? "/app/institution-studio" : "/app/business") as never });
    } catch (error: any) {
      toast.error(`Invalid code: ${error?.message || "try again"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <BusinessAuthShell topRight={<Link to={"/business/signup" as never} className={businessTopLink}>Create account</Link>}>
      <div className="mx-auto w-full max-w-[400px]">
        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-5">
            <div className="mb-6 text-center">
              <BusinessFormMark />
              <p className="zc-eyebrow mb-3"><ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} /> Business sign in</p>
              <h1 className={`font-display text-[26px] font-normal leading-tight sm:text-[30px] ${businessStrong}`}>Back to your organization.</h1>
              <p className={`mx-auto mt-2 max-w-[340px] text-[13px] leading-6 ${businessMuted}`}>Sign in with a one-time code sent to your work email. No passwords.</p>
            </div>
            <div>
              <label className={businessLabel} htmlFor="email">Work email</label>
              <span className="relative block">
                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d7279] dark:text-white/50" strokeWidth={1.7} />
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@acmelabs.com" autoComplete="email" className={`${businessInput} pl-11`} />
              </span>
            </div>
            <button type="submit" disabled={loading} className={businessPrimary}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Send code <ArrowRight className="h-4 w-4" /></>}
            </button>
            <p className={`text-center text-[13px] ${businessMuted}`}>
              New here? <Link to={"/business/signup" as never} className={`font-semibold underline-offset-4 hover:underline ${businessStrong}`}>Create a business account</Link>
            </p>
            <p className={`text-center text-[12.5px] ${businessMuted}`}>
              Looking for your personal account? <Link to="/signin" className="font-medium text-[#c3217e] underline-offset-4 hover:underline">Personal sign in</Link>
            </p>
          </form>
        ) : (
          <form ref={codeFormRef} onSubmit={verify} className="space-y-5">
            <div className="text-center">
              <BusinessFormMark />
              <h1 className={`font-display text-2xl font-normal ${businessStrong}`}>Enter the code</h1>
              <p className={`mt-1 text-sm leading-6 ${businessMuted}`}>Sent to <span className={`font-medium ${businessStrong}`}>{email}</span>.</p>
            </div>
            <OtpInput value={code} onChange={setCode} disabled={loading} onComplete={() => requestAnimationFrame(() => codeFormRef.current?.requestSubmit())} />
            <button type="submit" disabled={loading || code.length < 6} className={businessPrimary}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
            </button>
            <ResendRow disabled={loading} onResend={async () => { await sendCode(); }} onChangeEmail={() => { setStep("email"); setCode(""); }} />
          </form>
        )}
        <p className={`mt-8 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[11.5px] leading-5 ${businessMuted}`}>
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          Secured with one-time email codes · No passwords stored ·
          <Link to="/terms" className="underline-offset-4 hover:underline">Terms</Link>{" & "}<Link to="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
        </p>
      </div>
    </BusinessAuthShell>
  );
}
