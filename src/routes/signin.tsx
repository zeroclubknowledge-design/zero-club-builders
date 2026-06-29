import { createFileRoute, Link, redirect, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronLeft, Loader2, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
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

function SignInPage() {
  const router = useRouter();
  const { ref, club } = useSearch({ from: "/signin" });
  const [email, setEmail] = useState(() => localStorage.getItem("signin_email") || "");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "code">(() => (localStorage.getItem("signin_step") as "email" | "code") || "email");
  const [code, setCode] = useState("");

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
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;

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

  const featureLines = ["Ship faster with clubs and bootcamps", "Track profile signal, XP, and network", "Access your builder feed instantly"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_12%,rgba(204,32,143,0.18),transparent_30%),radial-gradient(circle_at_80%_86%,rgba(245,185,75,0.16),transparent_30%)]" />

      <header className="fixed left-0 right-0 top-0 z-50 flex h-[calc(64px+env(safe-area-inset-top))] items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/70 backdrop-blur-xl transition active:scale-95" aria-label="Back to home">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <Link to="/signup" search={{ ref, club }} className="rounded-full border border-border/50 bg-background/70 px-4 py-2 text-xs font-black text-foreground backdrop-blur-xl transition active:scale-95">
          Create account
        </Link>
      </header>

      <main className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 gap-8 px-5 pb-10 pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pt-16">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-border/50 bg-card/70 px-4 py-2 backdrop-blur-xl">
              <img src="/logo.png" alt="Zero Club" className="h-7 w-auto object-contain" />
              <span className="text-sm font-black">Zero Club</span>
            </div>
            <h1 className="font-display text-6xl font-black leading-[0.95] tracking-tight">
              Come back to the place builders compound.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
              Your ships, clubs, bootcamps, wallet, and network are waiting behind a quick email code.
            </p>
            <div className="mt-10 grid gap-3">
              {featureLines.map((line) => (
                <div key={line} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/55 px-4 py-3 backdrop-blur-xl">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm font-bold text-foreground/85">{line}</span>
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
            <h1 className="font-display text-4xl font-black leading-none tracking-tight">Welcome back</h1>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/82 shadow-[0_24px_80px_rgba(0,0,0,0.16)] backdrop-blur-2xl">
            <div className="border-b border-border/40 bg-background/35 px-6 py-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                Secure access
              </div>
              <h2 className="mt-4 font-display text-3xl font-black tracking-tight">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter your email and we will send a one-time code.</p>
            </div>

            <div className="p-6">
              {step === "email" ? (
                <form onSubmit={handleSendCode} className="space-y-5">
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

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-black text-white shadow-glow transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Send code <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-5">
                  <label className="block space-y-2">
                    <span className="ml-1 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Confirmation code</span>
                    <span className="relative block">
                      <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="000000"
                        maxLength={10}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        className="h-14 w-full rounded-xl border border-border bg-background/70 px-4 pl-12 text-center text-lg font-black tracking-[0.45em] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
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
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Verify code <ArrowRight className="h-4 w-4" /></>}
                  </button>

                  <button type="button" onClick={() => { setStep("email"); setCode(""); }} className="w-full py-2 text-sm font-black text-muted-foreground transition hover:text-foreground">
                    Use a different email
                  </button>
                </form>
              )}

              <div className="mt-6 flex items-center gap-2 rounded-xl border border-border/35 bg-background/45 px-4 py-3 text-xs font-bold text-muted-foreground">
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                No password to remember. Just your inbox and a fresh code.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
