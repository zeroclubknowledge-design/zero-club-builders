import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, Gift, Loader2, Mail, ShieldCheck, User } from "lucide-react";
import { IconClubs, IconInstitution, IconPresentation, IconProfile } from "@/components/icons";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

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
  const router = useRouter();
  const { ref, club } = useSearch({ from: "/signup" });
  const [username, setUsername] = useState(() => localStorage.getItem("signup_username") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("signup_email") || "");
  const [referralCode, setReferralCode] = useState(() => localStorage.getItem("signup_ref") || ref || "");
  const [step, setStep] = useState<"info" | "code">(() => (localStorage.getItem("signup_step") as "info" | "code") || "info");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(() => localStorage.getItem("signup_terms") === "true");
  const [accountType, setAccountType] = useState<"Learner" | "Tutor" | "Institution">(() => (localStorage.getItem("signup_account_type") as "Learner" | "Tutor" | "Institution") || "Learner");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
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

  return (
    <div className="min-h-screen overflow-hidden bg-[#f8f6f1] text-[#171417]">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(23,20,23,0.045)_1px,transparent_1px),linear-gradient(rgba(23,20,23,0.035)_1px,transparent_1px)] bg-[size:56px_56px]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[42vh] bg-[radial-gradient(circle_at_22%_14%,rgba(204,32,143,0.16),transparent_35%),radial-gradient(circle_at_84%_8%,rgba(143,88,73,0.14),transparent_30%)]" />

      <header className="relative z-20 mx-auto flex h-[calc(68px+env(safe-area-inset-top))] w-full max-w-6xl items-center justify-between px-5 pt-[env(safe-area-inset-top)] lg:px-8">
        <Link
          to="/signin"
          className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white/75 shadow-sm backdrop-blur-xl transition hover:bg-white active:scale-[0.98]"
          aria-label="Back to sign in"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        </Link>
        <Link
          to="/signin"
          className="rounded-xl border border-black/10 bg-white/75 px-4 py-2 text-sm font-medium text-[#171417] shadow-sm backdrop-blur-xl transition hover:bg-white active:scale-[0.98]"
        >
          Sign in
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-68px)] w-full max-w-6xl grid-cols-1 gap-8 px-5 pb-10 pt-5 lg:grid-cols-[1.03fr_0.97fr] lg:items-center lg:px-8 lg:pb-14">
        <section className="hidden lg:block">
          <div className="relative overflow-hidden rounded-[28px] bg-[#181217] p-7 text-white shadow-[0_34px_90px_-44px_rgba(24,18,23,0.9)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(204,32,143,0.34),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.12),transparent_38%)]" />
            <div className="relative">
              <div className="mb-14 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/12">
                    <img src="/logo.png" alt="" className="h-7 w-auto object-contain" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Zero Club</p>
                    <p className="text-xs text-white/55">Social proof for builders</p>
                  </div>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 ring-1 ring-white/12">New profile</span>
              </div>

              <div className="max-w-md">
                <p className="text-sm font-medium text-[#f2a8dc]">Join the network</p>
                <h1 className="mt-4 font-display text-[48px] font-normal leading-[1.08]">
                  Build a profile people can trust.
                </h1>
                <p className="mt-5 text-[15px] leading-7 text-white/64">
                  Start with your identity, then connect every post, bootcamp, club, and shipped project to one public record.
                </p>
              </div>

              <div className="mt-12 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#cc208f]/18 text-[#f2a8dc] ring-1 ring-[#cc208f]/20">
                    <IconClubs className="h-6 w-6" active />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Your first layer</p>
                    <p className="text-xs text-white/55">Profile, clubs, learning, work</p>
                  </div>
                </div>
                <div className="grid gap-2">
                  {proofPoints.map((point) => (
                    <div key={point} className="rounded-xl bg-black/16 px-3 py-2 text-sm text-white/72">
                      {point}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[480px]">
          <div className="mb-8 text-center lg:text-left">
            <Link to="/" className="mx-auto mb-7 inline-flex items-center gap-3 lg:mx-0">
              <img src="/logo.png" alt="Zero Club" className="h-10 w-auto object-contain" />
              <span className="font-display text-xl font-medium">Zero Club</span>
            </Link>
            <p className="mx-auto mb-4 flex w-fit max-w-full items-center justify-center gap-2 rounded-full border border-[#cc208f]/18 bg-[#cc208f]/8 px-3 py-1.5 text-center text-[12px] font-medium leading-5 text-[#9d176d] lg:mx-0">
              <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              One code, no password
            </p>
            <h1 className="font-display text-[40px] font-normal leading-[1.08] text-[#241f23] sm:text-[50px]">
              Start your Zero Club profile.
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-[15px] leading-7 text-[#6d6269] lg:mx-0">
              Choose your account type, reserve your handle, and enter with a secure email code.
            </p>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white/88 p-5 shadow-[0_24px_70px_-38px_rgba(23,20,23,0.45)] backdrop-blur-2xl sm:p-6">
            {step === "info" ? (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-normal text-[#241f23]">Create account</h2>
                  <p className="mt-1 text-sm leading-6 text-[#746970]">Set up the identity attached to your proof.</p>
                </div>

                <div className="space-y-2">
                  <span className="text-[12px] font-medium text-[#5a5056]">Account type</span>
                  <div className="grid grid-cols-3 gap-2">
                    {accountTypeOptions.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setAccountType(role.id)}
                        className={`min-h-[96px] rounded-xl border p-3 text-left transition ${
                          accountType === role.id
                            ? "border-[#cc208f]/45 bg-[#cc208f]/9 text-[#9d176d] ring-4 ring-[#cc208f]/8"
                            : "border-black/10 bg-[#fbfaf7] text-[#655b61] hover:bg-white"
                        }`}
                      >
                        <role.Icon className="mb-3 h-6 w-6" active={accountType === role.id} />
                        <span className="block text-[13px] font-medium">{role.label}</span>
                        <span className="mt-0.5 block text-[11px] text-[#81767d]">{role.helper}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-[#5a5056]">Username</span>
                  <span className="relative block">
                    <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d7279]" strokeWidth={1.7} />
                    <input
                      type="text"
                      placeholder="adabuilds"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="h-14 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-4 pl-11 text-[15px] font-normal text-[#171417] outline-none transition placeholder:text-[#9b9297] focus:border-[#cc208f]/45 focus:bg-white focus:ring-4 focus:ring-[#cc208f]/10"
                    />
                  </span>
                </label>

                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-[#5a5056]">Email address</span>
                  <span className="relative block">
                    <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d7279]" strokeWidth={1.7} />
                    <input
                      type="email"
                      placeholder="ada@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-14 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-4 pl-11 text-[15px] font-normal text-[#171417] outline-none transition placeholder:text-[#9b9297] focus:border-[#cc208f]/45 focus:bg-white focus:ring-4 focus:ring-[#cc208f]/10"
                    />
                  </span>
                </label>

                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-[#5a5056]">Referral code <span className="text-[#9b9297]">optional</span></span>
                  <span className="relative block">
                    <Gift className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d7279]" strokeWidth={1.7} />
                    <input
                      type="text"
                      placeholder="Enter referral code"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      className={`h-14 w-full rounded-xl border bg-[#fbfaf7] px-4 pl-11 pr-20 text-[15px] font-normal text-[#171417] outline-none transition placeholder:text-[#9b9297] focus:border-[#cc208f]/45 focus:bg-white focus:ring-4 focus:ring-[#cc208f]/10 ${referralCode ? "border-[#cc208f]/35" : "border-black/10"}`}
                    />
                    {referralCode && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[#9d176d]">Applied</span>}
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-black/10 bg-[#fbfaf7] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-black/20 accent-[#cc208f]"
                  />
                  <span className="text-xs leading-5 text-[#746970]">
                    I agree to the <span className="font-medium text-[#241f23] underline">Terms of Service</span> and <span className="font-medium text-[#241f23] underline">Privacy Policy</span>.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#cc208f] text-sm font-medium text-white shadow-[0_18px_36px_-20px_rgba(204,32,143,0.8)] transition hover:bg-[#ad1b79] active:scale-[0.99] disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Continue <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-normal text-[#241f23]">Verify email</h2>
                  <p className="mt-1 text-sm leading-6 text-[#746970]">
                    Sent to <span className="font-medium text-[#241f23]">{email}</span>.
                  </p>
                </div>

                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-[#5a5056]">Confirmation code</span>
                  <input
                    type="text"
                    placeholder="000000"
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="h-14 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-4 text-center text-lg font-medium tracking-[0.28em] text-[#171417] outline-none transition placeholder:text-[#9b9297] focus:border-[#cc208f]/45 focus:bg-white focus:ring-4 focus:ring-[#cc208f]/10"
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#cc208f] text-sm font-medium text-white shadow-[0_18px_36px_-20px_rgba(204,32,143,0.8)] transition hover:bg-[#ad1b79] active:scale-[0.99] disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Complete signup <ArrowRight className="h-4 w-4" /></>}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={handleSendCode} disabled={loading} className="rounded-xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm font-medium text-[#5a5056] transition hover:bg-white">
                    Resend code
                  </button>
                  <button type="button" onClick={() => { setStep("info"); setCode(""); }} className="rounded-xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm font-medium text-[#5a5056] transition hover:bg-white">
                    Go back
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
