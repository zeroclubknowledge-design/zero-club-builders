import type { Certificate, Experience } from "@/features/profile/credentials";

export const SECTION_KEYS = [
  "work",
  "about",
  "experience",
  "skills",
  "learning",
  "certificates",
  "proofs",
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
  proofs: "Zero Proofs",
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

export type Portfolio = {
  id: string;
  status: "draft" | "published";
  template: "minimal" | "studio";
  headline: string | null;
  about: string | null;
  accent: PortfolioAccent;
  sections: PortfolioSection[];
  skills: string[];
  show_stats: boolean;
  indexable: boolean;
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
  for (const key of SECTION_KEYS) if (!seen.has(key)) out.push({ key, visible: true });
  return out;
}

export const portfolioUrl = (username: string) => `https://www.zeroclubs.xyz/@${username}`;
export const portfolioDisplayUrl = (username: string) => `zeroclubs.xyz/@${username}`;
