import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { OtpInput, ResendRow } from "@/components/auth/OtpInput";
import { getDeviceId } from "@/lib/device";
import { isUntrustedEmailError } from "@/lib/trustedEmail";
import { BusinessAuthShell, businessInput, businessLabel, businessPrimary } from "@/features/business/BusinessAuthShell";

export const Route = createFileRoute("/business/signup")({
  component: BusinessSignUp,
  head: () => ({ meta: [{ title: "Create a business account — Zero Club" }] }),
});

const STORE = "biz_signup";

function BusinessSignUp() {
  const router = useRouter();
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
  })();
  const [orgName, setOrgName] = useState<string>(saved.orgName || "");
  const [handle, setHandle] = useState<string>(saved.handle || "");
  const [handleEdited, setHandleEdited] = useState<boolean>(Boolean(saved.handle));
  const [email, setEmail] = useState<string>(saved.email || "");
  const [agreed, setAgreed] = useState<boolean>(Boolean(saved.agreed));
  const [step, setStep] = useState<"info" | "code">(saved.step === "code" ? "code" : "info");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const codeFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ orgName, handle, email, agreed, step })); } catch { /* storage off */ }
  }, [orgName, handle, email, agreed, step]);

  // Signed in already (and not adding another account): go straight in.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const adding = new URLSearchParams(window.location.search).get("add_account") === "true";
      if (session && !adding && step === "info") router.navigate({ to: "/app" });
    });
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestHandle = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  const cleanHandle = handle.toLowerCase().replace(/[^a-z0-9]/g, "");

  const sendCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!orgName.trim() || !cleanHandle || !email.trim()) return toast.error("Fill in your organization, handle and work email.");
    if (cleanHandle.length < 3) return toast.error("Your handle needs at least 3 letters or numbers.");
    if (!agreed) return toast.error("Please agree to the Terms and Privacy Policy.");
    setLoading(true);
    try {
      const { data: allowed } = await supabase.rpc("is_business_email_allowed" as never, { email: email.trim() } as never);
      if (allowed === false) {
        toast.error("Use your organization's email", { description: "Temporary and throwaway inboxes can't be used." });
        return;
      }
      const { data: pre } = await supabase.rpc("business_signup_precheck" as never, { p_email: email.trim() } as never);
      if ((pre as any)?.ok === false) {
        toast.error("That email already has a Zero Club account", {
          description: "Sign in with it, or use a different work email for your organization.",
          action: { label: "Sign in", onClick: () => router.navigate({ to: "/business/signin" as never }) },
        });
        return;
      }
      const { data: taken } = await supabase.from("profiles").select("id").eq("username", cleanHandle).maybeSingle();
      if (taken) return toast.error("That handle is taken. Try another one.");

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          data: { username: cleanHandle, full_name: orgName.trim(), account_kind: "business", device_id: getDeviceId() },
        },
      });
      if (error) {
        if (isUntrustedEmailError(error.message)) toast.error("Use your organization's email", { description: "Temporary and throwaway inboxes can't be used." });
        else if (/DUPLICATE_ACCOUNT/.test(error.message)) toast.error("That email already has a Zero Club account");
        else toast.error(error.message);
        return;
      }
      setStep("code");
      toast.success("We sent a code to your email.");
    } catch (error: any) {
      toast.error(error?.message || "Could not start sign up");
    } finally {
      setLoading(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length < 6) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
      if (error) throw error;
      try { localStorage.removeItem(STORE); } catch { /* storage off */ }
      toast.success(`Welcome, ${orgName.trim() || "team"}.`);
      router.navigate({ to: "/business/welcome" as never });
    } catch (error: any) {
      toast.error(`Invalid code: ${error?.message || "try again"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <BusinessAuthShell
      topRight={
        <Link to={"/business/signin" as never} className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white/85 ring-1 ring-white/10 transition hover:bg-white/10">
          Sign in
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-[400px]">
        {step === "info" ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#ff5cc3]">Business account</p>
              <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-[-0.02em]">Create your organization</h1>
              <p className="mt-1.5 text-[14px] leading-6 text-white/55">Use a work email. This is separate from your personal Zero Club account.</p>
            </div>
            <div>
              <label className={businessLabel} htmlFor="org">Organization name</label>
              <input
                id="org"
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  if (!handleEdited) setHandle(suggestHandle(e.target.value));
                }}
                placeholder="Acme Labs"
                autoComplete="organization"
                className={businessInput}
              />
            </div>
            <div>
              <label className={businessLabel} htmlFor="handle">Handle</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-white/40">@</span>
                <input
                  id="handle"
                  value={handle}
                  onChange={(e) => { setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")); setHandleEdited(true); }}
                  placeholder="acmelabs"
                  className={`${businessInput} pl-8`}
                />
              </div>
              <p className="mt-1 text-[11.5px] text-white/40">Your page lives at zeroclubs.xyz/@{cleanHandle || "handle"}</p>
            </div>
            <div>
              <label className={businessLabel} htmlFor="email">Work email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@acmelabs.com" autoComplete="email" className={businessInput} />
            </div>
            <label className="flex items-start gap-2.5 text-[13px] leading-5 text-white/60">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#cc208f]" />
              <span>I'm authorized to create this account for my organization and agree to the <Link to="/terms" className="text-white underline-offset-4 hover:underline">Terms</Link> and <Link to="/privacy" className="text-white underline-offset-4 hover:underline">Privacy Policy</Link>.</span>
            </label>
            <button type="submit" disabled={loading} className={businessPrimary}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Continue <ArrowRight className="h-4 w-4" /></>}
            </button>
            <p className="text-center text-[13px] text-white/50">
              Have one already? <Link to={"/business/signin" as never} className="font-semibold text-white underline-offset-4 hover:underline">Sign in</Link>
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
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Create account <ArrowRight className="h-4 w-4" /></>}
            </button>
            <ResendRow disabled={loading} onResend={async () => { await sendCode(); }} onChangeEmail={() => { setStep("info"); setCode(""); }} />
          </form>
        )}
      </div>
    </BusinessAuthShell>
  );
}
