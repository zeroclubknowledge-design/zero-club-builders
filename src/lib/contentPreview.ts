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
 * The text to show for a piece of content in a list, inbox or notification.
 * Returns the written part when there is one, and a description of the
 * attachments when there is not. Never returns the marker.
 */
export function contentPreview(content?: string | null): string {
  const value = content || "";
  if (!value.includes(MEDIA_MARKER)) return value.trim();

  const [textPart = "", mediaPart = ""] = value.split(MEDIA_MARKER);
  if (textPart.trim()) return textPart.trim();

  const described = describeMedia(mediaPart.split(",").map((t) => t.trim()).filter(Boolean));
  return described || "an attachment";
}
