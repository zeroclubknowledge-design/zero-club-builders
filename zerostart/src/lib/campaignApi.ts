import { supabase } from "./supabase";
import { config } from "./config";
import type { PayoutCurrency } from "./money";
import type {
  AdminCampaign, Campaign, Earnings, LeaderRow, PayoutPreviewRow, PendingProof,
} from "@/types/campaign";

type Refusal = { ok: boolean; reason?: string; code?: string };

/** Where a campaign link sends people: straight into Zero Club sign-up. */
export const campaignLink = (code: string) => `${config.zeroClubUrl}/signup?c=${encodeURIComponent(code)}`;

export async function listCampaigns() {
  const { data, error } = await supabase.rpc("zs_campaigns_feed");
  if (error) throw error;
  return (data || []) as Campaign[];
}

export async function joinCampaign(id: string) {
  const { data, error } = await supabase.rpc("zs_join_amb_campaign", { p_campaign_id: id });
  if (error) throw error;
  return data as Refusal;
}

export async function submitProof(input: { campaignId: string; quantity: number; evidence: string; url?: string }) {
  const { data, error } = await supabase.rpc("zs_submit_campaign_proof", {
    p_campaign_id: input.campaignId,
    p_quantity: input.quantity,
    p_evidence: input.evidence,
    p_evidence_url: input.url || null,
  });
  if (error) throw error;
  return data as Refusal;
}

export async function getEarnings() {
  const { data, error } = await supabase.rpc("zs_my_earnings");
  if (error) throw error;
  return data as Earnings;
}

export async function setPayoutCurrency(currency: PayoutCurrency) {
  const { data, error } = await supabase.rpc("zs_set_payout_currency", { p_currency: currency });
  if (error) throw error;
  return data as Refusal;
}

export async function getLeaderboard(period: "week" | "all", limit = 100) {
  const { data, error } = await supabase.rpc("zs_campaign_leaderboard", { p_period: period, p_limit: limit });
  if (error) throw error;
  return (data || []) as LeaderRow[];
}

/* ── Admin ─────────────────────────────────────────────────────────────── */

export async function adminCampaigns() {
  const { data, error } = await supabase.rpc("zs_admin_campaigns");
  if (error) throw error;
  return (data || []) as AdminCampaign[];
}

export async function adminSaveCampaign(input: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("zs_admin_save_campaign", { p: input });
  if (error) throw error;
  return data as string;
}

export async function adminPendingProofs() {
  const { data, error } = await supabase.rpc("zs_admin_pending_proofs");
  if (error) throw error;
  return (data || []) as PendingProof[];
}

export async function adminReviewProof(id: string, approve: boolean, quantity?: number, note?: string) {
  const { data, error } = await supabase.rpc("zs_admin_review_proof", {
    p_id: id, p_approve: approve, p_quantity: quantity ?? null, p_note: note || null,
  });
  if (error) throw error;
  return data as Refusal;
}

export async function adminPayoutPreview(until?: string) {
  const { data, error } = await supabase.rpc("zs_admin_payout_preview", { p_until: until || null });
  if (error) throw error;
  return (data || []) as PayoutPreviewRow[];
}

export async function adminRunPayouts(until?: string) {
  const { data, error } = await supabase.rpc("zs_admin_run_payouts", { p_until: until || null });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; ambassadors_paid?: number; total?: number; until?: string };
}

/* ── Admin: applications, ambassadors, rates, bonuses ─────────────────── */

export interface ApplicationRow {
  id: string;
  profile_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  location: string;
  country: string | null;
  bio: string | null;
  motivation: string;
  links: string | null;
  focus_labels: string[];
  payout_currency: PayoutCurrency;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  member_since: string;
  posts: number;
  created_at: string;
}

export interface AmbassadorRow {
  profile_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  location: string;
  status: "active" | "paused" | "removed";
  commission_rate: number;
  payout_currency: PayoutCurrency;
  joined_at: string;
  referred: number;
  sales: number;
  paid: number;
}

export async function adminApplications(status: "pending" | "approved" | "rejected" | "all" = "pending") {
  const { data, error } = await supabase.rpc("zs_admin_applications", { p_status: status });
  if (error) throw error;
  return (data || []) as ApplicationRow[];
}

export async function adminReviewApplication(id: string, approve: boolean, note?: string, rate?: number | null) {
  const { data, error } = await supabase.rpc("zs_admin_review_application", {
    p_id: id, p_approve: approve, p_note: note || null, p_rate: rate ?? null,
  });
  if (error) throw error;
  return data as Refusal;
}

export async function adminAmbassadors() {
  const { data, error } = await supabase.rpc("zs_admin_ambassadors");
  if (error) throw error;
  return (data || []) as AmbassadorRow[];
}

export async function adminUpdateAmbassador(profileId: string, changes: { status?: string; rate?: number }) {
  const { data, error } = await supabase.rpc("zs_admin_update_ambassador", {
    p_profile: profileId, p_status: changes.status ?? null, p_rate: changes.rate ?? null,
  });
  if (error) throw error;
  return data as Refusal;
}

export async function getDefaultRate() {
  const { data, error } = await supabase.from("zs_settings").select("value").eq("key", "commission_rate").maybeSingle();
  if (error) throw error;
  return Number((data as { value?: unknown } | null)?.value ?? 20);
}

export async function adminSetDefaultRate(rate: number) {
  const { data, error } = await supabase.rpc("zs_admin_set_default_rate", { p_rate: rate });
  if (error) throw error;
  return data as Refusal;
}

export async function adminAddBonus(profileId: string, amount: number, reason: string) {
  const { data, error } = await supabase.rpc("zs_admin_add_bonus", { p_profile: profileId, p_amount: amount, p_reason: reason });
  if (error) throw error;
  return data as Refusal;
}
