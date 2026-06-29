import { createFileRoute, Link, useRouter, useSearch, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowRight, Mail, Lock, ChevronLeft, Eye, EyeOff, Github, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/signin")({
  beforeLoad: async ({ search }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      throw redirect({
        to: "/app",
        search: {
          club: search.club || "",
          ref: search.ref || "",
        },
      });
    }
  },
  component: SignInPage,
  validateSearch: (search: Record<string, unknown>): { ref?: string; club?: string } => ({
    ref: (search.ref as string) || undefined,
    club: (search.club as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign In — Zero Club" },
      { name: "description", content: "Sign in to your Zero Club account to access bootcamps and your builder feed." },
      { property: "og:image", content: "/logo.png" },
    ]
  }),
});

function SignInPage() {
  const router = useRouter();
  const { ref, club } = useSearch({ from: "/signin" });
  const [email, setEmail] = useState(() => localStorage.getItem('signin_email') || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [step, setStep] = useState<'email' | 'code'>(() => (localStorage.getItem('signin_step') as 'email' | 'code') || 'email');
  const [code, setCode] = useState("");

  useEffect(() => {
    localStorage.setItem('signin_email', email);
  }, [email]);

  useEffect(() => {
    localStorage.setItem('signin_step', step);
  }, [step]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.navigate({ 
          to: "/app", 
          search: { 
            club: club || "",
            ref: ref || ""
          } 
        });
      } else {
        setCheckingAuth(false);
      }
    });
  }, [router, club, ref]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
      setStep('code');
      toast.success("Confirmation code sent! Check your email.");
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
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw error;
      
      toast.success("Welcome back!");
      localStorage.removeItem('signin_email');
      localStorage.removeItem('signin_step');
      
      router.navigate({ 
        to: "/app", 
        search: { 
          club: club || "",
          ref: ref || ""
        } 
      });
    } catch (err: any) {
      toast.error(`Invalid code: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Fixed Header */}
      <header className="sticky top-0 z-50 flex items-center h-[calc(60px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] px-6 bg-background/95 backdrop-blur-md border-b border-border/50">
        <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/50 transition active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-md mx-auto">
          <div className="mb-8 space-y-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Zero Club Logo" className="h-10 w-auto object-contain" />
              <span className="font-display text-xl font-black tracking-tighter text-foreground">Zero Club</span>
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Welcome back</h1>
              <p className="text-muted-foreground leading-relaxed">
                Sign in to continue your builder journey and reach the next level.
              </p>
            </div>
          </div>

          {step === 'email' ? (
            <form onSubmit={handleSendCode} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold tracking-wider text-muted-foreground ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      placeholder="ada@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl border border-border bg-card/40 p-4 pl-12 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bold text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? "Sending Code…" : <> Send Code <ArrowRight className="h-4 w-4" /></>}
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-border" />
                <span className="mx-4 shrink-0 text-xs font-medium text-muted-foreground">or</span>
                <div className="flex-grow border-t border-border" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button type="button" className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/40 py-3 text-sm font-bold transition active:scale-[0.98] active:bg-accent/30">
                  <Github className="h-4 w-4" /> GitHub
                </button>
                <button type="button" className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/40 py-3 text-sm font-bold transition active:scale-[0.98] active:bg-accent/30">
                  <img src="https://www.google.com/favicon.ico" className="h-4 w-4 grayscale opacity-70" alt="" /> Google
                </button>
              </div>

              <div className="pt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <Link to="/signup" search={{ ref, club }} className="font-bold text-primary hover:underline">Sign Up</Link>
                </p>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold tracking-wider text-muted-foreground ml-1">Confirmation Code</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Enter confirmation code"
                      maxLength={10}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      className="w-full rounded-2xl border border-border bg-card/40 p-4 pl-12 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 tracking-[0.5em] text-center font-bold text-lg"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 ml-1">
                    We sent a code to <span className="text-foreground font-bold">{email}</span>.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bold text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? "Verifying…" : <> Verify Code <ArrowRight className="h-4 w-4" /></>}
              </button>

              <div className="pt-4 text-center">
                <button type="button" onClick={() => {
                  setStep('email');
                  setCode("");
                }} className="text-sm font-bold text-muted-foreground hover:text-foreground">
                  Use a different email
                </button>
              </div>
            </form>
          )}

        </div>
      </main>
    </div>
  );
}
