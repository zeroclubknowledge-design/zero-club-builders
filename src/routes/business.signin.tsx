import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { OtpInput, ResendRow } from "@/components/auth/OtpInput";
import { BusinessAuthShell, businessInput, businessLabel, businessPrimary } from "@/features/business/BusinessAuthShell";

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
    <BusinessAuthShell
      topRight={
        <Link to={"/business/signup" as never} className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white/85 ring-1 ring-white/10 transition hover:bg-white/10">
          Create account
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-[400px]">
        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#ff5cc3]">Business account</p>
              <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em]">Sign in to your organization</h1>
              <p className="mt-1.5 text-[14px] leading-6 text-white/55">We'll email you a one-time code. No passwords.</p>
            </div>
            <div>
              <label className={businessLabel} htmlFor="email">Work email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@acmelabs.com" autoComplete="email" className={businessInput} />
            </div>
            <button type="submit" disabled={loading} className={businessPrimary}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Send code <ArrowRight className="h-4 w-4" /></>}
            </button>
            <p className="text-center text-[13px] text-white/50">
              New here? <Link to={"/business/signup" as never} className="font-semibold text-white underline-offset-4 hover:underline">Create a business account</Link>
            </p>
            <p className="text-center text-[12.5px] text-white/40">
              Looking for your personal account? <Link to="/signin" className="text-white/70 underline-offset-4 hover:underline">Personal sign in</Link>
            </p>
          </form>
        ) : (
          <form ref={codeFormRef} onSubmit={verify} className="space-y-5">
            <div>
              <h1 className="font-display text-[26px] font-semibold">Enter the code</h1>
              <p className="mt-1 text-[14px] text-white/55">Sent to <span className="font-medium text-white">{email}</span>.</p>
            </div>
            <OtpInput value={code} onChange={setCode} disabled={loading} onComplete={() => requestAnimationFrame(() => codeFormRef.current?.requestSubmit())} />
            <button type="submit" disabled={loading || code.length < 6} className={businessPrimary}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
            </button>
            <ResendRow disabled={loading} onResend={async () => { await sendCode(); }} onChangeEmail={() => { setStep("email"); setCode(""); }} />
          </form>
        )}
      </div>
    </BusinessAuthShell>
  );
}
