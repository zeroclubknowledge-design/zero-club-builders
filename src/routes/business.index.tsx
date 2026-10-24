import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  ClipboardList,
  GraduationCap,
  LayoutGrid,
  Megaphone,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Trophy,
  Users,
  X,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { usePublicTheme } from "@/hooks/usePublicTheme";
import { useReveal } from "@/hooks/useReveal";
import { usePointerGlow } from "@/hooks/useLandingMotion";
import { BrandField } from "@/features/landing/HeroStage";
import { Spotlight } from "@/features/landing/LandingKit";

/*
 * Zero Club for Business — the organization side of Zero Club, built from the
 * same pieces as the main landing page (header, brand field hero, eyebrows,
 * glow cards, closing band, footer) so the two read as one product.
 */
export const Route = createFileRoute("/business/")({
  component: BusinessLanding,
  head: () => ({
    meta: [
      { title: "Zero Club for Business — hire builders, run tech hubs" },
      {
        name: "description",
        content:
          "One business account for your organization. Hire builders by their proof of work, sponsor challenges, train your team — or run a tech hub with bootcamps and tutors.",
      },
      { property: "og:title", content: "Zero Club for Business" },
      { property: "og:description", content: "Hire builders, sponsor challenges, train your team, or run a tech hub on Zero Club." },
    ],
  }),
});

const COMPANY_FEATURES = [
  { Icon: Search, title: "Hire by proof of work", body: "Search builders by what they've shipped, not what their CV says. Message them, post a role or a paid gig, and hire with escrow." },
  { Icon: Megaphone, title: "Sponsor & reach", body: "Put your brand on challenges, games and giveaways that learners actually take part in. Boost posts to the people you want to reach." },
  { Icon: GraduationCap, title: "Train your team", body: "Invite your staff, assign bootcamps that fit their roles and see who has enrolled and when each programme runs." },
  { Icon: Building2, title: "A company page", body: "Your logo, story, industry, open roles and posts on one public page people can follow." },
];

const HUB_FEATURES = [
  { Icon: LayoutGrid, title: "Bootcamps", body: "Publish programmes, run live classes and keep every bootcamp in one place." },
  { Icon: Users, title: "Tutors", body: "Bring your tutors in, assign them to bootcamps and follow their delivery." },
  { Icon: ClipboardList, title: "Admissions with Zero Form", body: "Pre-registration forms, early-bird pricing and seat limits, paid into your wallet." },
  { Icon: Trophy, title: "Outcomes", body: "Learner progress, attendance and analytics you can show to partners and funders." },
];

const STEPS = [
  { n: "01", title: "Create a business account", body: "Use your work email. It's separate from your personal Zero Club account." },
  { n: "02", title: "Set up your organization", body: "Name, logo, industry and what you want to do here — about two minutes." },
  { n: "03", title: "Switch modes any time", body: "Company and Institutional are one tap apart, like a person switching Learner and Tutor." },
];

const NAV = [
  { href: "#company", label: "For companies" },
  { href: "#hubs", label: "For tech hubs" },
  { href: "#how", label: "How it works" },
];

function useSignedInBusiness() {
  const [state, setState] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return alive && setState(false);
      const { data } = await supabase.from("profiles").select("account_kind").eq("id", session.user.id).maybeSingle();
      if (alive) setState((data as any)?.account_kind === "business");
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function BrandMark() {
  return (
    <Link to={"/business" as never} className="flex min-w-0 items-center gap-2" aria-label="Zero Club for Business">
      <img decoding="async" src="/logo.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
      <span className="hidden whitespace-nowrap font-display text-[19px] font-semibold tracking-tight text-[#171717] dark:text-white min-[420px]:inline">
        Zero <span className="text-[#cc208f]">Club</span>
      </span>
      <span className="shrink-0 rounded-full bg-[#171717] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white dark:bg-white dark:text-[#171717]">
        Business
      </span>
    </Link>
  );
}

function Header({ signedIn }: { signedIn: boolean }) {
  const { dark, toggle } = usePublicTheme();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow] duration-200 ${
          open || scrolled ? "bg-[#f4f2ef] shadow-[0_1px_0_rgba(23,23,23,0.06)] dark:bg-[#0f0d12] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)]" : "bg-transparent"
        }`}
      >
        <div className="flex h-[calc(4rem+env(safe-area-inset-top))] w-full items-end justify-between gap-2 px-4 pb-3 pt-[env(safe-area-inset-top)] md:px-6 lg:px-8">
          <BrandMark />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Business navigation">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#666a70] transition-colors hover:bg-[#171717]/[0.04] hover:text-[#171717] dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white">
                {n.label}
              </a>
            ))}
            <Link to="/" className="rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#666a70] transition-colors hover:bg-[#171717]/[0.04] hover:text-[#171717] dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white">
              Personal
            </Link>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              aria-pressed={dark}
              className="hidden h-10 w-10 place-items-center rounded-full text-[#4d4f55] transition-colors hover:bg-[#171717]/[0.04] dark:text-white/70 dark:hover:bg-white/10 min-[380px]:grid"
            >
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            {!signedIn && (
              <Link to={"/business/signin" as never} className="hidden rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#4d4f55] transition-colors hover:bg-[#171717]/[0.04] dark:text-white/70 dark:hover:bg-white/10 sm:inline-flex">
                Sign in
              </Link>
            )}
            <Link
              to={(signedIn ? "/app/business" : "/business/signup") as never}
              className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#171717] px-4 text-[12.5px] font-semibold tracking-tight text-white transition hover:opacity-90 active:scale-[0.97] dark:bg-white dark:text-[#171717] sm:h-10 sm:px-5 sm:text-[13.5px]"
            >
              {signedIn ? "Business Hub" : <><span className="sm:hidden">Get started</span><span className="hidden sm:inline">Create business account</span></>}
            </Link>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-[#303236] transition hover:bg-[#171717]/[0.04] dark:text-white dark:hover:bg-white/10 lg:hidden"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" strokeWidth={2.25} />}
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top))] z-40 overflow-y-auto overscroll-contain bg-[#f4f2ef] px-5 py-5 dark:bg-[#0f0d12] lg:hidden">
          <div className="mx-auto max-w-xl pb-10">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block py-3.5 font-display text-[28px] font-medium leading-none tracking-tight text-[#171417] dark:text-white">
                {n.label}
              </a>
            ))}
            <Link to="/" onClick={() => setOpen(false)} className="block py-3.5 font-display text-[28px] font-medium leading-none tracking-tight text-[#171417] dark:text-white">
              Personal Zero Club
            </Link>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <Link to={"/business/signin" as never} onClick={() => setOpen(false)} className="flex h-12 items-center justify-center rounded-lg border border-[#171717]/12 text-[13px] font-semibold text-[#242126] dark:border-white/12 dark:text-white">
                Sign in
              </Link>
              <Link to={"/business/signup" as never} onClick={() => setOpen(false)} className="flex h-12 items-center justify-center rounded-lg bg-[#171417] px-4 text-[13px] font-semibold text-white dark:bg-white dark:text-[#171417]">
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BusinessLanding() {
  const signedIn = Boolean(useSignedInBusiness());
  useReveal();
  usePointerGlow();
  const primaryTo = signedIn ? "/app/business" : "/business/signup";
  const primaryLabel = signedIn ? "Open Business Hub" : "Create a business account";

  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans text-[#171717] selection:bg-[#cc208f]/20 dark:bg-[#141118] dark:text-white">
      <Header signedIn={signedIn} />
      <main>
        {/* Hero — the same brand field as the main landing page. */}
        <section className="relative flex flex-col overflow-hidden bg-[#f4f2ef] text-[#171717] dark:bg-[#0b0a0d] dark:text-white">
          <BrandField />
          <div className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-col items-center px-4 pb-14 pt-[calc(4rem+2.5rem+env(safe-area-inset-top))] text-center md:px-8 md:pb-20">
            <h1 className="max-w-[900px] text-balance font-display text-[clamp(36px,8vw,84px)] font-semibold leading-[1.03] tracking-[-0.045em] animate-[zc-line_0.85s_cubic-bezier(0.22,1,0.36,1)_0.12s_both]">
              Where organizations meet the <span className="text-[#cc208f]">builders who ship.</span>
            </h1>
            <p className="mt-5 max-w-[min(600px,94%)] text-balance text-[clamp(15px,1.7vw,18px)] leading-[1.55] text-[#4d4f55] animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.28s_both] dark:text-white/70">
              One business account for your organization. Hire and train talent as a company, or run bootcamps as an institution — and switch between the two whenever you need.
            </p>
            <div className="mt-7 flex w-full flex-col items-stretch justify-center gap-3 animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.4s_both] sm:w-auto sm:flex-row sm:items-center">
              <Link
                to={primaryTo as never}
                className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#171717] px-7 text-[15px] font-semibold tracking-tight text-white shadow-[0_10px_30px_-12px_rgba(204,32,143,0.6)] transition hover:-translate-y-0.5 active:scale-[0.99] dark:bg-white dark:text-black dark:shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_0_26px_rgba(204,32,143,0.35)]"
              >
                {primaryLabel} <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold tracking-tight text-[#303236] ring-1 ring-[#171717]/15 transition hover:bg-white active:scale-[0.99] dark:text-white/85 dark:ring-white/20 dark:hover:bg-white/10"
              >
                How it works
              </a>
            </div>
            <p className="mt-4 text-[12.5px] text-[#666a70] dark:text-white/45">Free to start · Uses a work email · Separate from your personal account</p>

            <div className="mt-12 grid w-full max-w-[920px] gap-4 text-left sm:grid-cols-2">
              <ModeCard
                Icon={BriefcaseBusiness}
                tag="Company"
                title="A company or business owner"
                points={["Hire builders & post gigs", "Sponsor challenges and games", "Train your team", "Company page and posts"]}
                href="#company"
              />
              <ModeCard
                Icon={Building2}
                tag="Institutional"
                title="A tech hub or training institution"
                points={["Digital Hub for bootcamps", "Tutors and bootcamps", "Admissions with Zero Form", "Learner outcomes"]}
                href="#hubs"
                note="Reviewed by Zero Club"
              />
            </div>
          </div>
        </section>

        <div data-reveal>
          <Section id="company" tone="white" eyebrow="For companies" title="Hire, sponsor and train — with people who already build in public.">
            <div className="grid gap-4 sm:grid-cols-2">{COMPANY_FEATURES.map((f) => <Feature key={f.title} {...f} />)}</div>
          </Section>
        </div>

        <div data-reveal>
          <Section id="hubs" tone="warm" eyebrow="For tech hubs" title="Run your whole programme from one Digital Hub.">
            <div className="grid gap-4 sm:grid-cols-2">{HUB_FEATURES.map((f) => <Feature key={f.title} {...f} />)}</div>
            <div className="mt-6 flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#cc208f]/10"><ShieldCheck className="h-3.5 w-3.5 text-[#cc208f]" /></span>
              <p className="max-w-[720px] text-[15px] leading-relaxed text-[#4d4f55] dark:text-white/60">
                Institutional mode opens after Zero Club reviews your hub, so learners know every institution here is real. Meanwhile your account works in Company mode.
              </p>
            </div>
          </Section>
        </div>

        <div data-reveal>
          <Section id="how" tone="white" eyebrow="How it works" title="Set up in minutes. Switch modes in a tap.">
            <div className="grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <article key={s.n} className="zc-glow-card rounded-[22px] bg-white p-6 ring-1 ring-[#171717]/[0.08] dark:bg-[#141118] dark:ring-white/10">
                  <p className="font-display text-[13px] font-semibold tabular-nums text-[#cc208f]">{s.n}</p>
                  <h3 className="mt-3 text-[18px] font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[#666a70] dark:text-white/55">{s.body}</p>
                </article>
              ))}
            </div>
            <div className="mt-8 flex justify-center">
              <div className="inline-grid grid-cols-2 gap-1 rounded-full bg-[#171717]/[0.05] p-1 text-[13px] font-semibold dark:bg-white/[0.07]">
                <span className="rounded-full bg-white px-5 py-2 text-[#171717] shadow-sm dark:bg-white">Company</span>
                <span className="rounded-full px-5 py-2 text-[#666a70] dark:text-white/60">Institutional</span>
              </div>
            </div>
          </Section>
        </div>

        {/* Closing band — the main landing page's final call. */}
        <div data-reveal>
          <section className="bg-[#f4f2ef] px-4 py-12 dark:bg-[#0f0d12] md:px-6 md:py-16">
            <div className="mx-auto max-w-[1320px]">
              <div className="zc-glow-card relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#201924] via-[#151218] to-[#0e0c10] px-6 py-12 text-center md:px-16 md:py-16">
                <Spotlight />
                <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#cc208f]/25 blur-[100px]" />
                <div className="relative">
                  <BadgeCheck className="mx-auto h-11 w-11 text-[#ff86cd] drop-shadow-[0_0_28px_rgba(204,32,143,0.65)]" />
                  <h2 className="mx-auto mt-4 max-w-[680px] text-balance font-display text-[clamp(28px,5vw,52px)] font-semibold leading-[1.08] tracking-[-0.035em] text-white">
                    Bring your organization to Zero Club.
                  </h2>
                  <p className="mx-auto mt-4 max-w-[460px] text-[15px] leading-relaxed text-white/55">
                    Create the account, set up your page, and start with whatever matters most — hiring, sponsoring, training or teaching.
                  </p>
                  <Link
                    to={primaryTo as never}
                    className="mt-9 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-8 py-3.5 text-[15px] font-semibold tracking-tight text-[#171717] transition hover:opacity-90 active:scale-[0.98]"
                  >
                    {signedIn ? "Open Business Hub" : "Get started free"} <ArrowRight className="h-4 w-4" />
                  </Link>
                  {!signedIn && (
                    <p className="mt-4 text-[13px] text-white/50">
                      Already have one? <Link to={"/business/signin" as never} className="font-semibold text-white underline-offset-4 hover:underline">Sign in</Link>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="bg-[#f4f2ef] px-4 py-12 dark:bg-[#0f0d12] md:px-6">
        <div className="mx-auto max-w-[1320px]">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <BrandMark />
            <p className="text-[12px] text-[#666a70] dark:text-white/55">Where organizations meet builders.</p>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 pt-6">
            <p className="text-[12px] text-[#666a70] dark:text-white/55">Zero Club © {new Date().getFullYear()}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-[#666a70] dark:text-white/55">
              <Link to="/" className="hover:text-[#171717] dark:hover:text-white">Personal accounts</Link>
              <Link to={"/business/signin" as never} className="hover:text-[#171717] dark:hover:text-white">Business sign in</Link>
              <Link to="/privacy" className="hover:text-[#171717] dark:hover:text-white">Privacy</Link>
              <Link to="/terms" className="hover:text-[#171717] dark:hover:text-white">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ModeCard({ Icon, tag, title, points, href, note }: { Icon: any; tag: string; title: string; points: string[]; href: string; note?: string }) {
  return (
    <a href={href} className="zc-glow-card group block rounded-[22px] bg-white p-5 ring-1 ring-[#171717]/[0.08] transition hover:ring-[#cc208f]/40 dark:bg-[#141118] dark:ring-white/10 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#cc208f]/10 text-[#cc208f]"><Icon className="h-5 w-5" /></span>
        <span className="zc-eyebrow">{tag}</span>
      </div>
      <h3 className="mt-4 text-[18px] font-semibold tracking-tight text-[#171717] dark:text-white">{title}</h3>
      <ul className="mt-3 grid gap-2">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-2.5 text-[14px] text-[#4d4f55] dark:text-white/60">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#cc208f]/10"><Check className="h-3 w-3 text-[#cc208f]" strokeWidth={2.5} /></span>
            {p}
          </li>
        ))}
      </ul>
      {note && <p className="mt-3 text-[12px] font-medium text-[#666a70] dark:text-white/45">{note}</p>}
    </a>
  );
}

function Section({ id, tone, eyebrow, title, children }: { id: string; tone: "white" | "warm"; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-20 ${tone === "white" ? "bg-white dark:bg-[#141118]" : "bg-[#fbfaf8] dark:bg-[#16131a]"}`}>
      <div className="mx-auto max-w-[1320px] px-4 py-12 md:px-6 lg:py-20">
        <div className="max-w-[720px]">
          <p className="zc-eyebrow">{eyebrow}</p>
          <h2 className="mt-3 text-balance font-display text-[clamp(28px,5vw,42px)] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white">{title}</h2>
        </div>
        <div className="mt-8 md:mt-10">{children}</div>
      </div>
    </section>
  );
}

function Feature({ Icon, title, body }: { Icon: any; title: string; body: string }) {
  return (
    <article className="zc-glow-card rounded-[22px] bg-white p-6 ring-1 ring-[#171717]/[0.08] dark:bg-[#141118] dark:ring-white/10">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#cc208f]/10 text-[#cc208f]"><Icon className="h-5 w-5" /></span>
      <h3 className="mt-4 text-[17px] font-semibold tracking-tight text-[#171717] dark:text-white">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-[#666a70] dark:text-white/55">{body}</p>
    </article>
  );
}
