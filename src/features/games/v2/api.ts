import { supabase } from "@/lib/supabase";
import type { ZeroGameKey } from "./catalog";

export type TournamentStatus = "upcoming" | "live" | "ended";
export type TournamentReward = "none" | "funds" | "zp" | "offer";
export type TournamentPrize = { place: number; amount?: number; zp?: number; label?: string };

export type TournamentRow = {
  id: string;
  game_type: ZeroGameKey;
  title: string;
  description: string | null;
  difficulty: string;
  profession?: string | null;
  starts_at: string;
  ends_at: string;
  max_players: number | null;
  visibility: "public" | "private";
  eligibility: "everyone" | "subscribers";
  reward_type: TournamentReward;
  prizes: TournamentPrize[];
  share_code: string | null;
  status: TournamentStatus;
  creator_id: string;
  creator_name: string | null;
  creator_avatar?: string | null;
  players: number;
  /** Prizes paid by Zero Club rather than the host. */
  sponsored?: boolean;
  my_best?: number | null;
  joined?: boolean;
};

export type LeaderboardRow = {
  rank: number;
  profile_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  best_score: number;
  plays: number;
};

export type AwardRow = {
  place: number;
  profile_id: string;
  name: string;
  avatar_url: string | null;
  score: number;
  amount: number | null;
  zp: number | null;
  label: string | null;
};

export type TournamentDetail =
  | { found: false }
  | { found: true; locked: true; title: string; game_type: ZeroGameKey }
  | {
    found: true;
    locked: false;
    tournament: TournamentRow & { is_creator: boolean };
    joined: boolean;
    can_enter: boolean;
    me: { best_score: number; plays: number; rank: number | null } | null;
    leaderboard: LeaderboardRow[];
    awards: AwardRow[];
  };

export async function listTournaments(filter: "live" | "ended" | "mine") {
  const { data, error } = await supabase.rpc("zero_tournaments_list", { p_filter: filter });
  if (error) throw error;
  return (data || []) as TournamentRow[];
}

export async function tournamentDetail(id: string, code?: string) {
  const { data, error } = await supabase.rpc("zero_tournament_detail", { p_id: id, p_code: code || null });
  if (error) throw error;
  return data as TournamentDetail;
}

export const JOIN_REFUSAL: Record<string, string> = {
  not_signed_in: "Sign in to join.",
  not_found: "This tournament no longer exists.",
  ended: "This tournament has ended.",
  invite_only: "This is a private tournament — you need the invite link.",
  subscribers_only: "Only Premium members can enter this tournament.",
  full: "This tournament is full.",
  not_joined: "Join the tournament first.",
  upcoming: "The tournament hasn't started yet.",
};

export async function joinTournament(id: string, code?: string) {
  const { data, error } = await supabase.rpc("join_zero_tournament", { p_id: id, p_code: code || null });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; already?: boolean };
}

export type CreateTournamentInput = {
  game_type: ZeroGameKey;
  title: string;
  description?: string;
  difficulty?: string;
  profession?: string | null;
  starts_at?: string | null;
  duration_minutes: number;
  max_players: number | null;
  visibility: "public" | "private";
  eligibility: "everyone" | "subscribers";
  reward_type: TournamentReward;
  prizes: TournamentPrize[];
  /** Admins only: Zero Club pays the prizes. */
  sponsored?: boolean;
};

export async function createTournament(input: CreateTournamentInput) {
  const { data, error } = await supabase.rpc("create_zero_tournament", { p: input });
  if (error) throw error;
  return data as { ok: boolean; id: string; share_code: string };
}

export async function startRun(id: string) {
  const { data, error } = await supabase.rpc("start_zero_run", { p_id: id });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; run_id?: string; puzzle?: string | null; difficulty?: string; profession?: string | null; ends_at?: string };
}

export async function finishRun(runId: string, score: number, meta: Record<string, unknown> = {}, solution?: string) {
  const { data, error } = await supabase.rpc("finish_zero_run", {
    p_run: runId,
    p_score: Math.max(0, Math.round(score)),
    p_meta: meta,
    p_solution: solution ?? null,
  });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; score?: number; best?: number };
}

/* ── formatting helpers ── */

export function prizeText(p: TournamentPrize, reward: TournamentReward, money: (n: number) => string) {
  if (reward === "funds") return money(Number(p.amount || 0));
  if (reward === "zp") return `${Number(p.zp || 0).toLocaleString()} ZP`;
  if (reward === "offer") return p.label || "Reward";
  return "";
}

export function rewardHeadline(t: Pick<TournamentRow, "reward_type" | "prizes">, money: (n: number) => string) {
  if (t.reward_type === "none" || !t.prizes?.length) return "Bragging rights";
  const first = t.prizes.find((p) => p.place === 1) || t.prizes[0];
  return prizeText(first, t.reward_type, money);
}

export function placeLabel(n: number) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

/** "2d 4h", "3h 12m", "4m 09s" */
export function countdown(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

export function durationLabel(mins: number) {
  if (mins % 1440 === 0) return `${mins / 1440} day${mins === 1440 ? "" : "s"}`;
  if (mins < 60) return `${mins} min`;
  if (mins % 60 === 0 && mins < 1440) return `${mins / 60} hour${mins === 60 ? "" : "s"}`;
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ");
}

/* ── Host editing ── */

export type TournamentEdit = {
  title?: string;
  description?: string;
  starts_at?: string | null;
  ends_at?: string;
  max_players?: number | null;
  visibility?: "public" | "private";
  eligibility?: "everyone" | "subscribers";
};

/** The host can change details; the game and the held prize stay as they are. */
export async function updateTournament(id: string, edit: TournamentEdit) {
  const payload: Record<string, unknown> = { ...edit };
  if ("max_players" in edit) payload.max_players = edit.max_players == null ? "" : edit.max_players;
  const { data, error } = await supabase.rpc("update_zero_tournament", { p_id: id, p: payload });
  if (error) throw error;
  return data as { ok: boolean };
}

/* ── Link previews ── */

export type TournamentPreview =
  | { found: false }
  | { found: true; locked: true; game_type: ZeroGameKey }
  | {
    found: true;
    locked: false;
    title: string;
    description: string | null;
    game_type: ZeroGameKey;
    status: TournamentStatus;
    starts_at: string;
    ends_at: string;
    players: number;
    max_players: number | null;
    eligibility: "everyone" | "subscribers";
    reward_type: TournamentReward;
    prizes: TournamentPrize[];
    sponsored: boolean;
    host_name: string | null;
  };

/** Works signed out — it is what link previews are built from. */
export async function tournamentPreview(id: string, code?: string) {
  const { data, error } = await supabase.rpc("zero_tournament_preview", { p_id: id, p_code: code || null });
  if (error) throw error;
  return data as TournamentPreview;
}

/** "₦5,000 for 1st" style headline without a currency hook (used server-side). */
export function previewPrizeLine(p: { reward_type: TournamentReward; prizes: TournamentPrize[] }) {
  if (p.reward_type === "none" || !p.prizes?.length) return "Play for the top spot";
  const first = p.prizes.find((x) => x.place === 1) || p.prizes[0];
  const value = p.reward_type === "funds" ? `₦${Number(first.amount || 0).toLocaleString("en-NG")}`
    : p.reward_type === "zp" ? `${Number(first.zp || 0).toLocaleString("en-NG")} ZP`
    : first.label || "a reward";
  return `Win ${value}${p.prizes.length > 1 ? ` · prizes for top ${p.prizes.length}` : ""}`;
}
