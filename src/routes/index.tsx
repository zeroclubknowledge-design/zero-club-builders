import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Check,
  ChevronRight,
  Code2,
  Github,
  Layers3,
  Menu,
  MessageCircle,
  Play,
  Sparkles,
  UsersRound,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import React, { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  component: Landing,
  validateSearch: (search: Record<string, unknown>): { ref?: string } => ({
    ref: (search.ref as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Zero Club - Product network for builders" },
      {
        name: "description",
        content:
          "Zero Club helps builders learn, ship, prove skill, and unlock opportunities in one focused product network.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
});

type ReferralProps = {
  referralCode?: string;
};

const menuGroups = [
  {
    label: "System",
    links: ["Intake", "Plan", "Build", "Proof", "Monitor"],
  },
  {
    label: "Product",
    links: ["Integrations", "Pricing", "Changelog", "Documentation"],
  },
  {
    label: "Resources",
    links: ["About", "Customers", "Careers", "Contact"],
  },
];

const productSteps = [
  {
    number: "1.0",
    name: "Intake",
    title: "Collect every signal",
    copy: "Capture goals, projects, posts, payments, and feedback in one place before momentum gets scattered.",
    icon: Sparkles,
    accentClass:
      "hover:bg-[#1a0b15] hover:shadow-[inset_0_0_0_1px_rgba(204,32,143,0.4),0_22px_70px_-42px_rgba(204,32,143,0.9)] focus-visible:bg-[#1a0b15] active:bg-[#23111d]",
    selectedClass:
      "bg-[#1a0b15] shadow-[inset_0_0_0_1px_rgba(204,32,143,0.42),0_22px_70px_-42px_rgba(204,32,143,0.9)]",
    iconClass: "group-hover:text-[#ff77cd] group-focus-visible:text-[#ff77cd]",
    selectedIconClass: "text-[#ff77cd]",
  },
  {
    number: "2.0",
    name: "Plan",
    title: "Turn ambition into direction",
    copy: "Give builders a clear path from learning to shipping with structured programs, milestones, and proof.",
    icon: Layers3,
    accentClass:
      "hover:bg-[#101328] hover:shadow-[inset_0_0_0_1px_rgba(141,124,255,0.4),0_22px_70px_-42px_rgba(141,124,255,0.9)] focus-visible:bg-[#101328] active:bg-[#171b36]",
    selectedClass:
      "bg-[#101328] shadow-[inset_0_0_0_1px_rgba(141,124,255,0.42),0_22px_70px_-42px_rgba(141,124,255,0.9)]",
    iconClass: "group-hover:text-[#8d7cff] group-focus-visible:text-[#8d7cff]",
    selectedIconClass: "text-[#8d7cff]",
  },
  {
    number: "3.0",
    name: "Build",
    title: "Move work forward together",
    copy: "Coordinate clubs, creators, bootcamps, and AI tools around real projects instead of disconnected chats.",
    icon: Code2,
    accentClass:
      "hover:bg-[#0a1a14] hover:shadow-[inset_0_0_0_1px_rgba(81,238,142,0.35),0_22px_70px_-42px_rgba(81,238,142,0.85)] focus-visible:bg-[#0a1a14] active:bg-[#10241b]",
    selectedClass:
      "bg-[#0a1a14] shadow-[inset_0_0_0_1px_rgba(81,238,142,0.38),0_22px_70px_-42px_rgba(81,238,142,0.85)]",
    iconClass: "group-hover:text-[#51ee8e] group-focus-visible:text-[#51ee8e]",
    selectedIconClass: "text-[#51ee8e]",
  },
  {
    number: "4.0",
    name: "Proof",
    title: "Show what people can do",
    copy: "Replace static claims with portfolios, XP, public work, and community-backed reputation.",
    icon: Check,
    accentClass:
      "hover:bg-[#1c1807] hover:shadow-[inset_0_0_0_1px_rgba(242,255,30,0.32),0_22px_70px_-42px_rgba(242,255,30,0.78)] focus-visible:bg-[#1c1807] active:bg-[#27220d]",
    selectedClass:
      "bg-[#1c1807] shadow-[inset_0_0_0_1px_rgba(242,255,30,0.34),0_22px_70px_-42px_rgba(242,255,30,0.78)]",
    iconClass: "group-hover:text-[#f2ff1e] group-focus-visible:text-[#f2ff1e]",
    selectedIconClass: "text-[#f2ff1e]",
  },
  {
    number: "5.0",
    name: "Monitor",
    title: "See progress at scale",
    copy: "Track learning, shipping, earnings, and engagement so teams know what needs attention next.",
    icon: Zap,
    accentClass:
      "hover:bg-[#071924] hover:shadow-[inset_0_0_0_1px_rgba(39,204,255,0.34),0_22px_70px_-42px_rgba(39,204,255,0.82)] focus-visible:bg-[#071924] active:bg-[#0d2332]",
    selectedClass:
      "bg-[#071924] shadow-[inset_0_0_0_1px_rgba(39,204,255,0.36),0_22px_70px_-42px_rgba(39,204,255,0.82)]",
    iconClass: "group-hover:text-[#27ccff] group-focus-visible:text-[#27ccff]",
    selectedIconClass: "text-[#27ccff]",
  },
];

const principles = [
  {
    title: "Built for purpose",
    copy: "Zero Club is shaped around the practices of modern digital builders.",
    icon: Layers3,
    artworkSrc: "/zero-club-purpose-art.png",
  },
  {
    title: "Powered by proof",
    copy: "Projects, posts, XP, and portfolios become a living record of ability.",
    icon: Code2,
    artworkSrc: "/zero-club-proof-art.png",
  },
  {
    title: "Made for motion",
    copy: "Communities, classes, stores, and wallets sit close to the work itself.",
    icon: Play,
    artworkSrc: "/zero-club-community-art.png",
  },
];

const audienceCards = [
  {
    title: "Builders",
    copy: "Learn skills, ship projects, join clubs, and build a public record of progress.",
    className: "bg-[linear-gradient(145deg,#ffe2f4,#cc208f)] text-[#08090c]",
  },
  {
    title: "Creators",
    copy: "Run cohorts, sell knowledge, host communities, and stay close to your members.",
    className: "bg-[linear-gradient(145deg,#f2ff1e,#ff77cd)] text-[#08090c]",
  },
  {
    title: "Teams",
    copy: "Discover talent through proof of work, not polished claims or stale resumes.",
    className: "bg-[linear-gradient(145deg,#cc208f,#581241)] text-white",
  },
];

const partnerLogos = [
  { name: "Paystack", src: "/partners/paystack-uploaded.png" },
  { name: "Vigency", src: "/partners/vigency-uploaded.png" },
  { name: "Stranja", src: "/partners/stranja-uploaded.png" },
  { name: "Spyda", src: "/partners/spyda-uploaded.png" },
  { name: "Stranja", src: "/partners/stranja-uploaded-2.png" },
];

const showcaseCards = [
  {
    title: "Builder profiles",
    copy: "A living portfolio that brings projects, clubs, posts, XP, and earnings into one place.",
    icon: UsersRound,
    artworkSrc: "/showcase-builder-profiles.png",
  },
  {
    title: "Bootcamps",
    copy: "Structured programs for learning, assignments, feedback, and visible progress.",
    icon: BookOpen,
    artworkSrc: "/showcase-bootcamps.png",
  },
  {
    title: "Private clubs",
    copy: "High-signal spaces for teams, cohorts, and communities to build around shared goals.",
    icon: MessageCircle,
    artworkSrc: "/showcase-private-clubs.png",
  },
  {
    title: "Wallet and store",
    copy: "A path from knowledge and reputation to digital products, paid access, and income.",
    icon: Wallet,
    artworkSrc: "/showcase-wallet-and-store.png",
  },
];

const footerGroups = [
  {
    title: "Product",
    links: ["Bootcamps", "Clubs", "Profiles", "Store", "Wallet"],
  },
  {
    title: "Community",
    links: ["Builder feed", "Private clubs", "Challenges", "XP system"],
  },
  {
    title: "Company",
    links: ["About", "Careers", "Blog", "Contact"],
  },
  {
    title: "Legal",
    links: ["Privacy", "Terms"],
  },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="Zero Club home">
      <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
      {!compact && (
        <span className="text-[25px] font-semibold leading-none tracking-[-0.03em] text-white md:text-[21px]">
          Zero <span className="text-[#cc208f]">Club</span>
        </span>
      )}
    </Link>
  );
}

function PartnerMarquee() {
  const scrollingPartners = [...partnerLogos, ...partnerLogos];

  return (
    <div className="relative left-1/2 mt-20 ml-[-50vw] flex h-[82px] w-screen items-center overflow-hidden border-y border-white/[0.08] md:h-[104px]">
      <motion.div
        animate={{ x: ["-50%", "0%"] }}
        transition={{ duration: 32, ease: "linear", repeat: Infinity }}
        className="flex w-max items-center gap-10"
      >
        {scrollingPartners.map((partner, index) => (
          <div
            key={`${partner.name}-${index}`}
            className="flex h-[118px] min-w-[280px] items-center justify-center md:h-[150px] md:min-w-[390px]"
          >
            <img
              src={partner.src}
              alt={partner.name}
              className="max-h-full w-full max-w-[390px] object-contain"
            />
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function Header({ referralCode }: ReferralProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      <header
        className={`fixed left-0 top-0 z-[80] flex h-[72px] w-full items-center justify-between border-b px-5 transition-colors duration-300 md:h-[76px] md:px-10 ${
          isScrolled || isOpen
            ? "border-[#cc208f]/20 bg-[#050608]/90 backdrop-blur-xl"
            : "border-[#cc208f]/10 bg-[#050608]/75 backdrop-blur-xl"
        }`}
      >
        <BrandMark />

        <nav className="hidden items-center gap-8 text-[14px] font-medium text-[#8f929b] lg:flex">
          <a href="#product" className="transition-colors hover:text-white">
            Product
          </a>
          <a href="#showcase" className="transition-colors hover:text-white">
            Features
          </a>
          <a href="#customers" className="transition-colors hover:text-white">
            Customers
          </a>
          <a href="#footer" className="transition-colors hover:text-white">
            Resources
          </a>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            to="/signin"
            search={{ ref: referralCode, club: undefined }}
            className="hidden text-[15px] font-medium text-[#8f929b] transition-colors hover:text-white sm:block"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            search={{ ref: referralCode, club: undefined }}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#cc208f] px-6 text-[15px] font-semibold text-white shadow-[0_0_28px_rgba(204,32,143,0.28)] transition-colors hover:bg-[#e033a8]"
          >
            Sign up
          </Link>
          <button
            type="button"
            aria-label={isOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((value) => !value)}
            className="grid h-10 w-10 place-items-center rounded-full text-white transition-colors hover:bg-white/[0.06] lg:hidden"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] overflow-y-auto bg-[#050608] px-5 pb-12 pt-[104px] lg:hidden"
          >
            <div className="mx-auto max-w-[720px]">
              {menuGroups.map((group) => (
                <div key={group.label} className="border-b border-white/[0.06] py-8 last:border-b-0">
                  <p className="mb-7 text-[19px] font-semibold text-[#737780]">{group.label}</p>
                  <div className="grid gap-6">
                    {group.links.map((item) => (
                      <a
                        key={item}
                        href="#product"
                        onClick={() => setIsOpen(false)}
                        className="text-[34px] font-semibold leading-none tracking-[-0.04em] text-white"
                      >
                        {item}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Hero({ referralCode }: ReferralProps) {
  return (
    <section className="relative min-h-[92vh] overflow-hidden px-5 pb-12 pt-36 md:min-h-screen md:px-10 md:pt-40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_50%_0%,rgba(204,32,143,0.32),transparent_48%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(5,6,8,0.65)_68%,#050608)]" />

      <div className="relative mx-auto flex max-w-[1180px] flex-col">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-[940px]"
        >
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#cc208f]/20 bg-[#cc208f]/10 px-3 py-1.5 text-[13px] font-medium text-[#f3c4e5]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#cc208f]" />
            Zero Club is now open for builders
          </div>

          <h1 className="max-w-[930px] text-[58px] font-semibold leading-[0.94] tracking-[-0.06em] text-white sm:text-[82px] md:text-[118px]">
            Zero Club
          </h1>
          <p className="mt-7 max-w-[820px] text-[27px] font-semibold leading-[1.15] tracking-[-0.045em] text-white md:text-[48px]">
            A new species of builder network.
            <span className="block text-[#777a84]">
              Purpose-built for modern learning, proof of work, and opportunity.
            </span>
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/signup"
              search={{ ref: referralCode, club: undefined }}
              className="group inline-flex h-12 items-center justify-center rounded-full bg-[#cc208f] px-6 text-[15px] font-semibold text-white shadow-[0_0_38px_rgba(204,32,143,0.28)] transition-colors hover:bg-[#e033a8]"
            >
              Start building
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#product"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.07]"
            >
              Explore product
            </a>
          </div>
        </motion.div>

        <PartnerMarquee />
      </div>
    </section>
  );
}

function ProductDirection() {
  const [activeStep, setActiveStep] = useState<string | null>(null);

  return (
    <section id="product" className="border-b border-white/[0.08] px-5 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-[1180px]">
        <div className="max-w-[760px]">
          <p className="mb-4 text-[15px] font-medium text-[#797d86]">Product direction</p>
          <h2 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.055em] text-white md:text-[78px]">
            Plan, build, and show progress at scale.
          </h2>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-[8px] border border-white/[0.08] bg-white/[0.08] lg:grid-cols-5">
          {productSteps.map((step) => (
            <article
              key={step.name}
              tabIndex={0}
              onClick={() => setActiveStep(step.name)}
              onTouchStart={() => setActiveStep(step.name)}
              className={`group cursor-pointer bg-[#0a0b0d] p-6 outline-none transition-[background-color,box-shadow] duration-300 ${step.accentClass} ${
                activeStep === step.name ? step.selectedClass : ""
              }`}
            >
              <div className="mb-12 flex items-center justify-between text-[15px] font-medium text-[#747780]">
                <span>{step.number}</span>
                <step.icon
                  className={`h-5 w-5 transition-colors ${
                    activeStep === step.name ? step.selectedIconClass : step.iconClass
                  }`}
                />
              </div>
              <h3 className="text-[24px] font-semibold tracking-[-0.04em] text-white">{step.title}</h3>
              <p className="mt-4 text-[15px] leading-6 text-[#8f929b]">{step.copy}</p>
              <a href="#showcase" className="mt-8 inline-flex items-center gap-2 text-[15px] font-medium text-[#8f929b]">
                {step.name}
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PrincipleCards() {
  return (
    <section className="overflow-hidden border-b border-white/[0.08] px-5 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-14 max-w-[760px]">
          <h2 className="text-[32px] font-semibold leading-[1.12] tracking-[-0.05em] text-white md:text-[58px]">
            A product operating system for ambitious builders.
          </h2>
        </div>

        <div className="flex snap-x gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {principles.map((card) => (
            <article
              key={card.title}
              className="relative h-[430px] min-w-[86vw] snap-start overflow-hidden rounded-[8px] border border-white/[0.08] bg-[#111214] p-8 sm:min-w-[420px] lg:min-w-0 lg:flex-1"
            >
              {card.artworkSrc ? (
                <div className="absolute inset-x-10 top-12 flex h-[230px] items-center justify-center overflow-hidden rounded-[8px] border border-white/[0.09] bg-[linear-gradient(145deg,rgba(204,32,143,0.14),rgba(255,255,255,0.01))]">
                  <img
                    src={card.artworkSrc}
                    alt=""
                    className="h-full w-full object-contain p-4"
                  />
                </div>
              ) : (
                <>
                  <div className="absolute inset-x-10 top-14 h-[210px] rounded-[8px] border border-white/[0.09] bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.01))]" />
                  <div className="absolute left-1/2 top-20 h-36 w-36 -translate-x-1/2 rotate-45 rounded-[8px] border border-white/[0.16]" />
                  <div className="absolute left-1/2 top-32 h-28 w-28 -translate-x-1/2 rounded-full border border-white/[0.08]" />
                  <card.icon className="absolute left-1/2 top-[126px] h-12 w-12 -translate-x-1/2 text-white/45" />
                </>
              )}
              <div className="absolute bottom-8 left-8 right-8">
                <h3 className="text-[20px] font-semibold tracking-[-0.03em] text-white">{card.title}</h3>
                <p className="mt-4 text-[17px] leading-7 text-[#8f929b]">{card.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Showcase() {
  return (
    <section id="showcase" className="border-b border-white/[0.08] py-20 md:py-28">
      <div className="px-5 md:px-10">
        <div className="mx-auto max-w-[1180px]">
          <p className="mb-4 text-[15px] font-medium text-[#797d86]">Built for modern teams</p>
          <h2 className="max-w-[780px] text-[38px] font-semibold leading-[1.05] tracking-[-0.055em] text-white md:text-[72px]">
            Everything needed to turn skill into opportunity.
          </h2>
        </div>
      </div>

      <div className="mt-14 px-5 md:px-10">
        <div className="mx-auto grid max-w-[1180px] gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {showcaseCards.map((card) => (
            <article
              key={card.title}
              className="flex min-h-[420px] flex-col rounded-[8px] border border-white/[0.08] bg-[#0b0c0e] p-7"
            >
              <div className="mb-12 flex h-[210px] items-center justify-center overflow-hidden rounded-[8px] border border-white/[0.08] bg-[#101114] p-4">
                <img
                  src={card.artworkSrc}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="mt-auto">
                <h3 className="text-[26px] font-semibold tracking-[-0.04em] text-white">{card.title}</h3>
                <p className="mt-4 text-[17px] leading-7 text-[#8f929b]">{card.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section id="customers" className="overflow-hidden border-b border-white/[0.08] px-5 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-14 max-w-[760px]">
          <h2 className="text-center text-[42px] font-semibold leading-[1.05] tracking-[-0.055em] text-white md:text-[68px]">
            Built for the future. Available today.
          </h2>
        </div>
      </div>

      <div className="flex snap-x gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {audienceCards.map((card) => (
          <article
            key={card.title}
            className={`flex h-[430px] min-w-[82vw] snap-start flex-col justify-between rounded-[8px] p-8 sm:min-w-[430px] ${card.className}`}
          >
            <p className="text-[31px] font-semibold leading-[1.16] tracking-[-0.055em]">
              "{card.copy}"
            </p>
            <div>
              <div className="mb-6 h-10 w-10 rounded-full border border-current/25" />
              <p className="text-[17px] font-semibold">{card.title}</p>
              <p className="text-[15px] opacity-60">Zero Club</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="footer" className="bg-[#050608] px-5 py-16 md:px-10 md:py-20">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-12 flex items-center justify-between border-b border-white/[0.08] pb-8">
          <BrandMark />
          <div className="flex items-center gap-3 text-[#8f929b]">
            <Github className="h-5 w-5" />
            <Briefcase className="h-5 w-5" />
            <MessageCircle className="h-5 w-5" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-10 gap-y-16 md:grid-cols-4">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-8 text-[17px] font-semibold tracking-[-0.02em] text-white">{group.title}</h3>
              <ul className="grid gap-6">
                {group.links.map((link) => (
                  <li key={link}>
                    <Link to="/" className="text-[17px] font-medium text-[#8f929b] transition-colors hover:text-white">
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

function Landing() {
  const { ref } = useSearch({ from: "/" });

  return (
    <div className="min-h-screen bg-[#050608] font-['Montserrat'] text-white selection:bg-[#cc208f]/30">
      <Header referralCode={ref} />
      <main>
        <Hero referralCode={ref} />
        <ProductDirection />
        <PrincipleCards />
        <Showcase />
        <Testimonials />
      </main>
      <Footer />
    </div>
  );
}
