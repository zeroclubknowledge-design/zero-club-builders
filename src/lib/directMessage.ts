import { describeMedia } from "@/lib/contentPreview";

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

    // Was sniffing the URL for file extensions, which missed the encoded
    // token format entirely — a .webm voice note read as neither audio nor
    // video. describeMedia decodes the token's declared type instead.
    const described = describeMedia(mediaPart.split(",").map((t) => t.trim()).filter(Boolean));
    return `Sent ${described || "an attachment"}`;
  }

  return value;
}
