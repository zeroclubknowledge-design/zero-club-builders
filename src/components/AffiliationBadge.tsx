/**
 * The Zero Club Ambassador affiliation — like an organisation badge on X.
 *
 * Set only by a Zero Club admin approving an ambassador application (the
 * database refuses it from anyone else), and taken away if they are removed.
 * Two forms: a small square Zero mark beside the name, and the same mark
 * pinned to the corner of the profile picture.
 */
export const ZEROSTART_URL =
  ((import.meta as { env?: Record<string, string> }).env?.VITE_ZEROSTART_URL as string) || "https://start.zeroclubs.xyz";

export function isAmbassador(profile: { affiliation?: string | null } | null | undefined) {
  return profile?.affiliation === "zero_ambassador";
}

/** Beside a name. `size` is the square's edge in pixels. */
export function AffiliationBadge({ profile, size = 16 }: { profile: { affiliation?: string | null } | null | undefined; size?: number }) {
  if (!isAmbassador(profile)) return null;
  return (
    <span
      role="img"
      aria-label="Zero Club Ambassador"
      title="Zero Club Ambassador"
      className="inline-grid shrink-0 place-items-center overflow-hidden bg-white ring-1 ring-black/10 dark:ring-white/15"
      style={{ width: size, height: size, borderRadius: Math.max(3, Math.round(size / 4.5)) }}
    >
      <img src="/logo.png" alt="" className="object-contain" style={{ width: size * 0.78, height: size * 0.78 }} />
    </span>
  );
}

/** Pinned to the bottom-right of an avatar. The avatar's wrapper must be `relative`. */
export function AvatarAffiliation({ profile, size = 18 }: { profile: { affiliation?: string | null } | null | undefined; size?: number }) {
  if (!isAmbassador(profile)) return null;
  return (
    <span
      role="img"
      aria-label="Zero Club Ambassador"
      title="Zero Club Ambassador"
      className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-10 grid place-items-center overflow-hidden bg-white shadow-sm ring-2 ring-card"
      style={{ width: size, height: size, borderRadius: Math.max(4, Math.round(size / 4)) }}
    >
      <img src="/logo.png" alt="" className="object-contain" style={{ width: size * 0.74, height: size * 0.74 }} />
    </span>
  );
}

/** The small "Zero Ambassador" label under the name on profile pages, linking to ZeroStart. */
export function AmbassadorChip({ profile }: { profile: { affiliation?: string | null } | null | undefined }) {
  if (!isAmbassador(profile)) return null;
  return (
    <a
      href={ZEROSTART_URL}
      target="_blank"
      rel="noreferrer"
      className="mt-0.5 inline-block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#b81b80] dark:text-[#f28fd0]"
    >
      Zero Ambassador
    </a>
  );
}
