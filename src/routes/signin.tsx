import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, Loader2, Mail, ShieldCheck } from "lucide-react";
import { IconClubs, IconNotes, IconWallet } from "@/components/icons";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/signin")({
  component: SignInPage,
  validateSearch: (search: Record<string, unknown>): { ref?: string; club?: string } => ({
    ref: (search.ref as string) || undefined,
    club: (search.club as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign In - Zero Club" },
      { name: "description", content: "Sign in to your Zero Club account to access bootcamps and your builder feed." },
      { property: "og:image", content: "/logo.png" },
    ],
  }),
});

const proofItems = [
  { label: "Builder feed", value: "Proof from people doing the work", Icon: IconNotes },
  { label: "Focused clubs", value: "Private rooms for learning and shipping", Icon: IconClubs },
  { label: "Wallet ready", value: "Keep earnings and payments close", Icon: IconWallet },
];

function SignInPage() {
  const router = useRouter();
  const { ref, club } = useSearch({ from: "/signin" });
  const [email, setEmail] = useState(() => localStorage.getItem("signin_email") || "");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "code">(() => (localStorage.getItem("signin_step") as "email" | "code") || "email");
  const [code, setCode] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const searchParams = new URLSearchParams(window.location.search);
      const isAddingAccount = searchParams.get("add_account") === "true";

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
    localStorage.setItem("signin_email", email);
  }, [email]);

  useEffect(() => {
    localStorage.setItem("signin_step", step);
  }, [step]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setStep("code");
      toast.success("Confirmation code sent. Check your email.");
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
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
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;

      if (!data.session) {
        toast.error("Session missing after verification. Are you registered?");
        setLoading(false);
        return;
      }

      toast.success("Welcome back.");
      localStorage.removeItem("signin_email");
      localStorage.removeItem("signin_step");

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
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[42vh] bg-[radial-gradient(circle_at_24%_18%,rgba(204,32,143,0.16),transparent_34%),radial-gradient(circle_at_78%_8%,rgba(143,88,73,0.14),transparent_30%)]" />

      <header className="relative z-20 mx-auto flex h-[calc(68px+env(safe-area-inset-top))] w-full max-w-6xl items-center justify-between px-5 pt-[env(safe-area-inset-top)] lg:px-8">
        <Link
          to="/"
          className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white/75 shadow-sm backdrop-blur-xl transition hover:bg-white active:scale-[0.98]"
          aria-label="Back to home"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        </Link>
        <Link
          to="/signup"
          search={{ ref, club }}
          className="rounded-xl border border-black/10 bg-white/75 px-4 py-2 text-sm font-medium text-[#171417] shadow-sm backdrop-blur-xl transition hover:bg-white active:scale-[0.98]"
        >
          Create account
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-68px)] w-full max-w-6xl grid-cols-1 gap-8 px-5 pb-10 pt-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:px-8 lg:pb-14">
        <section className="mx-auto w-full max-w-[460px]">
          <div className="mb-8">
            <Link to="/" className="mb-8 inline-flex items-center gap-3">
              <img src="/logo.png" alt="Zero Club" className="h-10 w-auto object-contain" />
              <span className="font-display text-xl font-medium">Zero Club</span>
            </Link>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#cc208f]/18 bg-[#cc208f]/8 px-3 py-1 text-[12px] font-medium text-[#9d176d]">
              <ShieldCheck className="h-4 w-4" strokeWidth={1.8} />
              Passwordless secure access
            </p>
            <h1 className="font-display text-[42px] font-normal leading-[1.08] text-[#241f23] sm:text-[52px]">
              Return to your proof of work.
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-7 text-[#6d6269]">
              Sign in with a one-time email code and continue from your feed, clubs, bootcamps, wallet, and profile.
            </p>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white/88 p-5 shadow-[0_24px_70px_-38px_rgba(23,20,23,0.45)] backdrop-blur-2xl sm:p-6">
            {step === "email" ? (
              <form onSubmit={handleSendCode} className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-normal text-[#241f23]">Sign in</h2>
                  <p className="mt-1 text-sm leading-6 text-[#746970]">We will send a short confirmation code.</p>
                </div>

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

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#cc208f] text-sm font-medium text-white shadow-[0_18px_36px_-20px_rgba(204,32,143,0.8)] transition hover:bg-[#ad1b79] active:scale-[0.99] disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Send code <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-normal text-[#241f23]">Enter the code</h2>
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
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Verify code <ArrowRight className="h-4 w-4" /></>}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={handleSendCode} disabled={loading} className="rounded-xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm font-medium text-[#5a5056] transition hover:bg-white">
                    Resend code
                  </button>
                  <button type="button" onClick={() => { setStep("email"); setCode(""); }} className="rounded-xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm font-medium text-[#5a5056] transition hover:bg-white">
                    Change email
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        <section className="hidden lg:block">
          <div className="relative overflow-hidden rounded-[28px] bg-[#181217] p-7 text-white shadow-[0_34px_90px_-44px_rgba(24,18,23,0.9)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_12%,rgba(204,32,143,0.34),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.12),transparent_38%)]" />
            <div className="relative">
              <div className="mb-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/12">
                    <img src="/logo.png" alt="" className="h-7 w-auto object-contain" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Zero Club</p>
                    <p className="text-xs text-white/55">Builder operating system</p>
                  </div>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 ring-1 ring-white/12">Live account</span>
              </div>

              <div className="max-w-md">
                <p className="text-sm font-medium text-[#f2a8dc]">Your work, made visible</p>
                <h2 className="mt-4 font-display text-[46px] font-normal leading-[1.08]">
                  Every login returns you to momentum.
                </h2>
                <p className="mt-5 text-[15px] leading-7 text-white/64">
                  Keep your profile, learning, conversations, and earnings in one focused social layer.
                </p>
              </div>

              <div className="mt-12 grid gap-3">
                {proofItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-4 rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-xl">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#cc208f]/18 text-[#f2a8dc] ring-1 ring-[#cc208f]/20">
                      <item.Icon className="h-6 w-6" active />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="mt-0.5 text-xs leading-5 text-white/55">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
