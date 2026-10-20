import type { Certificate, Experience } from "@/features/profile/credentials";
import type { RateCard } from "./rates";

export const SECTION_KEYS = [
  "work",
  "about",
  "experience",
  "skills",
  "learning",
  "certificates",
  "proofs",
  "achievements",
  "rates",
  "contact",
] as const;
export type PortfolioSectionKey = (typeof SECTION_KEYS)[number];
export type PortfolioSection = { key: PortfolioSectionKey; visible: boolean };

export const SECTION_LABELS: Record<PortfolioSectionKey, string> = {
  work: "Selected work",
  about: "About",
  experience: "Experience",
  skills: "Skills & tools",
  learning: "Learning",
  certificates: "Certificates",
  proofs: "Highlights",
  achievements: "Wins & awards",
  rates: "Rate card",
  contact: "Contact",
};

export const ACCENTS = ["pink", "violet", "emerald", "amber", "sky", "mono"] as const;
export type PortfolioAccent = (typeof ACCENTS)[number];
export const ACCENT_HEX: Record<PortfolioAccent, string> = {
  pink: "#e0329f",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
  sky: "#38bdf8",
  mono: "#f4f4f5",
};

export const PREMIUM_TEMPLATES = ["signal", "spotlight", "statement", "bright", "gallery"] as const;
export type PremiumTemplate = (typeof PREMIUM_TEMPLATES)[number];
export type PortfolioTemplate = "minimal" | "studio" | PremiumTemplate;
export const isPremiumTemplate = (t: string | null | undefined): t is PremiumTemplate =>
  (PREMIUM_TEMPLATES as readonly string[]).includes(t || "");

/** Verified wins, read from Zero Club results — never typed in by the owner. */
export type Achievement = {
  kind: "challenge" | "zero_games";
  title: string;
  place: number | null;
  label: string;
  at: string | null;
  ref: string;
};

export type Portfolio = {
  id: string;
  status: "draft" | "published";
  template: PortfolioTemplate;
  /** What the owner saved; differs from `template` when a premium look lapsed. */
  stored_template?: PortfolioTemplate;
  premium_active?: boolean;
  headline: string | null;
  about: string | null;
  accent: PortfolioAccent;
  sections: PortfolioSection[];
  skills: string[];
  show_stats: boolean;
  indexable: boolean;
  /** Where "Let's talk" goes: a Zero Club message, or the owner's email. */
  contact_method?: "email" | "zeroclub";
  /** The owner's brand mark, shown in place of an initial. */
  logo_url?: string | null;
  /** PRO only: replace "Built with Zero Club" with "Built with love". */
  hide_branding?: boolean;
  /** Server-computed: false only for PRO portfolios that turned branding off. */
  show_branding?: boolean;
  /** What the owner charges. Free plans show one rate; PRO up to four tiers. */
  rate_card?: RateCard | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PortfolioPost = {
  id: string;
  content: string;
  media_urls: string[] | null;
  likes_count: number | null;
  comments_count: number | null;
  created_at: string;
  is_build_post: boolean | null;
  is_verified_build: boolean | null;
  version_label: string | null;
  versions?: number | null;
};

export type PortfolioItem = {
  id: string;
  kind: "project" | "proof";
  featured: boolean;
  sort_order: number;
  problem: string | null;
  outcome: string | null;
  /** The owner's own wording and cover for this card; the post itself is untouched. */
  display_title?: string | null;
  display_summary?: string | null;
  cover_url?: string | null;
  post: PortfolioPost;
};

export type PortfolioProfile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  social_links: Record<string, string> | null;
  xp: number | null;
  account_type: string | null;
  interests: string[] | null;
};

export type LearningEntry = {
  id: string;
  title: string;
  category: string | null;
  banner_url: string | null;
  enrolled_at: string | null;
};

export type PublicPortfolio = {
  found: true;
  is_owner: boolean;
  profile: PortfolioProfile;
  portfolio: Portfolio;
  items: PortfolioItem[];
  experiences: Experience[];
  certificates: Certificate[];
  learning: LearningEntry[];
  achievements?: Achievement[];
  /** Every project the owner has shipped publicly, newest first. */
  shipped?: PortfolioPost[];
  stats: { ships: number; verified: number; proofs: number; xp: number };
};

export type PortfolioLookup = PublicPortfolio | { found: false };

/** Normalises the stored sections list: known keys only, each once, missing ones appended visible. */
export function normaliseSections(raw: unknown): PortfolioSection[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: PortfolioSection[] = [];
  for (const entry of list) {
    const key = (entry as any)?.key;
    if (!SECTION_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, visible: (entry as any)?.visible !== false });
  }
  // A section added later lands where it belongs (before the next known one), not at the end.
  SECTION_KEYS.forEach((key, index) => {
    if (seen.has(key)) return;
    const after = SECTION_KEYS.slice(index + 1);
    const at = out.findIndex((s) => after.includes(s.key));
    out.splice(at === -1 ? out.length : at, 0, { key, visible: true });
    seen.add(key);
  });
  return out;
}

export const portfolioUrl = (username: string) => `https://www.zeroclubs.xyz/@${username}`;
export const portfolioDisplayUrl = (username: string) => `zeroclubs.xyz/@${username}`;
