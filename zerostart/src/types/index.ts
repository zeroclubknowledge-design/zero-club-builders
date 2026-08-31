/** The domain, typed once. Everything else imports from here. */

export type MvpStatus =
  | "draft" | "pending_review" | "approved" | "live" | "paused" | "completed" | "rejected";

export type CampaignStatus = "draft" | "live" | "paused" | "completed" | "cancelled";

export type ParticipationStatus = "started" | "submitted" | "approved" | "rejected";

export type TesterLevel = "Beginner Tester" | "Verified Tester" | "Pro Tester" | "Elite Tester";

export const CATEGORIES = [
  "Artificial Intelligence", "Productivity", "Education", "Fintech", "Social",
  "Gaming", "Web3", "Developer Tools", "Health", "E-commerce", "Mobile", "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface Mvp {
  id: string;
  builder_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  short_description: string;
  full_description: string | null;
  category: string;
  zerohub_url: string | null;
  website_url: string | null;
  status: MvpStatus;
  is_featured: boolean;
  created_at: string;
  /** Joined, not stored. */
  builder?: Profile | null;
  campaigns?: Campaign[];
}

export interface Campaign {
  id: string;
  mvp_id: string;
  builder_id: string;
  name: string;
  description: string | null;
  objective: string | null;
  tester_limit: number;
  zp_reward: number;
  deadline: string | null;
  status: CampaignStatus;
  created_at: string;
  mvp?: Mvp | null;
  tasks?: TestingTask[];
  /** Derived by the service layer, never a column. */
  seats_taken?: number;
}

export interface TestingTask {
  id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  position: number;
  required: boolean;
}

export interface Participation {
  id: string;
  campaign_id: string;
  tester_id: string;
  status: ParticipationStatus;
  completed_task_ids: string[];
  started_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  campaign?: Campaign | null;
  tester?: Profile | null;
  feedback?: Feedback | null;
  bugs?: BugReport[];
}

export interface Feedback {
  id: string;
  participation_id: string;
  overall_rating: number;
  liked: string | null;
  confusing: string | null;
  suggestions: string | null;
  additional_feedback: string | null;
  screenshot_urls: string[];
  created_at: string;
}

export interface BugReport {
  id: string;
  participation_id: string;
  title: string;
  description: string | null;
  reproduction_steps: string | null;
  expected_result: string | null;
  actual_result: string | null;
  screenshot_urls: string[];
  status: "open" | "confirmed" | "fixed" | "wont_fix" | "invalid";
  created_at: string;
}

export interface TesterStats {
  profile_id: string;
  tests_started: number;
  tests_submitted: number;
  tests_approved: number;
  tests_rejected: number;
  bugs_reported: number;
  total_zp_earned: number;
}

/**
 * Level is derived, never stored — a stored level goes stale the moment the
 * thresholds change and then needs backfilling. The database has the same
 * function so both sides agree.
 */
export function testerLevel(stats?: Pick<TesterStats, "tests_approved" | "tests_submitted"> | null): TesterLevel {
  const approved = stats?.tests_approved ?? 0;
  const submitted = stats?.tests_submitted ?? 0;
  if (approved >= 50 && submitted > 0 && approved / submitted >= 0.9) return "Elite Tester";
  if (approved >= 20) return "Pro Tester";
  if (approved >= 5) return "Verified Tester";
  return "Beginner Tester";
}
