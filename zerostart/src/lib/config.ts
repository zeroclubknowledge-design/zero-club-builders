/**
 * Everything about *where* this app is, in one place.
 *
 * The spec is explicit that `/zerostart` must not be scattered through the
 * code, because the app is expected to move to its own domain. Nothing outside
 * this file should know the host, the base path, or where Zero Club lives — so
 * moving is an environment change rather than a search-and-replace.
 */
export const config = {
  appName: "ZeroStart",
  tagline: "Build. Test. Improve. Launch.",

  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,

  /** Where Zero Club lives, for cross-links and shared sign-in. */
  zeroClubUrl: (import.meta.env.VITE_ZERO_CLUB_URL as string) || "https://www.zeroclubs.xyz",
} as const;

/** A Zerohub product URL, built rather than pasted together at call sites. */
export const zerohubProductUrl = (slug: string) =>
  `${config.zeroClubUrl}/app/zerohub?product=${encodeURIComponent(slug)}`;
