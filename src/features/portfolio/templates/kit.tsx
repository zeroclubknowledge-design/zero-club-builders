/**
 * Shared pieces for the premium portfolio templates.
 *
 * Every template reads the same portfolio data through `portfolioView`, so a
 * person can switch looks without touching their content. Nothing here
 * invents a number: stats, wins and verification all come from Zero Club
 * records, and anything self-reported (experience, certificates) is shown as
 * written and labelled as such in the footer.
 */
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Trophy, Medal } from "@/components/icons/glyphs";
import { clip, describePost, postImages } from "../parse";
import {
  ACCENT_HEX,
  normaliseSections,
  type PortfolioItem,
  type PortfolioSectionKey,
  type PublicPortfolio,
} from "../types";

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
    contact: Boolean(email || website || Object.keys(profile.social_links || {}).length),
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
    postImages(item.post)
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
  const { ship } = describePost(item.post);
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

export function Footer({ dark }: { dark: boolean }) {
  return (
    <footer
      className={`mt-16 flex flex-col items-center gap-2 border-t pt-8 text-center ${dark ? "border-white/[0.08]" : "border-black/[0.08]"}`}
    >
      <a
        href="https://www.zeroclubs.xyz"
        className={`text-[13px] transition ${dark ? "text-white/45 hover:text-white/80" : "text-black/45 hover:text-black/80"}`}
      >
        Built with <span className="font-semibold">Zero Club</span>
      </a>
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
