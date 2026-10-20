/**
 * Shared pieces for the premium portfolio templates.
 *
 * Every template reads the same portfolio data through `portfolioView`, so a
 * person can switch looks without touching their content. Nothing here
 * invents a number: stats, wins and verification all come from Zero Club
 * records, and anything self-reported (experience, certificates) is shown as
 * written and labelled as such in the footer.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fitLogo, logoSize, type LogoFit } from "../logo";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Trophy, Medal, ChevronLeft, ChevronRight, ChevronUp, BadgeCheck, Mail, MessageCircle } from "@/components/icons/glyphs";
import { SocialLinksRow } from "@/features/profile/ProfileCredentials";
import { clip, describeItem, describePost, itemImages, postImages } from "../parse";
import {
  ACCENT_HEX,
  normaliseSections,
  type PortfolioItem,
  type PortfolioSectionKey,
  type PublicPortfolio,
} from "../types";
import { normaliseRateCard, visibleTiers } from "../rates";

export type TemplateProps = {
  data: PublicPortfolio;
  preview?: boolean;
  onOpenItem?: (item: PortfolioItem) => void;
};

export type Stat = { label: string; value: number };

/** Black or white text, whichever reads on the accent. */
export function inkOn(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#0a0a0a" : "#ffffff";
}

/**
 * Where "Let's talk" goes. The owner picks a Zero Club message or email;
 * email falls back to a message when there's no address on the profile.
 */
export function contactOf(data: Pick<PublicPortfolio, "profile" | "portfolio">) {
  const email = data.profile.social_links?.email || null;
  const useEmail = data.portfolio.contact_method === "email" && Boolean(email);
  return useEmail
    ? { method: "email" as const, href: `mailto:${email}`, external: true, email }
    : { method: "zeroclub" as const, href: `/app/chat/${data.profile.id}`, external: false, email };
}

/** PRO portfolios may switch "Built with Zero Club" to "Built with love". */
export function showsBranding(portfolio: PublicPortfolio["portfolio"]) {
  return !(portfolio.hide_branding && portfolio.premium_active);
}

export function portfolioView(data: PublicPortfolio, opts: { light?: boolean } = {}) {
  const { profile, portfolio, items, experiences, certificates, learning, stats } = data;
  const achievements = data.achievements || [];
  let accent = ACCENT_HEX[portfolio.accent] || ACCENT_HEX.pink;
  // The "mono" accent is near-white; on a light page it becomes ink.
  if (opts.light && portfolio.accent === "mono") accent = "#18181b";
  const name = profile.full_name?.trim() || profile.username;
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || name;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  const headline = portfolio.headline?.trim() || clip(profile.bio || "", 140);
  const about = portfolio.about?.trim() || profile.bio?.trim() || "";
  const email = profile.social_links?.email || null;
  const website = profile.website
    ? profile.website.startsWith("http")
      ? profile.website
      : `https://${profile.website}`
    : null;
  const projects = items.filter((i) => i.kind === "project");
  const proofs = items.filter((i) => i.kind === "proof");
  const skills = portfolio.skills || [];
  const contact = contactOf(data);
  const selectedIds = new Set(projects.map((p) => p.post.id));
  /** Every public ship, minus the ones already in Selected work. */
  const shipped = (data.shipped || []).filter((p) => !selectedIds.has(p.id));
  const current = experiences.find((e) => e.is_current) || experiences[0];
  const role = current?.title || null;

  const has: Record<PortfolioSectionKey, boolean> = {
    work: projects.length > 0,
    about: about.length > 0,
    experience: experiences.length > 0,
    skills: skills.length > 0,
    learning: learning.length > 0,
    certificates: certificates.length > 0,
    proofs: proofs.length > 0,
    achievements: achievements.length > 0,
    rates: visibleTiers(normaliseRateCard(portfolio.rate_card), Boolean(portfolio.premium_active)).length > 0,
    // Anyone can be messaged on Zero Club, so contact always has somewhere to go.
    contact: true,
  };
  const sections = normaliseSections(portfolio.sections).filter((s) => s.visible && has[s.key]);
  const on = (key: PortfolioSectionKey) => sections.some((s) => s.key === key);

  const numbers: Stat[] = portfolio.show_stats
    ? [
        { label: stats.ships === 1 ? "Project shipped" : "Projects shipped", value: stats.ships },
        { label: "Tutor-verified", value: stats.verified },
        { label: achievements.length === 1 ? "Win" : "Wins", value: achievements.length },
        { label: learning.length === 1 ? "Bootcamp" : "Bootcamps", value: learning.length },
        { label: proofs.length === 1 ? "Highlight" : "Highlights", value: proofs.length },
        { label: "XP earned", value: stats.xp },
      ]
        .filter((s) => Number(s.value) > 0)
        .slice(0, 4)
    : [];

  /** Images from the work, newest-featured first — for hero collages and galleries. */
  const gallery = projects.flatMap((item) =>
    itemImages(item)
      .slice(0, 3)
      .map((url) => ({ url, item })),
  );
  const heroImage = profile.banner_url || gallery[0]?.url || null;

  return {
    ...data,
    achievements,
    accent,
    accentInk: inkOn(accent),
    name,
    firstName,
    lastName,
    headline,
    about,
    email,
    website,
    projects,
    proofs,
    skills,
    role,
    sections,
    on,
    numbers,
    gallery,
    heroImage,
    contact,
    shipped,
    showBranding: showsBranding(portfolio),
  };
}
export type View = ReturnType<typeof portfolioView>;

/** Loads a display face for one template, once per page. */
export function useTemplateFont(family: string) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const id = `pf-font-${family.replace(/\W+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
    document.head.appendChild(link);
  }, [family]);
}

/** Keyframes the templates share. Rendered once per template root. */
export function TemplateStyles() {
  return (
    <style>{`
      @keyframes pf-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
      @keyframes pf-spin { to { transform: rotate(360deg) } }
      @keyframes pf-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
      .pf-rise { animation: pf-rise .7s cubic-bezier(.16,1,.3,1) both }
      @media (prefers-reduced-motion: reduce) { .pf-motion { animation: none !important } }
      [data-pf-root] section[id^="pf-"] { scroll-margin-top: 84px }
      [data-pf-reveal] { transition: opacity .9s cubic-bezier(.16,1,.3,1), transform .9s cubic-bezier(.16,1,.3,1) }
      [data-pf-hidden] { opacity: 0; transform: translateY(28px) }
      .pf-lift { transition: transform .45s cubic-bezier(.16,1,.3,1), box-shadow .45s, border-color .3s }
      .pf-lift:hover { transform: translateY(-4px) }
      @media (prefers-reduced-motion: reduce) { [data-pf-hidden] { opacity: 1; transform: none } .pf-lift:hover { transform: none } }
    `}</style>
  );
}

export function themeVars(accent: string, dark: boolean): CSSProperties {
  return {
    "--pf-accent": accent,
    "--pf-ink": inkOn(accent),
    "--border": dark ? "rgb(255 255 255 / 0.12)" : "rgb(0 0 0 / 0.1)",
    "--foreground": dark ? "#fafafa" : "#111111",
    "--muted-foreground": dark ? "rgb(255 255 255 / 0.55)" : "rgb(0 0 0 / 0.55)",
  } as CSSProperties;
}

export function Avatar({
  v,
  className = "",
  rounded = "rounded-full",
}: {
  v: View;
  className?: string;
  rounded?: string;
}) {
  return v.profile.avatar_url ? (
    <img
      src={v.profile.avatar_url}
      alt={v.name}
      className={`object-cover ${rounded} ${className}`}
    />
  ) : (
    <span
      className={`grid place-items-center bg-[var(--pf-accent)] font-semibold text-[color:var(--pf-ink)] ${rounded} ${className}`}
    >
      {v.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** A slowly turning ring of text around a centre mark. */
export function RotatingBadge({
  text,
  size = 120,
  children,
  className = "",
}: {
  text: string;
  size?: number;
  children?: ReactNode;
  className?: string;
}) {
  const id = `pf-ring-${size}`;
  return (
    <div
      className={`relative grid place-items-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        className="pf-motion absolute inset-0 h-full w-full"
        style={{ animation: "pf-spin 18s linear infinite" }}
        aria-hidden
      >
        <defs>
          <path id={id} d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
        </defs>
        <text fontSize="8.4" fontWeight="700" letterSpacing="2.2" fill="currentColor">
          <textPath href={`#${id}`} textLength="236" lengthAdjust="spacingAndGlyphs">
            {text}
          </textPath>
        </text>
      </svg>
      {children}
    </div>
  );
}

export function Marquee({
  items,
  className = "",
  separator = "✦",
}: {
  items: string[];
  className?: string;
  separator?: string;
}) {
  if (!items.length) return null;
  const row = [...items, ...items, ...items];
  return (
    <div className={`overflow-hidden whitespace-nowrap ${className}`} aria-hidden>
      <div
        className="pf-motion inline-flex"
        style={{ animation: "pf-marquee 32s linear infinite" }}
      >
        {[0, 1].map((copy) => (
          <span key={copy} className="inline-flex">
            {row.map((text, i) => (
              <span key={`${copy}-${i}`} className="inline-flex items-center">
                <span className="px-5">{text}</span>
                <span className="opacity-60">{separator}</span>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The project's own links, then the proof on Zero Club. */
export function WorkLinks({
  item,
  preview,
  onOpen,
  className = "",
  proofLabel = "View on Zero Club",
}: {
  item: PortfolioItem;
  preview?: boolean;
  onOpen?: (item: PortfolioItem) => void;
  className?: string;
  proofLabel?: string;
}) {
  const { ship } = describeItem(item);
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-semibold ${className}`}
    >
      {ship?.links.slice(0, 2).map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[var(--pf-accent)] hover:underline underline-offset-4"
        >
          {link.title} <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      ))}
      <Link
        to="/app/post/$id"
        params={{ id: item.post.id }}
        onClick={() => {
          if (!preview) onOpen?.(item);
        }}
        className="inline-flex items-center gap-1 opacity-80 transition hover:opacity-100 hover:underline underline-offset-4"
      >
        {proofLabel} <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export function AchievementIcon({ kind, className = "" }: { kind: string; className?: string }) {
  return kind === "challenge" ? <Trophy className={className} /> : <Medal className={className} />;
}

export const achievementSource = (kind: string) =>
  kind === "challenge" ? "Zero Proofs Challenge" : "Zero Games";

export function Footer({ dark, branding = true }: { dark: boolean; branding?: boolean }) {
  return (
    <footer
      className={`mt-16 flex flex-col items-center gap-2 border-t pt-8 text-center ${dark ? "border-white/[0.08]" : "border-black/[0.08]"}`}
    >
      {branding ? (
        <a
          href="https://www.zeroclubs.xyz"
          className={`text-[13px] transition ${dark ? "text-white/45 hover:text-white/80" : "text-black/45 hover:text-black/80"}`}
        >
          Built with <span className="font-semibold">Zero Club</span>
        </a>
      ) : (
        <p className={`text-[13px] ${dark ? "text-white/45" : "text-black/45"}`}>
          Built with <span className="font-semibold">Love</span> © {new Date().getFullYear()}
        </p>
      )}
      <p className={`max-w-md text-[12px] ${dark ? "text-white/30" : "text-black/35"}`}>
        Projects, highlights, wins and stats come from Zero Club. Experience and certificates are
        self-reported.
      </p>
    </footer>
  );
}

export const year = (iso?: string | null) => (iso ? new Date(iso).getFullYear() : null);

/**
 * A font size that keeps the longest word of `text` on one line inside its
 * own container (wrap the element in an `@container`), capped at `maxPx`.
 *
 * `perChar` is the average advance of one letter in em, measured with the
 * real web fonts (tracking included), e.g. Syne ExtraBold caps ≈ 1.1,
 * Archivo Black expanded caps ≈ 0.85, Instrument Serif ≈ 0.4.
 */
export function fitSize(text: string, maxPx: number, perChar: number, room = 96) {
  const longest = Math.max(1, ...text.split(/\s+/).map((w) => w.length));
  return `calc(min(${maxPx}px, ${(room / (longest * perChar)).toFixed(2)}cqw) * var(--pf-shrink, 1))`;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The safety net under `fitSize`: once the real web font has loaded, shrink
 * the text a little more if a word still runs past its box (very wide
 * letters like W, or a font that never loaded).
 */
export function useFitRef<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const run = () => {
      if (!alive) return;
      el.style.removeProperty("--pf-shrink");
      const over = el.scrollWidth / Math.max(1, el.clientWidth);
      if (over > 1.005) el.style.setProperty("--pf-shrink", (0.98 / over).toFixed(3));
    };
    run();
    void document.fonts?.ready.then(run);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(run);
    ro?.observe(el);
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, []);
  return ref;
}

/** Text sized by `fitSize` that also shrinks itself if a word still overflows. */
export function FitText({
  as = "p",
  className,
  style,
  children,
}: {
  as?: "h1" | "h2" | "p" | "li";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useFitRef<HTMLParagraphElement>();
  const Tag = as as "p";
  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  );
}

/**
 * "Let's talk": a link to the owner's Zero Club messages or their email,
 * whichever they chose. Keeps each template's own styling.
 */
export function ContactLink({ v, className, children }: { v: View; className?: string; children: ReactNode }) {
  if (v.contact.external) return <a href={v.contact.href} className={className}>{children}</a>;
  return <Link to={v.contact.href as never} className={className}>{children}</Link>;
}

/** Previous / next buttons for a horizontal work rail (by element id). */
export function RailArrows({ railId, dark }: { railId: string; dark: boolean }) {
  const go = (dir: 1 | -1) => {
    const el = typeof document !== "undefined" ? document.getElementById(railId) : null;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(260, el.clientWidth * 0.8), behavior: "smooth" });
  };
  const cls = `grid h-10 w-10 place-items-center rounded-full border transition active:scale-95 ${
    dark ? "border-white/15 text-white/80 hover:border-white/40" : "border-black/15 text-black/75 hover:border-black/40"
  }`;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" aria-label="Previous project" onClick={() => go(-1)} className={cls}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button type="button" aria-label="Next project" onClick={() => go(1)} className={cls}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Every project the owner has shipped on Zero Club, beyond the ones picked
 * for Selected work. Real posts only; nothing here is typed in.
 */
export function ShippedWork({
  v,
  dark,
  title,
  className = "",
  titleStyle,
}: {
  v: View;
  dark: boolean;
  title?: string;
  className?: string;
  titleStyle?: CSSProperties;
}) {
  if (!v.shipped.length) return null;
  const heading = title || (v.projects.length ? "More shipped work" : "Shipped work");
  const card = dark ? "border-white/[0.08] bg-white/[0.03] hover:border-white/20" : "border-black/[0.07] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:border-black/20 hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.35)]";
  const muted = dark ? "text-white/55" : "text-black/55";
  return (
    <section id="pf-shipped" data-pf-reveal className={`py-10 ${className}`}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-[24px] font-semibold tracking-[-0.02em] @3xl:text-[30px]" style={titleStyle}>
          {heading}
        </h2>
        <p className={`text-[13px] ${muted}`}>
          {v.shipped.length} {v.shipped.length === 1 ? "project" : "projects"}
        </p>
      </div>
      <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr))]">
        {v.shipped.map((post) => {
          const { title: name, summary, ship } = describePost(post);
          const img = postImages(post)[0];
          return (
            <Link
              key={post.id}
              to="/app/post/$id"
              params={{ id: post.id }}
              className={`pf-lift group flex flex-col overflow-hidden rounded-2xl border ${card}`}
            >
              <span className="block overflow-hidden">
                {img ? (
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                  />
                ) : (
                  <span
                    className="grid aspect-[16/10] w-full place-items-center px-5 text-center text-[17px] font-semibold leading-tight tracking-tight"
                    style={{ ...titleStyle, background: "linear-gradient(135deg, color-mix(in srgb, var(--pf-accent) 30%, transparent), color-mix(in srgb, var(--pf-accent) 6%, transparent))" }}
                  >
                    {clip(name, 40)}
                  </span>
                )}
              </span>
              <span className="flex flex-1 flex-col p-4">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15.5px] font-semibold tracking-tight" style={titleStyle}>{name}</span>
                  {post.is_verified_build && <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--pf-accent)]" />}
                </span>
                <span className={`mt-0.5 block text-[12px] ${muted}`}>
                  {[ship?.category, String(year(post.created_at) || "")].filter(Boolean).join(" · ")}
                </span>
                {summary && <span className={`mt-2 line-clamp-2 text-[13px] leading-snug ${muted}`}>{summary}</span>}
                <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[12.5px] font-semibold text-[var(--pf-accent)]">
                  View project <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ── PRO site chrome ─────────────────────────────────────────────── */

/**
 * The owner's brand: the logo they uploaded, otherwise their name set as a
 * small wordmark. Never a lone initial.
 */
export function BrandMark({
  v,
  className = "",
  style,
  scale = 1,
  dark = false,
}: {
  v: View;
  className?: string;
  style?: CSSProperties;
  /** 1 fits the 64px header; the footer shows it a little larger. */
  scale?: number;
  /** The page behind the logo, so a white or black mark never disappears. */
  dark?: boolean;
}) {
  const logo = v.portfolio.logo_url;
  if (logo) return <LogoImage url={logo} alt={v.name} scale={scale} dark={dark} className={className} />;
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 text-[15.5px] font-semibold tracking-[-0.01em] ${className}`}
      style={style}
    >
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[3px] bg-[var(--pf-accent)]" />
      <span className="truncate">{v.name}</span>
    </span>
  );
}

/**
 * An uploaded logo, trimmed of empty margins and sized from its own
 * proportions: square marks fill the header's height, long wordmarks run
 * wider and shorter, so each one reads clearly without growing the bar.
 */
function LogoImage({
  url,
  alt,
  scale,
  dark,
  className,
}: {
  url: string;
  alt: string;
  scale: number;
  dark: boolean;
  className: string;
}) {
  const [fit, setFit] = useState<LogoFit>({ src: url, aspect: 0 });
  useEffect(() => {
    let live = true;
    setFit({ src: url, aspect: 0 });
    void fitLogo(url).then((f) => {
      if (live) setFit(f);
    });
    return () => {
      live = false;
    };
  }, [url]);
  const known = fit.aspect > 0;
  // A white mark on a light page (or a black one on a dark page) gets a
  // contrasting plate; the plate's padding comes out of the logo's own box
  // so the header never grows.
  const plate = (fit.tone === "light" && !dark) || (fit.tone === "dark" && dark);
  const size = logoSize(fit.aspect, scale);
  // On a plate the mark keeps most of its height; the plate grows sideways.
  const padY = plate ? Math.round(5 * scale) : 0;
  const padX = plate ? Math.round(12 * scale) : 0;
  const innerH = size.height - padY * 2;
  const innerW = Math.min(size.width, Math.round(innerH * (fit.aspect || 1)));
  const img = (
    <img
      src={fit.src}
      alt={alt}
      decoding="async"
      onLoad={(e) => {
        const el = e.currentTarget;
        if (!known && el.naturalWidth && el.naturalHeight)
          setFit((f) => (f.aspect ? f : { ...f, aspect: el.naturalWidth / el.naturalHeight }));
      }}
      className={`block max-w-full shrink-0 object-contain ${fit.boxed ? "rounded-[8px]" : ""} ${plate ? "" : className}`}
      style={
        known
          ? { width: innerW, height: innerH }
          : { height: Math.round(36 * scale), width: "auto", maxWidth: Math.round(210 * scale) }
      }
    />
  );
  if (!plate) return img;
  return (
    <span
      className={`inline-flex shrink-0 rounded-[10px] ${fit.tone === "light" ? "bg-[#111]" : "bg-white"} ${className}`}
      style={{ padding: `${padY}px ${padX}px` }}
    >
      {img}
    </span>
  );
}

const NAV_LABEL: Partial<Record<PortfolioSectionKey, string>> = {
  work: "Work",
  about: "About",
  experience: "Experience",
  skills: "Skills",
  proofs: "Highlights",
  achievements: "Wins",
  rates: "Rates",
  learning: "Learning",
  certificates: "Credentials",
};

/** In-page links for the sections a template actually shows. */
export function navLinks(v: View, omit: PortfolioSectionKey[] = []) {
  return v.sections
    .filter((s) => NAV_LABEL[s.key] && !omit.includes(s.key))
    .slice(0, 4)
    .map((s) => ({ id: `pf-${s.key}`, label: NAV_LABEL[s.key] as string }));
}

/** Smooth in-page scroll that leaves the URL alone. */
export function jumpTo(id: string) {
  return (e: { preventDefault: () => void }) => {
    const el = typeof document !== "undefined" ? document.getElementById(id) : null;
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

/** A sticky, frosted top bar: brand, section links and "Let's talk". */
export function SiteNav({
  v,
  dark,
  bg,
  display,
  omit,
  maxW = "max-w-[1180px]",
  solid,
}: {
  v: View;
  dark: boolean;
  /** The page colour behind the bar, for the frosted fill. */
  bg: string;
  display?: CSSProperties;
  omit?: PortfolioSectionKey[];
  /** Match the template's content width. */
  maxW?: string;
  /** Opaque fill, for bars that sit over a differently coloured hero. */
  solid?: boolean;
}) {
  const links = navLinks(v, omit);
  return (
    <>
      <div id="pf-top" />
      <div
        className={`sticky top-0 z-40 border-b backdrop-blur-xl backdrop-saturate-150 ${dark ? "border-white/[0.07] text-white" : "border-black/[0.06] text-[#111]"}`}
        style={{ background: solid ? bg : `color-mix(in srgb, ${bg} 80%, transparent)` }}
      >
        <nav className={`mx-auto flex h-16 ${maxW} items-center justify-between gap-4 px-5 @3xl:px-10`}>
          <a href="#pf-top" onClick={jumpTo("pf-top")} className="min-w-0" aria-label={`${v.name} — top`}>
            <BrandMark v={v} style={display} dark={dark} />
          </a>
          {links.length > 1 && (
            <div className="hidden items-center gap-0.5 @3xl:flex">
              {links.map((l) => (
                <a
                  key={l.id}
                  href={`#${l.id}`}
                  onClick={jumpTo(l.id)}
                  className={`rounded-full px-3.5 py-2 text-[13.5px] font-medium transition ${dark ? "text-white/60 hover:bg-white/[0.07] hover:text-white" : "text-black/55 hover:bg-black/[0.05] hover:text-black"}`}
                >
                  {l.label}
                </a>
              ))}
            </div>
          )}
          <ContactLink
            v={v}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-[var(--pf-accent)] px-4 text-[13.5px] font-semibold text-[color:var(--pf-ink)] shadow-[0_6px_20px_-8px_var(--pf-accent)] transition hover:brightness-110 active:scale-[0.98]"
          >
            {v.contact.method === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
            Let's talk
          </ContactLink>
        </nav>
      </div>
    </>
  );
}

/**
 * Sections ease in as they scroll into view. Only content that starts below
 * the fold is hidden, so a page without JavaScript (or a reader who prefers
 * less motion) always sees everything.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-pf-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).removeAttribute("data-pf-hidden");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );
    for (const el of els) {
      if (el.getBoundingClientRect().top < window.innerHeight) continue;
      el.setAttribute("data-pf-hidden", "");
      io.observe(el);
    }
    return () => {
      io.disconnect();
      for (const el of els) el.removeAttribute("data-pf-hidden");
    };
  }, []);
  return ref;
}

/** A full footer for PRO pages: brand, links, socials and back-to-top. */
export function SiteFooter({
  v,
  dark,
  display,
  omit,
}: {
  v: View;
  dark: boolean;
  display?: CSSProperties;
  omit?: PortfolioSectionKey[];
}) {
  const links = navLinks(v, omit);
  const line = dark ? "border-white/[0.08]" : "border-black/[0.08]";
  const muted = dark ? "text-white/55" : "text-black/55";
  const faint = dark ? "text-white/35" : "text-black/40";
  const hover = dark ? "hover:text-white" : "hover:text-black";
  return (
    <footer className={`mt-20 border-t pt-12 ${line}`}>
      <div className="grid gap-10 @3xl:grid-cols-[1.4fr_1fr_auto] @3xl:items-start">
        <div className="min-w-0 max-w-[380px]">
          <BrandMark v={v} style={display} scale={1.3} dark={dark} />
          {v.headline && (
            <p className={`mt-4 text-[14px] leading-relaxed ${muted}`}>{clip(v.headline, 140)}</p>
          )}
          <SocialLinksRow links={v.profile.social_links} className="mt-5" />
        </div>
        {links.length > 0 && (
          <div>
            <p className={`text-[11.5px] font-semibold uppercase tracking-[0.16em] ${faint}`}>On this page</p>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[14px]">
              {links.map((l) => (
                <li key={l.id}>
                  <a href={`#${l.id}`} onClick={jumpTo(l.id)} className={`${muted} transition ${hover}`}>
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <ContactLink v={v} className={`${muted} transition ${hover}`}>
                  Contact
                </ContactLink>
              </li>
            </ul>
          </div>
        )}
        <a
          href="#pf-top"
          onClick={jumpTo("pf-top")}
          className={`inline-flex h-11 items-center gap-2 self-start rounded-full border px-4 text-[13px] font-semibold transition ${dark ? "border-white/15 text-white/80 hover:border-white/40" : "border-black/15 text-black/75 hover:border-black/40"}`}
        >
          <ChevronUp className="h-4 w-4" /> Back to top
        </a>
      </div>
      <div className={`mt-12 flex flex-col gap-3 border-t py-6 text-[12.5px] @3xl:flex-row @3xl:items-center @3xl:justify-between ${line}`}>
        {v.showBranding ? (
          <a href="https://www.zeroclubs.xyz" className={`${muted} transition ${hover}`}>
            Built with <span className="font-semibold">Zero Club</span>
          </a>
        ) : (
          <p className={muted}>
            Built with <span className="font-semibold">Love</span> © {new Date().getFullYear()}
          </p>
        )}
        <p className={`max-w-[460px] @3xl:text-right ${faint}`}>
          Projects, highlights, wins and stats come from Zero Club. Experience and certificates are
          self-reported.
        </p>
      </div>
    </footer>
  );
}
