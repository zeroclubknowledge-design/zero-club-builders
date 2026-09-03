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

export type AmbassadorLevel =
  | "New Ambassador"
  | "Ambassador"
  | "Active Ambassador"
  | "Lead Ambassador"
  | "Regional Lead";

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
 * The level thresholds, mirrored from zs_ambassador_level so the UI can
 * explain what the next one takes. The database stays the authority — this is
 * only for showing someone how far they have to go.
 */
export const LEVELS: { level: AmbassadorLevel; approved: number }[] = [
  { level: "New Ambassador", approved: 0 },
  { level: "Ambassador", approved: 1 },
  { level: "Active Ambassador", approved: 8 },
  { level: "Lead Ambassador", approved: 20 },
  { level: "Regional Lead", approved: 40 },
];

export function nextLevel(approved: number) {
  return LEVELS.find((l) => approved < l.approved) ?? null;
}

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
