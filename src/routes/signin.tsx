import { createFileRoute, Link, redirect, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, Loader2, Mail, ShieldCheck, GraduationCap, TrendingUp, Newspaper } from "lucide-react";
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
      const searchParams = new URLSearchParams(window.location.search);
      const isAddingAccount = searchParams.get('add_account') === 'true';
      
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

  const featureLines = [
    { text: "Ship faster with clubs and bootcamps", Icon: GraduationCap },
    { text: "Track profile signal, XP, and network", Icon: TrendingUp },
    { text: "Access your builder feed instantly", Icon: Newspaper },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_12%,rgba(204,32,143,0.10),transparent_30%)]" />

      <header className="fixed left-0 right-0 top-0 z-50 flex h-[calc(64px+env(safe-area-inset-top))] items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/70 backdrop-blur-xl transition active:scale-95" aria-label="Back to home">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <Link to="/signup" search={{ ref, club }} className="rounded-full border border-border/50 bg-background/70 px-4 py-2 text-sm font-semibold text-foreground backdrop-blur-xl transition active:scale-95">
          Create account
        </Link>
      </header>

      <main className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 gap-8 px-5 pb-10 pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pt-16">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-border/50 bg-card/70 px-4 py-2 backdrop-blur-xl">
              <img src="/logo.png" alt="Zero Club" className="h-7 w-auto object-contain" />
              <span className="text-sm font-semibold">Zero Club</span>
            </div>
            <h1 className="font-display text-[56px] font-normal leading-[1.05] tracking-[-0.04em] text-[#8f5849]">
              Come back to the place builders compound.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
              Your ships, clubs, bootcamps, wallet, and network are waiting behind a quick email code.
            </p>
            <div className="mt-10 grid gap-3">
              {featureLines.map((line) => (
                <div key={line.text} className="flex items-center gap-3 rounded-xl ring-1 ring-border bg-card/55 px-4 py-3 backdrop-blur-xl">
                  <line.Icon className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={1.75} />
                  <span className="text-sm font-medium text-foreground/85">{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="mb-5 flex items-center gap-3">
              <img src="/logo.png" alt="Zero Club" className="h-10 w-auto object-contain" />
              <span className="font-display text-xl font-semibold tracking-tight">Zero Club</span>
            </div>
            <h1 className="font-display text-4xl font-normal leading-tight tracking-[-0.035em] text-[#8f5849]">Welcome back</h1>
          </div>

          <div className="overflow-hidden rounded-3xl ring-1 ring-border bg-card shadow-lift">
            <div className="border-b hairline bg-background/35 px-6 py-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 ring-1 ring-primary/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                Secure access
              </div>
              <h2 className="mt-4 font-display text-3xl font-normal tracking-[-0.03em]">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter your email and we will send a one-time code.</p>
            </div>

            <div className="p-6">
              {step === "email" ? (
                <form onSubmit={handleSendCode} className="space-y-5">
                  <label className="block space-y-2">
                    <span className="ml-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Email address</span>
                    <span className="relative block">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                      <input
                        type="email"
                        placeholder="ada@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-14 w-full rounded-2xl ring-1 ring-border bg-background/70 px-4 pl-12 text-[15px] font-medium outline-none transition focus:ring-2 focus:ring-primary/40"
                      />
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-sm font-semibold text-white shadow-[0_10px_28px_rgba(204,32,143,0.22)] transition hover:bg-[#a71973] active:scale-[0.98] disabled:opacity-60"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Send code <ArrowRight className="h-4 w-4" /></>}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-5">
                  <label className="block space-y-2">
                    <span className="ml-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Confirmation code</span>
                    <span className="relative block">
                      <input
                        type="text"
                        placeholder="000000"
                        maxLength={10}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        className="h-14 w-full rounded-2xl ring-1 ring-border bg-background/70 px-4 text-center text-lg font-semibold tracking-[0.38em] tabular-nums outline-none transition focus:ring-2 focus:ring-primary/40"
                      />
                    </span>
                  </label>

                  <p className="text-sm leading-6 text-muted-foreground">
                    Sent to <span className="font-semibold text-foreground">{email}</span>.
                  </p>

                  <button
                    type="submit"
                    disabled={loading || code.length < 6}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-sm font-semibold text-white shadow-[0_10px_28px_rgba(204,32,143,0.22)] transition hover:bg-[#a71973] active:scale-[0.98] disabled:opacity-60"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Verify code <ArrowRight className="h-4 w-4" /></>}
                  </button>

                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={handleSendCode} disabled={loading} className="w-full py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
                      Resend code
                    </button>
                    <button type="button" onClick={() => { setStep("email"); setCode(""); }} className="w-full py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
                      Use a different email
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
