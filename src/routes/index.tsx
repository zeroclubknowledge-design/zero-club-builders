import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
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
} from "@/components/icons/solar";
import { useEffect, useState } from "react";
import { usePublicTheme } from "@/hooks/usePublicTheme";
import {
  IconClubs,
  IconInstitution,
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
      { property: "og:image", content: "/logo.png" },
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
      { label: "Metrics", detail: "Your proof, progress, and momentum", href: "/explore/metrics", slug: "metrics" },
      { label: "Zero AI", detail: "A practical thinking partner", href: "/explore/zero-ai", slug: "zero-ai" },
    ],
  },
  {
    label: "Explore",
    items: [
      { label: "Feed", detail: "Follow real work and progress", href: "/explore/feed", slug: "feed" },
      { label: "Bootcamps", detail: "Learn with working professionals", href: "/explore/bootcamps", slug: "bootcamps" },
      { label: "Clubs", detail: "Focused communities around work", href: "/explore/clubs", slug: "clubs" },
      { label: "Opportunities", detail: "Open doors through proof", href: "/explore/opportunities", slug: "opportunities" },
    ],
  },
  {
    label: "Earn",
    items: [
      { label: "Wallet", detail: "Manage what your work earns", href: "/explore/wallet", slug: "wallet" },
      { label: "Store", detail: "Sell products and private access", href: "/explore/store", slug: "store" },
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
    icon: <img src="/logo.png" alt="" className="h-[22px] w-[22px] object-contain" />,
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
      <span className={`font-display text-[19px] font-semibold tracking-tight ${light ? "text-white" : "text-[#171717] dark:text-white"}`}>
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
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-200 ${
        isOpen || isScrolled
          ? "border-[#171717]/[0.08] dark:border-white/10 bg-[#f4f2ef] dark:bg-[#0f0d12] shadow-[0_1px_0_rgba(23,23,23,0.02)]"
          : "border-transparent bg-transparent shadow-none"
      }`}
    >
      <div className="mx-auto flex h-[calc(4rem+env(safe-area-inset-top))] max-w-[1180px] items-end justify-between px-4 pb-3 pt-[env(safe-area-inset-top)] md:px-6">
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
              <div key={group.label} className="relative" onMouseEnter={() => setOpenGroup(group.label)}>
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
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="absolute left-0 top-full z-50 w-[320px] pt-2">
                    <div className="overflow-hidden rounded-xl border border-[#171717]/[0.08] bg-[#f7f6f3] p-1.5 shadow-[0_28px_60px_-28px_rgba(23,23,23,0.35)] dark:border-white/10 dark:bg-[#16131a]">
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
            {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
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
            className="inline-flex h-9 w-[68px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#171717] px-0 text-[12.5px] font-semibold tracking-tight text-white transition hover:opacity-90 active:scale-[0.97] sm:h-10 sm:w-auto sm:px-5 sm:text-[13.5px]"
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
        <div className="fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] bottom-0 z-40 overflow-y-auto overscroll-contain border-t border-[#171717]/[0.08] dark:border-white/10 bg-[#f4f2ef] dark:bg-[#0f0d12] px-5 py-5 lg:hidden">
          <div className="mx-auto max-w-xl pb-10">
            <div className="space-y-7">
              {mobileNavGroups.map((group) => (
                <section key={group.label}>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#766d73] dark:text-white/45">{group.label}</p>
                  <div className="divide-y divide-[#171717]/[0.08] dark:divide-white/10 border-y border-[#171717]/[0.08] dark:border-white/10">
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
                          <span className="block font-display text-[28px] font-medium leading-none tracking-tight text-[#171417] dark:text-white">{item.label}</span>
                          <span className="mt-1 block text-[11.5px] leading-5 text-[#6d6269] dark:text-white/55">{item.detail}</span>
                        </span>
                        <ArrowUpRight className="h-5 w-5 shrink-0 text-[#cc208f] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <Link to="/signin" search={{ ref: referralCode, club: undefined }} onClick={() => setIsOpen(false)} className="flex h-12 items-center justify-center rounded-lg border border-[#171717]/12 dark:border-white/12 text-[13px] font-semibold text-[#242126] dark:text-white">
                Sign in
              </Link>
              <Link to="/signup" search={{ ref: referralCode, club: undefined }} onClick={() => setIsOpen(false)} className="flex h-12 items-center justify-center rounded-lg bg-[#171417] dark:bg-white px-4 text-[13px] font-semibold text-white dark:text-[#171417]">
                Join Zero Club
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Code-built product showcase: the real Zero Club, not screenshots ── */
function ProductShowcase() {
  return (
    <div className="relative mx-auto w-[calc(100vw-20px)] max-w-[380px] min-w-0 justify-self-center pb-7 sm:w-full sm:max-w-[520px] sm:pb-0">
      {/* Glow */}
      <div className="pointer-events-none absolute -top-16 -right-10 h-72 w-72 rounded-full bg-[#cc208f]/20 blur-[90px]" />

      {/* Main: a shipped-work post inside the dark app frame */}
      <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-[#201924] via-[#151218] to-[#0e0c10] p-4 text-white shadow-[0_24px_70px_-24px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.06] sm:p-6">
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
        <div className="relative mt-4 h-28 overflow-hidden rounded-lg bg-gradient-to-br from-[#cc208f]/25 via-[#1d1a20] to-[#141117] ring-1 ring-white/[0.08] sm:h-36">
          <div className="absolute inset-x-5 top-5 h-2.5 w-24 rounded-full bg-white/15" />
          <div className="absolute inset-x-5 top-11 h-2 w-40 rounded-full bg-white/[0.08]" />
          <div className="absolute inset-x-5 top-16 h-2 w-32 rounded-full bg-white/[0.08]" />
          <div className="absolute left-5 bottom-5 h-7 w-20 rounded-full bg-[#cc208f]" />
        </div>

        {/* Post actions */}
        <div className="relative mt-4 flex items-center gap-3 text-[11px] text-white/45 tabular-nums sm:gap-5 sm:text-[11.5px]">
          <span className="flex items-center gap-1.5">
            <ThumbsUp className="h-3.5 w-3.5 fill-current" />
            128 likes
          </span>
          <span className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 fill-current" />
            24 replies
          </span>
          <span className="ml-auto flex items-center gap-1 text-emerald-400">
            <Check className="h-3 w-3" /> Verified proof
          </span>
        </div>
      </div>

      {/* Floating: live class pill */}
      <div className="zc-showcase-float absolute -top-3 left-0 flex max-w-full items-center gap-2 overflow-hidden rounded-lg bg-white dark:bg-gradient-to-br dark:from-[#201924] dark:via-[#151218] dark:to-[#0e0c10] p-2 pr-3 shadow-[0_16px_44px_-16px_rgba(0,0,0,0.3)] ring-1 ring-[#171717]/[0.06] dark:ring-white/10 sm:-top-5 sm:-left-6 sm:max-w-none sm:gap-2.5 sm:p-3 sm:pr-4">
        <span className="pointer-events-none absolute -right-6 -top-8 hidden h-20 w-20 rounded-full bg-[#cc208f]/25 blur-[30px] dark:block" />
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-500/10">
          <Radio className="h-4 w-4 text-red-500" />
          <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        </span>
        <div className="relative">
          <p className="text-[12px] font-semibold tracking-tight text-[#171717] dark:text-white">Live bootcamp</p>
          <p className="text-[10.5px] text-[#666a70] dark:text-white/55">UI Engineering · 48 learners</p>
        </div>
      </div>

      {/* Floating: wallet mini-card */}
      <div className="zc-showcase-float-delayed absolute bottom-0 right-0 w-[124px] overflow-hidden rounded-lg bg-gradient-to-br from-[#201924] via-[#151218] to-[#0e0c10] p-3 shadow-[0_16px_44px_-14px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.08] sm:-bottom-6 sm:-right-6 sm:w-44 sm:p-4">
        <div className="pointer-events-none absolute -top-8 -right-6 h-20 w-20 rounded-full bg-[#cc208f]/30 blur-[30px]" />
        <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/45">Creator wallet</p>
        <p className="mt-1.5 text-[17px] font-semibold tracking-tight text-white tabular-nums sm:text-[20px]">₦248,500</p>
        <p className="mt-0.5 text-[10px] text-emerald-400">+ ₦45,000 this week</p>
      </div>
    </div>
  );
}

/**
 * The scrolling rail under the hero, showing real clubs.
 *
 * Reads clubs directly with the anon key and only shows active clubs that have
 * a real logo or banner. The landing rail is a visual showcase only: it does
 * not expose a private club's posts, members, chat, or join controls.
 *
 * If the query fails or returns nothing, the rail renders nothing at all rather
 * than falling back to invented clubs. An empty strip is better than a landing
 * page that promises communities which do not exist.
 */
function ActivityRail() {
  const { data: clubs = [] } = useQuery({
    queryKey: ["landing-live-clubs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, category, logo_url, banner_url, status, created_at")
        .eq("status", "active")
        .or("logo_url.not.is.null,banner_url.not.is.null")
        .order("created_at", { ascending: false })
        .limit(18);

      if (error) throw error;

      // Prefer category variety, then fill the remaining spaces with the most
      // recently created image-backed clubs. At most six distinct clubs are
      // shown so the hero remains compact on phones.
      const imageBacked = (data ?? []).filter((club) => Boolean(club.logo_url || club.banner_url));
      const selected: typeof imageBacked = [];
      const usedCategories = new Set<string>();

      for (const club of imageBacked) {
        const category = (club.category || "Community").trim().toLowerCase();
        if (!usedCategories.has(category)) {
          selected.push(club);
          usedCategories.add(category);
        }
        if (selected.length === 6) break;
      }

      for (const club of imageBacked) {
        if (selected.length === 6) break;
        if (!selected.some((item) => item.id === club.id)) selected.push(club);
      }

      return selected;
    },
    // The landing page is the most-hit route on the site; clubs change rarely.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (clubs.length === 0) return null;

  // Duplicated so the marquee can loop without a visible seam. The copies are
  // hidden from screen readers so each club is announced once.
  const rail = [...clubs, ...clubs];

  return (
    <div className="mt-6 w-full max-w-[540px]">
      <div className="flex items-center justify-between px-1 pb-2 text-[9px] font-medium uppercase tracking-[0.13em] text-[#666a70] dark:text-white/55 sm:text-[10px]">
        <span className="flex items-center gap-2 text-[#9d176d]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#cc208f] animate-pulse" />
          Live Clubs
        </span>
        <span>Proof in motion</span>
      </div>
      {/* py/px keep each card's ring from being clipped by the overflow mask */}
      <div className="overflow-hidden px-1 py-1.5 [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
        <div className="zc-activity-rail flex w-max gap-2">
          {rail.map((club, index) => (
            <article
              key={`${club.id}-${index}`}
              aria-hidden={index >= clubs.length || undefined}
              className="flex w-[198px] shrink-0 items-center gap-2.5 rounded-lg bg-[#f4f2ef] dark:bg-[#0f0d12] px-3 py-2.5 ring-1 ring-[#171717]/[0.05] sm:w-[218px] sm:gap-3"
            >
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[#cc208f]/10 ring-1 ring-[#171717]/[0.06] dark:ring-white/10">
                <img
                  src={club.logo_url || club.banner_url || ""}
                  alt={`${club.name} club`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11.5px] font-semibold text-[#242126] dark:text-white">{club.name}</span>
                <span className="block truncate text-[10.5px] text-[#666a70] dark:text-white/55">{club.category || "Community"}</span>
              </span>
              <span className="ml-auto shrink-0 text-[10px] font-semibold text-[#9d176d]">Live</span>
            </article>
          ))}
        </div>
      </div>
    </div>
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

function Hero({ referralCode }: ReferralProps) {
  return (
    <section id="feed" className="relative overflow-hidden border-b border-[#171717]/[0.06] dark:border-white/10 bg-[#f4f2ef] dark:bg-[#0f0d12]">
      <div className="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-[#cc208f]/[0.07] blur-[100px]" />
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-10 px-4 pb-14 pt-[calc(6rem+env(safe-area-inset-top))] md:px-6 md:pb-16 md:pt-28 lg:grid-cols-[1fr_0.95fr] lg:gap-12 lg:pb-20 lg:pt-[calc(7.5rem+env(safe-area-inset-top))]">
        <div className="min-w-0">
          {/* Three deliberate lines, so the progression reads as a sequence:
              skills, then proof, then what the proof opens. `block` rather
              than <br>, so each line is its own box and the tight leading
              applies evenly instead of collapsing at the breaks. */}
          {/* Sized against the viewport rather than at fixed breakpoints.
              "Build Opportunities." is the longest line by some way, and at a
              flat 44px it wrapped on a phone and split the phrase in two.
              clamp() scales all three together so the set stays visually
              even. The ceiling is 48px, not 64px: from lg the hero splits
              into two columns and the text side is only ~566px wide, so the
              old size overflowed on DESKTOP as well as on a phone. And
              whitespace-nowrap guarantees none of them can ever break, at any
              width, rather than relying on the maths staying true. */}
          <h1 className="mt-0 max-w-[620px] font-display text-[clamp(25px,8vw,48px)] font-semibold leading-[1.08] tracking-[-0.035em] text-[#171717] dark:text-white">
            <span className="block whitespace-nowrap">Build Skills.</span>
            <span className="block whitespace-nowrap">Build Proof.</span>
            <span className="block whitespace-nowrap text-[#cc208f]">Build Opportunities.</span>
          </h1>
          <p className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-[#4d4f55] dark:text-white/60 md:text-[19px]">
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
              className="inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-semibold tracking-tight text-[#303236] dark:text-white ring-1 ring-[#171717]/15 transition hover:bg-white active:scale-[0.98] dark:text-white dark:ring-white/25 dark:hover:bg-white/10"
              preload={false}
            >
              Sign in
            </Link>
          </div>

          <AndroidAppDownload />

          <ActivityRail />

          <p className="mt-4 text-[12.5px] leading-relaxed text-[#666a70] dark:text-white/55">
            Free to join · Profiles, clubs, bootcamps, wallet, and XP built in
          </p>
        </div>

        <ProductShowcase />
      </div>

      {/* Integrated product capability band */}
      <div className="border-t border-white/[0.08] bg-[#171417] text-white">
        <div className="mx-auto max-w-[1180px]">
          <div className="flex min-h-12 items-center justify-between border-b border-white/[0.09] px-4 py-3 md:px-6">
            <p className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#f28fd0]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#cc208f]" />
              The builder system
            </p>
            <p className="hidden text-[10px] font-medium tracking-[0.04em] text-white/45 sm:block">
              Learn. Prove. Earn. Compound.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Live bootcamps",
                copy: "Learn directly from builders doing the work.",
                Icon: IconLearn,
              },
              {
                title: "Proof-of-work profiles",
                copy: "Let shipped work and progress speak first.",
                Icon: IconProfile,
              },
              {
                title: "Creator wallet",
                copy: "Earn and manage value without leaving your network.",
                Icon: IconWallet,
              },
              {
                title: "XP that compounds",
                copy: "Turn every contribution into visible experience.",
                Icon: IconPresentation,
              },
            ].map(({ title, copy, Icon }, index) => (
              <article
                key={title}
                className={`min-h-[146px] px-4 py-5 md:min-h-[158px] md:px-6 md:py-6 ${
                  index % 2 === 0 ? "border-r border-white/[0.09]" : ""
                } ${index < 2 ? "border-b border-white/[0.09] lg:border-b-0" : ""} ${
                  index < 3 ? "lg:border-r lg:border-white/[0.09]" : "lg:border-r-0"
                }`}
              >
                <span className="grid h-8 w-8 place-items-center rounded-md bg-white/[0.07] text-[#f28fd0] ring-1 ring-inset ring-white/[0.08]">
                  <Icon active className="h-[17px] w-[17px]" />
                </span>
                <h3 className="mt-4 text-[13.5px] font-semibold tracking-tight text-white md:text-[14px]">{title}</h3>
                <p className="mt-1.5 max-w-[225px] text-[10.5px] leading-[1.55] text-white/50 md:text-[11px]">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TopicExplorer() {
  return (
    <section id="people" className="border-b border-[#171717]/[0.06] dark:border-white/10 bg-white dark:bg-[#141118]">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-12 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Find your people</p>
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
                className="rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#4d4f55] dark:text-white/60 ring-1 ring-[#171717]/12 transition hover:bg-[#171717] hover:text-white hover:ring-transparent"
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
    <section id="learning" className="border-b border-[#171717]/[0.06] dark:border-white/10 bg-[#fbfaf8] dark:bg-[#16131a]">
      <div className="mx-auto max-w-[1180px] px-4 py-12 md:px-6 lg:py-20">
        <div className="max-w-[640px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Learning that compounds</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            Take bootcamps, join clubs, and make your progress visible.
          </h2>
        </div>
        <div className="mx-auto mt-10 max-w-[860px] pb-5">
          {platformHighlights.map((item, index) => (
            <article
              key={item.title}
              className="sticky mb-5 min-h-[210px] rounded-lg bg-white dark:bg-[#141118] p-6 ring-1 ring-[#171717]/[0.08] shadow-[0_18px_48px_-28px_rgba(23,20,23,0.42)] md:min-h-[220px] md:p-8"
              style={{ top: `calc(4.75rem + ${index * 12}px)`, zIndex: index + 1 }}
            >
              <div className="flex items-start justify-between gap-5">
                <div className="grid h-11 w-11 place-items-center rounded-md bg-[#cc208f]/[0.08] text-[#cc208f] ring-1 ring-[#cc208f]/15">
                  <item.Icon active className="h-[22px] w-[22px]" />
                </div>
                <span className="font-mono text-[10px] tracking-[0.14em] text-[#171717]/25">0{index + 1}</span>
              </div>
              <h3 className="mt-6 max-w-[620px] text-[19px] font-semibold leading-snug tracking-tight text-[#171717] dark:text-white md:text-[22px]">{item.title}</h3>
              <p className="mt-2.5 max-w-[650px] text-[13.5px] leading-relaxed text-[#666a70] dark:text-white/55 md:text-[14px]">{item.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClubsSection() {
  return (
    <section id="clubs" className="border-b border-[#171717]/[0.06] dark:border-white/10 bg-white dark:bg-[#141118]">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 py-12 md:px-6 lg:grid-cols-2 lg:py-20">
        <div className="order-2 lg:order-1">
          <img
            src="/landing-communities-purpose.png"
            alt="Zero Club private clubs"
            className="h-[360px] w-full rounded-lg bg-[#f7f5f2] dark:bg-[#16131a] object-cover ring-1 ring-[#171717]/[0.08] shadow-[0_20px_50px_-24px_rgba(0,0,0,0.25)]"
          />
        </div>
        <div className="order-1 lg:order-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Communities with a purpose</p>
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
                <p className="text-[15.5px] leading-relaxed text-[#4d4f55] dark:text-white/60">{item}</p>
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
    <section id="opportunities" className="border-b border-[#171717]/[0.06] dark:border-white/10 bg-[#f4f2ef] dark:bg-[#0f0d12]">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-12 md:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Open doors through proof</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            A network for people who want to be known by what they build.
          </h2>
        </div>
        <div className="pb-5">
          {audienceCards.map((card, index) => (
            <article
              key={card.title}
              className="sticky mb-5 min-h-[190px] rounded-lg bg-white dark:bg-[#141118] p-6 ring-1 ring-[#171717]/[0.08] shadow-[0_18px_48px_-28px_rgba(23,20,23,0.42)] md:min-h-[205px]"
              style={{ top: `calc(4.75rem + ${index * 12}px)`, zIndex: index + 1 }}
            >
              <div className="flex items-start justify-between gap-5">
                <div className="grid h-11 w-11 place-items-center rounded-md bg-[#cc208f]/[0.08] text-[#cc208f] ring-1 ring-[#cc208f]/15">
                  <card.Icon active className="h-[22px] w-[22px]" />
                </div>
                <span className="font-mono text-[10px] tracking-[0.14em] text-[#171717]/25">0{index + 1}</span>
              </div>
              <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-[#171717] dark:text-white">{card.title}</h3>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#666a70] dark:text-white/55">{card.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function WalletSection() {
  return (
    <section id="wallet" className="border-b border-[#171717]/[0.06] dark:border-white/10 bg-white dark:bg-[#141118]">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 py-12 md:px-6 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Creator economy built in</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            Teach, sell, earn, and manage it all in one account.
          </h2>
          <div className="mt-8 flex flex-wrap gap-2">
            {["Paid bootcamps", "Digital products", "Creator wallet", "Coupons", "Private access"].map((item) => (
              <span key={item} className="rounded-full px-4 py-2 text-[13.5px] font-semibold tracking-tight text-[#4d4f55] dark:text-white/60 ring-1 ring-[#171717]/12">
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
          <div className="relative flex min-h-[252px] flex-col overflow-hidden rounded-[26px] bg-gradient-to-br from-[#201924] via-[#151218] to-[#0e0c10] p-7 text-white shadow-[0_28px_65px_-30px_rgba(20,12,19,0.85)] ring-1 ring-black/10">
            <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[#cc208f]/20 blur-[72px]" />
            <div className="pointer-events-none absolute -bottom-28 -right-16 h-52 w-52 rounded-full bg-[#713bff]/15 blur-[76px]" />
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border-[20px] border-white opacity-[0.045]" />
            <div className="pointer-events-none absolute -bottom-14 right-20 h-28 w-28 rotate-12 border-[16px] border-white opacity-[0.035]" />

            <div className="relative z-10 flex flex-1 flex-col">
              <div className="mb-5 flex items-center gap-2">
                <img src="/logo.png" alt="" className="h-6 w-6 shrink-0 object-contain" />
                <span className="text-[11.5px] font-semibold tracking-tight text-white/85">Zero Wallet</span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-white/45">Available balance</p>
                  <h3 className="mt-2.5 flex items-start text-[46px] font-semibold leading-none tracking-[-0.045em] tabular-nums">
                    <span className="mr-2 mt-1 text-[23px] font-medium tracking-normal text-white/55">₦</span>
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
                <p className="shrink-0 text-[17px] font-semibold tracking-tight tabular-nums text-white">₦92,400</p>
              </div>
            </div>
          </div>
          <div className="relative -mt-4 mx-6 rounded-lg bg-white dark:bg-[#141118] p-4 shadow-[0_16px_44px_-16px_rgba(0,0,0,0.25)] ring-1 ring-[#171717]/[0.06] dark:ring-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold tracking-tight text-[#171717] dark:text-white">Bootcamp enrollment</p>
                <p className="text-[10.5px] text-[#666a70] dark:text-white/55">UI Engineering · just now</p>
              </div>
              <span className="text-[13px] font-semibold text-emerald-600 tabular-nums">+ ₦15,000</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="border-b border-[#171717]/[0.06] dark:border-white/10 bg-[#f4f2ef] dark:bg-[#0f0d12]">
      <div className="mx-auto max-w-[1180px] px-4 py-12 md:px-6 lg:py-20">
        <div className="max-w-[650px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">The Zero Club toolkit</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            The tools behind a more visible kind of progress.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#666a70] dark:text-white/55">
            Learn, build, find your people, and turn momentum into the next opportunity without spreading your work across separate apps.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-[900px] pb-5">
          {zeroClubFeatures.map((feature, index) => (
            <article
              key={feature.title}
              className="sticky mb-5 min-h-[190px] rounded-lg bg-white dark:bg-[#141118] p-6 ring-1 ring-[#171717]/[0.08] shadow-[0_18px_48px_-28px_rgba(23,20,23,0.42)] md:min-h-[205px] md:p-7"
              style={{ top: `calc(4.75rem + ${index * 11}px)`, zIndex: index + 1 }}
            >
              <div className="flex items-start justify-between gap-5">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-[#cc208f]/[0.08] text-[#cc208f] ring-1 ring-[#cc208f]/15">
                  {feature.icon}
                </div>
                <span className="font-mono text-[10px] tracking-[0.14em] text-[#171717]/25">0{index + 1}</span>
              </div>
              <h3 className="mt-5 text-[18px] font-semibold tracking-tight text-[#171717] dark:text-white md:text-[20px]">{feature.title}</h3>
              <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-[#666a70] dark:text-white/55 md:text-[13.5px]">{feature.copy}</p>
            </article>
          ))}
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

      if (!response.ok) throw new Error(result.error || "Your message could not be sent. Please try again.");

      setForm(emptyContactForm);
      setStatus("sent");
      setFeedback("Message sent. The Zero Club team will get back to you soon.");
    } catch (error) {
      setStatus("error");
      setFeedback(error instanceof Error ? error.message : "Your message could not be sent. Please try again.");
    }
  };

  const inputClass =
    "mt-2 w-full rounded-lg border border-[#171717]/[0.08] dark:border-white/10 bg-white dark:bg-[#141118] px-4 py-3 text-[14px] text-[#171717] dark:text-white outline-none transition placeholder:text-[#8a8c91] focus:border-[#cc208f]/50 focus:ring-4 focus:ring-[#cc208f]/[0.07]";

  return (
    <section id="contact" className="border-b border-[#171717]/[0.06] dark:border-white/10 bg-white dark:bg-[#141118]">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-12 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-20">
        <div className="lg:pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Contact us</p>
          <h2 className="mt-3 max-w-[440px] font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            Let&apos;s talk about what you&apos;re building.
          </h2>
          <p className="mt-5 max-w-[430px] text-[14px] leading-relaxed text-[#666a70] dark:text-white/55 md:text-[15px]">
            Have a question, partnership idea, or need help with Zero Club? Send us a note and it will go directly to our team.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-lg bg-[#f4f2ef] dark:bg-[#0f0d12] p-5 ring-1 ring-[#171717]/[0.06] dark:ring-white/10 sm:p-7" noValidate={false}>
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

          <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
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
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#171717] px-7 text-[14px] font-semibold text-white transition hover:opacity-90 active:scale-[0.98] disabled:cursor-wait disabled:opacity-65"
            >
              {status === "sending" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {status === "sending" ? "Sending..." : "Send message"}
            </button>
            {feedback && (
              <p role="status" className={`max-w-[360px] text-[12px] leading-relaxed ${status === "sent" ? "text-emerald-700" : "text-red-600"}`}>
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
    <section className="border-b border-[#171717]/[0.06] dark:border-white/10 bg-[#fbfaf8] dark:bg-[#16131a]">
      <div className="mx-auto max-w-[1180px] px-4 py-12 md:px-6 lg:py-20">
        <div className="mb-10 text-center md:mb-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">Questions</p>
          <h2 className="mt-3 font-display text-[32px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#171717] dark:text-white md:text-[42px]">
            Everything you're wondering
          </h2>
        </div>
        <div className="mx-auto flex max-w-[760px] flex-col gap-3">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={i} className={`overflow-hidden rounded-lg bg-white dark:bg-[#141118] ring-1 transition-all ${isOpen ? "ring-[#cc208f]/25" : "ring-[#171717]/[0.06] dark:ring-white/10"}`}>
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left"
                >
                  <h3 className="text-[15.5px] font-semibold tracking-tight text-[#171717] dark:text-white">{faq.q}</h3>
                  <ChevronDown className={`h-4.5 w-4.5 shrink-0 text-[#666a70] dark:text-white/55 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <div
                  className={`overflow-hidden px-6 transition-all duration-300 ${
                    isOpen ? "max-h-[200px] pb-5 opacity-100" : "max-h-0 pb-0 opacity-0"
                  }`}
                >
                  <p className="text-[14px] leading-relaxed text-[#666a70] dark:text-white/55">{faq.a}</p>
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
      <div className="mx-auto max-w-[1180px]">
        <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-[#201924] via-[#151218] to-[#0e0c10] px-6 py-12 text-center md:px-16 md:py-16">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#cc208f]/25 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-40 -right-20 h-72 w-72 rounded-full bg-[#cc208f]/10 blur-[90px]" />
          <div className="relative">
            <img src="/logo.png" alt="Zero Club" className="mx-auto h-10 w-10 object-contain" />
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
    <footer className="border-t border-[#171717]/[0.06] dark:border-white/10 bg-[#f4f2ef] dark:bg-[#0f0d12] px-4 py-12 md:px-6">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-5">
          <BrandMark />
          <p className="text-[12px] text-[#666a70] dark:text-white/55">The social network for builders.</p>
        </div>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#171717] dark:text-white">{group.title}</h3>
              <ul className="grid gap-2.5">
                {group.links.map((link) => (
                  <li key={link}>
                    <a href={link === "Contact" ? "#contact" : "#people"} className="text-[13px] font-medium text-[#666a70] dark:text-white/55 transition-colors hover:text-[#171717]">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex items-center justify-between border-t border-[#171717]/[0.06] dark:border-white/10 pt-6">
          <p className="text-[12px] text-[#666a70] dark:text-white/55">Zero Club © 2026</p>
          <p className="text-[12px] text-[#666a70] dark:text-white/55">Made for builders, by builders.</p>
        </div>
      </div>
    </footer>
  );
}

function Landing() {
  const { ref } = useSearch({ from: "/" });

  return (
    <div className="min-h-screen bg-white dark:bg-[#141118] font-['Montserrat'] text-[#171717] dark:text-white selection:bg-[#cc208f]/20">
      <Header referralCode={ref} />
      <main>
        <Hero referralCode={ref} />
        <TopicExplorer />
        <LearningSection />
        <ClubsSection />
        <OpportunitiesSection />
        <WalletSection />
        <FeaturesSection />
        <ContactSection />
        <FaqSection />
        <FinalCta referralCode={ref} />
      </main>
      <Footer />
    </div>
  );
}
