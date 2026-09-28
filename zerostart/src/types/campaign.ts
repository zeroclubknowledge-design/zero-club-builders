import type { PayoutCurrency } from "@/lib/money";

export type CampaignGoal = "signups" | "activations" | "event" | "sales" | "awareness" | "other";
export type CampaignTracking = "link" | "proof" | "both";
export type CampaignStatus = "draft" | "live" | "paused" | "ended" | "removed";
export type ReviewStatus = "pending" | "approved" | "rejected";

export interface BonusTier {
  min: number;
  bonus: number;
}

/** Fields every campaign has, whoever is looking at it. */
export interface CampaignBase {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  cover_url: string | null;
  partner_name: string | null;
  partner_url: string | null;
  goal: CampaignGoal;
  locations: string | null;
  starts_at: string;
  ends_at: string | null;
  ended_at: string | null;
  status: CampaignStatus;
  review_status: ReviewStatus | null;
  review_note: string | null;
  bonus_awarded: number | null;
  created_at: string;
}

/** A campaign the signed-in ambassador runs, with its numbers (zs_my_campaigns). */
export interface MyCampaign extends CampaignBase {
  tracking: CampaignTracking;
  my_code: string;
  new_members: number;
  paying_members: number;
  sales: number;
  commission: number;
  commission_paid: number;
  reported_results: number;
  my_week_results: number;
  my_pending_results: number;
}

/** What an admin sees when checking a campaign (zs_admin_campaign_reviews). */
export interface CampaignReview extends CampaignBase {
  owner_id: string;
  owner_name: string;
  owner_username: string | null;
  owner_avatar: string | null;
  owner_location: string | null;
  commission_rate: number | null;
  new_members: number;
  active_members: number;
  paying_members: number;
  sales: number;
  commission_owed: number;
  reports: { quantity: number; evidence: string; evidence_url: string | null; created_at: string }[];
}

export interface Payout {
  id: string;
  week_start: string;
  results: number;
  base: number;
  bonus: number;
  total: number;
  paid_at: string;
}

export interface Earnings {
  found: boolean;
  currency: PayoutCurrency;
  commission_rate: number;
  week_start: string;
  next_payout_on: string;
  /** Commission from campaigns still running or waiting for the admin check. */
  in_review_total: number;
  /** Approved and about to be paid (bonuses included). */
  ready_total: number;
  paid_total: number;
  this_week_sales: number;
  this_week_commission: number;
  referred_members: number;
  paying_members: number;
  recent_commissions: { id: string; source: string; description: string | null; gross: number; rate: number; amount: number; paid: boolean; created_at: string }[];
  payouts: Payout[];
  weekly_sales: { week_start: string; sales: number }[];
}

export interface LeaderRow {
  profile_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  location: string;
  results: number;
  level: string;
}

export interface PayoutPreviewRow {
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  currency: PayoutCurrency;
  results: number;
  base_amount: number;
  bonus_amount: number;
  total: number;
}

export const GOAL_LABEL: Record<CampaignGoal, string> = {
  signups: "New members",
  activations: "Active members",
  event: "Event",
  sales: "Sales",
  awareness: "Awareness",
  other: "Campaign",
};

/** One human label for where a campaign is in its life. */
export function campaignPhase(c: Pick<CampaignBase, "status" | "review_status">): {
  label: string;
  tone: "live" | "paused" | "review" | "paid" | "rejected";
} {
  if (c.status === "removed") return { label: "Taken down", tone: "rejected" };
  if (c.status === "live") return { label: "Live", tone: "live" };
  if (c.status === "paused") return { label: "Paused", tone: "paused" };
  if (c.review_status === "approved") return { label: "Approved & paid", tone: "paid" };
  if (c.review_status === "rejected") return { label: "Not approved", tone: "rejected" };
  return { label: "In review", tone: "review" };
}

export const PHASE_CLASS: Record<ReturnType<typeof campaignPhase>["tone"], string> = {
  live: "bg-ok/12 text-ok",
  paused: "bg-warn/12 text-warn",
  review: "bg-accent-soft text-accent",
  paid: "bg-ok/12 text-ok",
  rejected: "bg-bad/10 text-bad",
};

export function daysLeft(ends: string | null) {
  if (!ends) return null;
  return Math.max(0, Math.ceil((new Date(ends).getTime() - Date.now()) / 86_400_000));
}
