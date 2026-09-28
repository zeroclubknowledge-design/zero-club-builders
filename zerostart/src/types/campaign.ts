import type { PayoutCurrency } from "@/lib/money";

export type CampaignGoal = "signups" | "activations" | "event" | "sales" | "awareness" | "other";
export type CampaignTracking = "link" | "proof" | "both";
export type CampaignStatus = "draft" | "live" | "paused" | "ended";

export interface BonusTier {
  min: number;
  bonus: number;
}

export interface Campaign {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  cover_url: string | null;
  partner_name: string | null;
  partner_url: string | null;
  goal: CampaignGoal;
  tracking: CampaignTracking;
  reward_signup: number;
  reward_activation: number;
  reward_proof: number;
  proof_unit_label: string;
  bonus_tiers: BonusTier[];
  locations: string | null;
  max_ambassadors: number | null;
  starts_at: string;
  ends_at: string | null;
  status: CampaignStatus;
  ambassadors: number;
  my_code: string | null;
  joined: boolean;
  my_week_results: number;
  my_total_results: number;
  my_pending_results: number;
}

export interface AdminCampaign extends Omit<Campaign, "my_code" | "joined" | "my_week_results" | "my_total_results" | "my_pending_results"> {
  verified_results: number;
  pending_results: number;
  created_at: string;
}

export interface WeekLine {
  campaign_id: string | null;
  title: string;
  results: number;
  sales: number;
  base: number;
  bonus: number;
  tiers: BonusTier[];
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
  this_week: WeekLine[];
  this_week_total: number;
  this_week_sales: number;
  unpaid_total: number;
  referred_members: number;
  paying_members: number;
  recent_commissions: { id: string; source: string; description: string | null; gross: number; rate: number; amount: number; created_at: string }[];
  paid_total: number;
  pending_proofs: number;
  payouts: Payout[];
  weekly_results: { week_start: string; results: number }[];
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

export interface PendingProof {
  id: string;
  campaign_id: string;
  campaign_title: string;
  proof_unit_label: string;
  reward_proof: number;
  ambassador_id: string;
  ambassador_name: string;
  ambassador_avatar: string | null;
  location: string;
  quantity: number;
  evidence: string;
  evidence_url: string | null;
  created_at: string;
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
  event: "Events",
  sales: "Sales",
  awareness: "Awareness",
  other: "Campaign",
};

/** The next bonus tier above a weekly count, if there is one. */
export function nextTier(tiers: BonusTier[] | null | undefined, count: number) {
  const sorted = [...(tiers || [])].sort((a, b) => a.min - b.min);
  return sorted.find((t) => count < t.min) ?? null;
}

export function topBonus(tiers: BonusTier[] | null | undefined) {
  return (tiers || []).reduce((best, t) => Math.max(best, Number(t.bonus) || 0), 0);
}
