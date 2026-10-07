import { supabase } from "@/lib/supabase";

/*
 * Boosts: members promote their own posts. A boost shows the post as
 * "Sponsored" at intervals in the feed and in clubs. 30% of the budget pays
 * for reach; 70% is a reward pool: every member who does what the boost asks
 * earns 20 ZP + 10 XP, once. Unused pool is refunded when it stops or ends.
 * All money and rewards are handled by database functions (post_boosts).
 */

export type BoostGoal = "engage" | "follow" | "visit";
export type BoostPayment = "wallet" | "zp";

export const BOOST_REWARD_ZP = 20;
export const BOOST_REWARD_XP = 10;
export const BOOST_LAUNCH_XP = 50;
export const ZP_PER_NAIRA = 10;

export const boostQuote = (budget: number) => {
  const reach = Math.round(budget * 0.3);
  const pool = budget - reach;
  return {
    budget,
    reach,
    pool,
    maxActions: Math.floor((pool * ZP_PER_NAIRA) / BOOST_REWARD_ZP),
    zpCost: budget * ZP_PER_NAIRA,
  };
};

export const GOALS: Record<BoostGoal, { title: string; short: string; detail: string; action: string }> = {
  engage: { title: "More engagement", short: "Likes & comments", detail: "People earn when they like or comment on your post.", action: "Like this post" },
  follow: { title: "More followers", short: "Follows", detail: "People earn when they follow you.", action: "Follow" },
  visit: { title: "More visits", short: "Link visits", detail: "People earn when they open your link.", action: "Visit link" },
};

export type SponsoredPost = {
  boost_id: string;
  goal: BoostGoal;
  target_url: string | null;
  reward_zp: number;
  reward_xp: number;
  post: { id: string; content: string | null; media_urls: string[] | null; created_at: string; likes_count: number; comments_count: number; is_build_post: boolean };
  author: { id: string; username: string | null; full_name: string | null; avatar_url: string | null };
  viewer: { following: boolean; liked: boolean; commented: boolean; clicked: boolean };
};

export type MyBoost = {
  id: string;
  post_id: string;
  goal: BoostGoal;
  target_url: string | null;
  status: "active" | "paused" | "completed" | "stopped" | "removed";
  paid_with: BoostPayment;
  budget_naira: number;
  reward_pool_naira: number;
  reward_zp: number;
  max_actions: number;
  actions_count: number;
  impressions: number;
  clicks: number;
  refunded_naira: number;
  show_in_feed: boolean;
  show_in_clubs: boolean;
  starts_at: string;
  ends_at: string;
  settled_at: string | null;
  created_at: string;
  post: { content: string | null; media_urls: string[] | null } | null;
};

export async function getSponsoredPosts(placement: "feed" | "clubs", limit = 3) {
  const { data, error } = await supabase.rpc("get_sponsored_posts", { p_placement: placement, p_limit: limit });
  if (error) throw error;
  return (data || []) as SponsoredPost[];
}

export async function createBoost(input: {
  postId: string; goal: BoostGoal; budget: number; days: number; paidWith: BoostPayment;
  targetUrl?: string | null; feed: boolean; clubs: boolean;
}) {
  const { data, error } = await supabase.rpc("create_post_boost", {
    p_post: input.postId, p_goal: input.goal, p_budget: input.budget, p_days: input.days, p_paid_with: input.paidWith,
    p_target_url: input.targetUrl || null, p_feed: input.feed, p_clubs: input.clubs,
  });
  if (error) throw error;
  return data as { ok: true; id: string; max_actions: number };
}

export async function getMyBoosts() {
  const { data, error } = await supabase.rpc("get_my_boosts");
  if (error) throw error;
  return (data || []) as MyBoost[];
}

export async function stopBoost(id: string) {
  const { data, error } = await supabase.rpc("stop_post_boost", { p_id: id });
  if (error) throw error;
  return data as { ok: true; refunded_naira: number; paid_with: BoostPayment };
}

export async function pauseBoost(id: string, paused: boolean) {
  const { error } = await supabase.rpc("pause_post_boost", { p_id: id, p_paused: paused });
  if (error) throw error;
}

export async function claimBoostReward(id: string) {
  const { data, error } = await supabase.rpc("claim_boost_reward", { p_id: id });
  if (error) throw error;
  return data as { ok: true; zp: number; xp: number };
}

export const recordBoostView = (id: string) => { void supabase.rpc("record_boost_view", { p_id: id }); };
export const recordBoostClick = (id: string) => supabase.rpc("record_boost_click", { p_id: id });

/** Where sponsored posts go in a list: after the 4th item, then every 8th. */
export function sponsoredSlots(count: number, first = 4, every = 8) {
  const slots: number[] = [];
  for (let i = first; i < count; i += every) slots.push(i);
  return slots;
}
