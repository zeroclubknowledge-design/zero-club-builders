import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { ArrowRight, ChevronLeft, Gift, Loader2, Mail, ShieldCheck, User } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { usePublicTheme } from "@/hooks/usePublicTheme";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { OtpInput, ResendRow } from "@/components/auth/OtpInput";
import { startGoogleAuthentication } from "@/lib/googleAuth";
import { isTrustedEmail, isUntrustedEmailError, suggestEmailFix, UNTRUSTED_EMAIL_MESSAGE } from "@/lib/trustedEmail";

export const Route = createFileRoute("/signup")({
  component: SignUpPage,
  validateSearch: (search: Record<string, unknown>): { ref?: string; club?: string; c?: string } => ({
    ref: (search.ref as string) || undefined,
    club: (search.club as string) || undefined,
    // A Zero Ambassador's campaign code (ZeroStart). Kept until the new
    // member's first signed-in visit, where it is credited to the ambassador.
    c: typeof search.c === "string" && /^[A-Za-z0-9]{4,12}$/.test(search.c) ? search.c.toUpperCase() : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Join Zero Club - Start Building" },
      { name: "description", content: "Join the builder ecosystem. Learn, ship, and earn rewards." },
    ],
  }),
});

const proofPoints = [
  "Create a profile that shows real progress",
  "Join clubs, bootcamps, and focused learning rooms",
  "Turn public work into network and opportunity",
];

function SignUpPage() {
  // Adopts the theme chosen on the landing page.
  usePublicTheme();
  const router = useRouter();
  const { ref, club, c: campaignCode } = useSearch({ from: "/signup" });

  useEffect(() => {
    if (!campaignCode) return;
    try {
      localStorage.setItem("zs_campaign_code", campaignCode);
    } catch {
      /* Without storage the signup simply isn't credited to a campaign. */
    }
  }, [campaignCode]);
  const [username, setUsername] = useState(() => localStorage.getItem("signup_username") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("signup_email") || "");
  const [referralCode, setReferralCode] = useState(() => localStorage.getItem("signup_ref") || ref || "");
  const [step, setStep] = useState<"info" | "code">(() => (localStorage.getItem("signup_step") as "info" | "code") || "info");
  const [code, setCode] = useState("");
  const codeFormRef = useRef<HTMLFormElement>(null);

  // The app's tinted body background showed as a strip under this page
  // whenever the phone's address bar resized the viewport. Match it here.
  useEffect(() => {
    document.documentElement.classList.add("zc-auth-page");
    return () => document.documentElement.classList.remove("zc-auth-page");
  }, []);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(() => localStorage.getItem("signup_terms") === "true");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const isAddingAccount = new URLSearchParams(window.location.search).get("add_account") === "true";
      if (session && !isAddingAccount) {
        router.navigate({
          to: "/app",
          search: {
            club: club || "",
            ref: ref || "",
          },
        });
      }
    });
  }, [router, club, ref]);

  useEffect(() => {
    localStorage.setItem("signup_username", username);
  }, [username]);

  useEffect(() => {
    localStorage.setItem("signup_email", email);
  }, [email]);

  useEffect(() => {
    localStorage.setItem("signup_ref", referralCode);
  }, [referralCode]);

  useEffect(() => {
    localStorage.setItem("signup_step", step);
  }, [step]);

  useEffect(() => {
    localStorage.setItem("signup_terms", agreedToTerms ? "true" : "false");
  }, [agreedToTerms]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !email) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (!agreedToTerms) {
      toast.error("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    if (username.length < 3) {
      toast.error("Username must be at least 3 characters.");
      return;
    }

    setLoading(true);
    try {
      // Temporary / unknown email services are refused (enforced in the database too).
      if (!(await isTrustedEmail(email))) {
        const fix = suggestEmailFix(email);
        toast.error(fix ? `Did you mean ${fix}?` : "This email provider isn't accepted", {
          description: fix ? "That address looks mistyped. Check it and try again." : UNTRUSTED_EMAIL_MESSAGE,
        });
        setLoading(false);
        return;
      }

      const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, "");

      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", cleanUsername)
        .maybeSingle();

      if (existingUser) {
        toast.error("That username is already taken. Please choose another one.");
        setLoading(false);
        return;
      }

      if (referralCode) {
        const { data: existingRef } = await supabase
          .from("profiles")
          .select("id")
          .eq("referral_code", referralCode)
          .maybeSingle();

        if (!existingRef) {
          toast.error("That referral code is invalid.");
          setLoading(false);
          return;
        }
      }

      const metadata: any = {
        username: cleanUsername,
        full_name: username,
      };

      if (referralCode) {
        metadata.referral_code_used = referralCode;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: metadata,
          shouldCreateUser: true,
        },
      });

      if (error) {
        if (isUntrustedEmailError(error.message)) toast.error("This email provider isn't accepted", { description: UNTRUSTED_EMAIL_MESSAGE });
        else toast.error(`Sign Up Error: ${error.message}`);
      } else {
        setStep("code");
        toast.success("Confirmation code sent. Check your email.");
      }
    } catch (err: any) {
      toast.error(`Connection Error: ${err.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length < 6) {
      toast.error("Please enter the confirmation code.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;

      toast.success("Welcome to Zero Club.");
      localStorage.removeItem("signup_email");
      localStorage.removeItem("signup_step");
      localStorage.removeItem("signup_username");
      localStorage.removeItem("signup_ref");

      router.navigate({
        to: "/app",
        search: {
          club: club || "",
          ref: ref || "",
        },
      });
    } catch (err: any) {
      toast.error(`Invalid code: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    if (!agreedToTerms) {
      toast.error("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    setGoogleLoading(true);
    try {
      if (referralCode) {
        const { data: existingRef } = await supabase
          .from("profiles")
          .select("id")
          .eq("referral_code", referralCode)
          .maybeSingle();

        if (!existingRef) {
          toast.error("That referral code is invalid.");
          setGoogleLoading(false);
          return;
        }
      }

      const search = new URLSearchParams();
      if (club) search.set("club", club);
      if (ref) search.set("ref", ref);
      const query = search.toString();
      const destination = `/app${query ? `?${query}` : ""}`;
      const error = await startGoogleAuthentication({
        destination,
        signupContext: {
          referralCode: referralCode || undefined,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || "Google signup could not be started");
      setGoogleLoading(false);
    }
  };

  return (
    /* Same split container as signin, so the two pages are one flow rather
       than two designs. The panel carries the numbered steps from the
       reference; on a phone it does not render at all and the form is the
       whole screen. */
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-[#f8f6f1] px-4 py-4 text-[#171417] dark:bg-[#0b0a0d] dark:text-white sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between pb-4">
        {/* Home, not sign in. The arrow beside a page's title reads as "leave
            this flow", and the flow someone is leaving here is signing up —
            sending them to sign in instead was answering a question they had
            not asked. Sign in is still one tap away on the right. */}
        <Link
          to="/"
          className="grid h-10 w-10 place-items-center rounded-xl bg-black/[0.04] text-[#5a5056] ring-1 ring-black/10 transition hover:bg-black/[0.07] active:scale-[0.98] dark:bg-white/[0.06] dark:text-white/80 dark:ring-white/10 dark:hover:bg-white/10"
          aria-label="Back to home"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        </Link>
        <Link
          to="/signin"
          className="rounded-xl bg-black/[0.04] px-4 py-2 text-sm font-medium text-[#5a5056] ring-1 ring-black/10 transition hover:bg-black/[0.07] active:scale-[0.98] dark:bg-white/[0.06] dark:text-white/80 dark:ring-white/10 dark:hover:bg-white/10"
        >
          Sign in
        </Link>
      </div>

      <main className="zc-glow-card mx-auto grid w-full flex-1 content-start lg:flex-none lg:content-normal max-w-[1180px] overflow-hidden rounded-[26px] bg-white dark:bg-[#100c11] lg:grid-cols-[1fr_minmax(430px,480px)]">
        <section className="relative hidden overflow-hidden rounded-[20px] bg-[#0a070a] p-8 lg:m-3 lg:flex lg:flex-col xl:p-10">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 20%, rgba(255,61,176,0.85) 0%, rgba(204,32,143,0.45) 26%, rgba(94,12,64,0.28) 48%, rgba(10,7,10,0.96) 74%)",
            }}
          />
          <div aria-hidden className="zc-grain absolute inset-0 opacity-[0.14]" />

          <div className="relative max-w-md">
            <p className="text-sm font-medium text-[#f2a8dc]">Join the network</p>
            <h2 className="mt-3 font-display text-[34px] font-normal leading-[1.08] text-white xl:text-[38px]">
              Build a profile people can trust.
            </h2>
            <p className="mt-4 text-[14px] leading-6 text-white/60">
              Start with your identity, then connect every post, bootcamp, club, and shipped project to one public record.
            </p>
          </div>

          {/* The numbered steps from the reference. The current step is lit and
              the rest are quiet, so the panel doubles as a progress indicator
              rather than being decoration next to the form. */}
          <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { n: 1, label: "Create your account", done: true },
              { n: 2, label: "Confirm your email", done: step === "code" },
              { n: 3, label: "Set up your experience", done: false },
            ].map((item) => (
              <div
                key={item.n}
                className={`zc-notch p-4 ${
                  item.done ? "bg-white/[0.10] ring-1 ring-[#cc208f]/30" : "bg-black/30 ring-1 ring-white/10"
                }`}
              >
                <span className={`zc-node h-7 w-7 text-[12px] font-semibold ${item.done ? "is-done" : ""}`}>
                  {item.n}
                </span>
                <p className="mt-3 text-[13px] font-medium leading-5 text-white">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="relative mt-6 grid gap-2">
            {proofPoints.map((point) => (
              <div key={point} className="rounded-xl bg-black/30 px-3.5 py-2.5 text-[12.5px] text-white/70 ring-1 ring-white/8">
                {point}
              </div>
            ))}
          </div>

          <div className="relative mt-auto pt-8 text-center">
            <img
              decoding="async"
              src="/logo.png"
              alt=""
              className="mx-auto h-10 w-10 object-contain drop-shadow-[0_0_26px_rgba(204,32,143,0.7)]"
            />
            <p className="mt-3 font-display text-[19px] font-medium tracking-tight text-white">Zero Club</p>
            <p className="mt-1 text-[12.5px] text-white/55">Social proof for builders.</p>
          </div>
        </section>

        <section className="px-5 py-8 sm:px-8 sm:py-10 lg:px-9">
          <div className="mx-auto w-full max-w-[420px]">
          {/* Heading and its supporting line removed at request. The panel
              beside this already says what the page is, and the form's own
              "Create account" heading says what to do — so on a phone the
              screen now opens on the form rather than on two more paragraphs
              about it. */}
          <div className="mb-6 text-center">
            <Link to="/" className="mx-auto mb-3 flex w-fit items-center gap-3 lg:hidden">
              <img decoding="async" src="/logo.png" alt="Zero Club" className="h-9 w-auto object-contain lg:h-10" />
              <span className="font-display text-xl font-medium text-[#171417] dark:text-white">Zero Club</span>
            </Link>
            {/* Its own line, and a size smaller, so it sits centred under the
                logo instead of wrapping beside it on narrow phones. */}
            <p className="zc-eyebrow mx-auto flex w-fit !gap-1 !px-2.5 !py-[3px] !text-[9.5px] !tracking-[0.1em]">
              <ShieldCheck className="h-3 w-3 shrink-0" strokeWidth={2} />
              One code, no password
            </p>
          </div>

          {/* The lit edge from the landing page, so the create-account card is
              recognisably part of the same product. */}
          <div className="rounded-xl bg-transparent">
            {step === "info" ? (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-normal text-[#241f23] dark:text-white">Create account</h2>
                  <p className="mt-1 text-sm leading-6 text-[#746970] dark:text-white/55">One account to learn, teach and run communities — you'll choose where to start next.</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block min-w-0 space-y-2">
                    <span className="text-[12px] font-medium text-[#5a5056] dark:text-white/60">Username</span>
                    <span className="relative block">
                      <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d7279] dark:text-white/50" strokeWidth={1.7} />
                      <input
                        type="text"
                        placeholder="adabuilds"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="h-12 w-full min-w-0 rounded-xl border border-black/10 bg-[#fbfaf7] dark:border-white/12 dark:bg-white/[0.04] px-4 pl-11 text-[15px] font-normal text-[#171417] outline-none dark:text-white transition placeholder:text-[#9b9297] dark:placeholder:text-white/35 focus:border-[#cc208f]/45 focus:bg-white dark:focus:bg-white/[0.07] focus:ring-4 focus:ring-[#cc208f]/10"
                      />
                    </span>
                  </label>

                  <label className="block min-w-0 space-y-2">
                    <span className="text-[12px] font-medium text-[#5a5056] dark:text-white/60">Email address</span>
                    <span className="relative block">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d7279] dark:text-white/50" strokeWidth={1.7} />
                      <input
                        type="email"
                        placeholder="ada@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-12 w-full min-w-0 rounded-xl border border-black/10 bg-[#fbfaf7] dark:border-white/12 dark:bg-white/[0.04] px-4 pl-11 text-[15px] font-normal text-[#171417] outline-none dark:text-white transition placeholder:text-[#9b9297] dark:placeholder:text-white/35 focus:border-[#cc208f]/45 focus:bg-white dark:focus:bg-white/[0.07] focus:ring-4 focus:ring-[#cc208f]/10"
                      />
                    </span>
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-[#5a5056] dark:text-white/60">Referral code <span className="text-[#9b9297] dark:text-white/40">optional</span></span>
                  <span className="relative block">
                    <Gift className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d7279] dark:text-white/50" strokeWidth={1.7} />
                    <input
                      type="text"
                      placeholder="Enter referral code"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      className={`h-12 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-4 pl-11 pr-20 dark:border-white/12 dark:bg-white/[0.04] text-[15px] font-normal text-[#171417] outline-none dark:text-white transition placeholder:text-[#9b9297] dark:placeholder:text-white/35 focus:border-[#cc208f]/45 focus:bg-white dark:focus:bg-white/[0.07] focus:ring-4 focus:ring-[#cc208f]/10 ${referralCode ? "border-[#cc208f]/35" : "border-black/10 dark:border-white/12"}`}
                    />
                    {referralCode && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[#9d176d]">Applied</span>}
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-black/10 bg-[#fbfaf7] dark:border-white/12 dark:bg-white/[0.04] px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-black/20 accent-[#cc208f] dark:border-white/25"
                  />
                  <span className="text-xs leading-5 text-[#746970] dark:text-white/55">
                    I agree to the <span className="font-medium text-[#241f23] underline dark:text-white">Terms of Service</span> and <span className="font-medium text-[#241f23] underline dark:text-white">Privacy Policy</span>.
                  </span>
                </label>

                <GoogleAuthButton label="Sign up with Google" loading={googleLoading} disabled={loading} onClick={handleGoogleSignUp} />

                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-black/10 dark:bg-white/12" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#8c8187] dark:text-white/40">or use email</span>
                  <span className="h-px flex-1 bg-black/10 dark:bg-white/12" />
                </div>

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#cc208f] text-sm font-medium text-white shadow-[0_18px_36px_-20px_rgba(204,32,143,0.8)] transition hover:bg-[#ad1b79] active:scale-[0.99] disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Continue <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>
            ) : (
              <form ref={codeFormRef} onSubmit={handleVerifyCode} className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-normal text-[#241f23] dark:text-white">Verify email</h2>
                  <p className="mt-1 text-sm leading-6 text-[#746970] dark:text-white/55">
                    Sent to <span className="font-medium text-[#241f23] dark:text-white">{email}</span>.
                  </p>
                </div>
                <OtpInput
                  value={code}
                  onChange={setCode}
                  disabled={loading}
                  // Verifies the moment the last digit lands, like banking apps do.
                  onComplete={() => requestAnimationFrame(() => codeFormRef.current?.requestSubmit())}
                />

                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#cc208f] text-sm font-medium text-white shadow-[0_18px_36px_-20px_rgba(204,32,143,0.8)] transition hover:bg-[#ad1b79] active:scale-[0.99] disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Complete signup <ArrowRight className="h-4 w-4" /></>}
                </button>
                <ResendRow
                  disabled={loading}
                  onResend={() => handleSendCode({ preventDefault() {} } as any)}
                  onChangeEmail={() => { setStep("info"); setCode(""); }}
                  changeLabel="Go back"
                />
              </form>
            )}
          </div>
            {/* Quiet reassurance under the form: how access works, and where the rules live. */}
            <p className="mt-8 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[11.5px] leading-5 text-[#8c8187] dark:text-white/40">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              Secured with one-time email codes · No passwords stored ·
              <Link to="/docs" className="underline-offset-4 hover:text-[#241f23] hover:underline dark:hover:text-white">Terms &amp; Privacy</Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
