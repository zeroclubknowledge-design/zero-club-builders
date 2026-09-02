import { createFileRoute, Link, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronLeft, Loader2, Mail, ShieldCheck } from "@/components/icons/solar";
import { IconClubs, IconNotes, IconWallet } from "@/components/icons/nav";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { usePublicTheme } from "@/hooks/usePublicTheme";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { startGoogleAuthentication } from "@/lib/googleAuth";

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
  // Adopts the theme chosen on the landing page.
  usePublicTheme();
  const router = useRouter();
  const { ref, club } = useSearch({ from: "/signin" });
  const [email, setEmail] = useState(() => localStorage.getItem("signin_email") || "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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
      /*
       * Sign in, never sign up.
       *
       * signInWithOtp creates an account for an unknown address by default, so
       * this page was a second, silent registration route: type any email,
       * receive a code, and you were in — with no username, no profile, and no
       * agreement to anything. shouldCreateUser turns that off, and it is
       * enforced by the auth server rather than by a check here that a crafted
       * request could skip.
       */
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (error) {
        // Supabase words this as "Signups not allowed for otp", which reads as
        // a fault on our side rather than "we do not know this address".
        const unknown =
          /signups? not allowed|user not found|not found/i.test(error.message || "");
        if (unknown) {
          toast.error("No Zero Club account uses that email", {
            description: "Check the address, or create an account first.",
          });
          return;
        }
        throw error;
      }

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

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const search = new URLSearchParams();
      if (club) search.set("club", club);
      if (ref) search.set("ref", ref);
      const query = search.toString();
      const destination = `/app${query ? `?${query}` : ""}`;
      const error = await startGoogleAuthentication({ destination });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || "Google sign-in could not be started");
      setGoogleLoading(false);
    }
  };

  return (
    /* Rebuilt to the reference: one rounded container, split down the middle.
       A brand gradient panel carries the identity on the left, the form sits
       on the right, and the page around them is quiet. The previous version
       stacked a full marketing column above the form, which is what made it so
       tall on a phone — here the panel simply does not render below lg, and
       the form is the whole screen. */
    <div className="min-h-dvh bg-[#0b0a0d] px-4 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between pb-4">
        <Link
          to="/"
          className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-white/80 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98]"
          aria-label="Back to home"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        </Link>
        <Link
          to="/signup"
          search={{ ref, club }}
          className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-medium text-white/80 ring-1 ring-white/10 transition hover:bg-white/10 active:scale-[0.98]"
        >
          Create account
        </Link>
      </div>

      <main className="zc-glow-card mx-auto grid w-full max-w-[1120px] overflow-hidden rounded-[26px] bg-[#100c11] lg:grid-cols-2">
        {/* The identity panel. A single soft bloom of brand light falling to
            near-black at the edges, with the mark and the line that goes with
            it sitting at the bottom — exactly the shape of the reference. */}
        <section className="relative hidden overflow-hidden rounded-[20px] bg-[#0a070a] p-8 lg:m-3 lg:flex lg:flex-col">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 22%, rgba(255,61,176,0.85) 0%, rgba(204,32,143,0.45) 26%, rgba(94,12,64,0.28) 48%, rgba(10,7,10,0.96) 74%)",
            }}
          />
          <div aria-hidden className="zc-grain absolute inset-0 opacity-[0.14]" />

          {/* The copy that used to live in the old right-hand panel, kept
              word for word and rehoused here. */}
          <div className="relative">
            <p className="text-sm font-medium text-[#f2a8dc]">Your work, made visible</p>
            <h2 className="mt-3 font-display text-[34px] font-normal leading-[1.08] text-white">
              Every login returns you to momentum.
            </h2>
            <p className="mt-4 max-w-[340px] text-[14px] leading-6 text-white/60">
              Keep your profile, learning, conversations, and earnings in one focused social layer.
            </p>
          </div>

          <div className="relative mt-8 grid gap-2.5">
            {proofItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3.5 rounded-2xl bg-black/25 p-3.5 ring-1 ring-white/10 backdrop-blur-xl"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#cc208f]/25 text-[#f2a8dc] ring-1 ring-[#cc208f]/30">
                  <item.Icon className="h-5 w-5" active />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white">{item.label}</p>
                  <p className="mt-0.5 text-[11.5px] leading-5 text-white/55">{item.value}</p>
                </div>
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
            <p className="mt-1 text-[12.5px] text-white/55">The social network for builders.</p>
          </div>
        </section>

        {/* The form side. */}
        <section className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
          <div className="mx-auto w-full max-w-[400px]">
            <div className="mb-6 text-center">
              {/* The mark only shows here when the panel beside it is hidden,
                  so it is never on screen twice. */}
              <img
                decoding="async"
                src="/logo.png"
                alt="Zero Club"
                className="mx-auto mb-4 h-10 w-10 object-contain drop-shadow-[0_0_22px_rgba(204,32,143,0.6)] lg:hidden"
              />
              <p className="zc-eyebrow mb-3">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                Passwordless secure access
              </p>
              <h1 className="font-display text-[26px] font-normal leading-tight text-white sm:text-[30px]">
                Return to your proof of work.
              </h1>
              <p className="mx-auto mt-2 max-w-[340px] text-[13px] leading-6 text-white/50">
                Sign in with a one-time email code and continue from your feed, clubs, bootcamps, wallet, and profile.
              </p>
            </div>

          <div className="rounded-xl bg-transparent">
            {step === "email" ? (
              <form onSubmit={handleSendCode} className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-normal text-white">Sign in</h2>
                  <p className="mt-1 text-sm leading-6 text-white/55">We will send a short confirmation code.</p>
                </div>

                <GoogleAuthButton label="Continue with Google" loading={googleLoading} disabled={loading} onClick={handleGoogleSignIn} />

                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-white/12" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">or use email</span>
                  <span className="h-px flex-1 bg-white/12" />
                </div>

                <label className="block space-y-2">
                  <span className="text-[12px] font-medium text-white/60">Email address</span>
                  <span className="relative block">
                    <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" strokeWidth={1.7} />
                    <input
                      type="email"
                      placeholder="ada@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 w-full rounded-lg border border-white/12 bg-white/[0.04] px-4 pl-11 text-[15px] font-normal text-white outline-none transition placeholder:text-white/35 focus:border-[#cc208f]/45 focus:bg-white/[0.07] focus:ring-4 focus:ring-[#cc208f]/10"
                    />
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#cc208f] text-sm font-medium text-white shadow-[0_18px_36px_-20px_rgba(204,32,143,0.8)] transition hover:bg-[#ad1b79] active:scale-[0.99] disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending code</> : <>Send code <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-normal text-white">Enter the code</h2>
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
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying</> : <>Verify code <ArrowRight className="h-4 w-4" /></>}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={handleSendCode} disabled={loading} className="rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/10">
                    Resend code
                  </button>
                  <button type="button" onClick={() => { setStep("email"); setCode(""); }} className="rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/10">
                    Change email
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
