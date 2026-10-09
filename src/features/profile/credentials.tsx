import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Work experience, outside certificates and social links.
 *
 * These are self-reported: the person typed them in, and they are labelled
 * that way wherever they show. Zero Club-verified things (ships, bootcamps,
 * XP) live elsewhere and are labelled as verified. The portfolio reads both.
 */

export type Experience = {
  id: string;
  profile_id: string;
  title: string;
  company: string;
  employment_type: string | null;
  location: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  sort_order: number;
};

export type Certificate = {
  id: string;
  profile_id: string;
  name: string;
  issuer: string;
  issued_on: string | null;
  expires_on: string | null;
  credential_id: string | null;
  credential_url: string | null;
  sort_order: number;
};

export const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Freelance",
  "Internship",
  "Volunteer",
  "Self-employed",
] as const;

export function useProfileCredentials(profileId?: string | null) {
  return useQuery({
    queryKey: ["profile-credentials", profileId],
    enabled: Boolean(profileId),
    staleTime: 60_000,
    queryFn: async () => {
      const [experiences, certificates] = await Promise.all([
        supabase
          .from("profile_experiences")
          .select("*")
          .eq("profile_id", profileId!)
          .order("is_current", { ascending: false })
          .order("start_date", { ascending: false }),
        supabase
          .from("profile_certificates")
          .select("*")
          .eq("profile_id", profileId!)
          .order("issued_on", { ascending: false, nullsFirst: false }),
      ]);
      return {
        experiences: (experiences.data || []) as Experience[],
        certificates: (certificates.data || []) as Certificate[],
      };
    },
  });
}

/* ── Dates ───────────────────────────────────────────── */

export function monthYear(date?: string | null) {
  if (!date) return "";
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString([], {
    month: "short",
    year: "numeric",
  });
}

/** "Jan 2023 – Present · 2 yrs 4 mos" */
export function experienceSpan(exp: Pick<Experience, "start_date" | "end_date" | "is_current">) {
  const start = new Date(`${exp.start_date.slice(0, 10)}T00:00:00`);
  const end =
    exp.is_current || !exp.end_date
      ? new Date()
      : new Date(`${exp.end_date.slice(0, 10)}T00:00:00`);
  const months = Math.max(
    1,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1,
  );
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const length = [
    years ? `${years} yr${years === 1 ? "" : "s"}` : "",
    rest ? `${rest} mo${rest === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `${monthYear(exp.start_date)} – ${exp.is_current ? "Present" : monthYear(exp.end_date)} · ${length}`;
}

/* ── Social links ────────────────────────────────────── */

const path = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
    <path d={d} />
  </svg>
);

export const SOCIAL_NETWORKS: {
  key: string;
  label: string;
  placeholder: string;
  /** Turns a handle into a full link. */
  base?: string;
  icon: ReactNode;
}[] = [
  {
    key: "linkedin",
    label: "LinkedIn",
    placeholder: "linkedin.com/in/yourname",
    base: "https://www.linkedin.com/in/",
    icon: path(
      "M5.3 8.4h3.1V19H5.3V8.4Zm1.6-5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6ZM10.3 8.4h3v1.5c.4-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5V19h-3.1v-5.2c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V19h-3.2V8.4Z",
    ),
  },
  {
    key: "github",
    label: "GitHub",
    placeholder: "github.com/yourname",
    base: "https://github.com/",
    icon: path(
      "M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.5-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z",
    ),
  },
  {
    key: "x",
    label: "X",
    placeholder: "x.com/yourname",
    base: "https://x.com/",
    icon: path(
      "M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.9 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z",
    ),
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "instagram.com/yourname",
    base: "https://instagram.com/",
    icon: path(
      "M12 7.4A4.6 4.6 0 1 0 12 16.6 4.6 4.6 0 0 0 12 7.4Zm0 7.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm5.9-7.8a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21 8.3c-.1-1.5-.4-2.8-1.5-3.8-1-1.1-2.3-1.4-3.8-1.5-1.5-.1-6-.1-7.5 0-1.5.1-2.8.4-3.8 1.5-1.1 1-1.4 2.3-1.5 3.8-.1 1.5-.1 6 0 7.5.1 1.5.4 2.8 1.5 3.8 1 1.1 2.3 1.4 3.8 1.5 1.5.1 6 .1 7.5 0 1.5-.1 2.8-.4 3.8-1.5 1.1-1 1.4-2.3 1.5-3.8.1-1.5.1-6 0-7.5Zm-2 9.2a3 3 0 0 1-1.7 1.7c-1.2.5-3.9.4-5.3.4s-4.1.1-5.3-.4a3 3 0 0 1-1.7-1.7c-.5-1.2-.4-3.9-.4-5.3s-.1-4.1.4-5.3a3 3 0 0 1 1.7-1.7c1.2-.5 3.9-.4 5.3-.4s4.1-.1 5.3.4a3 3 0 0 1 1.7 1.7c.5 1.2.4 3.9.4 5.3s.1 4.1-.4 5.3Z",
    ),
  },
  {
    key: "behance",
    label: "Behance",
    placeholder: "behance.net/yourname",
    base: "https://www.behance.net/",
    icon: path(
      "M8.6 11.4c.9-.4 1.5-1.2 1.5-2.4C10.1 6.6 8.3 6 6.4 6H1v12h5.6c2.1 0 4.1-1 4.1-3.4 0-1.5-.7-2.6-2.1-3.2ZM3.5 8h2.4c.9 0 1.7.3 1.7 1.3 0 1-.6 1.3-1.5 1.3H3.5V8Zm2.7 8H3.5v-3.3h2.8c1.1 0 1.8.5 1.8 1.7S7.3 16 6.2 16ZM20 7.3h-5V6h5v1.3Zm2.6 7.1c0-2.7-1.6-4.9-4.4-4.9s-4.6 2.1-4.6 4.8c0 2.8 1.7 4.7 4.6 4.7 2.1 0 3.5-1 4.2-3h-2.2c-.2.7-1.2 1.1-1.9 1.1-1.4 0-2.1-.8-2.1-2.2h6.4v-.5Zm-6.4-.9c.1-1.1.8-1.8 1.9-1.8s1.7.7 1.8 1.8h-3.7Z",
    ),
  },
  {
    key: "dribbble",
    label: "Dribbble",
    placeholder: "dribbble.com/yourname",
    base: "https://dribbble.com/",
    icon: path(
      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.6 4.6a8.5 8.5 0 0 1 1.9 5.3c-.3-.1-3.1-.6-5.9-.3l-.2-.5-.6-1.2c3.1-1.3 4.5-3.1 4.8-3.3ZM12 3.5c2.2 0 4.2.8 5.6 2.2-.2.3-1.5 2-4.5 3.1-1.4-2.6-3-4.7-3.2-5a8.5 8.5 0 0 1 2.1-.3Zm-3.6.8c.2.3 1.8 2.4 3.2 4.9-4 1.1-7.6 1-8 1A8.5 8.5 0 0 1 8.4 4.3ZM3.5 12v-.3c.4 0 4.5.1 8.8-1.2l.7 1.4-.3.1c-4.4 1.4-6.8 5.4-7 5.7A8.5 8.5 0 0 1 3.5 12Zm8.5 8.5a8.5 8.5 0 0 1-5.2-1.8c.2-.3 1.9-3.6 6.6-5.3h.1a35 35 0 0 1 1.8 6.5 8.4 8.4 0 0 1-3.3.6Zm4.8-1.5c-.1-.5-.5-3-1.7-6.1 2.6-.4 4.9.3 5.2.4a8.5 8.5 0 0 1-3.5 5.7Z",
    ),
  },
  {
    key: "youtube",
    label: "YouTube",
    placeholder: "youtube.com/@yourname",
    base: "https://www.youtube.com/@",
    icon: path(
      "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z",
    ),
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "tiktok.com/@yourname",
    base: "https://www.tiktok.com/@",
    icon: path(
      "M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-1.8-2.5V9.8a5.7 5.7 0 1 0 4.9 5.6V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6Z",
    ),
  },
  {
    key: "medium",
    label: "Medium",
    placeholder: "medium.com/@yourname",
    base: "https://medium.com/@",
    icon: path(
      "M13.5 12a6.75 6.75 0 1 1-13.5 0 6.75 6.75 0 0 1 13.5 0Zm7.4 0c0 3.5-1.5 6.3-3.4 6.3s-3.4-2.8-3.4-6.3 1.5-6.3 3.4-6.3 3.4 2.8 3.4 6.3ZM24 12c0 3.1-.5 5.7-1.2 5.7s-1.2-2.6-1.2-5.7.5-5.7 1.2-5.7S24 8.9 24 12Z",
    ),
  },
  {
    key: "email",
    label: "Email",
    placeholder: "you@example.com",
    icon: path(
      "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 7.1L4 7v11h16V7l-8 5.1Zm0-2.2L19.2 7H4.8L12 9.9Z",
    ),
  },
];

/** "@ada", "ada", "linkedin.com/in/ada" or a full URL → a full https link. */
export function normaliseSocialLink(key: string, raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (key === "email") return value.replace(/^mailto:/i, "");
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+\//.test(value) || /^[\w-]+\.[a-z]{2,}$/i.test(value))
    return `https://${value}`;
  const network = SOCIAL_NETWORKS.find((n) => n.key === key);
  const handle = value.replace(/^@/, "");
  return network?.base ? `${network.base}${handle}` : `https://${value}`;
}

export function socialHref(key: string, value: string) {
  return key === "email" ? `mailto:${value}` : value;
}

/** Links in the order networks are listed, skipping empty ones. */
export function orderedSocialLinks(links?: Record<string, string> | null) {
  return SOCIAL_NETWORKS.filter((n) => links?.[n.key]).map((n) => ({ ...n, value: links![n.key] }));
}
