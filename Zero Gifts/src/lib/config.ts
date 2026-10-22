/**
 * Everything about *where* this app is, in one place. Moving to another
 * domain is an environment change, not a search-and-replace.
 */
export const config = {
  appName: "Zero Gifts",
  /** Written to the new account's metadata (signup_source) so we know which product brought them in. */
  productKey: "zerogifts",
  tagline: "Send someone a head start.",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  /** Where Zero Club lives, for cross-links (bootcamps, wallet, terms). */
  zeroClubUrl: ((import.meta.env.VITE_ZERO_CLUB_URL as string) || "https://www.zeroclubs.xyz").replace(/\/$/, ""),
  authStorageKey: "zerogifts-auth",
} as const;

/** A Zero Club URL, never pasted together at call sites. */
export const zc = (path = "") => `${config.zeroClubUrl}${path}`;
