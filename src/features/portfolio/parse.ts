import { toPlainText } from "@/lib/contentPreview";
import type { PortfolioPost } from "./types";

/**
 * Reads a ship's stored markdown back into its parts. The ship form writes:
 *
 *   **Project:** name
 *   **Category:** Web App
 *   description…
 *   **Collaborators:** @a @b
 *   **Tools Used:** #react #supabase        (older ships say "Skills Used")
 *   **Project Links:**
 *   - [Live](https://…)
 *   **AI Prompts Used:**
 *   > …
 *
 * Nothing is invented: a field that is not in the post comes back empty.
 */
export type ParsedShip = {
  name: string;
  category: string | null;
  description: string;
  tools: string[];
  links: { title: string; url: string }[];
  collaborators: string[];
  usedAi: boolean;
};

const MEDIA_MARKER = "$$MEDIA$$";

export function parseShip(content: string): ParsedShip {
  const text = (content || "")
    .split(MEDIA_MARKER)[0]
    .replace(/## 🚀 /g, "**Project:** ")
    .replace(/### 🔗 Project Links/g, "**Project Links:**")
    .replace(/### 🤖 AI Prompts Used/g, "**AI Prompts Used:**");
  const out: ParsedShip = {
    name: "",
    category: null,
    description: "",
    tools: [],
    links: [],
    collaborators: [],
    usedAi: false,
  };
  const description: string[] = [];
  let section: "description" | "links" | "prompts" = "description";

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("**Project:**")) {
      out.name = trimmed.replace("**Project:**", "").trim();
      continue;
    }
    if (trimmed.startsWith("**Category:**")) {
      out.category = trimmed.replace("**Category:**", "").trim() || null;
      continue;
    }
    if (trimmed.startsWith("**Tools Used:**") || trimmed.startsWith("**Skills Used:**")) {
      out.tools = trimmed
        .replace("**Tools Used:**", "")
        .replace("**Skills Used:**", "")
        .split(/[\s,]+/)
        .map((tool) => tool.replace(/^#/, "").trim())
        .filter(Boolean);
      section = "description";
      continue;
    }
    if (trimmed.startsWith("**Collaborators:**")) {
      out.collaborators = trimmed
        .replace("**Collaborators:**", "")
        .split(/[\s,]+/)
        .map((handle) => handle.replace(/^@/, "").trim())
        .filter(Boolean);
      continue;
    }
    if (trimmed.startsWith("**Project Links:**")) {
      section = "links";
      continue;
    }
    if (trimmed.startsWith("**AI Prompts Used:**")) {
      section = "prompts";
      out.usedAi = true;
      continue;
    }
    if (section === "links") {
      const match = trimmed.match(/^- \[(.*?)\]\((.*?)\)/);
      if (match && /^https?:\/\//i.test(match[2]))
        out.links.push({ title: match[1] || "Link", url: match[2] });
      continue;
    }
    if (section === "prompts") continue;
    if (!trimmed && description.length === 0) continue;
    description.push(line);
  }
  out.description = description.join("\n").trim();
  return out;
}

/** Bold/italic markers and heading hashes read as noise once flattened to plain text. */
function stripMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "");
}

/** Plain text that keeps paragraph breaks, so write-ups don't collapse into one block. */
function toParagraphs(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
    .split("\n")
    .map((line) => toPlainText(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Title and summary for any post: a ship's project name, or the first line of a proof. */
export function describePost(post: Pick<PortfolioPost, "content" | "is_build_post">) {
  if (post.is_build_post) {
    const ship = parseShip(post.content);
    const plain = toParagraphs(stripMarkdown(ship.description));
    return {
      title: ship.name || plain.slice(0, 60) || "Untitled project",
      summary: plain,
      ship,
    };
  }
  const plain = toParagraphs(stripMarkdown((post.content || "").split(MEDIA_MARKER)[0]));
  const firstSentence = plain.split(/(?<=[.!?])\s|\n/)[0] || plain;
  return {
    title:
      firstSentence.length > 70
        ? `${firstSentence.slice(0, 67).trimEnd()}…`
        : firstSentence || "Zero Proof",
    summary: plain,
    ship: null,
  };
}

const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i;
export const isVideoUrl = (url: string) => VIDEO_RE.test(url);

/** Images attached to a post, in order. */
export function postImages(post: Pick<PortfolioPost, "media_urls">): string[] {
  return (post.media_urls || []).filter(
    (url) => typeof url === "string" && url && !isVideoUrl(url),
  );
}

export function clip(text: string, max: number) {
  const value = (text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max).replace(/\s+\S*$/, "")}…`;
}
