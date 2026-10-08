import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

/**
 * Sharing a Zero Club post to LinkedIn, blog-style.
 *
 * LinkedIn gets the first half of the post as the person's own words, then
 * "Continue reading here" and the link back. LinkedIn does not allow a
 * clickable word in a post, so the link sits on its own line right after
 * "Continue reading here 👉", and LinkedIn draws the post's preview card
 * under it. Readers tap through to Zero Club for the rest.
 */

export type LinkedInPayload = {
  postId: string;
  /** The post's full text, as stored. */
  body: string;
  /** The sharer wrote this post, so it can earn ZP. */
  isOwn: boolean;
  /** A shipped project on Zero Hub. */
  isShip: boolean;
};

const MEDIA_MARKER = "$$MEDIA$$";
const LINKEDIN_PACKAGE = "com.linkedin.android";
/** LinkedIn's limit is 3,000 characters. Leave room for the link. */
const MAX_EXCERPT = 1400;

/** Readable text with paragraphs kept, from stored post content. */
export function linkedInPlainText(content: string): string {
  let text = content || "";
  const marker = text.indexOf(MEDIA_MARKER);
  if (marker >= 0) text = text.slice(0, marker);
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** About the first half of the post, ending on a sentence where one is close. */
export function linkedInExcerpt(content: string): { excerpt: string; truncated: boolean } {
  const text = linkedInPlainText(content);
  if (!text) return { excerpt: "", truncated: false };
  const words = text.split(/(\s+)/);
  const wordCount = words.filter((w) => w.trim()).length;
  // Very short posts are shared whole: half of ten words reads like a typo.
  if (wordCount < 24 && text.length <= MAX_EXCERPT) return { excerpt: text, truncated: false };

  let target = Math.min(Math.ceil(text.length / 2), MAX_EXCERPT);
  // Prefer ending at a sentence or paragraph close to the halfway point.
  const window = text.slice(
    Math.floor(target * 0.75),
    Math.min(text.length, Math.ceil(target * 1.2)),
  );
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf("\n"),
  );
  if (sentenceEnd > 0) target = Math.floor(target * 0.75) + sentenceEnd + 1;
  else {
    const space = text.lastIndexOf(" ", target);
    if (space > target * 0.6) target = space;
  }
  const excerpt = text
    .slice(0, Math.min(target, MAX_EXCERPT))
    .trim()
    .replace(/[,;:\-–—]+$/, "");
  return { excerpt, truncated: excerpt.length < text.length };
}

export function linkedInShareText(payload: LinkedInPayload, url: string): string {
  const { excerpt, truncated } = linkedInExcerpt(payload.body);
  const head = excerpt
    ? `${excerpt}${truncated ? "…" : ""}`
    : payload.isShip
      ? "I just shipped a new project on Zero Club."
      : "New on Zero Club.";
  return `${head}\n\nContinue reading here 👉 ${url}`;
}

/** Marks the link so Zero Club can tell visits that came from LinkedIn. */
export function linkedInUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "linkedin");
    u.searchParams.set("utm_medium", "social");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Opens LinkedIn with the post already written. On Android it goes straight
 * into the LinkedIn app's composer; without the app, or on iPhone and
 * desktop, it opens LinkedIn's share box with the same text. The text is
 * also copied, so it can be pasted if LinkedIn leaves the box empty.
 */
export async function openLinkedInComposer(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard is a fallback only */
  }
  const web = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (isAndroid) {
    window.location.href =
      `intent:#Intent;action=android.intent.action.SEND;type=text/plain;` +
      `S.android.intent.extra.TEXT=${encodeURIComponent(text)};` +
      `package=${LINKEDIN_PACKAGE};S.browser_fallback_url=${encodeURIComponent(web)};end`;
    return;
  }
  window.open(web, "_blank", "noopener,noreferrer");
}

/** Credits the author's ZP for sharing their own post. Quiet when nothing is due. */
export async function claimLinkedInReward(payload: LinkedInPayload) {
  if (!payload.isOwn) return;
  const { data, error } = await supabase.rpc("claim_linkedin_share_reward", {
    p_post: payload.postId,
  });
  if (error) return;
  const result = (data || {}) as { awarded?: number; reason?: string };
  if (result.awarded && result.awarded > 0) {
    toast.success(`+${result.awarded} ZP for sharing to LinkedIn`, {
      description: payload.isShip
        ? "Thanks for showing your shipped project to your network."
        : "Thanks for bringing your network to Zero Club.",
    });
  } else if (result.reason === "daily_limit") {
    toast("You've reached today's LinkedIn rewards", {
      description: "Shares still go out. Rewards pick up again tomorrow.",
    });
  }
}
