/**
 * Which pages under /app a person may read without an account.
 *
 * The app shell redirects every signed-out visitor to /signup. That is right
 * for the feed, the wallet and the inbox, and completely wrong for a link
 * somebody deliberately shared — the whole point of sharing a post is that the
 * person receiving it is not a member yet. Until now there was exactly one
 * exception, hardcoded for published notes, so every other shared link bounced
 * the reader to a signup form before they saw what they had been sent. The
 * most common reaction to that is to close the tab.
 *
 * This is the list of pages that are read-only and meant to travel. Adding a
 * new shareable page means adding it here; the alternative — a second
 * hardcoded regex somewhere in the shell — is how the notes exception came to
 * be the only one.
 *
 * Being on this list only means "do not redirect". What a guest can actually
 * see is still decided by row-level security, and a page with no public reader
 * behind it will show its own empty state rather than somebody else's data.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const GUEST_READABLE: RegExp[] = [
  // A post or a shipped project — the most-shared link in the app.
  new RegExp(`^/app/post/${UUID}/?$`, "i"),
  // A published note, the original exception.
  new RegExp(`^/app/notes/${UUID}/?$`, "i"),
  /* Somebody's profile, which is what a mention or a credit points at.
     "edit" is excluded because /app/profile/edit is your own settings page and
     matches the same shape — a guest reaching it would get a broken form
     instead of an invitation. Any future reserved word under /app/profile
     belongs in this list too. */
  new RegExp(`^/app/profile/(?!edit(?:/|$))[^/]+/?$`, "i"),
  // A bootcamp being advertised.
  new RegExp(`^/app/bootcamps/${UUID}/?$`, "i"),
  // An institution's public page.
  new RegExp(`^/app/institution/${UUID}/?$`, "i"),
  // A product link opened from outside.
  new RegExp(`^/app/store/?$`, "i"),
];

export function isGuestReadablePath(pathname: string): boolean {
  return GUEST_READABLE.some((pattern) => pattern.test(pathname));
}
