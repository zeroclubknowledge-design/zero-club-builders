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
  /** A post or shipped project, or a Zero Store product. */
  kind?: "post" | "product";
  /** The post id, or the store item id for a product. */
  postId: string;
  /** The full text, as stored. For a product: its name and description. */
  body: string;
  /** The sharer made this post or product. */
  isOwn: boolean;
  /** A shipped project on Zero Proofs. */
  isShip: boolean;
  /** A quote post. Quote posts earn nothing. */
  isQuote?: boolean;
};

/**
 * ZP for sharing to LinkedIn, mirroring the server: your own post 200, your
 * own shipped project 500, anyone else's post, project or product 50; quote
 * posts and your own product nothing. The server decides; this only labels
 * the share sheet.
 */
export function linkedInRewardFor(payload: LinkedInPayload): number {
  if (payload.kind === "product") return payload.isOwn ? 0 : 50;
  if (payload.isQuote) return 0;
  if (!payload.isOwn) return 50;
  return payload.isShip ? 500 : 200;
}

const MEDIA_MARKER = "$$MEDIA$$";
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
    : payload.kind === "product"
      ? "Found this on Zero Store."
      : payload.isShip
        ? "A new project shipped on Zero Club."
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
 * Hands the post to LinkedIn with the text already written.
 *
 * On phones it opens the phone's own share menu with the text in it; picking
 * LinkedIn opens the LinkedIn app's post screen, filled in. A web page can't
 * open the LinkedIn app's composer directly: Chrome blocks that kind of link
 * and falls back to linkedin.com, which is why the website kept opening.
 *
 * Desktops, and phones without a share menu, get LinkedIn's share box on the
 * web. The text is copied too, in case LinkedIn leaves the box empty.
 *
 * Resolves true when the share went ahead, false when it was cancelled.
 */
export async function openLinkedInComposer(text: string): Promise<boolean> {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard is a fallback only */
  }
  const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isPhone && typeof navigator.share === "function") {
    try {
      // Text only: with a separate url, some apps drop the text and keep the link.
      await navigator.share({ text });
      return true;
    } catch (error) {
      // Dismissed: nothing was shared.
      if ((error as DOMException)?.name === "AbortError") return false;
      // Anything else (e.g. share not allowed here): fall through to the web.
    }
  }
  window.open(
    `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer",
  );
  return true;
}

/** Time in LinkedIn that counts as having written and posted. */
const MIN_TIME_IN_LINKEDIN_MS = 8000;
/** After this, a share that never came back earns nothing. */
const SHARE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Pays the ZP only once the person has actually been to LinkedIn and back.
 *
 * LinkedIn never tells another site whether a post went out, so tapping the
 * button can't be the trigger. Instead: Zero Club goes to the background while
 * LinkedIn is open, and the reward is paid when the person returns after
 * spending long enough there to write and post. Popping in and straight back
 * out earns nothing, with a nudge to finish posting.
 */
export function rewardWhenSharedToLinkedIn(payload: LinkedInPayload) {
  if (typeof document === "undefined" || linkedInRewardFor(payload) === 0) return;
  let leftAt: number | null = document.hidden ? Date.now() : null;
  let nudged = false;
  const done = () => {
    document.removeEventListener("visibilitychange", onChange);
    window.clearTimeout(expiry);
  };
  const onChange = () => {
    if (document.hidden) {
      leftAt = Date.now();
      return;
    }
    if (leftAt === null) return;
    const away = Date.now() - leftAt;
    leftAt = null;
    if (away >= MIN_TIME_IN_LINKEDIN_MS) {
      done();
      void claimLinkedInReward(payload);
    } else if (!nudged) {
      nudged = true;
      toast("Finish your LinkedIn post to earn ZP", {
        description: `Your ${linkedInRewardFor(payload)} ZP arrives once you've posted and come back.`,
      });
    }
  };
  document.addEventListener("visibilitychange", onChange);
  const expiry = window.setTimeout(done, SHARE_WINDOW_MS);
}

/** Credits the sharer's ZP. Quiet when nothing is due. */
export async function claimLinkedInReward(payload: LinkedInPayload) {
  if (linkedInRewardFor(payload) === 0) return;
  const { data, error } =
    payload.kind === "product"
      ? await supabase.rpc("claim_linkedin_product_share_reward", { p_item: payload.postId })
      : await supabase.rpc("claim_linkedin_share_reward", { p_post: payload.postId });
  if (error) return;
  const result = (data || {}) as { awarded?: number; reason?: string };
  if (result.awarded && result.awarded > 0) {
    toast.success(`+${result.awarded} ZP for sharing to LinkedIn`, {
      description: !payload.isOwn
        ? "Thanks for spreading good work from Zero Club."
        : payload.isShip
          ? "Thanks for showing your shipped project to your network."
          : "Thanks for bringing your network to Zero Club.",
    });
  } else if (result.reason === "daily_limit") {
    toast("You've reached today's LinkedIn rewards", {
      description: "Shares still go out. Rewards pick up again tomorrow.",
    });
  }
}
