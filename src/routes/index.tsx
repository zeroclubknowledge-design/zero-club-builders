import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  Menu,
  Search,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { useState } from "react";

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
  { label: "People", href: "#people", iconSrc: "/landing-builder-feed-icon-brand.png" },
  { label: "Learning", href: "#learning", iconSrc: "/landing-learning-icon-brand.png" },
  { label: "Clubs", href: "#clubs", iconSrc: "/landing-communities-icon-brand.png" },
  { label: "Opportunities", href: "#opportunities", iconSrc: "/landing-proof-teams-icon-brand.png" },
  { label: "Wallet", href: "#wallet", iconSrc: "/landing-wallet-icon-brand.png" },
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

const roleTopics = [
  "Student builders",
  "Product designers",
  "Software developers",
  "Tutors",
  "Institutions",
  "Community managers",
  "Startup teams",
  "Digital creators",
];

const platformHighlights = [
  {
    title: "Build a profile that shows real progress",
    copy: "Bring posts, projects, clubs, XP, bootcamps, and public proof into one credible builder identity.",
    iconSrc: "/landing-bootcamp-icon.svg",
  },
  {
    title: "Learn in public with people moving in the same direction",
    copy: "Join bootcamps, follow structured paths, and make your learning visible through work and milestones.",
    iconSrc: "/landing-learning-icon-brand.png",
  },
  {
    title: "Create focused communities around work",
    copy: "Private clubs help cohorts, teams, tutors, and creators stay close to the conversations that matter.",
    iconSrc: "/landing-communities-icon-brand.png",
  },
];

const audienceCards = [
  {
    title: "For builders",
    copy: "Share what you are learning, document your work, join clubs, and build a profile that compounds.",
    iconSrc: "/landing-proof-builders-icon-brand.png",
  },
  {
    title: "For tutors",
    copy: "Run bootcamps, manage curriculum, create coupons, teach communities, and earn from your knowledge.",
    iconSrc: "/landing-proof-tutors-icon-brand.png",
  },
  {
    title: "For institutions",
    copy: "Create structured learning spaces, support cohorts, and track real learner participation.",
    iconSrc: "/landing-proof-institutions-icon-brand.png",
  },
  {
    title: "For teams",
    copy: "Find people through proof of work, contribution history, learning activity, and community signal.",
    iconSrc: "/landing-proof-teams-icon-brand.png",
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

function BrandMark() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="Zero Club home">
      <img src="/logo.png" alt="" className="h-9 w-9 object-contain" />
      <span className="text-[22px] font-bold tracking-[-0.03em] text-[#171717]">
        Zero <span className="text-[#cc208f]">Club</span>
      </span>
    </Link>
  );
}

function Header({ referralCode }: ReferralProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#e3e3e3] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-4 md:px-6">
        <BrandMark />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="flex min-w-[86px] flex-col items-center gap-1 rounded-[6px] px-3 py-2 text-[12px] font-semibold text-[#5f6167] transition hover:bg-[#f4f2ef] hover:text-[#171717]"
            >
              <img src={item.iconSrc} alt="" className={`h-5 w-5 object-contain ${!item.iconSrc.includes('wallet') ? 'scale-[1.3]' : ''}`} />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/signin"
            search={{ ref: referralCode, club: undefined }}
            className="hidden rounded-full px-5 py-2.5 text-[15px] font-semibold text-[#4d4f55] transition hover:bg-[#f4f2ef] sm:inline-flex"
            preload={false}
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            search={{ ref: referralCode, club: undefined }}
            className="inline-flex rounded-full border border-[#cc208f] px-5 py-2.5 text-[15px] font-bold text-[#cc208f] transition hover:bg-[#fff1f9]"
            preload={false}
          >
            Join now
          </Link>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-[#303236] transition hover:bg-[#f4f2ef] lg:hidden"
            aria-label={isOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((value) => !value)}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-[#e3e3e3] bg-white px-4 py-4 lg:hidden">
          <div className="mx-auto grid max-w-[1180px] gap-2">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 rounded-[6px] px-3 py-3 text-[15px] font-semibold text-[#303236] hover:bg-[#f4f2ef]"
              >
                <img src={item.iconSrc} alt="" className={`h-6 w-6 object-contain ${!item.iconSrc.includes('wallet') ? 'scale-[1.3]' : ''}`} />
                {item.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

function Hero({ referralCode }: ReferralProps) {
  return (
    <section className="border-b border-[#e8e3dc] bg-[#f4f2ef]">
      <div className="mx-auto grid min-h-[calc(100vh-64px)] max-w-[1180px] items-center gap-10 px-4 py-10 md:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:py-14">
        <div>
          <h1 className="max-w-[620px] text-[46px] font-normal leading-[1.08] tracking-[-0.035em] text-[#8f5849] md:text-[64px]">
            A professional network for builders
          </h1>
          <p className="mt-5 max-w-[560px] text-[21px] leading-8 text-[#303236]">
            The professional social network where builders learn in public, join serious communities, and turn proof of work into opportunity.
          </p>

          <div className="mt-8 grid max-w-[420px] gap-3">
            <Link
              to="/signup"
              search={{ ref: referralCode, club: undefined }}
              className="inline-flex h-12 items-center justify-center rounded-full bg-[#cc208f] px-6 text-[16px] font-bold text-white transition hover:bg-[#a71973]"
              preload={false}
            >
              Join Zero Club
            </Link>
            <Link
              to="/signin"
              search={{ ref: referralCode, club: undefined }}
              className="inline-flex h-12 items-center justify-center rounded-full border border-[#6a6d73] px-6 text-[16px] font-bold text-[#303236] transition hover:bg-white"
              preload={false}
            >
              Sign in
            </Link>
          </div>

          <p className="mt-5 max-w-[420px] text-[13px] leading-5 text-[#666a70]">
            By joining, you can create a profile, follow people, share posts, enroll in bootcamps, join clubs, and manage your creator wallet.
          </p>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-[8px] border border-[#ddd6ce] bg-white shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
            <div className="border-b border-[#ece7e1] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-[#cc208f]/10">
                  <img src="/landing-builder-feed-icon-brand.png" alt="" className="h-11 w-11 object-contain" />
                </div>
                <div>
                  <p className="text-[15px] font-bold text-[#171717]">Builder feed</p>
                  <p className="text-[13px] text-[#666a70]">People, projects, learning, and opportunities</p>
                </div>
              </div>
            </div>
            <div className="grid gap-px bg-[#ece7e1] md:grid-cols-2">
              <div className="bg-white p-5">
                <img
                  src="/landing-profile-proof-source.png"
                  alt="Zero Club profile preview"
                  className="h-[210px] w-full object-contain"
                  style={{ filter: "hue-rotate(88deg) saturate(1.2)" }}
                />
                <h2 className="mt-4 text-[19px] font-bold tracking-[-0.02em] text-[#171717]">Profiles with proof</h2>
                <p className="mt-2 text-[14px] leading-6 text-[#666a70]">Show progress through work, XP, posts, and community activity.</p>
              </div>
              <div className="bg-white p-5">
                <img
                  src="/landing-focused-clubs-source.png"
                  alt="Zero Club communities preview"
                  className="h-[210px] w-full object-contain"
                  style={{ filter: "hue-rotate(92deg) saturate(1.18)" }}
                />
                <h2 className="mt-4 text-[19px] font-bold tracking-[-0.02em] text-[#171717]">Focused clubs</h2>
                <p className="mt-2 text-[14px] leading-6 text-[#666a70]">Build with cohorts, teams, tutors, and creator-led communities.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TopicExplorer() {
  return (
    <section id="people" className="border-b border-[#e8e3dc] bg-white">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
        <div>
          <h2 className="text-[38px] font-normal leading-[1.16] tracking-[-0.03em] text-[#171717] md:text-[48px]">
            Find the people and work that move your goals forward
          </h2>
        </div>
        <div>
          <label className="mb-5 flex min-h-14 items-center gap-3 rounded-full border border-[#b7b0a8] bg-white px-5 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.05)]">
            <Search className="h-5 w-5 shrink-0 text-[#666a70]" />
            <input
              type="text"
              aria-label="Search Zero Club"
              placeholder="Search goals, people, clubs, bootcamps, and projects"
              className="w-full bg-transparent text-[15px] text-[#171717] outline-none placeholder:text-[#666a70]"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            {searchTopics.map((topic) => (
              <a
                key={topic}
                href="#learning"
                className="rounded-full border border-[#b7b0a8] px-4 py-2.5 text-[15px] font-bold text-[#4d4f55] transition hover:border-[#171717] hover:bg-[#f4f2ef]"
              >
                {topic}
              </a>
            ))}
          </div>
          <button className="mt-5 inline-flex items-center gap-1 text-[15px] font-bold text-[#7b1d59]">
            Show more <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function LearningSection() {
  return (
    <section id="learning" className="border-b border-[#e8e3dc] bg-[#fbfaf8]">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 md:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:py-24">
        <div>
          <p className="text-[17px] font-bold text-[#8f5849]">Learning that connects to reputation</p>
          <h2 className="mt-3 text-[38px] font-normal leading-[1.15] tracking-[-0.03em] text-[#171717] md:text-[50px]">
            Take bootcamps, join clubs, and make your progress visible.
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {platformHighlights.map((item) => (
            <article key={item.title} className="rounded-[8px] border border-[#e2ddd6] bg-white p-5">
              <div className="mb-5 grid h-14 w-14 place-items-center rounded-[8px] bg-[#f4f2ef]">
                <img src={item.iconSrc} alt="" className={`h-10 w-10 object-contain ${!item.iconSrc.includes('wallet') ? 'scale-[1.3]' : ''}`} />
              </div>
              <h3 className="text-[18px] font-bold tracking-[-0.02em] text-[#171717]">{item.title}</h3>
              <p className="mt-3 text-[14px] leading-6 text-[#666a70]">{item.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClubsSection() {
  return (
    <section id="clubs" className="border-b border-[#e8e3dc] bg-white">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 py-16 md:px-6 lg:grid-cols-2 lg:py-24">
        <div className="order-2 lg:order-1">
          <img
            src="/landing-communities-purpose.png"
            alt="Zero Club private clubs"
            className="h-[360px] w-full rounded-[8px] border border-[#e2ddd6] bg-[#f7f5f2] object-cover"
          />
        </div>
        <div className="order-1 lg:order-2">
          <p className="text-[17px] font-bold text-[#8f5849]">Communities with a purpose</p>
          <h2 className="mt-3 text-[38px] font-normal leading-[1.15] tracking-[-0.03em] text-[#171717] md:text-[50px]">
            Build private spaces for cohorts, creator circles, and serious teams.
          </h2>
          <div className="mt-7 grid gap-4">
            {[
              "Host live conversations around shared goals.",
              "Create channels for lessons, updates, projects, and feedback.",
              "Turn community participation into visible trust signals.",
            ].map((item) => (
              <div key={item} className="flex gap-3">
                <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-[#24754f]" />
                <p className="text-[17px] leading-7 text-[#4d4f55]">{item}</p>
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
    <section id="opportunities" className="border-b border-[#e8e3dc] bg-[#f4f2ef]">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
        <div>
          <p className="text-[17px] font-bold text-[#8f5849]">Open doors through proof</p>
          <h2 className="mt-3 text-[38px] font-normal leading-[1.15] tracking-[-0.03em] text-[#171717] md:text-[50px]">
            A network for people who want to be known by what they build.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {audienceCards.map((card) => (
            <article key={card.title} className="rounded-[8px] border border-[#d9d3ca] bg-white p-6">
              <div className="grid h-12 w-12 place-items-center rounded-[8px] bg-[#cc208f]/10">
                <img src={card.iconSrc} alt="" className="h-9 w-9 object-contain" />
              </div>
              <h3 className="mt-5 text-[20px] font-bold tracking-[-0.02em] text-[#171717]">{card.title}</h3>
              <p className="mt-3 text-[15px] leading-6 text-[#666a70]">{card.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function WalletSection() {
  return (
    <section id="wallet" className="border-b border-[#e8e3dc] bg-white">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 py-16 md:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <p className="text-[17px] font-bold text-[#8f5849]">Creator economy built in</p>
          <h2 className="mt-3 text-[38px] font-normal leading-[1.15] tracking-[-0.03em] text-[#171717] md:text-[50px]">
            Teach, sell, earn, and manage your activity in one professional account.
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {["Paid bootcamps", "Digital products", "Creator wallet", "Coupons", "Private access"].map((item) => (
              <span key={item} className="rounded-full border border-[#b7b0a8] px-4 py-2.5 text-[15px] font-bold text-[#4d4f55]">
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="relative h-[360px] overflow-hidden rounded-[8px] border border-[#e2ddd6] bg-black">
          <img
            src="/landing-creator-economy-phone-final.png"
            alt="Zero Club wallet and store phone mockup"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}

const faqs = [
  { q: "What is Zero Club?", a: "Zero Club is a professional network designed specifically for the next generation of builders, creators, and institutions to learn, connect, and grow." },
  { q: "Who can join Zero Club?", a: "Whether you're a student learning new skills, a tutor looking to monetize your expertise, or an institution managing bootcamps, Zero Club is built for you." },
  { q: "How does the Creator Wallet work?", a: "The built-in wallet lets you manage earnings from paid bootcamps, digital products, and private access seamlessly directly within the platform." },
  { q: "Can I host my own bootcamps?", a: "Yes! Tutors and Institutions have access to dedicated studios where they can create, manage, and monetize their own bootcamps." },
  { q: "Is Zero Club free to use?", a: "It is free to join and start building your network. We also offer Premium memberships for advanced features, and creators can charge for their own content." },
];

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="border-b border-[#e8e3dc] bg-[#fbfaf8]">
      <div className="mx-auto max-w-[1180px] px-4 py-16 md:px-6 lg:py-24">
        <h2 className="text-[38px] font-normal leading-[1.16] tracking-[-0.03em] text-[#171717] md:text-[48px] mb-10 md:mb-14 text-center">
          Frequently Asked Questions
        </h2>
        <div className="mx-auto max-w-[800px] flex flex-col gap-4">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={i} className="rounded-[8px] border border-[#d9d3ca] bg-white overflow-hidden transition-all">
                <button 
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left"
                >
                  <h3 className="text-[17px] font-bold text-[#171717]">{faq.q}</h3>
                  <ChevronDown className={`h-5 w-5 text-[#666a70] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <div 
                  className={`px-6 pb-5 pt-0 transition-all duration-300 overflow-hidden ${
                    isOpen ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0 pb-0"
                  }`}
                >
                  <p className="text-[16px] leading-relaxed text-[#666a70]">{faq.a}</p>
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
    <section className="bg-white px-4 py-16 md:px-6 md:py-24">
      <div className="mx-auto max-w-[1180px]">
        <div className="max-w-[760px]">
          <h2 className="text-[42px] font-normal leading-[1.12] tracking-[-0.035em] text-[#171717] md:text-[58px]">
            Join a professional network built for the next generation of builders.
          </h2>
          <Link
            to="/signup"
            search={{ ref: referralCode, club: undefined }}
            className="mt-8 inline-flex items-center rounded-full bg-[#cc208f] px-7 py-3.5 text-[16px] font-bold text-white transition hover:bg-[#a71973]"
            preload={false}
          >
            Get started <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#e3e3e3] bg-[#f4f2ef] px-4 py-10 md:px-6">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-8 flex items-center justify-between gap-5">
          <BrandMark />
          <div className="flex items-center gap-3 text-[#666a70]">
            <Bell className="h-5 w-5" />
            <ShieldCheck className="h-5 w-5" />
            <Store className="h-5 w-5" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-4 text-[14px] font-bold text-[#171717]">{group.title}</h3>
              <ul className="grid gap-3">
                {group.links.map((link) => (
                  <li key={link}>
                    <a href="#people" className="text-[13px] font-semibold text-[#666a70] hover:text-[#171717]">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-10 text-[12px] font-semibold text-[#666a70]">Zero Club © 2026</p>
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
