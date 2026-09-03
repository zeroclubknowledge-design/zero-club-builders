import { supabase } from "./supabase";
import type {
  AmbassadorMe, AmbassadorTask, FocusArea, PushableBootcamp, RosterEntry,
} from "@/types/ambassador";

/** Every database call the ambassador side makes. */

export async function listFocusAreas() {
  const { data, error } = await supabase
    .from("zs_focus_areas")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data || []) as FocusArea[];
}

export async function getMe() {
  const { data, error } = await supabase.rpc("zs_ambassador_me");
  if (error) throw error;
  return data as AmbassadorMe;
}

export async function saveAmbassador(input: {
  location: string;
  country?: string;
  bio?: string;
  focus: string[];
  bootcamps: string[];
}) {
  const { data, error } = await supabase.rpc("zs_save_ambassador", {
    p_location: input.location,
    p_country: input.country ?? null,
    p_bio: input.bio ?? null,
    p_focus: input.focus,
    p_bootcamps: input.bootcamps,
  });
  if (error) throw error;
  return data as { ok: boolean; reason?: string };
}

export async function listTasks() {
  const { data, error } = await supabase.rpc("zs_ambassador_tasks");
  if (error) throw error;
  return (data || []) as AmbassadorTask[];
}

export async function submitTask(questId: string, evidence?: string, evidenceUrl?: string) {
  const { data, error } = await supabase.rpc("zs_submit_ambassador_task", {
    p_quest_id: questId,
    p_evidence: evidence ?? null,
    p_evidence_url: evidenceUrl ?? null,
  });
  if (error) throw error;
  return data as { ok: boolean; reason?: string };
}

export async function getRoster(limit = 50) {
  const { data, error } = await supabase.rpc("zs_ambassador_roster", { p_limit: limit });
  if (error) throw error;
  return (data || []) as RosterEntry[];
}

/**
 * Bootcamps an ambassador can pick up and push locally.
 *
 * Read straight from Zero Club's table — one database, so there is nothing to
 * sync. Only published ones, because committing to promote a draft would be
 * committing to promote something that may never run.
 */
export async function listPushableBootcamps() {
  const { data, error } = await supabase
    .from("bootcamps")
    .select("id, title, category, price, starts_at")
    .eq("status", "published")
    .order("starts_at", { ascending: true })
    .limit(60);
  if (error) throw error;
  return (data || []) as PushableBootcamp[];
}

/* ── Initiatives ────────────────────────────────────────────────────────── */

import type { Initiative, InitiativeKind } from "@/types/ambassador";

export async function listMyInitiatives(profileId: string) {
  const { data, error } = await supabase
    .from("zs_initiatives")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Initiative[];
}

export async function createInitiative(input: {
  profileId: string;
  focus: string;
  kind: InitiativeKind;
  title: string;
  description: string;
  targetCount?: number | null;
  targetLabel?: string | null;
}) {
  const { error } = await supabase.from("zs_initiatives").insert({
    profile_id: input.profileId,
    focus_slug: input.focus,
    kind: input.kind,
    title: input.title.trim(),
    description: input.description.trim(),
    target_count: input.targetCount ?? null,
    target_label: input.targetLabel ?? null,
    // status and zp_awarded are left at their defaults on purpose — the insert
    // policy requires them, so setting them here could only ever break it.
  });
  if (error) throw error;
}

export async function submitInitiative(input: {
  id: string;
  summary: string;
  count?: number | null;
  evidenceUrl?: string;
}) {
  const { data, error } = await supabase.rpc("zs_submit_initiative", {
    p_id: input.id,
    p_summary: input.summary,
    p_count: input.count ?? null,
    p_evidence_url: input.evidenceUrl ?? null,
  });
  if (error) throw error;
  return data as { ok: boolean; reason?: string };
}

export async function abandonInitiative(id: string) {
  const { error } = await supabase
    .from("zs_initiatives")
    .update({ status: "abandoned" })
    .eq("id", id);
  if (error) throw error;
}
