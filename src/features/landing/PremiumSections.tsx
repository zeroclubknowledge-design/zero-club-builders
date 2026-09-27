import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Check, Download, Radio } from "@/components/icons/glyphs";
import { IconClubs, IconLearn, IconPresentation, IconProfile } from "@/components/icons/nav";

/* ───────────────────────────── Device frame ─────────────────────────────
 * Real product screens in a phone, instead of mixed stock illustrations.
 * One frame style everywhere so the page reads as one product.
 */
export function PhoneFrame({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`relative aspect-[9/19.2] rounded-[2.4rem] bg-[#0d0b10] p-[7px] shadow-[0_40px_80px_-30px_rgba(23,23,23,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset] ring-1 ring-black/10 dark:ring-white/10 ${className}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-[#f4f2ef]">
        <img
          src={src}
          alt={alt}
          width={1080}
          height={1920}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="h-full w-full object-cover object-top"
        />
        {/* Dynamic-island style notch */}
        <span
          aria-hidden
          className="absolute left-1/2 top-2 h-[18px] w-[34%] -translate-x-1/2 rounded-full bg-[#0d0b10]"
        />
      </div>
    </div>
  );
}

/* ───────────────────────────── Hero additions ───────────────────────────── */

/** "Join 290+ builders" — a real count, shown only once it is worth showing. */
export function HeroTrust() {
  const { data } = useQuery({
    queryKey: ["landing-trust"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [{ data: stats }, { data: faces }] = await Promise.all([
        supabase.rpc("get_landing_stats"),
        supabase
          .from("profiles")
          .select("id, avatar_url")
          .not("avatar_url", "is", null)
          .neq("avatar_url", "")
          .limit(5),
      ]);
      return {
        builders: Number((stats as { builders?: number } | null)?.builders || 0),
        faces: (faces || []) as { id: string; avatar_url: string }[],
      };
    },
  });
  if (!data || data.builders < 100) return null;
  const rounded = Math.floor(data.builders / 10) * 10;

  return (
    <div className="mt-6 flex items-center justify-center gap-3 animate-[zc-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.5s_both]">
      {data.faces.length > 0 && (
        <div className="flex -space-x-2.5">
          {data.faces.map((face) => (
            <img
              key={face.id}
              src={face.avatar_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-8 w-8 rounded-full object-cover ring-2 ring-[#f4f2ef] dark:ring-[#0b0a0d]"
            />
          ))}
        </div>
      )}
      <p className="text-[13.5px] font-medium text-[#4d4f55] dark:text-white/65">
        Join{" "}
        <span className="font-semibold text-[#171717] dark:text-white">{rounded}+ builders</span>{" "}
        learning in public
      </p>
    </div>
  );
}

/** Three real screens, fanned, rising out of the hero. */
export function HeroDevices() {
  return (
    <div
      aria-hidden
      className="relative mx-auto mt-12 h-[360px] w-full max-w-[760px] sm:h-[440px] md:mt-14 md:h-[520px]"
    >
      <div className="pointer-events-none absolute left-1/2 top-16 h-72 w-72 -translate-x-1/2 rounded-full bg-[#cc208f]/25 blur-[90px]" />
      <PhoneFrame
        src="/screenshots/screenshot-clubs.png"
        alt=""
        className="absolute left-[4%] top-16 hidden w-[200px] -rotate-[8deg] opacity-95 sm:block md:w-[230px] animate-[zc-rise_1s_cubic-bezier(0.22,1,0.36,1)_0.7s_both]"
      />
      <PhoneFrame
        src="/screenshots/screenshot-wallet.png"
        alt=""
        className="absolute right-[4%] top-16 hidden w-[200px] rotate-[8deg] opacity-95 sm:block md:w-[230px] animate-[zc-rise_1s_cubic-bezier(0.22,1,0.36,1)_0.8s_both]"
      />
      <PhoneFrame
        src="/screenshots/screenshot-feed.png"
        alt=""
        priority
        className="absolute left-1/2 top-0 w-[230px] -translate-x-1/2 sm:w-[250px] md:w-[270px] animate-[zc-rise_1s_cubic-bezier(0.22,1,0.36,1)_0.6s_both]"
      />
      {/* The phones sink into the next section instead of ending on a hard edge. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#f4f2ef] dark:to-[#0b0a0d]" />
    </div>
  );
}

/* ───────────────────────────── Clubs visual ───────────────────────────── */
export function ClubsVisual() {
  return (
    <div className="relative mx-auto flex h-[460px] w-full max-w-[460px] items-start justify-center pt-4 md:h-[520px]">
      <div className="pointer-events-none absolute left-1/2 top-24 h-64 w-64 -translate-x-1/2 rounded-full bg-[#cc208f]/20 blur-[80px]" />
      <PhoneFrame
        src="/screenshots/screenshot-clubs.png"
        alt="Clubs in the Zero Club app"
        className="relative w-[230px] md:w-[250px]"
      />
      <div className="zc-showcase-float absolute left-0 top-24 flex items-center gap-2.5 rounded-2xl bg-white/95 p-3 pr-4 shadow-[0_18px_40px_-20px_rgba(23,23,23,0.45)] ring-1 ring-black/5 backdrop-blur dark:bg-[#1b1720]/95 dark:ring-white/10 sm:left-2">
        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-red-500/10">
          <Radio className="h-4 w-4 text-red-500" />
          <span className="absolute right-0 top-0 h-2 w-2 animate-pulse rounded-full bg-red-500" />
        </span>
        <div>
          <p className="text-[12px] font-semibold text-[#171717] dark:text-white">Live class now</p>
          <p className="text-[10.5px] text-[#666a70] dark:text-white/55">
            Frontend Builders · 36 in
          </p>
        </div>
      </div>
      <div className="zc-showcase-float-delayed absolute bottom-20 right-0 rounded-2xl bg-white/95 p-3 pr-4 shadow-[0_18px_40px_-20px_rgba(23,23,23,0.45)] ring-1 ring-black/5 backdrop-blur dark:bg-[#1b1720]/95 dark:ring-white/10 sm:right-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#cc208f]">
          Join request
        </p>
        <p className="mt-1 text-[12px] font-semibold text-[#171717] dark:text-white">
          Approved by admin
        </p>
        <p className="text-[10.5px] text-[#666a70] dark:text-white/55">Design Systems Guild</p>
      </div>
    </div>
  );
}

/* ───────────────────────────── Audience grid ───────────────────────────── */
const AUDIENCE: { title: string; copy: string; icon: ReactNode }[] = [
  {
    title: "For builders",
    copy: "Share what you're learning, document your work, join clubs, and build a profile that compounds.",
    icon: <IconProfile className="h-5 w-5" />,
  },
  {
    title: "For tutors",
    copy: "Run live bootcamps, manage curriculum, teach communities, and earn from your knowledge.",
    icon: <IconLearn className="h-5 w-5" />,
  },
  {
    title: "For institutions",
    copy: "Create structured learning spaces, support cohorts, and track real learner participation.",
    icon: <IconPresentation className="h-5 w-5" />,
  },
  {
    title: "For teams",
    copy: "Find people through proof of work, contribution history, and community signal.",
    icon: <IconClubs className="h-5 w-5" />,
  },
];

export function AudienceGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      {AUDIENCE.map((card, index) => (
        <article
          key={card.title}
          data-reveal
          style={{ "--reveal-delay": `${index * 70}ms` } as CSSProperties}
          className="zc-glow-card group rounded-[20px] bg-white p-6 ring-1 ring-[#171717]/[0.06] transition-transform duration-300 hover:-translate-y-1 dark:bg-[#141118] dark:ring-white/10"
        >
          <span className="grid h-11 w-11 place-items-center rounded-[13px] bg-gradient-to-br from-[#cc208f]/20 to-[#cc208f]/[0.04] text-[#cc208f] ring-1 ring-[#cc208f]/25">
            {card.icon}
          </span>
          <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-[#171717] dark:text-white">
            {card.title}
          </h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#666a70] dark:text-white/55">
            {card.copy}
          </p>
        </article>
      ))}
    </div>
  );
}

/* ───────────────────────────── Features grid ───────────────────────────── */
export function FeaturesGrid({
  features,
}: {
  features: { title: string; copy: string; icon: ReactNode }[];
}) {
  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {features.map((feature, index) => (
        <article
          key={feature.title}
          data-reveal
          style={{ "--reveal-delay": `${(index % 3) * 70}ms` } as CSSProperties}
          className="zc-glow-card rounded-[20px] bg-white p-6 ring-1 ring-[#171717]/[0.06] transition-transform duration-300 hover:-translate-y-1 dark:bg-[#141118] dark:ring-white/10 md:p-7"
        >
          <div className="grid h-11 w-11 place-items-center rounded-[13px] bg-gradient-to-br from-[#cc208f]/20 to-[#cc208f]/[0.04] text-[#cc208f] ring-1 ring-[#cc208f]/25 shadow-[0_0_24px_-6px_rgba(204,32,143,0.55)]">
            {feature.icon}
          </div>
          <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-[#171717] dark:text-white md:text-[18px]">
            {feature.title}
          </h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#666a70] dark:text-white/55">
            {feature.copy}
          </p>
        </article>
      ))}
    </div>
  );
}

/* ───────────────────────────── Final call to action ───────────────────────────── */
export function FinalCallToAction({
  referralCode,
  spotlight,
}: {
  referralCode?: string;
  spotlight?: ReactNode;
}) {
  return (
    <section className="bg-white px-4 py-14 dark:bg-[#141118] md:px-6 md:py-20">
      <div className="mx-auto max-w-[1320px]">
        <div className="zc-glow-card relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#201924] via-[#151218] to-[#0e0c10] px-6 pt-14 text-white md:px-14 md:pt-16">
          {spotlight}
          <div className="pointer-events-none absolute -top-32 left-1/3 h-80 w-80 rounded-full bg-[#cc208f]/25 blur-[100px]" />
          <div className="relative grid items-end gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="pb-14 text-center lg:text-left md:pb-16">
              <img
                decoding="async"
                src="/logo.png"
                alt=""
                className="mx-auto h-12 w-12 object-contain drop-shadow-[0_0_28px_rgba(204,32,143,0.65)] lg:mx-0"
              />
              <h2 className="mt-5 font-display text-[34px] font-semibold leading-[1.06] tracking-[-0.035em] md:text-[52px]">
                Built for the next generation of builders.
              </h2>
              <p className="mx-auto mt-4 max-w-[460px] text-[15.5px] leading-relaxed text-white/60 lg:mx-0">
                Your profile, your proof, your people, your income — one platform.
              </p>
              <ul className="mx-auto mt-6 grid max-w-[460px] gap-2 text-left text-[14px] text-white/75 sm:grid-cols-2 lg:mx-0">
                {[
                  "Free to join",
                  "No passwords — one-time codes",
                  "Live classes & clubs",
                  "Android app available",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#cc208f]/25">
                      <Check className="h-3 w-3 text-[#f28fd0]" strokeWidth={2.5} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <Link
                  to="/signup"
                  search={{ ref: referralCode, club: undefined }}
                  preload={false}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold tracking-tight text-[#171717] transition hover:-translate-y-0.5 active:scale-[0.98]"
                >
                  Get started free <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="/downloads/zero-club.apk"
                  download="zero-club.apk"
                  className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold tracking-tight text-white ring-1 ring-white/20 transition hover:bg-white/10"
                >
                  <Download className="h-4 w-4" /> Android app
                </a>
              </div>
            </div>
            {/* Real screens rising from the bottom edge of the band. */}
            <div
              aria-hidden
              className="relative mx-auto hidden h-[340px] w-full max-w-[420px] md:block"
            >
              <PhoneFrame
                src="/screenshots/screenshot-bootcamps.png"
                alt=""
                className="absolute bottom-[-60px] left-0 w-[190px] -rotate-6"
              />
              <PhoneFrame
                src="/screenshots/screenshot-feed.png"
                alt=""
                className="absolute bottom-[-90px] right-0 w-[210px] rotate-3"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── Footer ───────────────────────────── */
type FooterLink = { label: string; href: string; download?: boolean };
const FOOTER: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Builder profiles", href: "#people" },
      { label: "Bootcamps", href: "#learning" },
      { label: "Clubs", href: "#clubs" },
      { label: "Creator wallet", href: "#wallet" },
      { label: "All features", href: "#features" },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Create account", href: "/signup" },
      { label: "Sign in", href: "/signin" },
      { label: "Android app", href: "/downloads/zero-club.apk", download: true },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Getting started", href: "/docs?page=getting-started" },
      { label: "Tutors & institutions", href: "/docs?page=tutors-and-institutions" },
      { label: "Wallet & gifts", href: "/docs?page=wallet-and-gifts" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact us", href: "#contact" },
      { label: "FAQ", href: "#faq" },
      { label: "Safety", href: "/docs?page=safety-and-notifications" },
    ],
  },
];

export function SiteFooter({ brand }: { brand: ReactNode }) {
  return (
    <footer className="border-t border-[#171717]/[0.06] bg-[#f4f2ef] px-4 pb-10 pt-14 dark:border-white/10 dark:bg-[#0f0d12] md:px-6">
      <div className="mx-auto max-w-[1320px]">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div className="max-w-[340px]">
            {brand}
            <p className="mt-4 text-[14px] leading-relaxed text-[#666a70] dark:text-white/55">
              The social network for builders. Learn in live bootcamps, ship work in public, and
              turn proof of work into reputation and income.
            </p>
            <a
              href="/downloads/zero-club.apk"
              download="zero-club.apk"
              className="mt-6 inline-flex h-11 items-center gap-2.5 rounded-xl bg-[#171717] px-4 text-white transition hover:opacity-90 dark:bg-white dark:text-[#171717]"
            >
              <Download className="h-4 w-4" />
              <span className="text-left leading-tight">
                <span className="block text-[9.5px] font-medium uppercase tracking-[0.12em] opacity-70">
                  Get it for
                </span>
                <span className="block text-[13.5px] font-semibold">Android</span>
              </span>
            </a>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER.map((group) => (
              <div key={group.title}>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#171717] dark:text-white">
                  {group.title}
                </h3>
                <ul className="mt-4 grid gap-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(link.download ? { download: "zero-club.apk" } : {})}
                        className="text-[13.5px] font-medium text-[#666a70] transition-colors hover:text-[#cc208f] dark:text-white/55 dark:hover:text-[#f28fd0]"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-[#171717]/[0.06] pt-6 text-[12.5px] text-[#666a70] dark:border-white/10 dark:text-white/50 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Zero Club. All rights reserved.</p>
          <p>Made for builders, by builders.</p>
        </div>
      </div>
    </footer>
  );
}
