/** The Zero Ambassador domain, typed once. */

/** A growth lever an ambassador can commit to. Rows, not an enum — the admin
    can add or retire one without a code change. */
export interface FocusArea {
  slug: string;
  label: string;
  description: string;
  icon: string | null;
  sort_order: number;
  active: boolean;
}

export type AmbassadorStatus = "active" | "paused" | "removed";

/** Zero Ambassador ranks, lowest to highest, by members brought in. */
export type AmbassadorLevel =
  | "Associate"
  | "Representative"
  | "Specialist"
  | "Manager"
  | "Director"
  | "Executive";

/** Everything the dashboard needs, as returned by zs_ambassador_me(). */
export interface AmbassadorMe {
  found: boolean;
  location?: string;
  country?: string | null;
  bio?: string | null;
  status?: AmbassadorStatus;
  joined_at?: string;
  focus?: string[];
  bootcamps?: string[];
  tasks_approved?: number;
  tasks_submitted?: number;
  zp_earned?: number;
  level?: AmbassadorLevel;
  /** Verified signups brought in — what the rank is based on. */
  members_brought_in?: number;
  commission_rate?: number;
  payout_currency?: "NGN" | "GHS" | "USD";
  payout_frequency?: "weekly" | "monthly";
  /** Schedule changes still allowed this calendar month (4 per month). */
  frequency_changes_left?: number;
  /** Only when found is false: the person's latest application, if any. */
  application?: AmbassadorApplication;
  default_rate?: number;
}

export interface AmbassadorApplication {
  id?: string;
  status: "none" | "pending" | "approved" | "rejected";
  location?: string;
  country?: string | null;
  bio?: string | null;
  motivation?: string;
  links?: string | null;
  focus?: string[];
  bootcamps?: string[];
  payout_currency?: "NGN" | "GHS" | "USD";
  payout_frequency?: "weekly" | "monthly";
  review_note?: string | null;
  created_at?: string;
  reviewed_at?: string | null;
}

export type TaskStatus = "available" | "submitted" | "approved" | "rejected";

export interface AmbassadorTask {
  quest_id: string;
  title: string;
  description: string;
  reward: number;
  icon_name: string | null;
  frequency: string;
  my_status: TaskStatus;
  submitted_at: string | null;
  note: string | null;
}

export interface RosterEntry {
  profile_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  location: string;
  focus: string[];
  tasks_approved: number;
  level: AmbassadorLevel;
}

/** A bootcamp an ambassador can commit to pushing in their area. */
export interface PushableBootcamp {
  id: string;
  title: string;
  category: string | null;
  price: number | null;
  starts_at: string | null;
}

/**
 * Rank thresholds by members brought in (verified signups), mirrored from
 * zs_rank_for so the UI can explain what the next rank takes. The database
 * stays the authority — this is only for showing how far there is to go.
 */
export const LEVELS: { level: AmbassadorLevel; members: number; range: string }[] = [
  { level: "Associate", members: 0, range: "0 – 100 members" },
  { level: "Representative", members: 101, range: "101 – 1,000 members" },
  { level: "Specialist", members: 1001, range: "1,001 – 10,000 members" },
  { level: "Manager", members: 10001, range: "10,001 – 100,000 members" },
  { level: "Director", members: 100001, range: "100,001 – 1,000,000 members" },
  { level: "Executive", members: 1000001, range: "1,000,001 – 10,000,000 members" },
];

export function nextLevel(members: number) {
  return LEVELS.find((l) => members < l.members) ?? null;
}

export const rankBadge = (level?: string | null) =>
  `/badges/ambassador-${(LEVELS.some((l) => l.level === level) ? level! : "Associate").toLowerCase()}.png`;

/* ── Initiatives ────────────────────────────────────────────────────────── */

export type InitiativeKind =
  | "project" | "market_course" | "invite" | "partnership"
  | "event" | "content" | "chapter" | "other";

export type InitiativeStatus =
  | "active" | "submitted" | "completed" | "rejected" | "abandoned";

export interface Initiative {
  id: string;
  focus_slug: string;
  kind: InitiativeKind;
  title: string;
  description: string;
  target_count: number | null;
  target_label: string | null;
  status: InitiativeStatus;
  result_summary: string | null;
  result_count: number | null;
  evidence_url: string | null;
  zp_awarded: number;
  review_note: string | null;
  created_at: string;
  submitted_at: string | null;
}

/**
 * What an ambassador can commit to.
 *
 * `needsTarget` marks the kinds where a number is the point — you cannot
 * meaningfully say "invite people" without saying how many. The others are
 * judged on what happened rather than counted, so asking for a figure would
 * only invite a made-up one.
 */
export const INITIATIVE_KINDS: {
  value: InitiativeKind;
  label: string;
  blurb: string;
  needsTarget: boolean;
  targetLabel?: string;
}[] = [
  { value: "project", label: "Run a project", blurb: "Something you'll build or organise for Zero Club.", needsTarget: false },
  { value: "market_course", label: "Market a bootcamp", blurb: "Push a specific bootcamp to people who'd take it.", needsTarget: true, targetLabel: "signups" },
  { value: "invite", label: "Invite people", blurb: "Bring a number of new builders onto Zero Club.", needsTarget: true, targetLabel: "people" },
  { value: "partnership", label: "Land a partnership", blurb: "Bring a brand, school, or organisation on board.", needsTarget: false },
  { value: "event", label: "Run an event", blurb: "A meetup, workshop, build night, or class.", needsTarget: true, targetLabel: "attendees" },
  { value: "content", label: "Make content", blurb: "Posts, videos, or threads that reach your people.", needsTarget: true, targetLabel: "pieces" },
  { value: "chapter", label: "Start a chapter", blurb: "A standing Zero Club presence at a campus or hub.", needsTarget: true, targetLabel: "members" },
  { value: "other", label: "Something else", blurb: "Your idea. Say what it is and what it should achieve.", needsTarget: false },
];
