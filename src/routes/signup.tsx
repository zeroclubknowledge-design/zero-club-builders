import { createFileRoute, Link, redirect, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Box, CheckCircle2, ChevronLeft, Gift, Loader2, Lock, Mail, ShieldCheck, Sparkles, User } from "lucide-react";
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

  const perks = ["Claim your builder profile", "Join clubs and bootcamps", "Earn XP when you ship"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_14%_10%,rgba(204,32,143,0.18),transparent_30%),radial-gradient(circle_at_84%_84%,rgba(245,185,75,0.16),transparent_32%)]" />

      <header className="fixed left-0 right-0 top-0 z-50 flex h-[calc(64px+env(safe-area-inset-top))] items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <Link to="/signin" className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/70 backdrop-blur-xl transition active:scale-95" aria-label="Back to sign in">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <Link to="/signin" className="rounded-full border border-border/50 bg-background/70 px-4 py-2 text-xs font-black text-foreground backdrop-blur-xl transition active:scale-95">
          Sign in
        </Link>
      </header>

      <main className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 gap-8 px-5 pb-10 pt-24 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-8 lg:pt-16">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-border/50 bg-card/70 px-4 py-2 backdrop-blur-xl">
              <img src="/logo.png" alt="Zero Club" className="h-7 w-auto object-contain" />
              <span className="text-sm font-black">Zero Club</span>
            </div>
            <h1 className="font-display text-6xl font-black leading-[0.95] tracking-tight">
              Build your profile like a product people remember.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
              Start with a clean identity, then turn your posts, ships, clubs, and network into public proof.
            </p>
            <div className="mt-10 grid gap-3">
              {perks.map((perk) => (
                <div key={perk} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/55 px-4 py-3 backdrop-blur-xl">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm font-bold text-foreground/85">{perk}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="mb-5 flex items-center gap-3">
              <img src="/logo.png" alt="Zero Club" className="h-10 w-auto object-contain" />
              <span className="font-display text-xl font-black tracking-tight">Zero Club</span>
            </div>
            <h1 className="font-display text-4xl font-black leading-none tracking-tight">Create account</h1>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/82 shadow-[0_24px_80px_rgba(0,0,0,0.16)] backdrop-blur-2xl">
            <div className="border-b border-border/40 bg-background/35 px-6 py-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                <Box className="h-3.5 w-3.5" />
                Builder access
              </div>
              <h2 className="mt-4 font-display text-3xl font-black tracking-tight">{step === "info" ? "Join Zero Club" : "Verify email"}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {step === "info" ? "Create your handle, add an email, and enter with a secure code." : "Enter the code we sent to finish your account."}
              </p>
            </div>

            <div className="p-6">
              {step === "info" ? (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <label className="block space-y-2">
                    <span className="ml-1 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Username</span>
                    <span className="relative block">
                      <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="adabuilds"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="h-14 w-full rounded-xl border border-border bg-background/70 px-4 pl-12 text-[15px] font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                      />
                    </span>
                  </label>

                  <label className="block space-y-2">
                    <span className="ml-1 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Email address</span>
                    <span className="relative block">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        placeholder="ada@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-14 w-full rounded-xl border border-border bg-background/70 px-4 pl-12 text-[15px] font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                      />
                    </span>
                  </label>

                  <label className="block space-y-2">
                    <span className="ml-1 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Referral code <span className="normal-case tracking-normal text-muted-foreground/60">optional</span></span>
                    <span className="relative block">
                      <Gift className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Enter referral code"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value)}
                        className={`h-14 w-full rounded-xl border bg-background/70 px-4 pl-12 pr-20 text-[15px] font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 ${referralCode ? "border-primary/50 bg-primary/5" : "border-border"}`}
                      />
                      {referralCode && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-[0.16em] text-primary">Applied</span>}
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-border/35 bg-background/45 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-border bg-card accent-primary"
                    />
                    <span className="text-xs leading-5 text-muted-foreground">
                      I agree to the <span className="font-black text-foreground underline">Terms of Service</span> and <span className="font-black text-foreground underline">Privacy Policy</span>.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-black text-white shadow-glow transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Continue <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-5">
                  <label className="block space-y-2">
                    <span className="ml-1 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Confirmation code</span>
                    <span className="relative block">
                      <input
                        type="text"
                        placeholder="000000"
                        maxLength={10}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        className="h-14 w-full rounded-xl border border-border bg-background/70 px-4 text-center text-lg font-black tracking-[0.45em] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                      />
                    </span>
                  </label>

                  <p className="text-sm leading-6 text-muted-foreground">
                    Sent to <span className="font-black text-foreground">{email}</span>.
                  </p>

                  <button
                    type="submit"
                    disabled={loading || code.length < 6}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-black text-white shadow-glow transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Complete signup <ArrowRight className="h-4 w-4" /></>}
                  </button>

                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={handleSendCode} disabled={loading} className="w-full py-2 text-sm font-black text-muted-foreground transition hover:text-foreground">
                      Resend code
                    </button>
                    <button type="button" onClick={() => { setStep("info"); setCode(""); }} className="w-full py-2 text-sm font-black text-muted-foreground transition hover:text-foreground">
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
