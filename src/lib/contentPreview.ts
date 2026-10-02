import { decodeChatMedia } from "@/hooks/useVoiceRecorder";

/**
 * Turns stored post, comment and message content into something a person can
 * read in a list.
 *
 * Attachments are stored inline as a marker followed by encoded tokens:
 *
 *   Nice work$$MEDIA$$audio|voice-note-1784650518.webm|https://...
 *
 * That is fine where the content is rendered properly, because the renderer
 * splits on the marker and draws a player. It is not fine anywhere the raw
 * string is shown as text — a notification saying someone liked your comment
 * was printing the marker, the encoded filename and the URL.
 *
 * A comment that is only a voice note has no text at all, so there is nothing
 * to fall back to. It has to be described instead: "a voice note".
 */

const MEDIA_MARKER = "$$MEDIA$$";

type MediaType = "image" | "video" | "audio" | "file";

const LABELS: Record<MediaType, { one: string; many: (n: number) => string }> = {
  image: { one: "a photo", many: (n) => `${n} photos` },
  video: { one: "a video", many: (n) => `${n} videos` },
  audio: { one: "a voice note", many: (n) => `${n} voice notes` },
  file: { one: "an attachment", many: (n) => `${n} attachments` },
};

/** Describes a set of attachment tokens, e.g. "a voice note", "3 photos". */
export function describeMedia(tokens: string[]): string {
  const types = tokens
    .map((token) => decodeChatMedia(token)?.type as MediaType)
    .filter((type): type is MediaType => type in LABELS);

  if (types.length === 0) return "";

  const unique = Array.from(new Set(types));
  // Mixed kinds are not worth enumerating in a one-line preview.
  if (unique.length > 1) {
    return types.length === 1 ? "an attachment" : `${types.length} attachments`;
  }

  const label = LABELS[unique[0]];
  return types.length === 1 ? label.one : label.many(types.length);
}

/**
 * Flattens rich content to readable plain text for lists and admin tables.
 *
 * Posts and notes are stored as HTML, because the editors are rich text. That
 * is correct where the markup is rendered, and wrong everywhere it is printed
 * as a string — the admin panel was showing people literal
 * `<p>💧 <strong>WEB3 FOR DROPS…</strong></p>`.
 *
 * Block-level tags become spaces rather than vanishing, or the last word of a
 * paragraph would weld itself to the first word of the next.
 */
export function toPlainText(value?: string | null): string {
  return (value || "")
    // <br> and closing block tags are sentence breaks, not nothing.
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    // Entities the editors emit. Ampersand last, so &amp;lt; does not become <.
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The text to show for a piece of content in a list, inbox or notification.
 * Returns the written part when there is one, and a description of the
 * attachments when there is not. Never returns the marker.
 */
export function contentPreview(content?: string | null): string {
  const value = content || "";
  // Club chat cards are stored as a marker + JSON. Show what they are, in words.
  const card = (prefix: string) => {
    if (!value.startsWith(prefix)) return null;
    try {
      return JSON.parse(value.slice(prefix.length)) || {};
    } catch {
      return {};
    }
  };
  const note = card("::ZEROCLUB_NOTE::");
  if (note) return note.title ? `ZeroNote: ${toPlainText(note.title)}` : "Shared a ZeroNote";
  const giveaway = card("::ZEROCLUB_GIVEAWAY::");
  if (giveaway) return giveaway.title ? `Giveaway: ${toPlainText(giveaway.title)}` : "Started a giveaway";
  const clubCard = card("::ZEROCLUB_CARD::");
  if (clubCard) {
    const kind = clubCard.type === "assignment" ? "Assignment" : clubCard.type === "question" ? "Question" : "Announcement";
    const text = toPlainText(clubCard.title || clubCard.body);
    return text ? `${kind}: ${text}` : kind;
  }
  const reply = card("::ZEROCLUB_REPLY::");
  if (reply) {
    const text = toPlainText(reply.body);
    const kind = reply.type === "submission" ? "Submission" : "Answer";
    return text ? `${kind}: ${text}` : kind;
  }
  if (value.startsWith("::ZEROCLUB_")) return "Shared a card";
  if (!value.includes(MEDIA_MARKER)) return toPlainText(value);

  const [textPart = "", mediaPart = ""] = value.split(MEDIA_MARKER);
  if (toPlainText(textPart)) return toPlainText(textPart);

  const described = describeMedia(mediaPart.split(",").map((t) => t.trim()).filter(Boolean));
  return described || "an attachment";
}
