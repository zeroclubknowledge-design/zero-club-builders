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
