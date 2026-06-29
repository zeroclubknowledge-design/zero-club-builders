import { createFileRoute, Link, useRouter, useSearch, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowRight, User, Mail, Lock, ChevronLeft, Box, Eye, EyeOff, Gift, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
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
  component: SignUpPage,
  validateSearch: (search: Record<string, unknown>): { ref?: string; club?: string } => ({
    ref: (search.ref as string) || undefined,
    club: (search.club as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Join Zero Club — Start Building" },
      { name: "description", content: "Join the elite builder ecosystem. Learn, ship, and earn rewards." },
      { property: "og:image", content: "/logo.png" },
    ]
  }),
});

function SignUpPage() {
  const router = useRouter();
  const { ref, club } = useSearch({ from: "/signup" });
  const [username, setUsername] = useState(() => localStorage.getItem('signup_username') || "");
  const [email, setEmail] = useState(() => localStorage.getItem('signup_email') || "");
  const [referralCode, setReferralCode] = useState(() => localStorage.getItem('signup_ref') || ref || "");
  const [step, setStep] = useState<'info' | 'code'>(() => (localStorage.getItem('signup_step') as 'info' | 'code') || 'info');
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(() => localStorage.getItem('signup_terms') === 'true');
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    localStorage.setItem('signup_username', username);
  }, [username]);

  useEffect(() => {
    localStorage.setItem('signup_email', email);
  }, [email]);

  useEffect(() => {
    localStorage.setItem('signup_ref', referralCode);
  }, [referralCode]);

  useEffect(() => {
    localStorage.setItem('signup_step', step);
  }, [step]);

  useEffect(() => {
    localStorage.setItem('signup_terms', agreedToTerms ? 'true' : 'false');
  }, [agreedToTerms]);

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
    console.log("Sign up attempt started...", { username, email, agreedToTerms });

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
      
      // Pre-flight check: ensure username is unique
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (existingUser) {
        toast.error("That username is already taken. Please choose another one.");
        setLoading(false);
        return;
      }

      // Pre-flight check: ensure referral code is valid if provided
      if (referralCode) {
        const { data: existingRef } = await supabase
          .from('profiles')
          .select('id')
          .eq('referral_code', referralCode)
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

      console.log("Calling Supabase signInWithOtp for signup with metadata:", metadata);
      
      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: metadata,
          shouldCreateUser: true
        },
      });

      if (error) {
        console.error("Supabase signUp error details:", error);
        toast.error(`Sign Up Error: ${error.message}`);
      } else {
        console.log("Supabase OTP sent:", data);
        setStep('code');
        toast.success("Confirmation code sent! Check your email.");
      }
    } catch (err: any) {
      console.error("Unexpected error during signUp:", err);
      toast.error(`Connection Error: ${err.message || 'Unknown error'}`);
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
      
      toast.success("Welcome to Zero Club!");
      localStorage.removeItem('signup_email');
      localStorage.removeItem('signup_step');
      localStorage.removeItem('signup_username');
      localStorage.removeItem('signup_ref');
      
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
        <Link to="/signin" className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/50 transition active:scale-95">
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
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold tracking-wider text-primary">
                <Box className="h-3 w-3" /> Start your journey
              </div>
              <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">Create account</h1>
              <p className="text-muted-foreground leading-relaxed">
                Join the elite club of builders and start earning rewards for your skills.
              </p>
            </div>
          </div>

          {step === 'info' ? (
            <form onSubmit={handleSendCode} className="space-y-5">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-wider text-muted-foreground ml-1">Username</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="adabuilds"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full rounded-2xl border border-border bg-card/40 p-4 pl-12 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-wider text-muted-foreground ml-1">Email Address</label>
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

                {/* Referral Code */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-wider text-muted-foreground ml-1">
                    Referral Code <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <div className="relative">
                    <Gift className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Enter referral code"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      className={`w-full rounded-2xl border bg-card/40 p-4 pl-12 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 ${referralCode ?"border-primary/50 bg-primary/5" : "border-border"}`}
                    />
                    {referralCode && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary tracking-wider">APPLIED</span>
                    )}
                  </div>
                  {referralCode && (
                    <p className="text-[10px] text-primary/70 ml-1 flex items-center gap-1">
                      <Gift className="h-3 w-3" /> Referral code applied — you and your inviter earn bonus XP!
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 px-1 py-2">
                <input 
                  type="checkbox" 
                  id="terms" 
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border bg-card accent-primary" 
                />
                <label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed">
                  By creating an account, you agree to our <span className="font-bold text-foreground underline">Terms of Service</span> and <span className="font-bold text-foreground underline">Privacy Policy</span>.
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bold text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending Code…</> : <> Continue <ArrowRight className="h-4 w-4" /></>}
              </button>
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
                {loading ? "Verifying…" : <> Complete Signup <ArrowRight className="h-4 w-4" /></>}
              </button>

              <div className="pt-4 text-center">
                <button type="button" onClick={() => {
                  setStep('info');
                  setCode("");
                }} className="text-sm font-bold text-muted-foreground hover:text-foreground">
                  Go back
                </button>
              </div>
            </form>
          )}
        </div>
      </main>


      <footer className="px-6 py-6 text-center border-t border-border/50">
        <p className="text-sm text-muted-foreground">
          Already a builder?{" "}
          <Link to="/signin" className="font-bold text-primary">Sign In</Link>
        </p>
      </footer>
    </div>
  );
}
