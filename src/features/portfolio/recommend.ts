import { describePost, postImages } from "./parse";
import type { PortfolioPost } from "./types";

/**
 * Picks the work most worth showing, and says why in plain words.
 *
 * Scoring only reads what is already on the post — images, links, tools,
 * how much was written, engagement, recency, versions, verification. It never
 * guesses at quality and never fills anything in.
 */
export type Candidate = PortfolioPost & { project_root_id?: string | null };

export type Recommendation = {
  post: Candidate;
  kind: "project" | "proof";
  title: string;
  summary: string;
  category: string | null;
  score: number;
  reasons: string[];
  /** Things the owner could add to make this stronger. */
  gaps: string[];
  recommended: boolean;
};

const DAY = 86_400_000;

function scoreOne(post: Candidate, now: number): Omit<Recommendation, "recommended"> {
  const kind = post.is_build_post ? "project" : "proof";
  const { title, summary, ship } = describePost(post);
  const images = postImages(post).length;
  const links = ship?.links.length || 0;
  const tools = ship?.tools.length || 0;
  const words = summary.split(/\s+/).filter(Boolean).length;
  const likes = Number(post.likes_count || 0);
  const comments = Number(post.comments_count || 0);
  const versions = Number(post.versions || 0);
  const ageDays = Math.max(0, (now - new Date(post.created_at).getTime()) / DAY);

  let score = kind === "project" ? 20 : 0;
  const reasons: string[] = [];
  const gaps: string[] = [];

  if (post.is_verified_build) {
    score += 25;
    reasons.push("Verified by a tutor");
  }
  if (images > 0) {
    score += Math.min(images, 3) * 6;
    reasons.push(images > 1 ? `${images} screenshots` : "Has a screenshot");
  } else if (kind === "project") gaps.push("Add a screenshot");
  if (links > 0) {
    score += 10;
    reasons.push(links > 1 ? `${links} live links` : "Has a live link");
  } else if (kind === "project") gaps.push("Add a live or repo link");
  if (tools > 0) {
    score += Math.min(tools, 5) * 2;
    if (tools >= 3) reasons.push(`${tools} tools listed`);
  } else if (kind === "project") gaps.push("List the tools you used");
  if (words >= 60) {
    score += 12;
    reasons.push("Clear write-up");
  } else if (words >= 25) score += 6;
  else gaps.push("Explain what it does in a few sentences");
  if (versions > 0) {
    score += Math.min(versions, 4) * 4;
    reasons.push(versions === 1 ? "Shipped an update" : `${versions + 1} versions shipped`);
  }
  const engagement = likes + comments * 2;
  if (engagement > 0) {
    score += Math.min(18, Math.round(Math.log2(engagement + 1) * 4));
    if (engagement >= 10) reasons.push(`${likes} likes · ${comments} comments`);
  }
  if (ageDays < 30) {
    score += 8;
    reasons.push("Recent");
  } else if (ageDays < 120) score += 4;

  return { post, kind, title, summary, category: ship?.category || null, score, reasons, gaps };
}

/**
 * Scores every candidate and marks the best ones as recommended:
 * up to 6 projects (spread across categories first) and up to 3 strong proofs.
 */
export function recommendWork(candidates: Candidate[], now = Date.now()): Recommendation[] {
  const roots = candidates.filter((post) => !post.project_root_id);
  const scored = roots.map((post) => scoreOne(post, now)).sort((a, b) => b.score - a.score);

  const picked = new Set<string>();
  const projects = scored.filter((r) => r.kind === "project");
  const seenCategories = new Set<string>();
  // First pass: the best project from each category, so the page shows range.
  for (const rec of projects) {
    if (picked.size >= 6) break;
    const cat = (rec.category || "other").toLowerCase();
    if (seenCategories.has(cat)) continue;
    seenCategories.add(cat);
    picked.add(rec.post.id);
  }
  for (const rec of projects) {
    if (picked.size >= 6) break;
    picked.add(rec.post.id);
  }
  // Proofs only make the cut when there is something to show.
  let proofs = 0;
  for (const rec of scored) {
    if (rec.kind !== "proof" || proofs >= 3) continue;
    const hasSubstance = postImages(rec.post).length > 0 || rec.summary.length > 220;
    if (hasSubstance && rec.score >= 18) {
      picked.add(rec.post.id);
      proofs += 1;
    }
  }

  return scored.map((rec) => ({ ...rec, recommended: picked.has(rec.post.id) }));
}

/** Tools from the given ships, most used first. Feeds the skills suggestions. */
export function toolsFrom(posts: PortfolioPost[]): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const post of posts) {
    if (!post.is_build_post) continue;
    for (const tool of describePost(post).ship?.tools || []) {
      const key = tool.toLowerCase();
      const entry = counts.get(key) || { label: tool, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map((e) => e.label);
}
