import { supabase } from "@/lib/supabase";

/**
 * Challenges on Zero Proofs projects. Every write is a database function:
 * money, deadlines, sealing and permissions are all enforced on the server.
 * See supabase/migrations/20261011150000_zero_proofs_challenges.sql.
 */

export type ChallengeStatus =
  "open" | "judging" | "result_posted" | "completed" | "cancelled" | "admin_review";
export type PayoutStatus = "held" | "paid" | "refunded" | "split_refunded" | "frozen";
export type PrizeType = "funds" | "zp";
export type RightsPreset = "showcase" | "use_with_credit" | "full_transfer";
export type TaskType = "improve" | "recreate" | "feature" | "fix" | "alternative" | "extend";

export type Criterion = { name: string; weight: number };
export type Prize = { place: number; amount: number };
export type Person = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export type Challenge = {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  brief: string;
  task_type: TaskType;
  skills: string[];
  requirements: { live_url: boolean; repo_url: boolean; images: boolean; writeup: boolean };
  criteria: Criterion[];
  rights_preset: RightsPreset;
  terms_text: string;
  prize_type: PrizeType;
  prizes: Prize[];
  prize_total: number;
  fee: number;
  deadline: string;
  judging_until: string | null;
  objection_until: string | null;
  status: ChallengeStatus;
  payout_status: PayoutStatus;
  result_note: string | null;
  cancel_reason: string | null;
  adopted_version_id: string | null;
  created_at: string;
  finalized_at: string | null;
  completed_at: string | null;
};

export type Entry = {
  id: string;
  status: "submitted" | "withdrawn" | "disqualified" | "winner" | "mention" | "not_selected";
  place: number | null;
  explanation: string;
  links: { live_url?: string; repo_url?: string; design_url?: string };
  media_urls: string[];
  submitted_at: string;
  updated_at: string;
  revision: number;
  disqualify_reason?: string | null;
  owner_feedback?: string | null;
  scores?: Record<string, number> | null;
  published_post_id?: string | null;
  entrant: Person;
};

export type ChallengeDetail = {
  found: true;
  challenge: Challenge;
  is_owner: boolean;
  is_admin: boolean;
  project: {
    id: string;
    content: string;
    media_urls: string[] | null;
    version_label: string | null;
    created_at: string;
  } | null;
  owner: Person;
  entry_count: number;
  my_entry: (Omit<Entry, "entrant"> & { entrant_id: string; terms_text: string }) | null;
  my_dispute: { id: string; status: string; reason: string; resolution: string | null } | null;
  open_disputes: number;
  entries: Entry[];
  paid: { profile_id: string; amount: number; kind: "prize" | "share"; at: string }[];
};

type Lookup = ChallengeDetail | { found: false };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as any, args as any);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchChallenge = (id: string) => call<Lookup>("challenge_detail", { p_id: id });
export const fetchProjectChallenge = (projectId: string) =>
  call<Lookup>("project_challenge", { p_project: projectId });
export const fetchOpenChallenges = (limit = 30, offset = 0) =>
  call<any[]>("list_open_challenges", { p_limit: limit, p_offset: offset });
export async function fetchChallengeBadges(projectIds: string[]) {
  if (!projectIds.length) return [] as any[];
  return call<any[]>("challenge_badges", { p_projects: projectIds });
}

export const createChallenge = (payload: Record<string, unknown>) =>
  call<{ id: string; duplicate: boolean }>("create_challenge", { p: payload });
export const updateChallenge = (id: string, patch: Record<string, unknown>) =>
  call<void>("update_challenge", { p_id: id, p: patch });
export const submitEntry = (id: string, payload: Record<string, unknown>) =>
  call<{ id: string; updated: boolean }>("submit_challenge_entry", { p_id: id, p: payload });
export const withdrawEntry = (id: string) => call<void>("withdraw_challenge_entry", { p_id: id });
export const scoreEntry = (
  entryId: string,
  scores: Record<string, number>,
  feedback?: string | null,
) =>
  call<void>("score_challenge_entry", {
    p_entry: entryId,
    p_scores: scores,
    p_feedback: feedback ?? null,
  });
export const disqualifyEntry = (entryId: string, reason: string) =>
  call<void>("disqualify_challenge_entry", { p_entry: entryId, p_reason: reason });
export const finalizeChallenge = (
  id: string,
  winners: { entry_id: string; place: number }[],
  mentions: string[],
  note: string,
) =>
  call<void>("finalize_challenge", {
    p_id: id,
    p_winners: winners,
    p_mentions: mentions,
    p_note: note,
  });
export const closeChallenge = (id: string, reason: string) =>
  call<{ ok: boolean; shared: number; refund: number; entrants?: number }>("close_challenge", {
    p_id: id,
    p_reason: reason,
  });
export const disputeChallenge = (id: string, reason: string) =>
  call<void>("dispute_challenge", { p_id: id, p_reason: reason });
export const adminResolveChallenge = (id: string, release: boolean, note: string) =>
  call<any>("admin_resolve_challenge", { p_id: id, p_release: release, p_note: note });
export const addEntryToPortfolio = (entryId: string) =>
  call<{ post_id: string }>("add_challenge_entry_to_portfolio", { p_entry: entryId });
export const markAdopted = (id: string, versionId: string) =>
  call<void>("mark_challenge_adopted", { p_id: id, p_version: versionId });
