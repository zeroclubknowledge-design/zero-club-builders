import { supabase } from "@/lib/supabase";
import type { Candidate } from "./recommend";
import type { Portfolio, PortfolioItem, PortfolioLookup } from "./types";

export async function loadPortfolio<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    return await request(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The portfolio took too long to load. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Data access for the Smart Portfolio. Every write goes through RLS:
 * owners can only touch their own portfolio, and only add their own posts.
 */

export async function fetchPublicPortfolio(username: string, signal?: AbortSignal): Promise<PortfolioLookup> {
  const { data, error } = await supabase.rpc("get_public_portfolio" as any, {
    p_username: username,
  }).abortSignal(signal ?? new AbortController().signal);
  if (error) throw error;
  return (data || { found: false }) as PortfolioLookup;
}

export async function fetchMyPortfolio(profileId: string, signal?: AbortSignal): Promise<Portfolio | null> {
  const { data, error } = await supabase
    .from("portfolios" as any)
    .select("*")
    .eq("profile_id", profileId)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Portfolio) || null;
}

const POST_FIELDS =
  "id, content, media_urls, likes_count, comments_count, created_at, is_build_post, is_verified_build, version_label, project_root_id";

/** Everything the owner has published to everyone, with version counts on each project. */
export async function fetchMyCandidates(profileId: string, signal?: AbortSignal): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_FIELDS)
    .eq("author_id", profileId)
    .eq("audience", "everyone")
    .is("quoted_post_id", null)
    .order("created_at", { ascending: false })
    .limit(300)
    .abortSignal(signal ?? new AbortController().signal);
  if (error) throw error;
  const rows = (data || []) as unknown as Candidate[];
  const versions = new Map<string, number>();
  for (const row of rows) {
    if (row.project_root_id)
      versions.set(row.project_root_id, (versions.get(row.project_root_id) || 0) + 1);
  }
  return rows.map((row) => ({ ...row, versions: versions.get(row.id) || 0 }));
}

export type ItemDraft = {
  post_id: string;
  kind: "project" | "proof";
  featured: boolean;
  sort_order: number;
};

export async function createPortfolio(
  profileId: string,
  fields: Partial<Pick<Portfolio, "headline" | "about" | "skills">>,
  items: ItemDraft[],
): Promise<Portfolio> {
  const { data, error } = await supabase
    .from("portfolios" as any)
    .insert({ profile_id: profileId, ...fields })
    .select("*")
    .single();
  if (error) throw error;
  const portfolio = data as unknown as Portfolio;
  if (items.length) {
    const { error: itemError } = await supabase
      .from("portfolio_items" as any)
      .insert(items.map((item) => ({ ...item, portfolio_id: portfolio.id })));
    if (itemError) throw itemError;
  }
  return portfolio;
}

export async function updatePortfolio(id: string, patch: Partial<Portfolio>) {
  const { error } = await supabase
    .from("portfolios" as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function insertItems(portfolioId: string, items: ItemDraft[]) {
  if (!items.length) return [];
  const { data, error } = await supabase
    .from("portfolio_items" as any)
    .upsert(
      items.map((item) => ({ ...item, portfolio_id: portfolioId })),
      { onConflict: "portfolio_id,post_id", ignoreDuplicates: true },
    )
    .select("id, post_id");
  if (error) throw error;
  return (data || []) as unknown as { id: string; post_id: string }[];
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<PortfolioItem, "featured" | "sort_order" | "problem" | "outcome" | "kind">>,
) {
  const { error } = await supabase
    .from("portfolio_items" as any)
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function removeItem(id: string) {
  const { error } = await supabase
    .from("portfolio_items" as any)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function saveOrder(ids: string[]) {
  await Promise.all(ids.map((id, index) => updateItem(id, { sort_order: index })));
}

/**
 * "Add to portfolio" from a post. Creates a draft portfolio first if the
 * person has none yet. Returns whether it was newly added.
 */
export async function addPostToPortfolio(
  profileId: string,
  post: { id: string; is_build_post?: boolean | null },
): Promise<"added" | "exists"> {
  let portfolio = await fetchMyPortfolio(profileId);
  if (!portfolio) portfolio = await createPortfolio(profileId, {}, []);
  const { data: existing } = await supabase
    .from("portfolio_items" as any)
    .select("id, sort_order")
    .eq("portfolio_id", portfolio.id);
  const rows = (existing || []) as unknown as { id: string; sort_order: number }[];
  const inserted = await insertItems(portfolio.id, [
    {
      post_id: post.id,
      kind: post.is_build_post ? "project" : "proof",
      featured: false,
      sort_order: rows.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1,
    },
  ]);
  return inserted.length ? "added" : "exists";
}

export async function recordPortfolioView(portfolioId: string, postId?: string | null) {
  if (typeof window === "undefined") return;
  const device = window.matchMedia?.("(max-width: 767px)").matches ? "mobile" : "desktop";
  await supabase.rpc("record_portfolio_view" as any, {
    p_portfolio: portfolioId,
    p_post: postId || null,
    p_referrer: document.referrer || null,
    p_device: device,
  });
}

export async function fetchMyPortfolioStats(): Promise<{
  total: number;
  last_30_days: number;
  last_7_days: number;
}> {
  const { data, error } = await supabase.rpc("my_portfolio_stats" as any);
  if (error) throw error;
  return (data || { total: 0, last_30_days: 0, last_7_days: 0 }) as any;
}
