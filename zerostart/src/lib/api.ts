import { supabase } from "./supabase";
import type {
  ActivityItem, BoardStats, Campaign, LeaderboardRow, Mvp, MvpOverview,
  Participation, TesterStats,
} from "@/types";

/**
 * Every database call ZeroStart makes.
 *
 * Kept out of components on purpose: the spec asks for no business logic in
 * the UI, and the practical version of that rule is that a component never
 * names a table. When the shape of a query has to change, it changes here once
 * rather than in every screen that happened to fetch the same thing.
 *
 * The three writes that matter — join, submit, review — are RPCs rather than
 * table writes, because each has a rule that has to hold under a race and
 * those rules live in the database.
 */

const MVP_SELECT = `
  *,
  builder:profiles!zs_mvps_builder_id_fkey (id, username, full_name, avatar_url)
`;

/** Live MVPs, for the discovery page. */
export async function listLiveMvps(options?: { category?: string }) {
  let query = supabase
    .from("zs_mvps")
    .select(MVP_SELECT)
    .in("status", ["approved", "live"])
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (options?.category && options.category !== "All") {
    query = query.eq("category", options.category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as Mvp[];
}

export async function getMvp(id: string) {
  const { data, error } = await supabase
    .from("zs_mvps")
    .select(MVP_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Mvp | null;
}

/**
 * Campaigns for an MVP, each with its seats already counted.
 *
 * The count is done here rather than in the card, because "12 of 20" appearing
 * on screen means one query for the page instead of one per campaign — and
 * because a card that counts its own seats is a card doing business logic.
 */
export async function listCampaignsForMvp(mvpId: string) {
  const { data, error } = await supabase
    .from("zs_campaigns")
    .select("*, tasks:zs_tasks (*)")
    .eq("mvp_id", mvpId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const campaigns = (data || []) as unknown as Campaign[];
  return withSeatCounts(campaigns);
}

/** Every live campaign, newest first — the discovery feed. */
export async function listLiveCampaigns() {
  const { data, error } = await supabase
    .from("zs_campaigns")
    .select(`*, mvp:zs_mvps (${MVP_SELECT})`)
    .eq("status", "live")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return withSeatCounts((data || []) as unknown as Campaign[]);
}

export async function getCampaign(id: string) {
  const { data, error } = await supabase
    .from("zs_campaigns")
    .select(`*, mvp:zs_mvps (${MVP_SELECT}), tasks:zs_tasks (*)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [campaign] = await withSeatCounts([data as unknown as Campaign]);
  if (campaign.tasks) campaign.tasks.sort((a, b) => a.position - b.position);
  return campaign;
}

/**
 * One grouped count for all the campaigns on screen.
 *
 * Rejected participations are excluded: a rejected attempt should not hold a
 * seat hostage, or a campaign could be permanently full of work its builder
 * turned down.
 */
async function withSeatCounts(campaigns: Campaign[]): Promise<Campaign[]> {
  if (campaigns.length === 0) return campaigns;

  const { data } = await supabase
    .from("zs_participations")
    .select("campaign_id")
    .in("campaign_id", campaigns.map((c) => c.id))
    .in("status", ["started", "submitted", "approved"]);

  const counts = new Map<string, number>();
  (data || []).forEach((row: { campaign_id: string }) => {
    counts.set(row.campaign_id, (counts.get(row.campaign_id) || 0) + 1);
  });

  return campaigns.map((c) => ({ ...c, seats_taken: counts.get(c.id) || 0 }));
}

/* ── The three writes that carry rules ─────────────────────────────────── */

/** Takes a seat. The database decides whether there is one. */
export async function joinCampaign(campaignId: string) {
  const { data, error } = await supabase.rpc("zs_join_campaign", { p_campaign_id: campaignId });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; participation_id?: string; resumed?: boolean };
}

export async function submitTest(input: {
  participationId: string;
  rating: number;
  liked?: string;
  confusing?: string;
  suggestions?: string;
  additional?: string;
  screenshots?: string[];
}) {
  const { data, error } = await supabase.rpc("zs_submit_test", {
    p_participation_id: input.participationId,
    p_rating: input.rating,
    p_liked: input.liked ?? null,
    p_confusing: input.confusing ?? null,
    p_suggestions: input.suggestions ?? null,
    p_additional: input.additional ?? null,
    p_screenshots: input.screenshots ?? [],
  });
  if (error) throw error;
  return data as { ok: boolean; reason?: string };
}

/** Approve or reject. Pays at most once, whatever happens here. */
export async function reviewSubmission(participationId: string, approve: boolean, note?: string) {
  const { data, error } = await supabase.rpc("zs_review_submission", {
    p_participation_id: participationId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; approved?: boolean; zp_awarded?: number };
}

/* ── Reads for the dashboards ──────────────────────────────────────────── */

export async function myParticipations(testerId: string) {
  const { data, error } = await supabase
    .from("zs_participations")
    .select(`*, campaign:zs_campaigns (*, mvp:zs_mvps (${MVP_SELECT}))`)
    .eq("tester_id", testerId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as Participation[];
}

export async function submissionsForCampaign(campaignId: string) {
  const { data, error } = await supabase
    .from("zs_participations")
    .select(`
      *,
      tester:profiles!zs_participations_tester_id_fkey (id, username, full_name, avatar_url),
      feedback:zs_feedback (*),
      bugs:zs_bug_reports (*)
    `)
    .eq("campaign_id", campaignId)
    .order("submitted_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data || []) as unknown as Participation[];
}

export async function myMvps(builderId: string) {
  const { data, error } = await supabase
    .from("zs_mvps")
    .select("*, campaigns:zs_campaigns (*)")
    .eq("builder_id", builderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as Mvp[];
}

export async function getTesterStats(profileId: string) {
  const { data, error } = await supabase
    .from("zs_tester_stats")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data as TesterStats | null;
}

/** The shared wallet. Read from Zero Club's profile row, not a local copy. */
export async function getZpBalance(profileId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("zp")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return Number((data as { zp?: number } | null)?.zp ?? 0);
}

/* ── The board ─────────────────────────────────────────────────────────── */

/** The counts in the pill. One round trip, not five. */
export async function getBoardStats() {
  const { data, error } = await supabase.rpc("zs_board_stats");
  if (error) throw error;
  return data as BoardStats;
}

export async function getRecentActivity(limit = 8) {
  const { data, error } = await supabase.rpc("zs_recent_activity", { p_limit: limit });
  if (error) throw error;
  return (data || []) as ActivityItem[];
}

export async function getLeaderboard(limit = 10) {
  const { data, error } = await supabase.rpc("zs_leaderboard", { p_limit: limit });
  if (error) throw error;
  return (data || []) as LeaderboardRow[];
}

/** Everything the product page shows, ranks included. One call. */
export async function getMvpOverview(mvpId: string) {
  const { data, error } = await supabase.rpc("zs_mvp_overview", { p_mvp_id: mvpId });
  if (error) throw error;
  return data as MvpOverview;
}

/** Every live campaign for a product, so the page can show what is on offer. */
export async function listCampaignsForProduct(mvpId: string) {
  return listCampaignsForMvp(mvpId);
}
