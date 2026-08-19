/**
 * Rose Noir — who may use it, and for how long.
 *
 * Every account gets the theme free for a month; after that it belongs to
 * members. The clock starts the first time somebody actually applies it, not
 * the day they signed up, so a person who discovers it in April gets a real
 * month rather than an expired one.
 *
 * The start date lives in localStorage, which means it is per device: clearing
 * site data or switching phones starts a fresh month. That is a deliberate
 * trade for now — enforcing it properly needs a column on `profiles` and a
 * migration, and this keeps a display option from depending on the network.
 */

export const NOIR_THEME = "rose-noir";
export const NOIR_TRIAL_DAYS = 30;

const TRIAL_KEY = "zc_noir_trial_started";

export type NoirAccess = {
  allowed: boolean;
  /** How the access is held: a membership, the free month, or neither. */
  via: "premium" | "trial" | "expired";
  /** Whole days remaining on the free month. Zero when `via` is not "trial". */
  daysLeft: number;
};

/** Anything above Basic — including Creator and institutional accounts. */
export function isPremiumMember(profile: any): boolean {
  const accountType = String(profile?.account_type || "").toLowerCase();
  if (accountType === "institution") return true;

  const tier = String(profile?.tier || "").toLowerCase().replace(/\s+/g, "");
  return tier === "premium" || tier === "premium+" || tier === "creator";
}

function readTrialStart(): number | null {
  try {
    const raw = localStorage.getItem(TRIAL_KEY);
    if (!raw) return null;
    const started = Number(raw);
    return Number.isFinite(started) && started > 0 ? started : null;
  } catch {
    return null;
  }
}

/** Called when the theme is applied. Starting twice does not shorten anything. */
export function startNoirTrial(): void {
  try {
    if (!readTrialStart()) localStorage.setItem(TRIAL_KEY, String(Date.now()));
  } catch {
    /* storage denied — the theme still applies for this session */
  }
}

export function getNoirAccess(profile: any): NoirAccess {
  if (isPremiumMember(profile)) return { allowed: true, via: "premium", daysLeft: 0 };

  const started = readTrialStart();
  if (started === null) return { allowed: true, via: "trial", daysLeft: NOIR_TRIAL_DAYS };

  const elapsedDays = (Date.now() - started) / 86_400_000;
  const daysLeft = Math.max(0, Math.ceil(NOIR_TRIAL_DAYS - elapsedDays));

  return daysLeft > 0
    ? { allowed: true, via: "trial", daysLeft }
    : { allowed: false, via: "expired", daysLeft: 0 };
}
