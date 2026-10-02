import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { HeroStage } from "@/features/landing/HeroStage";
import { CanvasVideo } from "@/features/landing/CanvasVideo";
import { PartnerMarquee } from "@/features/landing/PartnerMarquee";
import { useReveal } from "@/hooks/useReveal";
import { usePointerGlow, useParallax, usePrefersReducedMotion } from "@/hooks/useLandingMotion";
import { Bloom, Seam, Spotlight } from "@/features/landing/LandingKit";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  LoaderCircle,
  Mail,
  Send,
  Sun,
  ThumbsUp,
  Menu,
  Moon,
  MessageSquare,
  Radio,
  Search,
  X,
  Zap,
} from "@/components/icons/glyphs";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { usePublicTheme } from "@/hooks/usePublicTheme";
import {
  IconClubs,
  IconLearn,
  IconPresentation,
  IconProfile,
  IconWallet,
} from "@/components/icons/nav";

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
    ],
  }),
});

type ReferralProps = {
  referralCode?: string;
};

const mobileNavGroups = [
  {
    label: "Build",
    items: [
      { label: "Docs", detail: "The complete guide to Zero Club", href: "/docs", slug: null },
      {
        label: "Metrics",
        detail: "Your proof, progress, and momentum",
        href: "/explore/metrics",
        slug: "metrics",
      },
      {
        label: "Zero AI",
        detail: "A practical thinking partner",
        href: "/explore/zero-ai",
        slug: "zero-ai",
      },
    ],
  },
  {
    label: "Explore",
    items: [
      {
        label: "Feed",
        detail: "Follow real work and progress",
        href: "/explore/feed",
        slug: "feed",
      },
      {
        label: "Bootcamps",
        detail: "Learn with working professionals",
        href: "/explore/bootcamps",
        slug: "bootcamps",
      },
      {
        label: "Clubs",
        detail: "Focused communities around work",
        href: "/explore/clubs",
        slug: "clubs",
      },
      {
        label: "Opportunities",
        detail: "Open doors through proof",
        href: "/explore/opportunities",
        slug: "opportunities",
      },
    ],
  },
  {
    label: "Earn",
    items: [
      {
        label: "Wallet",
        detail: "Manage what your work earns",
        href: "/explore/wallet",
        slug: "wallet",
      },
      {
        label: "Store",
        detail: "Sell products and private access",
        href: "/explore/store",
        slug: "store",
      },
    ],
  },
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

const zeroClubFeatures = [
  {
    title: "Builder feed",
    copy: "Share progress, receive feedback, and build a record of work people can trust.",
    icon: <IconProfile className="h-[22px] w-[22px]" />,
  },
  {
    title: "Live bootcamps",
    copy: "Learn from working professionals in focused cohorts with curriculum and real momentum.",
    icon: <IconLearn className="h-[22px] w-[22px]" />,
  },
  {
    title: "Focused clubs",
    copy: "Keep your people, conversations, projects, and shared goals in one purposeful place.",
    icon: <IconClubs className="h-[22px] w-[22px]" />,
  },
  {
    title: "Zero AI",
    copy: "Get help to think through lessons, ideas, projects, and your next practical move.",
    icon: (
      <img decoding="async" src="/logo.png" alt="" className="h-[22px] w-[22px] object-contain" />
    ),
  },
  {
    title: "Creator wallet",
    copy: "Earn from bootcamps, products, and private access without leaving your community.",
    icon: <IconWallet className="h-[22px] w-[22px]" />,
  },
  {
    title: "Opportunities",
    copy: "Meet builders, tutors, institutions, and teams through proof rather than empty profiles.",
    icon: <IconPresentation className="h-[22px] w-[22px]" />,
  },
];

const platformHighlights = [
  {
    title: "A profile that shows real progress",
    copy: "Posts, projects, clubs, XP, bootcamps, and public proof — one credible builder identity.",
    video: "/highlights/profile.mp4",
    poster: "/highlights/profile.webp",
  },
  {
    title: "Learn in public, together",
    copy: "Join live bootcamps, follow structured paths, and make your learning visible through shipped work.",
    video: "/highlights/learn.mp4",
    poster: "/highlights/learn.webp",
  },
  {
    title: "Communities built around work",
    copy: "Private clubs keep cohorts, teams, tutors, and creators close to the conversations that matter.",
    video: "/highlights/communities.mp4",
    poster: "/highlights/communities.webp",
  },
];

const audienceCards = [
  {
    title: "For builders",
    copy: "Share what you're learning, document your work, join clubs, and build a profile that compounds.",
    art: "/audience/builders.webp",
  },
  {
    title: "For tutors",
    copy: "Run live bootcamps, manage curriculum, teach communities, and earn from your knowledge.",
    art: "/audience/tutors.webp",
  },
  {
    title: "For institutions",
    copy: "Create structured learning spaces, support cohorts, and track real learner participation.",
    art: "/audience/institutions.webp",
  },
  {
    title: "For teams",
    copy: "Find people through proof of work, contribution history, and community signal.",
    art: "/audience/teams.webp",
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
      <img decoding="async" src="/logo.png" alt="" className="h-8 w-8 object-contain" />
      <span
        className={`font-display text-[19px] font-semibold tracking-tight ${light ? "text-white" : "text-[#171717] dark:text-white"}`}
      >
        Zero <span className="text-[#cc208f]">Club</span>
      </span>
    </Link>
  );
}

function Header({ referralCode }: ReferralProps) {
  // Shared with sign in, sign up, docs and explore, so the choice survives
  // leaving this page.
  const { dark, toggle: toggleTheme } = usePublicTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // A dropdown opened by hover still needs a keyboard way out.
  useEffect(() => {
    if (!openGroup) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenGroup(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openGroup]);

  useEffect(() => {
    const updateHeader = () => setIsScrolled(window.scrollY > 12);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow] duration-200 ${
          isOpen || isScrolled
            ? "border-[#171717]/[0.08] dark:border-white/10 bg-[#f4f2ef] dark:bg-[#0f0d12] shadow-[0_1px_0_rgba(23,23,23,0.02)]"
            : "ransparent bg-transparent shadow-none"
        }`}
      >
        {/* Full width, not a centred 1180px column.
          On a 1366px screen that column left ~93px of dead margin on each
          side, so the logo floated inward from the left edge and Join floated
            inward from the right — the header read as a narrow strip laid on the
            page rather than the top of it. A header belongs to the window; only
            the reading content below needs a measure. */}
        <div className="flex h-[calc(4rem+env(safe-area-inset-top))] w-full items-end justify-between px-4 pb-3 pt-[env(safe-area-inset-top)] md:px-6 lg:px-8">
          <BrandMark />

          {/* The same three groups the mobile menu uses, as dropdowns.
            The old bar was five #anchor links that only scrolled this page —
              so the desktop header advertised sections while the mobile menu
              offered real destinations. One source of truth now: mobileNavGroups
              drives both. */}
          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Primary navigation"
            onMouseLeave={() => setOpenGroup(null)}
          >
            {mobileNavGroups.map((group) => {
              const isOpen = openGroup === group.label;
              return (
                <div
                  key={group.label}
                  className="relative"
                  onMouseEnter={() => setOpenGroup(group.label)}
                >
                  <button
                    type="button"
                    onClick={() => setOpenGroup(isOpen ? null : group.label)}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight transition-colors ${
                      isOpen
                        ? "bg-[#171717]/[0.05] text-[#171717] dark:bg-white/10 dark:text-white"
                        : "text-[#666a70] hover:bg-[#171717]/[0.04] hover:text-[#171717] dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white"
                    }`}
                  >
                    {group.label}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="absolute left-0 top-full z-50 w-[320px] pt-2">
                      <div className="overflow-hidden rounded-xl border border-[#171717]/[0.08] bg-[#f7f6f3] p-1.5 dark:border-white/10 dark:bg-[#16131a]">
                        {group.items.map((item) => (
                          <Link
                            key={item.href}
                            {...(item.slug
                              ? { to: "/explore/$slug" as const, params: { slug: item.slug } }
                              : { to: "/docs" as const, search: { page: undefined } })}
                            onClick={() => setOpenGroup(null)}
                            preload={false}
                            className="group/item flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#171717]/[0.04] dark:hover:bg-white/[0.06]"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold tracking-tight text-[#171717] dark:text-white">
                                {item.label}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-4 text-[#6d6269] dark:text-white/50">
                                {item.detail}
                              </span>
                            </span>
                            <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#cc208f] opacity-0 transition-opacity group-hover/item:opacity-100" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              title={dark ? "Switch to light" : "Switch to dark"}
              aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              aria-pressed={dark}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#4d4f55] dark:text-white/60 transition-colors hover:bg-[#171717]/[0.04] dark:text-white/70 dark:hover:bg-white/10 sm:h-10 sm:w-10"
            >
              {dark ? (
                <Sun className="h-[18px] w-[18px]" />
              ) : (
                <Moon className="h-[18px] w-[18px]" />
              )}
            </button>
            <Link
              to="/signin"
              search={{ ref: referralCode, club: undefined }}
              className="hidden rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#4d4f55] dark:text-white/60 transition-colors hover:bg-[#171717]/[0.04] dark:text-white/70 dark:hover:bg-white/10 sm:inline-flex"
              preload={false}
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              search={{ ref: referralCode, club: undefined }}
              className="inline-flex h-9 w-[68px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#171717] px-0 text-[12.5px] font-semibold tracking-tight text-white transition hover:opacity-90 dark:bg-white dark:text-[#171717] active:scale-[0.97] sm:h-10 sm:w-auto sm:px-5 sm:text-[13.5px]"
              preload={false}
            >
              <span className="sm:hidden">Join</span>
              <span className="hidden sm:inline">Join Zero Club</span>
            </Link>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-[#303236] dark:text-white transition hover:bg-[#171717]/[0.04] dark:text-white dark:hover:bg-white/10 lg:hidden"
              aria-label={isOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={isOpen}
              onClick={() => setIsOpen((value) => !value)}
            >
              {isOpen ? <X className="h-6 w-7" /> : <Menu className="h-6 w-7" strokeWidth={2.25} />}
            </button>
          </div>
        </div>
      </header>

      {isOpen && (
        <div className="fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] bottom-0 z-40 overflow-y-auto overscroll-contain bg-[#f4f2ef] dark:bg-[#0f0d12] px-5 py-5 lg:hidden">
          <div className="mx-auto max-w-xl pb-10">
            <div className="space-y-7">
              {mobileNavGroups.map((group) => (
                <section key={group.label}>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#766d73] dark:text-white/45">
                    {group.label}
                  </p>
                  <div>
                    {group.items.map((item) => (
                      <Link
                        key={item.label}
                        {...(item.slug
                          ? { to: "/explore/$slug" as const, params: { slug: item.slug } }
                          : { to: "/docs" as const, search: { page: undefined } })}
                        onClick={() => setIsOpen(false)}
                        preload={false}
                        className="group flex items-center justify-between gap-4 py-3.5 transition-colors active:opacity-70"
                      >
                        <span>
                          <span className="block font-display text-[28px] font-medium leading-none tracking-tight text-[#171417] dark:text-white">
                            {item.label}
                          </span>
                          <span className="mt-1 block text-[11.5px] leading-5 text-[#6d6269] dark:text-white/55">
                            {item.detail}
                          </span>
                        </span>
                        <ArrowUpRight className="h-5 w-5 shrink-0 text-[#cc208f] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <Link
                to="/signin"
                search={{ ref: referralCode, club: undefined }}
                onClick={() => setIsOpen(false)}
                className="flex h-12 items-center justify-center rounded-lg border border-[#171717]/12 dark:border-white/12 text-[13px] font-semibold text-[#242126] dark:text-white"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                search={{ ref: referralCode, club: undefined }}
                onClick={() => setIsOpen(false)}
                className="flex h-12 items-center justify-center rounded-lg bg-[#171417] dark:bg-white px-4 text-[13px] font-semibold text-white dark:text-[#171417]"
              >
                Join Zero Club
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
   * Download button for the Android app, shown only on Android.
   *
   * An APK is useless on iPhone and desktop, so showing it there would only add
   * noise to the hero. Detection runs in an effect rather than during render:
   * this route is server-rendered, `navigator` does not exist on the server, and
   * assuming a value would make the server and client markup disagree. Starting
   * hidden and revealing after mount keeps hydration clean, and means non-Android
   * visitors never see a flash of a button meant for someone else.
   */
function AndroidAppDownload() {
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Excludes Windows Phone, whose old user agent string also contains
    // "Android" for compatibility reasons.
    const ua = navigator.userAgent;
    setIsAndroid(/android/i.test(ua) && !/windows phone/i.test(ua));
  }, []);

  if (!isAndroid) return null;

  return (
    <a
      href="/downloads/zero-club.apk"
      // Tells the browser to download rather than try to render it, and gives
      // the saved file a sensible name in the user's Downloads folder.
      download="zero-club.apk"
      className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#cc208f] px-7 text-[15px] font-semibold tracking-tight text-white shadow-sm transition hover:bg-[#b31c7d] active:scale-[0.98]"
    >
      <Download className="h-4 w-4" />
      Download the Android app
    </a>
  );
}

function ProductSection() {
  /*
   * What the old hero carried, kept.
   *
   * Keeps the Android download link (a real install path) beneath the first
   * screen. The product mockup and the "Live Clubs" rail were removed.
   */
  return (
    <section className="relative overflow-hidden bg-[#f4f2ef] dark:bg-[#0f0d12]">
      <div className="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-[#cc208f]/[0.07] blur-[100px]" />
      {/* Partner strip leads into the section: it is the bridge from the
          hero's promise to "everything you build", and it no longer competes
          with the hero's call to action. */}
      <div className="relative mx-auto max-w-[1320px] px-4 pt-10 md:px-6 md:pt-12 lg:pt-14">
        <PartnerMarquee />
      </div>
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-center gap-10 px-4 pb-14 pt-10 md:px-6 md:pb-16 md:pt-12 lg:pb-20 lg:pt-14">
        <div className="min-w-0">
          <h2 className="max-w-[620px] font-display text-[clamp(24px,4.4vw,38px)] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white">
            Everything you build, in one place.
          </h2>
          <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-[#4d4f55] dark:text-white/60 md:text-[17px]">
            Profiles, clubs, live bootcamps, a wallet and a store — so the work, the people and the
            money all live where the learning happens.
          </p>

          <AndroidAppDownload />
        </div>
      </div>
    </section>
  );
}

function TopicExplorer() {
  return (
    <section id="people" className="bg-white dark:bg-[#141118]">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-12 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
        <div>
          <p className="zc-eyebrow">Find your people</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            The people and work that move your goals forward
          </h2>
        </div>
        <div>
          <label className="mb-5 flex min-h-13 items-center gap-3 rounded-full bg-[#f4f2ef] dark:bg-[#0f0d12] px-5 py-3.5 ring-1 ring-transparent transition-all focus-within:bg-white focus-within:ring-[#cc208f]/40">
            <Search className="h-4.5 w-4.5 shrink-0 text-[#666a70] dark:text-white/55" />
            <input
              type="text"
              aria-label="Search Zero Club"
              placeholder="Search goals, people, clubs, bootcamps, and projects"
              className="w-full bg-transparent text-[15px] text-[#171717] dark:text-white outline-none placeholder:text-[#666a70]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {searchTopics.map((topic) => (
              <a
                key={topic}
                href="#learning"
                className="rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#4d4f55] ring-1 ring-[#171717]/12 transition hover:bg-[#171717] hover:text-white hover:ring-transparent dark:text-white/60 dark:ring-white/15 dark:hover:bg-white dark:hover:text-[#171717]"
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
  // Decoration, so it yields to anyone who has asked for less of it.
  const reducedMotion = usePrefersReducedMotion();

  return (
    <section id="learning" className="bg-[#fbfaf8] dark:bg-[#16131a]">
      <div className="mx-auto max-w-[1320px] px-4 py-12 md:px-6 lg:py-20">
        <div className="max-w-[640px]">
          <p className="zc-eyebrow">Learning that compounds</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            Take bootcamps, join clubs, and make your progress visible.
          </h2>
        </div>
        <div className="mx-auto mt-10 max-w-[860px] pb-5">
          {platformHighlights.map((item, index) => (
            /* These stack as you scroll, so each one is seen against the last
               — which is exactly when a flat panel with a 1px ring looks
               unfinished. zc-surface-light gives the same treatment as the
               showcase: a hairline along the top edge, a soft inner glow, and
               a contact shadow under a wide ambient one. The pink wash in the
               corner keeps the brand present without a border doing it. */
            <article
              key={item.title}
              className="zc-surface-light zc-glow-card group sticky mb-5 overflow-hidden rounded-[22px] bg-white dark:bg-[#141118]"
              style={{ top: "4.75rem", zIndex: index + 1 }}
            >
              {/*
                Silent by construction, not by attribute.
                
                The audio track was removed from the file itself, so there is
                nothing left that a browser, an extension, or a right-click
                could ever unmute. `muted` is still set because autoplay is
                refused without it on every mobile browser, and `playsInline`
                because iOS otherwise takes the video fullscreen the moment it
                starts — which would be startling on a landing page.
                
                The poster is the first frame, so the card shows its artwork
                immediately instead of a black rectangle while the file loads.
              */}
              {/* Painted onto a canvas so mobile browsers don't float their own
                  download button over it — see CanvasVideo. */}
              <CanvasVideo
                src={item.video}
                poster={item.poster}
                play={!reducedMotion}
                className="aspect-video w-full bg-[#f4f2ef] dark:bg-[#0f0d12]"
              />
              <div className="bg-gradient-to-br from-white via-[#fbfaf8] to-[#f2f0ec] p-6 dark:from-[#1d1922] dark:via-[#161219] dark:to-[#121016] md:p-8">
                <h3 className="max-w-[620px] text-[19px] font-semibold leading-snug tracking-tight text-[#171717] dark:text-white md:text-[22px]">
                  {item.title}
                </h3>
                <p className="mt-2.5 max-w-[650px] text-[13.5px] leading-relaxed text-[#666a70] dark:text-white/55 md:text-[14px]">
                  {item.copy}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClubsSection() {
  return (
    <section id="clubs" className="bg-white dark:bg-[#141118]">
      <div className="mx-auto grid max-w-[1320px] items-center gap-10 px-4 py-12 md:px-6 lg:grid-cols-2 lg:py-20">
        {/* The visual arrives from the side it sits on and drifts a little
            against the text as you pass, so the row assembles toward its own
            centre instead of everything sliding the same way. */}
        <div data-reveal="left" className="order-2 lg:order-1">
          <div data-parallax="0.10" className="zc-parallax relative">
            <Bloom className="-left-10 top-1/3 h-56 w-56" />
            <img
              decoding="async"
              src="/landing-communities-purpose.png"
              alt="Zero Club private clubs"
              className="relative h-[360px] w-full rounded-lg bg-[#f7f5f2] dark:bg-[#16131a] object-cover ring-1 ring-[#171717]/[0.08] dark:ring-white/10"
            />
          </div>
        </div>
        <div data-reveal="right" className="order-1 lg:order-2">
          <p className="zc-eyebrow">Communities with a purpose</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
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
                <p className="text-[15.5px] leading-relaxed text-[#4d4f55] dark:text-white/60">
                  {item}
                </p>
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
    <section id="opportunities" className="bg-[#f4f2ef] dark:bg-[#0f0d12]">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-12 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
        <div>
          <p className="zc-eyebrow">Open doors through proof</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            A network for people who want to be known by what they build.
          </h2>
        </div>
        <div className="pb-5">
          {audienceCards.map((card, index) => (
            /* The illustration is the card now, so the icon has gone — a small
               mark above a full piece of art was the art competing with a
               thumbnail of itself. The 3:2 ratio is the artwork's own, so
               nothing is cropped at any width. */
            <article
              key={card.title}
              className="sticky mb-5 overflow-hidden rounded-lg bg-white ring-1 ring-[#171717]/[0.08] dark:bg-[#141118] dark:ring-white/10"
              style={{ top: "4.75rem", zIndex: index + 1 }}
            >
              <img
                src={card.art}
                alt=""
                width={1200}
                height={800}
                loading="lazy"
                decoding="async"
                className="aspect-[3/2] w-full bg-[#f4f2ef] object-cover dark:bg-[#0f0d12]"
              />
              {/* The words sit on the same gradient the stacking cards use,
                  rather than a flat fill. It runs top-left to bottom-right so
                  the lighter end meets the illustration above it and the block
                  settles as it goes down — a flat panel under a full piece of
                  art reads as a caption bolted on. */}
              <div className="bg-gradient-to-br from-white via-[#fbfaf8] to-[#f2f0ec] p-6 dark:from-[#1d1922] dark:via-[#161219] dark:to-[#121016]">
                <h3 className="text-[17px] font-semibold tracking-tight text-[#171717] dark:text-white">
                  {card.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#666a70] dark:text-white/55">
                  {card.copy}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function WalletSection() {
  return (
    <section id="wallet" className="bg-white dark:bg-[#141118]">
      <div className="mx-auto grid max-w-[1320px] items-center gap-10 px-4 py-12 md:px-6 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="zc-eyebrow">Creator economy built in</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            Teach, sell, earn, and manage it all in one account.
          </h2>
          <div className="mt-8 flex flex-wrap gap-2">
            {[
              "Paid bootcamps",
              "Digital products",
              "Creator wallet",
              "Coupons",
              "Private access",
            ].map((item) => (
              <span
                key={item}
                className="rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#4d4f55] dark:text-white/60 ring-1 ring-[#171717]/12 dark:ring-white/15"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* The actual wallet card from the product, built in code */}
        <div className="relative mx-auto w-full max-w-[440px]">
          <div className="pointer-events-none absolute -top-10 -right-8 h-52 w-52 rounded-full bg-[#cc208f]/15 blur-[70px]" />
          {/* Kept in step with the real card in app/wallet: the same gradient
              shell, the same 26px radius, the same two colour washes and
              embossed rings, and the same two figures — balance above,
              withdrawable earnings on the bottom line. If the product card
              changes, this is the one to change with it. */}
          <div className="relative flex min-h-[252px] flex-col overflow-hidden rounded-[26px] bg-gradient-to-br from-[#201924] via-[#151218] to-[#0e0c10] p-7 text-white ring-1 ring-black/10">
            <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[#cc208f]/20 blur-[72px]" />
            <div className="pointer-events-none absolute -bottom-28 -right-16 h-52 w-52 rounded-full bg-[#713bff]/15 blur-[76px]" />
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border-[20px] border-white opacity-[0.045]" />
            <div className="pointer-events-none absolute -bottom-14 right-20 h-28 w-28 rotate-12 border-[16px] border-white opacity-[0.035]" />

            <div className="relative z-10 flex flex-1 flex-col">
              <div className="mb-5 flex items-center gap-2">
                <img
                  decoding="async"
                  src="/logo.png"
                  alt=""
                  className="h-6 w-6 shrink-0 object-contain"
                />
                <span className="text-[11.5px] font-semibold tracking-tight text-white/85">
                  Zero Wallet
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-white/45">
                    Available balance
                  </p>
                  <h3 className="mt-2.5 flex items-start text-[46px] font-semibold leading-none tracking-[-0.045em] tabular-nums">
                    <span className="mr-2 mt-1 text-[23px] font-medium tracking-normal text-white/55">
                      ₦
                    </span>
                    <span>248,500</span>
                  </h3>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.065] text-white/55 ring-1 ring-white/[0.08]">
                  <IconWallet className="h-4 w-4" />
                </span>
              </div>

              <div className="mt-auto flex items-baseline justify-between gap-4 pt-6">
                <p className="text-[9.5px] font-medium uppercase tracking-[0.15em] text-white/45">
                  Withdrawable earnings
                </p>
                <p className="shrink-0 text-[17px] font-semibold tracking-tight tabular-nums text-white">
                  ₦92,400
                </p>
              </div>
            </div>
          </div>
          <div className="relative -mt-4 mx-6 rounded-lg bg-white dark:bg-[#141118] p-4 ring-1 ring-[#171717]/[0.06] dark:ring-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold tracking-tight text-[#171717] dark:text-white">
                  Bootcamp enrollment
                </p>
                <p className="text-[10.5px] text-[#666a70] dark:text-white/55">
                  UI Engineering · just now
                </p>
              </div>
              <span className="text-[13px] font-semibold text-emerald-600 tabular-nums">
                + ₦15,000
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="bg-[#f4f2ef] dark:bg-[#0f0d12]">
      <div className="mx-auto max-w-[1320px] px-4 py-12 md:px-6 lg:py-20">
        <div className="max-w-[650px]">
          <p className="zc-eyebrow">The Zero Club toolkit</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            The tools behind a more visible kind of progress.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#666a70] dark:text-white/55">
            Learn, build, find your people, and turn momentum into the next opportunity without
            spreading your work across separate apps.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-[900px] pb-5">
          {zeroClubFeatures.map((feature, index) => (
            <article
              key={feature.title}
              className="zc-glow-card sticky mb-5 min-h-[190px] rounded-[20px] bg-white p-6 dark:bg-[#141118] md:min-h-[205px] md:p-7"
              style={{ top: "4.75rem", zIndex: index + 1 }}
            >
              <div className="flex items-start">
                {/* The icon is the small light source each card is built
                    around, the way every card in the reference has one glowing
                    object in it. */}
                <div className="grid h-11 w-11 place-items-center rounded-[13px] bg-gradient-to-br from-[#cc208f]/20 to-[#cc208f]/[0.04] text-[#cc208f] ring-1 ring-[#cc208f]/25 shadow-[0_0_24px_-6px_rgba(204,32,143,0.55)]">
                  {feature.icon}
                </div>
              </div>
              <h3 className="mt-5 text-[18px] font-semibold tracking-tight text-[#171717] dark:text-white md:text-[20px]">
                {feature.title}
              </h3>
              <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-[#666a70] dark:text-white/55 md:text-[13.5px]">
                {feature.copy}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const faqs = [
  {
    q: "What is Zero Club?",
    a: "Zero Club is a social learning platform where you build skill, build proof and build opportunities for yourself.",
  },
  {
    q: "Who can join Zero Club?",
    a: "Whether you're a student learning new skills, a tutor looking to monetize your expertise, or an institution managing bootcamps, Zero Club is built for you.",
  },
  {
    q: "How does the Creator Wallet work?",
    a: "The built-in wallet lets you manage earnings from paid bootcamps, digital products, and private access seamlessly directly within the platform.",
  },
  {
    q: "Can I host my own bootcamps?",
    a: "Yes! Tutors and Institutions have access to dedicated studios where they can create, manage, and monetize their own bootcamps — including live video classes.",
  },
  {
    q: "Is Zero Club free to use?",
    a: "It is free to join and start building your network. We also offer Premium memberships for advanced features, and creators can charge for their own content.",
  },
];

type ContactFormState = {
  name: string;
  email: string;
  subject: string;
  description: string;
  website: string;
};

const emptyContactForm: ContactFormState = {
  name: "",
  email: "",
  subject: "",
  description: "",
  website: "",
};

function ContactSection() {
  const [form, setForm] = useState<ContactFormState>(emptyContactForm);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  const updateField = (field: keyof ContactFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (status !== "idle") {
      setStatus("idle");
      setFeedback("");
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("sending");
    setFeedback("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok)
        throw new Error(result.error || "Your message could not be sent. Please try again.");

      setForm(emptyContactForm);
      setStatus("sent");
      setFeedback("Message sent. The Zero Club team will get back to you soon.");
    } catch (error) {
      setStatus("error");
      setFeedback(
        error instanceof Error
          ? error.message
          : "Your message could not be sent. Please try again.",
      );
    }
  };

  const inputClass =
    "mt-2 w-full rounded-lg border border-[#171717]/[0.08] dark:border-white/10 bg-white dark:bg-[#141118] px-4 py-3 text-[14px] text-[#171717] dark:text-white outline-none transition placeholder:text-[#8a8c91] focus:border-[#cc208f]/50 focus:ring-4 focus:ring-[#cc208f]/[0.07]";

  return (
    <section id="contact" className="bg-white dark:bg-[#141118]">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-12 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-20">
        <div className="lg:pt-5">
          <p className="zc-eyebrow">Contact us</p>
          <h2 className="mt-3 max-w-[440px] font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            Let&apos;s talk about what you&apos;re building.
          </h2>
          <p className="mt-5 max-w-[430px] text-[14px] leading-relaxed text-[#666a70] dark:text-white/55 md:text-[15px]">
            Have a question, partnership idea, or need help with Zero Club? Send us a note and it
            will go directly to our team.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-lg bg-[#f4f2ef] dark:bg-[#0f0d12] p-5 ring-1 ring-[#171717]/[0.06] dark:ring-white/10 sm:p-7"
          noValidate={false}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-[12px] font-semibold text-[#343238] dark:text-white/75">
              Name
              <input
                required
                autoComplete="name"
                maxLength={100}
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                className={inputClass}
                placeholder="Your name"
              />
            </label>
            <label className="text-[12px] font-semibold text-[#343238] dark:text-white/75">
              Email
              <input
                required
                type="email"
                autoComplete="email"
                maxLength={254}
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
            </label>
          </div>

          <label className="mt-5 block text-[12px] font-semibold text-[#343238] dark:text-white/75">
            Subject
            <input
              required
              maxLength={160}
              value={form.subject}
              onChange={(event) => updateField("subject", event.target.value)}
              className={inputClass}
              placeholder="How can we help?"
            />
          </label>

          <label className="mt-5 block text-[12px] font-semibold text-[#343238] dark:text-white/75">
            Description
            <textarea
              required
              rows={5}
              maxLength={5000}
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              className={`${inputClass} min-h-[138px] resize-y`}
              placeholder="Tell us a little more..."
            />
          </label>

          <label
            className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
            aria-hidden="true"
          >
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
            />
          </label>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={status === "sending"}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#171717] px-7 text-[14px] font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-[#171717] active:scale-[0.98] disabled:cursor-wait disabled:opacity-65"
            >
              {status === "sending" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {status === "sending" ? "Sending..." : "Send message"}
            </button>
            {feedback && (
              <p
                role="status"
                className={`max-w-[360px] text-[12px] leading-relaxed ${status === "sent" ? "text-emerald-700" : "text-red-600"}`}
              >
                {feedback}
              </p>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="bg-[#fbfaf8] dark:bg-[#16131a]">
      <div className="mx-auto max-w-[1320px] px-4 py-12 md:px-6 lg:py-20">
        <div className="mb-10 text-center md:mb-14">
          <p className="zc-eyebrow">Questions</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            Everything you're wondering
          </h2>
        </div>
        <div className="mx-auto flex max-w-[760px] flex-col gap-3">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              /* Two elements, and the split matters.
               *
               * useReveal adds `is-in` straight to the DOM. React does not
               * know about it, so the next time React writes className on that
               * same element the class is wiped — and [data-reveal] without
               * is-in is opacity: 0. Tapping a question rewrote className to
               * add `is-featured`, which erased `is-in`, and the whole item
               * vanished.
               *
               * So the reveal lives on a wrapper React never re-renders, and
               * the interactive card owns the className that changes. Nothing
               * writes to the same attribute from two directions. */
              <div key={i} data-reveal style={{ "--reveal-delay": `${i * 60}ms` } as CSSProperties}>
                <div
                  className={`zc-glow-card overflow-hidden rounded-[16px] bg-white dark:bg-[#141118] ${isOpen ? "is-featured" : ""}`}
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
                  >
                    <h3 className="text-[15.5px] font-semibold tracking-tight text-[#171717] dark:text-white">
                      {faq.q}
                    </h3>
                    <ChevronDown
                      className={`h-4.5 w-4.5 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180 text-[#cc208f]" : "text-[#666a70] dark:text-white/55"}`}
                    />
                  </button>
                  <div
                    className={`overflow-hidden px-6 transition-all duration-300 ${
                      isOpen ? "max-h-[200px] pb-5 opacity-100" : "max-h-0 pb-0 opacity-0"
                    }`}
                  >
                    <p className="text-[14px] leading-relaxed text-[#666a70] dark:text-white/55">
                      {faq.a}
                    </p>
                  </div>
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
    <section className="bg-white dark:bg-[#141118] px-4 py-12 md:px-6 md:py-16">
      <div className="mx-auto max-w-[1320px]">
        {/* The closing band is the one place the page raises its voice: a cone
            of light falling from the top edge onto the mark, the way the
            reference lights its final call. The two existing blooms stay —
            they fill the corners the cone does not reach. */}
        <div className="zc-glow-card relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#201924] via-[#151218] to-[#0e0c10] px-6 py-12 text-center md:px-16 md:py-16">
          <Spotlight />
          <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#cc208f]/25 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-40 -right-20 h-72 w-72 rounded-full bg-[#cc208f]/10 blur-[90px]" />
          <div className="relative">
            {/* Lit from above, so the mark reads as sitting under the cone
                rather than pasted onto it. */}
            <img
              decoding="async"
              src="/logo.png"
              alt="Zero Club"
              className="mx-auto h-12 w-12 object-contain drop-shadow-[0_0_28px_rgba(204,32,143,0.65)]"
            />
            <h2 className="mx-auto mt-4 max-w-[680px] font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-white md:text-[52px]">
              Built for the next generation of builders.
            </h2>
            <p className="mx-auto mt-4 max-w-[440px] text-[15px] leading-relaxed text-white/55">
              Your profile, your proof, your people, your income — one platform.
            </p>
            <Link
              to="/signup"
              search={{ ref: referralCode, club: undefined }}
              className="mt-9 inline-flex items-center gap-2 rounded-full bg-white dark:bg-[#141118] px-8 py-3.5 text-[15px] font-semibold tracking-tight text-[#171717] dark:text-white transition hover:opacity-90 active:scale-[0.98]"
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
    <footer className="bg-[#f4f2ef] dark:bg-[#0f0d12] px-4 py-12 md:px-6">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-5">
          <BrandMark />
          <p className="text-[12px] text-[#666a70] dark:text-white/55">
            The social network for builders.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#171717] dark:text-white">
                {group.title}
              </h3>
              <ul className="grid gap-2.5">
                {group.links.map((link) => (
                  <li key={link}>
                    <a
                      href={link === "Contact" ? "#contact" : link === "Privacy" ? "/privacy" : link === "Terms" ? "/terms" : link === "Help Center" ? "/docs" : "#people"}
                      className="text-[13px] font-medium text-[#666a70] dark:text-white/55 transition-colors hover:text-[#171717]"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex items-center justify-between pt-6">
          <p className="text-[12px] text-[#666a70] dark:text-white/55">Zero Club © 2026</p>
          <p className="text-[12px] text-[#666a70] dark:text-white/55">
            Made for builders, by builders.
          </p>
        </div>
      </div>
    </footer>
  );
}

function Landing() {
  const { ref } = useSearch({ from: "/" });

  /* Sections arrive as they are reached rather than sitting there. */
  useReveal();

  /* And they respond once reached: cards light from where the pointer is, and
     section visuals drift against their text as you pass. Both are delegated
     document listeners writing CSS variables, so a page of dozens of cards
     costs two listeners rather than dozens of React state updates. */
  usePointerGlow();
  useParallax();

  return (
    <div className="min-h-screen bg-white dark:bg-[#141118] font-sans text-[#171717] dark:text-white selection:bg-[#cc208f]/20">
      <Header referralCode={ref} />
      <main>
        {/* The first screen is its own composition now — one viewport, brand
            motion behind it, and counts read from the database rather than
            asserted. Everything below it is unchanged. */}
        <HeroStage referralCode={ref} />
        <div data-reveal>
          <ProductSection />
        </div>
        <div data-reveal>
          <TopicExplorer />
        </div>
        <div data-reveal>
          <LearningSection />
        </div>
        <div data-reveal>
          <ClubsSection />
        </div>
        <div data-reveal>
          <OpportunitiesSection />
        </div>
        <div data-reveal>
          <WalletSection />
        </div>
        <div data-reveal>
          <FeaturesSection />
        </div>
        <div data-reveal>
          <ContactSection />
        </div>
        <div data-reveal>
          <FaqSection />
        </div>
        <div data-reveal>
          <FinalCta referralCode={ref} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
