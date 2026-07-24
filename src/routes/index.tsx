import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Menu,
  Radio,
  Search,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  IconClubs,
  IconInstitution,
  IconLearn,
  IconPresentation,
  IconProfile,
  IconWallet,
} from "@/components/icons";

export const Route = createFileRoute("/")({
  component: Landing,
  validateSearch: (search: Record<string, unknown>): { ref?: string } => ({
    ref: (search.ref as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Zero Club - The social network for builders" },
      {
        name: "description",
        content:
          "Zero Club is a professional social network where builders learn, share work, join communities, and turn proof into opportunity.",
      },
      { property: "og:image", content: "/logo.png" },
    ],
  }),
});

type ReferralProps = {
  referralCode?: string;
};

const navItems = [
  { label: "People", href: "#people" },
  { label: "Learning", href: "#learning" },
  { label: "Clubs", href: "#clubs" },
  { label: "Opportunities", href: "#opportunities" },
  { label: "Wallet", href: "#wallet" },
];

const searchTopics = [
  "Product design",
  "Frontend development",
  "Creator economy",
  "AI tools",
  "No-code",
  "Startups",
  "Community building",
  "Bootcamps",
  "Digital products",
  "Freelancing",
];

const activityUpdates = [
  { name: "Amara", action: "shipped a UI case study", signal: "+50 XP" },
  { name: "Mide", action: "joined Product Club", signal: "New member" },
  { name: "Tunde", action: "opened a live cohort", signal: "48 seats" },
];

const platformHighlights = [
  {
    title: "A profile that shows real progress",
    copy: "Posts, projects, clubs, XP, bootcamps, and public proof — one credible builder identity.",
    Icon: IconProfile,
  },
  {
    title: "Learn in public, together",
    copy: "Join live bootcamps, follow structured paths, and make your learning visible through shipped work.",
    Icon: IconLearn,
  },
  {
    title: "Communities built around work",
    copy: "Private clubs keep cohorts, teams, tutors, and creators close to the conversations that matter.",
    Icon: IconClubs,
  },
];

const audienceCards = [
  {
    title: "For builders",
    copy: "Share what you're learning, document your work, join clubs, and build a profile that compounds.",
    Icon: IconProfile,
  },
  {
    title: "For tutors",
    copy: "Run live bootcamps, manage curriculum, teach communities, and earn from your knowledge.",
    Icon: IconPresentation,
  },
  {
    title: "For institutions",
    copy: "Create structured learning spaces, support cohorts, and track real learner participation.",
    Icon: IconInstitution,
  },
  {
    title: "For teams",
    copy: "Find people through proof of work, contribution history, and community signal.",
    Icon: IconClubs,
  },
];

const footerGroups = [
  {
    title: "Explore",
    links: ["People", "Posts", "Bootcamps", "Clubs", "Store", "Wallet"],
  },
  {
    title: "Community",
    links: ["Student builders", "Tutors", "Institutions", "Creators", "Startup teams"],
  },
  {
    title: "Business",
    links: ["Post a bootcamp", "Create a club", "Sell products", "Find builders"],
  },
  {
    title: "Company",
    links: ["About", "Help Center", "Privacy", "Terms", "Contact"],
  },
];

function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="Zero Club home">
      <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
      <span className={`font-display text-[19px] font-semibold tracking-tight ${light ? "text-white" : "text-[#171717]"}`}>
        Zero <span className="text-[#cc208f]">Club</span>
      </span>
    </Link>
  );
}

function Header({ referralCode }: ReferralProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#171717]/[0.06] bg-white/85 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 md:px-6">
        <BrandMark />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#666a70] transition-colors hover:bg-[#171717]/[0.04] hover:text-[#171717]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/signin"
            search={{ ref: referralCode, club: undefined }}
            className="hidden rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#4d4f55] transition-colors hover:bg-[#171717]/[0.04] sm:inline-flex"
            preload={false}
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            search={{ ref: referralCode, club: undefined }}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#171717] px-5 py-2.5 text-[13.5px] font-semibold tracking-tight text-white transition hover:opacity-90 active:scale-[0.97]"
            preload={false}
          >
            Join Zero Club
          </Link>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-[#303236] transition hover:bg-[#171717]/[0.04] lg:hidden"
            aria-label={isOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((value) => !value)}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-[#171717]/[0.06] bg-white px-4 py-4 lg:hidden">
          <div className="mx-auto grid max-w-[1180px] gap-1">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className="rounded-xl px-4 py-3 text-[15px] font-semibold tracking-tight text-[#303236] hover:bg-[#171717]/[0.04]"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

/* ── Code-built product showcase: the real Zero Club, not screenshots ── */
function ProductShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      {/* Glow */}
      <div className="pointer-events-none absolute -top-16 -right-10 h-72 w-72 rounded-full bg-[#cc208f]/20 blur-[90px]" />

      {/* Main: a shipped-work post inside the dark app frame */}
      <div className="relative overflow-hidden rounded-[28px] bg-[#141117] p-6 text-white shadow-[0_24px_70px_-24px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.06]">
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[#cc208f]/15 blur-[80px]" />

        {/* Post header */}
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[#cc208f]/20 ring-1 ring-[#cc208f]/30 text-[15px] font-semibold text-[#f28fd0]">
            A
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-semibold tracking-tight">Amara O.</span>
              <span className="flex items-center gap-1 rounded-full bg-[#cc208f]/15 px-2 py-0.5 text-[9px] font-medium text-[#f28fd0] ring-1 ring-[#cc208f]/25">
                <ArrowUpRight className="h-2.5 w-2.5" /> Ship
              </span>
            </div>
            <p className="text-[11px] text-white/45">@amara · 2h</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-400 ring-1 ring-white/10 tabular-nums">
            <Zap className="h-3 w-3" /> +50 XP
          </span>
        </div>

        {/* Post body */}
        <p className="relative mt-4 text-[14px] leading-relaxed text-white/80">
          Shipped my first paid bootcamp landing page — built during the
          <span className="text-[#f28fd0]"> UI Engineering cohort</span>. Feedback welcome 🚀
        </p>

        {/* Mock media */}
        <div className="relative mt-4 h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-[#cc208f]/25 via-[#1d1a20] to-[#141117] ring-1 ring-white/[0.08]">
          <div className="absolute inset-x-5 top-5 h-2.5 w-24 rounded-full bg-white/15" />
          <div className="absolute inset-x-5 top-11 h-2 w-40 rounded-full bg-white/[0.08]" />
          <div className="absolute inset-x-5 top-16 h-2 w-32 rounded-full bg-white/[0.08]" />
          <div className="absolute left-5 bottom-5 h-7 w-20 rounded-full bg-[#cc208f]" />
        </div>

        {/* Post actions */}
        <div className="relative mt-4 flex items-center gap-5 text-[11.5px] text-white/45 tabular-nums">
          <span>128 likes</span>
          <span>24 replies</span>
          <span className="ml-auto flex items-center gap-1 text-emerald-400">
            <Check className="h-3 w-3" /> Verified proof
          </span>
        </div>
      </div>

      {/* Floating: live class pill */}
      <div className="zc-showcase-float absolute -top-5 left-2 flex items-center gap-2.5 rounded-2xl bg-white p-3 pr-4 shadow-[0_16px_44px_-16px_rgba(0,0,0,0.3)] ring-1 ring-[#171717]/[0.06] sm:-left-6">
        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-red-500/10">
          <Radio className="h-4 w-4 text-red-500" />
          <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        </span>
        <div>
          <p className="text-[12px] font-semibold tracking-tight text-[#171717]">Live bootcamp</p>
          <p className="text-[10.5px] text-[#666a70]">UI Engineering · 48 learners</p>
        </div>
      </div>

      {/* Floating: wallet mini-card */}
      <div className="zc-showcase-float-delayed absolute -bottom-6 right-2 w-44 overflow-hidden rounded-2xl bg-[#141117] p-4 shadow-[0_16px_44px_-14px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.08] sm:-right-6">
        <div className="pointer-events-none absolute -top-8 -right-6 h-20 w-20 rounded-full bg-[#cc208f]/30 blur-[30px]" />
        <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/45">Creator wallet</p>
        <p className="mt-1.5 text-[20px] font-semibold tracking-tight text-white tabular-nums">₦248,500</p>
        <p className="mt-0.5 text-[10px] text-emerald-400">+ ₦45,000 this week</p>
      </div>
    </div>
  );
}

function ActivityRail() {
  const updates = [...activityUpdates, ...activityUpdates];

  return (
    <div className="mt-8 max-w-[540px] overflow-hidden rounded-2xl border border-[#171717]/[0.08] bg-white/80 p-2 shadow-[0_12px_32px_-24px_rgba(23,20,23,0.34)]">
      <div className="flex items-center justify-between px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.13em] text-[#666a70]">
        <span className="flex items-center gap-2 text-[#9d176d]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#cc208f] animate-pulse" />
          Live network
        </span>
        <span>Proof in motion</span>
      </div>
      <div className="overflow-hidden">
        <div className="zc-activity-rail flex w-max gap-2">
          {updates.map((update, index) => (
            <article
              key={`${update.name}-${index}`}
              aria-hidden={index >= activityUpdates.length || undefined}
              className="flex w-[218px] shrink-0 items-center gap-3 rounded-xl bg-[#f4f2ef] px-3 py-2.5 ring-1 ring-[#171717]/[0.05]"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#cc208f]/10 text-[11px] font-semibold text-[#9d176d]">
                {update.name.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11.5px] font-semibold text-[#242126]">{update.name}</span>
                <span className="block truncate text-[10.5px] text-[#666a70]">{update.action}</span>
              </span>
              <span className="ml-auto shrink-0 text-[10px] font-semibold text-[#9d176d]">{update.signal}</span>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero({ referralCode }: ReferralProps) {
  return (
    <section className="relative overflow-hidden border-b border-[#171717]/[0.06] bg-[#f4f2ef]">
      <div className="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-[#cc208f]/[0.07] blur-[100px]" />
      <div className="mx-auto grid max-w-[1180px] items-center gap-14 px-4 pb-20 pt-14 md:px-6 lg:grid-cols-[1fr_0.95fr] lg:pb-24 lg:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-[#cc208f]/[0.08] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f] ring-1 ring-[#cc208f]/15">
            The builder network
          </p>
          <h1 className="mt-6 max-w-[620px] font-display text-[44px] font-semibold leading-[1.04] tracking-[-0.035em] text-[#171717] md:text-[64px]">
            Where builders become <span className="text-[#cc208f]">undeniable</span>.
          </h1>
          <p className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-[#4d4f55] md:text-[19px]">
            Learn in live bootcamps, ship work in public, join serious communities —
            and turn proof of work into reputation and income.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/signup"
              search={{ ref: referralCode, club: undefined }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#171717] px-7 text-[15px] font-semibold tracking-tight text-white transition hover:opacity-90 active:scale-[0.98]"
              preload={false}
            >
              Start building free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/signin"
              search={{ ref: referralCode, club: undefined }}
              className="inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold tracking-tight text-[#303236] ring-1 ring-[#171717]/15 transition hover:bg-white active:scale-[0.98]"
              preload={false}
            >
              Sign in
            </Link>
          </div>

          <ActivityRail />

          <p className="mt-6 text-[12.5px] leading-relaxed text-[#666a70]">
            Free to join · Profiles, clubs, bootcamps, wallet, and XP built in
          </p>
        </div>

        <ProductShowcase />
      </div>

      {/* Stat strip */}
      <div className="border-t border-[#171717]/[0.06] bg-white/60">
        <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-px px-4 py-6 text-center md:grid-cols-4 md:px-6">
          {[
            ["Live bootcamps", "Taught by real builders"],
            ["Proof-of-work profiles", "Reputation you can verify"],
            ["Creator wallet", "Earn from what you teach"],
            ["XP that compounds", "Progress you can see"],
          ].map(([title, sub]) => (
            <div key={title} className="px-3">
              <p className="text-[13.5px] font-semibold tracking-tight text-[#171717]">{title}</p>
              <p className="mt-0.5 text-[11.5px] text-[#666a70]">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TopicExplorer() {
  return (
    <section id="people" className="border-b border-[#171717]/[0.06] bg-white">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Find your people</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] md:text-[42px]">
            The people and work that move your goals forward
          </h2>
        </div>
        <div>
          <label className="mb-5 flex min-h-13 items-center gap-3 rounded-full bg-[#f4f2ef] px-5 py-3.5 ring-1 ring-transparent transition-all focus-within:bg-white focus-within:ring-[#cc208f]/40">
            <Search className="h-4.5 w-4.5 shrink-0 text-[#666a70]" />
            <input
              type="text"
              aria-label="Search Zero Club"
              placeholder="Search goals, people, clubs, bootcamps, and projects"
              className="w-full bg-transparent text-[15px] text-[#171717] outline-none placeholder:text-[#666a70]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {searchTopics.map((topic) => (
              <a
                key={topic}
                href="#learning"
                className="rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#4d4f55] ring-1 ring-[#171717]/12 transition hover:bg-[#171717] hover:text-white hover:ring-transparent"
              >
                {topic}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LearningSection() {
  return (
    <section id="learning" className="border-b border-[#171717]/[0.06] bg-[#fbfaf8]">
      <div className="mx-auto max-w-[1180px] px-4 py-16 md:px-6 lg:py-24">
        <div className="max-w-[640px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Learning that compounds</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] md:text-[42px]">
            Take bootcamps, join clubs, and make your progress visible.
          </h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {platformHighlights.map((item) => (
            <article
              key={item.title}
              className="group rounded-3xl bg-white p-6 ring-1 ring-[#171717]/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_-14px_rgba(0,0,0,0.12)] transition-all hover:ring-[#cc208f]/25 hover:-translate-y-0.5"
            >
              <div className="mb-5 grid h-11 w-11 place-items-center rounded-full bg-[#cc208f]/[0.08] text-[#cc208f] ring-1 ring-[#cc208f]/15">
                <item.Icon className="h-[22px] w-[22px]" />
              </div>
              <h3 className="text-[17px] font-semibold leading-snug tracking-tight text-[#171717]">{item.title}</h3>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#666a70]">{item.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClubsSection() {
  return (
    <section id="clubs" className="border-b border-[#171717]/[0.06] bg-white">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-4 py-16 md:px-6 lg:grid-cols-2 lg:py-24">
        <div className="order-2 lg:order-1">
          <img
            src="/landing-communities-purpose.png"
            alt="Zero Club private clubs"
            className="h-[360px] w-full rounded-3xl bg-[#f7f5f2] object-cover ring-1 ring-[#171717]/[0.08] shadow-[0_20px_50px_-24px_rgba(0,0,0,0.25)]"
          />
        </div>
        <div className="order-1 lg:order-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Communities with a purpose</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] md:text-[42px]">
            Private spaces for cohorts, creator circles, and serious teams.
          </h2>
          <div className="mt-8 grid gap-4">
            {[
              "Host live classes and conversations around shared goals.",
              "Create channels for lessons, updates, projects, and feedback.",
              "Turn community participation into visible trust signals.",
            ].map((item) => (
              <div key={item} className="flex gap-3">
                <span className="mt-0.5 grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full bg-[#cc208f]/10">
                  <Check className="h-3 w-3 text-[#cc208f]" strokeWidth={2.5} />
                </span>
                <p className="text-[15.5px] leading-relaxed text-[#4d4f55]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OpportunitiesSection() {
  return (
    <section id="opportunities" className="border-b border-[#171717]/[0.06] bg-[#f4f2ef]">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Open doors through proof</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] md:text-[42px]">
            A network for people who want to be known by what they build.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {audienceCards.map((card) => (
            <article
              key={card.title}
              className="rounded-3xl bg-white p-6 ring-1 ring-[#171717]/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_-14px_rgba(0,0,0,0.12)] transition-all hover:ring-[#cc208f]/25 hover:-translate-y-0.5"
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#cc208f]/[0.08] text-[#cc208f] ring-1 ring-[#cc208f]/15">
                <card.Icon className="h-[22px] w-[22px]" />
              </div>
              <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-[#171717]">{card.title}</h3>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#666a70]">{card.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function WalletSection() {
  return (
    <section id="wallet" className="border-b border-[#171717]/[0.06] bg-white">
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-4 py-16 md:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Creator economy built in</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] md:text-[42px]">
            Teach, sell, earn, and manage it all in one account.
          </h2>
          <div className="mt-8 flex flex-wrap gap-2">
            {["Paid bootcamps", "Digital products", "Creator wallet", "Coupons", "Private access"].map((item) => (
              <span key={item} className="rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#4d4f55] ring-1 ring-[#171717]/12">
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* The actual wallet card from the product, built in code */}
        <div className="relative mx-auto w-full max-w-[440px]">
          <div className="pointer-events-none absolute -top-10 -right-8 h-52 w-52 rounded-full bg-[#cc208f]/15 blur-[70px]" />
          <div className="relative overflow-hidden rounded-[28px] bg-[#141117] p-8 text-white shadow-[0_24px_70px_-24px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.06]">
            <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#cc208f]/25 blur-[80px]" />
            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/50">Balance</p>
                <IconWallet className="h-5 w-5 text-white/40" />
              </div>
              <h3 className="mt-3 text-[40px] font-semibold tracking-tight leading-none tabular-nums">
                <span className="mr-1 align-top text-[24px] font-normal text-white/70">₦</span>248,500
              </h3>
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3.5 py-1.5 ring-1 ring-white/10">
                  <span className="text-[10.5px] font-medium tracking-[0.14em] text-white/70">ZC · 9710478080</span>
                </div>
                <img src="/logo.png" alt="" className="h-6 w-6 object-contain opacity-60" />
              </div>
            </div>
          </div>
          <div className="relative -mt-4 mx-6 rounded-2xl bg-white p-4 shadow-[0_16px_44px_-16px_rgba(0,0,0,0.25)] ring-1 ring-[#171717]/[0.06]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold tracking-tight text-[#171717]">Bootcamp enrollment</p>
                <p className="text-[10.5px] text-[#666a70]">UI Engineering · just now</p>
              </div>
              <span className="text-[13px] font-semibold text-emerald-600 tabular-nums">+ ₦15,000</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const faqs = [
  { q: "What is Zero Club?", a: "Zero Club is a professional network designed specifically for the next generation of builders, creators, and institutions to learn, connect, and grow." },
  { q: "Who can join Zero Club?", a: "Whether you're a student learning new skills, a tutor looking to monetize your expertise, or an institution managing bootcamps, Zero Club is built for you." },
  { q: "How does the Creator Wallet work?", a: "The built-in wallet lets you manage earnings from paid bootcamps, digital products, and private access seamlessly directly within the platform." },
  { q: "Can I host my own bootcamps?", a: "Yes! Tutors and Institutions have access to dedicated studios where they can create, manage, and monetize their own bootcamps — including live video classes." },
  { q: "Is Zero Club free to use?", a: "It is free to join and start building your network. We also offer Premium memberships for advanced features, and creators can charge for their own content." },
];

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="border-b border-[#171717]/[0.06] bg-[#fbfaf8]">
      <div className="mx-auto max-w-[1180px] px-4 py-16 md:px-6 lg:py-24">
        <div className="mb-10 text-center md:mb-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Questions</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] md:text-[42px]">
            Everything you're wondering
          </h2>
        </div>
        <div className="mx-auto flex max-w-[760px] flex-col gap-3">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={i} className={`overflow-hidden rounded-2xl bg-white ring-1 transition-all ${isOpen ? "ring-[#cc208f]/25" : "ring-[#171717]/[0.06]"}`}>
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left"
                >
                  <h3 className="text-[15.5px] font-semibold tracking-tight text-[#171717]">{faq.q}</h3>
                  <ChevronDown className={`h-4.5 w-4.5 shrink-0 text-[#666a70] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <div
                  className={`overflow-hidden px-6 transition-all duration-300 ${
                    isOpen ? "max-h-[200px] pb-5 opacity-100" : "max-h-0 pb-0 opacity-0"
                  }`}
                >
                  <p className="text-[14px] leading-relaxed text-[#666a70]">{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ referralCode }: ReferralProps) {
  return (
    <section className="bg-white px-4 py-16 md:px-6 md:py-20">
      <div className="mx-auto max-w-[1180px]">
        <div className="relative overflow-hidden rounded-[32px] bg-[#141117] px-6 py-16 text-center md:px-16 md:py-20">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#cc208f]/25 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-40 -right-20 h-72 w-72 rounded-full bg-[#cc208f]/10 blur-[90px]" />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f28fd0]">Zero Club</p>
            <h2 className="mx-auto mt-4 max-w-[680px] font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-white md:text-[52px]">
              Built for the next generation of builders.
            </h2>
            <p className="mx-auto mt-4 max-w-[440px] text-[15px] leading-relaxed text-white/55">
              Your profile, your proof, your people, your income — one platform.
            </p>
            <Link
              to="/signup"
              search={{ ref: referralCode, club: undefined }}
              className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-[15px] font-semibold tracking-tight text-[#171717] transition hover:opacity-90 active:scale-[0.98]"
              preload={false}
            >
              Get started free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#171717]/[0.06] bg-[#f4f2ef] px-4 py-12 md:px-6">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-5">
          <BrandMark />
          <p className="text-[12px] text-[#666a70]">The social network for builders.</p>
        </div>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#171717]">{group.title}</h3>
              <ul className="grid gap-2.5">
                {group.links.map((link) => (
                  <li key={link}>
                    <a href="#people" className="text-[13px] font-medium text-[#666a70] transition-colors hover:text-[#171717]">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex items-center justify-between border-t border-[#171717]/[0.06] pt-6">
          <p className="text-[12px] text-[#666a70]">Zero Club © 2026</p>
          <p className="text-[12px] text-[#666a70]">Made for builders, by builders.</p>
        </div>
      </div>
    </footer>
  );
}

function Landing() {
  const { ref } = useSearch({ from: "/" });

  return (
    <div className="min-h-screen bg-white font-['Montserrat'] text-[#171717] selection:bg-[#cc208f]/20">
      <Header referralCode={ref} />
      <main>
        <Hero referralCode={ref} />
        <TopicExplorer />
        <LearningSection />
        <ClubsSection />
        <OpportunitiesSection />
        <WalletSection />
        <FaqSection />
        <FinalCta referralCode={ref} />
      </main>
      <Footer />
    </div>
  );
}
