import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, Gift, Loader2, Mail, ShieldCheck, User } from "@/components/icons/solar";
import { IconInstitution, IconPresentation, IconProfile } from "@/components/icons/nav";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { usePublicTheme } from "@/hooks/usePublicTheme";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { startGoogleAuthentication } from "@/lib/googleAuth";

export const Route = createFileRoute("/signup")({
  component: SignUpPage,
  validateSearch: (search: Record<string, unknown>): { ref?: string; club?: string } => ({
    ref: (search.ref as string) || undefined,
    club: (search.club as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Join Zero Club - Start Building" },
      { name: "description", content: "Join the builder ecosystem. Learn, ship, and earn rewards." },
      { property: "og:image", content: "/logo.png" },
    ],
  }),
});

const accountTypeOptions = [
  { id: "Learner", label: "Learner", helper: "Build proof", Icon: IconProfile },
  { id: "Tutor", label: "Tutor", helper: "Teach live", Icon: IconPresentation },
  { id: "Institution", label: "Institution", helper: "Run cohorts", Icon: IconInstitution },
] as const;

const proofPoints = [
  "Create a profile that shows real progress",
  "Join clubs, bootcamps, and focused learning rooms",
  "Turn public work into network and opportunity",
];

function SignUpPage() {
  // Adopts the theme chosen on the landing page.
  usePublicTheme();
  const router = useRouter();
  const { ref, club } = useSearch({ from: "/signup" });
  const [username, setUsername] = useState(() => localStorage.getItem("signup_username") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("signup_email") || "");
  const [referralCode, setReferralCode] = useState(() => localStorage.getItem("signup_ref") || ref || "");
  const [step, setStep] = useState<"info" | "code">(() => (localStorage.getItem("signup_step") as "info" | "code") || "info");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(() => localStorage.getItem("signup_terms") === "true");
  const [accountType, setAccountType] = useState<"Learner" | "Tutor" | "Institution">(() => (localStorage.getItem("signup_account_type") as "Learner" | "Tutor" | "Institution") || "Learner");

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

  useEffect(() => {
    localStorage.setItem("signup_account_type", accountType);
  }, [accountType]);

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
        account_type: accountType,
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
        toast.error(`Sign Up Error: ${error.message}`);
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
          accountType,
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
    <div className="min-h-dvh overflow-x-hidden bg-[#0b0a0d] px-4 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between pb-4">
        <Link
          to="/signin"
          className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-white/80 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98]"
          aria-label="Back to sign in"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        </Link>
        <Link
          to="/signin"
          className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white/80 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98]"
        >
          Sign in
        </Link>
      </div>

      <main className="zc-glow-card mx-auto grid w-full max-w-[1180px] overflow-hidden rounded-[26px] bg-[#100c11] lg:grid-cols-[1fr_minmax(430px,480px)]">
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
          <div className="relative mt-8 grid gap-3 sm:grid-cols-2">
            {[
              { n: 1, label: "Create your account", done: true },
              { n: 2, label: "Confirm your email", done: step === "code" },
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
            <Link to="/" className="mx-auto mb-4 inline-flex items-center gap-3 lg:hidden">
              <img decoding="async" src="/logo.png" alt="Zero Club" className="h-9 w-auto object-contain lg:h-10" />
              <span className="font-display text-xl font-medium text-white">Zero Club</span>
            </Link>
            <p className="zc-eyebrow mx-auto">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              One code, no password
            </p>
          </div>

          {/* The lit edge from the landing page, so the create-account card is
              recognisably part of the same product. */}
          <div className="rounded-xl bg-transparent">
            {step === "info" ? (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-normal text-white">Create account</h2>
                  <p className="mt-1 text-sm leading-6 text-white/55">Set up the identity attached to your proof.</p>
                </div>

                <div className="space-y-2">
                  <span className="text-[12px] font-medium text-white/60">Account type</span>
                  {/* Icons removed at request. The icon was also what set the
                      96px floor on these tiles, so without it they come down to
                      the height of their own text. */}
                  <div className="grid grid-cols-3 gap-2">
                    {accountTypeOptions.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setAccountType(role.id)}
                        className={`rounded-lg border p-2.5 text-left transition ${
                          accountType === role.id
                            ? "border-[#cc208f]/55 bg-[#cc208f]/12 text-white ring-2 ring-[#cc208f]/20"
                            : "border-white/12 bg-white/[0.04] text-white/60 hover:bg-white/[0.07]"
                        }`}
                      >
                        <span className="block text-[12.5px] font-medium">{role.label}</span>
                        <span className="mt-0.5 block text-[10.5px] leading-4 text-white/50">{role.helper}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block min-w-0 space-y-2">
                    <span className="text-[12px] font-medium text-white/60">Username</span>
                    <span className="relative block">
                      <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" strokeWidth={1.7} />
                      <input
                        type="text"
                        placeholder="adabuilds"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="h-12 w-full min-w-0 rounded-xl border border-white/12 bg-white/[0.04] px-4 pl-11 text-[15px] font-normal text-white outline-none transition placeholder:text-white/35 focus:border-[#cc208f]/45 focus:bg-white/[0.07] focus:ring-4 focus:ring-[#cc208f]/10"
                      />
                    </span>
                  </label>

                  <label className="block min-w-0 space-y-2">
                    <span className="text-[12px] font-medium text-white/60">Email address</span>
                    <span className="relative block">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" strokeWidth={1.7} />
                      <input
                        type="email"
                        placeholder="ada@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-12 w-full min-w-0 rounded-xl border border-white/12 bg-white/[0.04] px-4 pl-11 text-[15px] font-normal text-white outline-none transition placeholder:text-white/35 focus:border-[#cc208f]/45 focus:bg-white/[0.07] focus:ring-4 focus:ring-[#cc208f]/10"
                      />
                    </span>
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-white/60">Referral code <span className="text-white/40">optional</span></span>
                  <span className="relative block">
                    <Gift className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" strokeWidth={1.7} />
                    <input
                      type="text"
                      placeholder="Enter referral code"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      className={`h-12 w-full rounded-lg border bg-white/[0.04] px-4 pl-11 pr-20 text-[15px] font-normal text-white outline-none transition placeholder:text-white/35 focus:border-[#cc208f]/45 focus:bg-white/[0.07] focus:ring-4 focus:ring-[#cc208f]/10 ${referralCode ? "border-[#cc208f]/35" : "border-white/12"}`}
                    />
                    {referralCode && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[#9d176d]">Applied</span>}
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-white/25 accent-[#cc208f]"
                  />
                  <span className="text-xs leading-5 text-white/55">
                    I agree to the <span className="font-medium text-white underline">Terms of Service</span> and <span className="font-medium text-white underline">Privacy Policy</span>.
                  </span>
                </label>

                <GoogleAuthButton label="Sign up with Google" loading={googleLoading} disabled={loading} onClick={handleGoogleSignUp} />

                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-white/12" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">or use email</span>
                  <span className="h-px flex-1 bg-white/12" />
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
              <form onSubmit={handleVerifyCode} className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-normal text-white">Verify email</h2>
                  <p className="mt-1 text-sm leading-6 text-white/55">
                    Sent to <span className="font-medium text-white">{email}</span>.
                  </p>
                </div>

                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-white/60">Confirmation code</span>
                  <input
                    type="text"
                    placeholder="000000"
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="h-12 w-full rounded-lg border border-white/12 bg-white/[0.04] px-4 text-center text-lg font-medium tracking-[0.28em] text-white outline-none transition placeholder:text-white/35 focus:border-[#cc208f]/45 focus:bg-white/[0.07] focus:ring-4 focus:ring-[#cc208f]/10"
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#cc208f] text-sm font-medium text-white shadow-[0_18px_36px_-20px_rgba(204,32,143,0.8)] transition hover:bg-[#ad1b79] active:scale-[0.99] disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Complete signup <ArrowRight className="h-4 w-4" /></>}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={handleSendCode} disabled={loading} className="rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/10">
                    Resend code
                  </button>
                  <button type="button" onClick={() => { setStep("info"); setCode(""); }} className="rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/10">
                    Go back
                  </button>
                </div>
              </form>
            )}
          </div>
          </div>
        </section>
      </main>
    </div>
  );
}
