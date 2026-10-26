import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, BriefcaseBusiness, Loader2, Mail, ShieldCheck } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { OtpInput, ResendRow } from "@/components/auth/OtpInput";
import { getDeviceId } from "@/lib/device";
import { isUntrustedEmailError } from "@/lib/trustedEmail";
import { BusinessAuthShell, BusinessFormMark, businessInput, businessLabel, businessMuted, businessPrimary, businessStrong, businessTopLink } from "@/features/business/BusinessAuthShell";

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
    <BusinessAuthShell topRight={<Link to={"/business/signin" as never} className={businessTopLink}>Sign in</Link>}>
      <div className="mx-auto w-full max-w-[400px]">
        {step === "info" ? (
          <form onSubmit={sendCode} className="space-y-5">
            <div className="mb-6 text-center">
              <BusinessFormMark />
              <p className="zc-eyebrow mb-3"><BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" /> Business account</p>
              <h1 className={`font-display text-[26px] font-normal leading-tight sm:text-[30px] ${businessStrong}`}>Bring your organization to Zero Club.</h1>
              <p className={`mx-auto mt-2 max-w-[340px] text-[13px] leading-6 ${businessMuted}`}>Use a work email. This is separate from your personal Zero Club account.</p>
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
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-[#9b9297] dark:text-white/40">@</span>
                <input
                  id="handle"
                  value={handle}
                  onChange={(e) => { setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")); setHandleEdited(true); }}
                  placeholder="acmelabs"
                  className={`${businessInput} pl-8`}
                />
              </div>
              <p className={`mt-1 text-[11.5px] ${businessMuted}`}>Your page lives at zeroclubs.xyz/@{cleanHandle || "handle"}</p>
            </div>
            <div>
              <label className={businessLabel} htmlFor="email">Work email</label>
              <span className="relative block">
                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d7279] dark:text-white/50" strokeWidth={1.7} />
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@acmelabs.com" autoComplete="email" className={`${businessInput} pl-11`} />
              </span>
            </div>
            <label className={`flex items-start gap-2.5 text-[12.5px] leading-5 ${businessMuted}`}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#c3217e]" />
              <span>I'm authorized to create this account for my organization and agree to the <Link to="/terms" className={`font-medium underline-offset-4 hover:underline ${businessStrong}`}>Terms</Link> and <Link to="/privacy" className={`font-medium underline-offset-4 hover:underline ${businessStrong}`}>Privacy Policy</Link>.</span>
            </label>
            <button type="submit" disabled={loading} className={businessPrimary}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Continue <ArrowRight className="h-4 w-4" /></>}
            </button>
            <p className={`text-center text-[13px] ${businessMuted}`}>
              Have one already? <Link to={"/business/signin" as never} className={`font-semibold underline-offset-4 hover:underline ${businessStrong}`}>Sign in</Link>
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
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Create account <ArrowRight className="h-4 w-4" /></>}
            </button>
            <ResendRow disabled={loading} onResend={async () => { await sendCode(); }} onChangeEmail={() => { setStep("info"); setCode(""); }} />
          </form>
        )}
        <p className={`mt-8 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[11.5px] leading-5 ${businessMuted}`}>
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          Secured with one-time email codes · No passwords stored
        </p>
      </div>
    </BusinessAuthShell>
  );
}
