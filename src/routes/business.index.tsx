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
  Search,
  ShieldCheck,
  Trophy,
  Users,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";

/*
 * Zero Club for Business — the organization side of Zero Club.
 *
 * Deliberately a different register from the community landing page: a
 * dark, quiet, corporate surface with one accent colour, plain claims and
 * no invented numbers.
 */
export const Route = createFileRoute("/business/")({
  component: BusinessLanding,
  head: () => ({
    meta: [
      { title: "Zero Club for Business — hire builders, run tech hubs" },
      {
        name: "description",
        content:
          "One business account for your organization. Hire builders by their proof of work, sponsor challenges, train your team — or run a tech hub with bootcamps, tutors and cohorts.",
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
  { Icon: LayoutGrid, title: "Bootcamps & cohorts", body: "Publish programmes, run live classes and keep every cohort in one place." },
  { Icon: Users, title: "Tutors", body: "Bring your tutors in, assign them to bootcamps and follow their delivery." },
  { Icon: ClipboardList, title: "Admissions with Zero Form", body: "Pre-registration forms, early-bird pricing and seat limits, paid into your wallet." },
  { Icon: Trophy, title: "Outcomes", body: "Learner progress, attendance and analytics you can show to partners and funders." },
];

const STEPS = [
  { n: "01", title: "Create a business account", body: "Use your work email. It's separate from your personal Zero Club account." },
  { n: "02", title: "Set up your organization", body: "Name, logo, industry and what you want to do here — about two minutes." },
  { n: "03", title: "Switch modes any time", body: "Company and Institutional are one tap apart, like a person switching Learner and Tutor." },
];

function BusinessLanding() {
  const [signedInBusiness, setSignedInBusiness] = useState<boolean | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("zc-biz-page");
    let alive = true;
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return alive && setSignedInBusiness(false);
      const { data } = await supabase.from("profiles").select("account_kind").eq("id", session.user.id).maybeSingle();
      if (alive) setSignedInBusiness((data as any)?.account_kind === "business");
    });
    return () => {
      alive = false;
      document.documentElement.classList.remove("zc-biz-page");
    };
  }, []);

  const primaryTo = signedInBusiness ? "/app/business" : "/business/signup";
  const primaryLabel = signedInBusiness ? "Open Business Hub" : "Create a business account";

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#07060a] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07060a]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
          <Link to="/business" className="flex min-w-0 shrink items-center gap-2">
            <img src="/logo.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
            <span className="hidden font-display text-[17px] font-semibold tracking-tight min-[400px]:inline">Zero Club</span>
            <span className="shrink-0 rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">Business</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            <a href="#company" className="hidden rounded-lg px-3 py-2 text-[13.5px] font-medium text-white/65 transition hover:text-white md:block">For companies</a>
            <a href="#hubs" className="hidden rounded-lg px-3 py-2 text-[13.5px] font-medium text-white/65 transition hover:text-white md:block">For tech hubs</a>
            <Link to="/" className="hidden rounded-lg px-3 py-2 text-[13.5px] font-medium text-white/65 transition hover:text-white md:block">Personal</Link>
            {!signedInBusiness && (
              <Link to={"/business/signin" as never} className="rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-white/80 transition hover:text-white sm:px-3">Sign in</Link>
            )}
            <Link to={primaryTo as never} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-3 text-[13px] font-semibold text-[#0b0a0d] transition hover:bg-white/90 sm:px-3.5 sm:text-[13.5px]">
              {signedInBusiness ? "Business Hub" : "Get started"} <ArrowRight className="hidden h-3.5 w-3.5 sm:block" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_0%,rgba(204,32,143,0.32),transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_50%_20%,black,transparent)]" />
        <div className="relative mx-auto max-w-[1180px] px-5 pb-12 pt-12 text-center sm:px-6 sm:pb-16 sm:pt-24">
          <h1 className="mx-auto max-w-[860px] text-balance font-display text-[clamp(32px,7.5vw,68px)] font-semibold leading-[1.05] tracking-[-0.035em]">
            Where organizations meet the builders who ship.
          </h1>
          <p className="mx-auto mt-5 max-w-[640px] text-balance text-[15px] leading-relaxed text-white/60 sm:text-[18px]">
            One business account for your organization. Hire and train talent as a <span className="text-white">company</span>, or run bootcamps and cohorts as an <span className="text-white">institution</span> — and switch between the two whenever you need.
          </p>
          <div className="mx-auto mt-8 flex max-w-[420px] flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
            <Link to={primaryTo as never} className="inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#cc208f] px-4 sm:px-6 text-[15px] font-semibold text-white shadow-[0_20px_40px_-18px_rgba(204,32,143,0.9)] transition hover:bg-[#b51b7f] sm:w-auto">
              {primaryLabel} <ArrowRight className="hidden h-4 w-4 shrink-0 min-[380px]:block" />
            </Link>
            <a href="#how" className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/15 px-6 text-[15px] font-semibold text-white/85 transition hover:bg-white/[0.05] sm:w-auto">
              How it works
            </a>
          </div>
          <p className="mt-4 text-[12.5px] text-white/40">Free to start · Uses a work email · Separate from your personal account</p>

          {/* Two kinds of organization */}
          <div className="mx-auto mt-10 grid max-w-[920px] gap-3 text-left sm:mt-14 sm:grid-cols-2">
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
              points={["Digital Hub for bootcamps", "Tutors and cohorts", "Admissions with Zero Form", "Learner outcomes"]}
              href="#hubs"
              note="Reviewed by Zero Club"
            />
          </div>
        </div>
      </section>

      {/* Company */}
      <Section id="company" eyebrow="For companies" title="Hire, sponsor and train — with people who already build in public.">
        <div className="grid gap-3 sm:grid-cols-2">
          {COMPANY_FEATURES.map((f) => <Feature key={f.title} {...f} />)}
        </div>
      </Section>

      {/* Hubs */}
      <Section id="hubs" eyebrow="For tech hubs" title="Run your whole programme from one Digital Hub.">
        <div className="grid gap-3 sm:grid-cols-2">
          {HUB_FEATURES.map((f) => <Feature key={f.title} {...f} />)}
        </div>
        <p className="mt-5 flex items-start gap-2 text-[13px] leading-relaxed text-white/50">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#ff5cc3]" />
          Institutional mode opens after Zero Club reviews your hub, so learners know every institution on Zero Club is real. Meanwhile your account works in Company mode.
        </p>
      </Section>

      {/* How it works */}
      <Section id="how" eyebrow="How it works" title="Set up in minutes. Switch modes in a tap.">
        <div className="grid gap-3 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
              <p className="font-display text-[13px] font-semibold tabular-nums text-[#ff5cc3]">{s.n}</p>
              <h3 className="mt-3 text-[17px] font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-white/55">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-center">
          <div className="inline-grid grid-cols-2 gap-1 rounded-full bg-white/[0.07] p-1 text-[13px] font-semibold">
            <span className="rounded-full bg-white px-4 py-1.5 text-[#0b0a0d]">Company</span>
            <span className="rounded-full px-4 py-1.5 text-white/60">Institutional</span>
          </div>
        </div>
      </Section>

      {/* CTA */}
      <section className="px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-6">
        <div className="relative mx-auto max-w-[1180px] overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,#1a0c17_0%,#0d0a10_60%)] px-5 py-10 text-center sm:rounded-[28px] sm:px-12 sm:py-14">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_100%,rgba(204,32,143,0.35),transparent_70%)]" />
          <div className="relative">
            <BadgeCheck className="mx-auto h-9 w-9 text-[#ff5cc3]" />
            <h2 className="mx-auto mt-4 max-w-[640px] font-display text-[clamp(26px,4.4vw,42px)] font-semibold leading-[1.08] tracking-[-0.03em]">
              Bring your organization to Zero Club.
            </h2>
            <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-relaxed text-white/60">
              Create the account, set up your page, and start with whatever matters most — hiring, sponsoring, training or teaching.
            </p>
            <Link to={primaryTo as never} className="mt-7 inline-flex h-12 w-full max-w-[360px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 sm:px-6 text-[15px] font-semibold text-[#0b0a0d] transition hover:bg-white/90">
              {primaryLabel} <ArrowRight className="hidden h-4 w-4 shrink-0 min-[380px]:block" />
            </Link>
            {!signedInBusiness && (
              <p className="mt-4 text-[13px] text-white/50">
                Already have one? <Link to={"/business/signin" as never} className="font-semibold text-white underline-offset-4 hover:underline">Sign in</Link>
              </p>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-3 text-center text-[12.5px] text-white/45 sm:flex-row">
          <p>Zero Club for Business © {new Date().getFullYear()}</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link to="/" className="hover:text-white">Personal accounts</Link>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ModeCard({ Icon, tag, title, points, href, note }: { Icon: any; tag: string; title: string; points: string[]; href: string; note?: string }) {
  return (
    <a href={href} className="group rounded-2xl border border-white/[0.09] bg-white/[0.03] p-4 transition sm:p-5 hover:border-[#cc208f]/50 hover:bg-white/[0.05]">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#cc208f]/15 text-[#ff5cc3]"><Icon className="h-5 w-5" /></span>
        <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">{tag}</span>
      </div>
      <h3 className="mt-4 text-[17px] font-semibold">{title}</h3>
      <ul className="mt-3 grid gap-1.5">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-2 text-[13.5px] text-white/65"><Check className="h-3.5 w-3.5 shrink-0 text-[#ff5cc3]" /> {p}</li>
        ))}
      </ul>
      {note && <p className="mt-3 text-[11.5px] font-medium text-white/40">{note}</p>}
    </a>
  );
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 px-5 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-[1180px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#ff5cc3]">{eyebrow}</p>
        <h2 className="mt-3 max-w-[720px] text-balance font-display text-[clamp(24px,6vw,40px)] font-semibold leading-[1.12] tracking-[-0.03em]">{title}</h2>
        <div className="mt-6 sm:mt-8">{children}</div>
      </div>
    </section>
  );
}

function Feature({ Icon, title, body }: { Icon: any; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-white"><Icon className="h-5 w-5" /></span>
      <h3 className="mt-4 text-[16px] font-semibold">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-white/55">{body}</p>
    </div>
  );
}

