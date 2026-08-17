import { toast } from "sonner";

// Bump this when the shape of product link metadata changes. Messaging apps
// cache link previews very aggressively, so a versioned URL makes them fetch
// the corrected card instead of keeping an older image-less result.
export const PRODUCT_PREVIEW_VERSION = "3";

/**
 * Sharing helpers, kept in one place so the store page and the seller's own
 * store produce identical links. A link that differs between the two would be
 * a support problem nobody would think to look for.
 */

/** Falls back to the production origin during SSR, where `window` is absent. */
export function appOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "https://www.zeroclubs.xyz";
}

/**
 * The canonical shareable link for a Zero Store product.
 *
 * Points at /product/<id>, not /app/store?product=<id>. Both open the same
 * thing, but only /product/<id> is server-rendered with the product's own name
 * and cover image, so that is the one that previews properly when pasted into
 * WhatsApp or X. Signed-in visitors are redirected straight into the store.
 */
export function storeProductUrl(productId: string): string {
  return `${appOrigin()}/product/${productId}?preview=${PRODUCT_PREVIEW_VERSION}`;
}

/**
 * Return a crawler-friendly rendition of a public product cover.
 *
 * Store covers can be several megabytes. WhatsApp and similar clients often
 * read the text metadata but silently skip an image that is too expensive to
 * download. Weserv fetches the same public file, fits it to the standard
 * 1200x630 social-card canvas, converts it to JPEG, and caches the result.
 * The original URL remains untouched everywhere inside the store.
 */
export function socialProductImageUrl(coverUrl: string): string {
  const source = coverUrl.trim();
  if (!source || !/^https:\/\//i.test(source)) return source;
  if (source.startsWith("https://images.weserv.nl/")) return source;

  const params = new URLSearchParams({
    url: source,
    w: "1200",
    h: "630",
    fit: "cover",
    output: "jpg",
    q: "80",
  });
  return `https://images.weserv.nl/?${params.toString()}`;
}

// WhatsApp, Telegram and X cache a preview against the exact URL and will
// replay a stale one for days — which is why re-sharing the same gift code kept
// showing the old card no matter what had been deployed. Bump this whenever the
// gift preview changes.
export const GIFT_PREVIEW_VERSION = "5";

/** The shareable link for a Zero Club Gift, carrying the preview version. */
export function giftLinkUrl(code: string): string {
  return `${appOrigin()}/gift/${code}?v=${GIFT_PREVIEW_VERSION}`;
}

/** The shareable link for a wallet fund link. */
export function fundLinkUrl(slug: string): string {
  return `${appOrigin()}/fund/${slug}`;
}

/**
 * Copies text, with a fallback for the cases where the async clipboard is not
 * available: it needs a secure context and is blocked in some older Android
 * webviews, which is exactly where a lot of Zero Club traffic lives.
 */
export async function copyToClipboard(text: string, message = "Link copied"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
    return true;
  } catch {
    try {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      document.body.removeChild(field);
      toast.success(message);
      return true;
    } catch {
      toast.error("Couldn't copy the link — you can copy it from the address bar");
      return false;
    }
  }
}

/**
 * Opens the device share sheet when there is one, otherwise copies.
 *
 * A dismissed share sheet rejects, which is indistinguishable from a failure,
 * so a dismissal falls through to copying. That is the friendlier mistake to
 * make: the person still ends up with the link.
 */
export async function shareOrCopy(options: {
  title: string;
  text?: string;
  url: string;
  copiedMessage?: string;
}): Promise<void> {
  const { title, text, url, copiedMessage } = options;
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch {
      /* dismissed or unsupported target */
    }
  }
  await copyToClipboard(url, copiedMessage);
}
