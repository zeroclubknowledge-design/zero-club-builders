/**
 * Turning what a builder typed into a link that actually leaves the site.
 *
 * "zeroclubs.xyz" in an href is not a website — it is a *relative path*. From
 * /product/<uuid> the browser resolves it to /product/zeroclubs.xyz, so the
 * "Visit the product" button navigated back into ZeroStart and the product
 * page was handed a product id of "zeroclubs.xyz". The database said what it
 * always says about that, and the user got a uuid syntax error for pressing a
 * button.
 *
 * Normalising at render rather than only on save is deliberate: rows already
 * stored without a scheme have to work too, and they will never be edited by
 * the people hitting them.
 */

/** Schemes that must never come back from this function. A builder-supplied
    javascript: or data: URL is a script anyone on the board can be made to
    click. */
const DANGEROUS = /^\s*(javascript|data|vbscript|file):/i;

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * A safe absolute URL, or null when there is nothing usable.
 * Null is the signal to hide the link entirely — better than a button that
 * goes somewhere wrong.
 */
export function externalUrl(raw: string | null | undefined): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  if (DANGEROUS.test(value)) return null;

  const candidate = HAS_SCHEME.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(candidate);
    // Belt and braces: a scheme could still be something exotic.
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** What to show a person: the host, without the scheme noise. */
export function displayUrl(raw: string | null | undefined): string {
  const url = externalUrl(raw);
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Postgres error text is written for whoever is reading the logs, not for the
 * person who pressed a button. This turns the ones we can actually predict
 * into something a person can act on, and leaves the rest alone rather than
 * inventing a reassuring lie about an error nobody has seen yet.
 */
export function readableError(message: string | undefined | null): string {
  const text = (message || "").trim();
  if (!text) return "Something didn't work. Try again.";

  if (/invalid input syntax for type uuid/i.test(text)) {
    return "That link points at something that doesn't exist here. It may be out of date.";
  }
  if (/Could not find the table|schema cache/i.test(text)) {
    return "This part of ZeroStart isn't set up yet. If you're the admin, run the database migrations.";
  }
  if (/JWT|not authenticated|refresh token/i.test(text)) {
    return "Your session expired. Sign in again.";
  }
  if (/violates row-level security|permission denied/i.test(text)) {
    return "You don't have access to that.";
  }
  if (/Failed to fetch|NetworkError|network/i.test(text)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  // Our own trigger messages are already written for a person.
  if (/^Cannot /.test(text)) return text;

  return text;
}

/** A uuid, checked before it is sent to a column that will reject it loudly. */
export function isUuid(value: string | undefined | null): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "");
}
