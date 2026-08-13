export type FundLinkMessage = {
  slug: string;
  ownerName: string;
};

const FUND_LINK_PREFIX = "FUND_LINK:";

export function parseFundLinkMessage(content?: string | null): FundLinkMessage | null {
  if (!content?.startsWith(FUND_LINK_PREFIX)) return null;

  const [, rawSlug = "", ...nameParts] = content.split(":");
  const slug = rawSlug.trim();
  if (!slug) return null;

  return {
    slug,
    ownerName: nameParts.join(":").trim() || "a Zero Club member",
  };
}

/** Converts stored message commands into text suitable for inboxes, replies,
 * notifications, and search. The command itself should never reach the UI. */
export function directMessagePreview(
  content?: string | null,
  options?: { sentByCurrentUser?: boolean },
) {
  const value = content || "";
  const fundLink = parseFundLinkMessage(value);

  if (fundLink) {
    return options?.sentByCurrentUser
      ? "You shared a wallet fund link"
      : `${fundLink.ownerName} sent you a wallet fund link`;
  }

  if (value.startsWith("TUTOR_INVITE:")) {
    const institution = value.split(":").slice(2).join(":").trim() || "an institution";
    return `Tutor invitation from ${institution}`;
  }

  if (value.startsWith("ACCEPTED_TUTOR_INVITE:")) {
    return `Accepted invitation to join ${value.split(":").slice(1).join(":")}`;
  }

  if (value.startsWith("REJECTED_TUTOR_INVITE:")) {
    return `Declined invitation to join ${value.split(":").slice(1).join(":")}`;
  }

  if (value.includes("$$MEDIA$$")) {
    const [textPart = "", mediaPart = ""] = value.split("$$MEDIA$$");
    if (textPart.trim()) return textPart.trim();

    const firstUrl = mediaPart.split(",")[0]?.toLowerCase() || "";
    if (/\.(jpeg|jpg|gif|png|webp|bmp)/i.test(firstUrl) || firstUrl.includes("image"))
      return "Sent a picture";
    if (/\.(mp4|webm|ogg|mov)/i.test(firstUrl) || firstUrl.includes("video")) return "Sent a video";
    if (/\.(mp3|wav|m4a|aac)/i.test(firstUrl) || firstUrl.includes("audio"))
      return "Sent a voice note";
    return "Sent an attachment";
  }

  return value;
}
