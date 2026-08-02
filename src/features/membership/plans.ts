export type AccountAudience = "Learner" | "Creator" | "Tutor" | "Institution";
export type IndividualPlanKey = "learner_basic" | "learner_premium" | "creator" | "tutor_basic" | "tutor_premium" | "tutor_premium_plus";
export type SubscriptionStatus = "active" | "past_due" | "grace_period" | "expired" | "cancelled";

export type ClubCapacity = {
  plan_key: string;
  plan_name: string;
  permanent_club_limit: number | null;
  permanent_club_count: number;
  remaining: number | null;
  can_create: boolean;
  is_over_limit: boolean;
  upgrade_message: string | null;
};

export const CLUB_LIMITS: Record<IndividualPlanKey, number> = {
  learner_basic: 0,
  learner_premium: 0,
  creator: 3,
  tutor_basic: 1,
  tutor_premium: 5,
  tutor_premium_plus: 10,
};

export const PLAN_NAMES: Record<IndividualPlanKey, string> = {
  learner_basic: "Learner Basic",
  learner_premium: "Learner Premium",
  creator: "Creator",
  tutor_basic: "Tutor Basic",
  tutor_premium: "Tutor Premium",
  tutor_premium_plus: "Tutor Premium+",
};

export function resolvePlanKey(profile: any): IndividualPlanKey | "institution" {
  const accountType = String(profile?.account_type || "learner").toLowerCase();
  const tier = String(profile?.tier || "basic").toLowerCase().replace(/\s+/g, "");

  if (accountType === "institution") return "institution";
  if (accountType === "tutor") {
    if (tier === "premium+") return "tutor_premium_plus";
    if (tier === "premium") return "tutor_premium";
    return "tutor_basic";
  }
  if (tier === "creator") return "creator";
  if (tier === "premium" || tier === "premium+") return "learner_premium";
  return "learner_basic";
}

export function clubUpgradeMessage(planKey: string) {
  switch (planKey) {
    case "learner_basic":
    case "learner_premium":
      return "Build your own community with Creator. The Creator plan unlocks up to 3 permanent Clubs.";
    case "creator":
      return "You've reached your Creator plan limit of 3 Clubs.";
    case "tutor_basic":
      return "You've reached your 1-Club limit. Upgrade to Tutor Premium to create up to 5 Clubs.";
    case "tutor_premium":
      return "You've reached your 5-Club limit. Upgrade to Tutor Premium+ to create up to 10 Clubs.";
    case "tutor_premium_plus":
      return "You've reached your Tutor Premium+ limit of 10 Clubs.";
    default:
      return null;
  }
}

export function fallbackClubCapacity(profile: any, permanentClubCount: number): ClubCapacity {
  const planKey = resolvePlanKey(profile);
  if (planKey === "institution" || profile?.is_admin) {
    return {
      plan_key: String(planKey),
      plan_name: planKey === "institution" ? "Institution" : "Administrator",
      permanent_club_limit: null,
      permanent_club_count: permanentClubCount,
      remaining: null,
      can_create: true,
      is_over_limit: false,
      upgrade_message: null,
    };
  }

  const limit = CLUB_LIMITS[planKey];
  return {
    plan_key: planKey,
    plan_name: PLAN_NAMES[planKey],
    permanent_club_limit: limit,
    permanent_club_count: permanentClubCount,
    remaining: Math.max(0, limit - permanentClubCount),
    can_create: permanentClubCount < limit,
    is_over_limit: permanentClubCount > limit,
    upgrade_message: permanentClubCount >= limit ? clubUpgradeMessage(planKey) : null,
  };
}

export function isBootcampCohortClub(club: any) {
  return club?.club_type === "bootcamp_cohort" || Boolean(club?.bootcamp_id) || String(club?.category || "").toLowerCase() === "bootcamp";
}

export function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
}
