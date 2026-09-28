import { supabase } from "./supabase";
import { config } from "./config";
import { compressImage } from "./imageCompression";
import type { PayoutCurrency } from "./money";
import type {
  CampaignGoal, CampaignReview, Earnings, LeaderRow, MyCampaign, PayoutPreviewRow,
} from "@/types/campaign";

type Refusal = { ok: boolean; reason?: string; code?: string; id?: string };

/** Where a campaign link sends people: straight into Zero Club sign-up. */
export const campaignLink = (code: string) => `${config.zeroClubUrl}/signup?c=${encodeURIComponent(code)}`;

/* ── Ambassador: my campaigns ─────────────────────────────────────────── */

export interface CampaignInput {
  title: string;
  summary?: string;
  description?: string;
  cover_url?: string;
  partner_name?: string;
  partner_url?: string;
  goal?: CampaignGoal;
  locations?: string;
  ends_at: string;
}

export async function listMyCampaigns() {
  const { data, error } = await supabase.rpc("zs_my_campaigns");
  if (error) throw error;
  return (data || []) as MyCampaign[];
}

export async function createCampaign(input: CampaignInput) {
  const { data, error } = await supabase.rpc("zs_create_campaign", { p: input });
  if (error) throw error;
  return data as Refusal;
}

export async function updateMyCampaign(id: string, input: Partial<CampaignInput>) {
  const { data, error } = await supabase.rpc("zs_update_my_campaign", { p_id: id, p: input });
  if (error) throw error;
  return data as Refusal;
}

export async function endMyCampaign(id: string) {
  const { data, error } = await supabase.rpc("zs_end_my_campaign", { p_id: id });
  if (error) throw error;
  return data as Refusal;
}

export async function uploadCampaignCover(file: File, ownerId: string) {
  const image = await compressImage(file);
  const ext = (image.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${ownerId}/campaigns/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("zerostart-media").upload(path, image, { contentType: image.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from("zerostart-media").getPublicUrl(path).data.publicUrl;
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

/* ── Admin: campaign checks and payouts ───────────────────────────────── */

export type ReviewFilter = "pending" | "live" | "reviewed" | "all";

export async function adminCampaignReviews(filter: ReviewFilter) {
  const { data, error } = await supabase.rpc("zs_admin_campaign_reviews", { p_filter: filter });
  if (error) throw error;
  return (data || []) as CampaignReview[];
}

export async function adminReviewCampaign(id: string, approve: boolean, bonus: number, note?: string) {
  const { data, error } = await supabase.rpc("zs_admin_review_campaign", {
    p_id: id, p_approve: approve, p_bonus: bonus, p_note: note || null,
  });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; approved?: boolean; paid?: number };
}

export async function adminSetCampaignStatus(id: string, status: "live" | "paused" | "removed", note?: string) {
  const { data, error } = await supabase.rpc("zs_admin_set_campaign_status", { p_id: id, p_status: status, p_note: note || null });
  if (error) throw error;
  return data as Refusal;
}

export async function adminPayoutPreview() {
  const { data, error } = await supabase.rpc("zs_admin_payout_preview", { p_until: null });
  if (error) throw error;
  return (data || []) as PayoutPreviewRow[];
}

export async function adminRunPayouts() {
  const { data, error } = await supabase.rpc("zs_admin_run_payouts", { p_until: null });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; ambassadors_paid?: number; total?: number };
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
