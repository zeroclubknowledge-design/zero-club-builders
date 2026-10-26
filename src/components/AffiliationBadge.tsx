/**
 * The Zero Club Ambassador affiliation — like an organisation badge on X.
 *
 * Set only by a Zero Club admin approving an ambassador application (the
 * database refuses it from anyone else), and taken away if they are removed.
 * The badge artwork changes with the ambassador's rank (public/badges/).
 * Two forms: beside the name, and pinned to the corner of the profile picture.
 */
export const ZEROSTART_URL =
  ((import.meta as { env?: Record<string, string> }).env?.VITE_ZEROSTART_URL as string) || "https://start.zeroclubs.xyz";

export function isAmbassador(profile: { affiliation?: string | null } | null | undefined) {
  return profile?.affiliation === "zero_ambassador";
}

type BadgeProfile = {
  affiliation?: string | null;
  ambassador_rank?: string | null;
  tier?: string | null;
  account_type?: string | null;
} | null | undefined;

/**
 * Zero Ambassador ranks, lowest to highest, by members brought in.
 * The rank itself is worked out on the server (profiles.ambassador_rank).
 */
export const AMBASSADOR_RANKS = [
  { name: "Associate", range: "0 – 100 members" },
  { name: "Representative", range: "101 – 1,000 members" },
  { name: "Specialist", range: "1,001 – 10,000 members" },
  { name: "Manager", range: "10,001 – 100,000 members" },
  { name: "Director", range: "100,001 – 1,000,000 members" },
  { name: "Executive", range: "1,000,001 – 10,000,000 members" },
] as const;

export function ambassadorRank(profile: BadgeProfile): string | null {
  if (!isAmbassador(profile)) return null;
  const rank = String(profile?.ambassador_rank || "");
  return AMBASSADOR_RANKS.some((r) => r.name === rank) ? rank : "Associate";
}

const rankSrc = (rank: string) => `/badges/ambassador-${rank.toLowerCase()}.png`;

/** Beside a name. `size` is the badge's edge in pixels. */
export function AffiliationBadge({ profile, size = 16 }: { profile: BadgeProfile; size?: number }) {
  const rank = ambassadorRank(profile);
  if (!rank) return null;
  const label = `${rank} · Zero Ambassador`;
  return (
    <img
      src={rankSrc(rank)}
      alt={label}
      title={label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="inline-block shrink-0 select-none object-contain"
      style={{ width: size, height: size }}
    />
  );
}

/** Pinned to the bottom-right of an avatar. The avatar's wrapper must be `relative`. */
export function AvatarAffiliation({ profile, size = 18 }: { profile: BadgeProfile; size?: number }) {
  const rank = ambassadorRank(profile);
  if (!rank) return null;
  const label = `${rank} · Zero Ambassador`;
  return (
    <img
      src={rankSrc(rank)}
      alt={label}
      title={label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="pointer-events-none absolute -bottom-1 -right-1 z-10 select-none object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * The subscription badge beside a name: Premium, Premium+ or Institution.
 * Creator plans map onto the same two paid levels (Creator PRO → Premium,
 * Creator Max → Premium+).
 */
export function subscriptionBadge(profile: BadgeProfile): { key: "premium" | "premium-plus" | "institution"; label: string } | null {
  if (String(profile?.account_type || "").toLowerCase() === "institution") return { key: "institution", label: "Institution" };
  const tier = String(profile?.tier || "").toLowerCase().replace(/\s+/g, "");
  if (tier === "premium+" || tier === "creatormax") return { key: "premium-plus", label: "Premium+" };
  if (tier === "premium" || tier === "creator") return { key: "premium", label: "Premium" };
  return null;
}

export function SubscriptionBadge({ profile, size = 16 }: { profile: BadgeProfile; size?: number }) {
  const badge = subscriptionBadge(profile);
  if (!badge) return null;
  return (
    <img
      src={`/badges/${badge.key}.png`}
      alt={badge.label}
      title={badge.label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="inline-block shrink-0 select-none object-contain"
      style={{ width: size, height: size }}
    />
  );
}

/** The small "Zero Ambassador" label under the name on profile pages, linking to ZeroStart. */
export function AmbassadorChip({ profile }: { profile: BadgeProfile }) {
  if (!isAmbassador(profile)) return null;
  return (
    <a
      href={ZEROSTART_URL}
      target="_blank"
      rel="noreferrer"
      className="mt-0.5 inline-block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#af1c70] dark:text-[#f089c4]"
    >
      {ambassadorRank(profile)} · Zero Ambassador
    </a>
  );
}
