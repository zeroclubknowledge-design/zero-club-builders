export type AccountAudience = "Learner" | "Creator" | "Tutor" | "Institution";
export type IndividualPlanKey = "learner_basic" | "learner_premium" | "creator_basic" | "creator" | "creator_max" | "tutor_basic" | "tutor_premium" | "tutor_premium_plus";
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
  creator_basic: 0,
  creator_max: 3,
  tutor_basic: 1,
  tutor_premium: 5,
  tutor_premium_plus: 10,
};

export const PLAN_NAMES: Record<IndividualPlanKey, string> = {
  learner_basic: "Learner Basic",
  learner_premium: "Learner Premium",
  creator: "Creator PRO",
  creator_basic: "Creator Basic",
  creator_max: "Creator Max",
  tutor_basic: "Tutor Basic",
  tutor_premium: "Tutor Pro",
  tutor_premium_plus: "Tutor Max",
};

export function membershipAudience(profile: any): AccountAudience {
  const type = String(profile?.account_type || "learner").toLowerCase();
  if (type === "institution") return "Institution";
  if (type === "tutor") return "Tutor";
  if (String(profile?.active_mode || "").toLowerCase() === "creator" || type === "creator") return "Creator";
  return "Learner";
}

export function resolvePlanKey(profile: any): IndividualPlanKey | "institution" | "administrator" {
  if (profile?.is_admin) return "administrator";
  const tier = String(profile?.tier || "basic").toLowerCase().replace(/\s+/g, "");
  const audience = membershipAudience(profile);

  if (audience === "Institution") return "institution";
  if (audience === "Tutor") {
    if (tier === "premium+") return "tutor_premium_plus";
    if (tier === "premium") return "tutor_premium";
    return "tutor_basic";
  }
  if (audience === "Creator") return tier === "creatormax" ? "creator_max" : tier === "creator" ? "creator" : "creator_basic";
  // A Creator membership belongs to Creator mode; it isn't a Learner plan.
  if (tier === "creator" || tier === "creatormax") return "learner_basic";
  if (tier === "premium" || tier === "premium+") return "learner_premium";
  return "learner_basic";
}

/** Which account type each plan belongs to. */
export const PLAN_AUDIENCE: Record<string, AccountAudience> = {
  learner_basic: "Learner",
  learner_premium: "Learner",
  creator_basic: "Creator",
  creator: "Creator",
  creator_max: "Creator",
  tutor_basic: "Tutor",
  tutor_premium: "Tutor",
  tutor_premium_plus: "Tutor",
  institution: "Institution",
  institution_small: "Institution",
  institution_large: "Institution",
  institution_custom: "Institution",
};

const BASIC_PLAN: Record<AccountAudience, IndividualPlanKey | "institution"> = {
  Learner: "learner_basic",
  Creator: "creator_basic",
  Tutor: "tutor_basic",
  Institution: "institution",
};

/**
 * The plan to show for the account type the person is using right now.
 * A membership bought or gifted for one account type (say Creator PRO) shows
 * only there; in Learner or Tutor mode they see that mode's own plan.
 * `subscriptionPlanKey` is the server's plan (get_my_subscription_dashboard).
 */
export function planForMode(
  profile: any,
  subscriptionPlanKey?: string | null,
): IndividualPlanKey | "institution" | "administrator" {
  if (profile?.is_admin || subscriptionPlanKey === "administrator") return "administrator";
  const audience = membershipAudience(profile);
  if (subscriptionPlanKey) {
    if (PLAN_AUDIENCE[subscriptionPlanKey] !== audience) return BASIC_PLAN[audience];
    return audience === "Institution" ? "institution" : (subscriptionPlanKey as IndividualPlanKey);
  }
  return resolvePlanKey(profile);
}

/** True when a plan belongs to the account type in use. */
export function planMatchesMode(profile: any, planKey?: string | null) {
  return Boolean(planKey && PLAN_AUDIENCE[planKey] === membershipAudience(profile));
}

export function clubUpgradeMessage(planKey: string) {
  switch (planKey) {
    case "learner_basic":
    case "learner_premium":
      return "Learners can join clubs but cannot create them. Switch to Creator mode to view Creator PRO and Max.";
    case "creator_basic":
      return "Choose Creator PRO or Creator Max to create up to 3 permanent clubs.";
    case "creator":
      return "You've reached your Creator PRO plan limit of 3 Clubs.";
    case "creator_max":
      return "You've reached your Creator Max plan limit of 3 Clubs.";
    case "tutor_basic":
      return "You've reached your 1-Club limit. Upgrade to Tutor Pro to create up to 5 Clubs.";
    case "tutor_premium":
      return "You've reached your 5-Club limit. Upgrade to Tutor Max to create up to 10 Clubs.";
    case "tutor_premium_plus":
      return "You've reached your Tutor Max limit of 10 Clubs.";
    default:
      return null;
  }
}

export function canUseZeroAI(profile: any): boolean {
  const audience = membershipAudience(profile);
  const key = resolvePlanKey(profile);
  if (profile?.is_admin) return true;
  if (audience === "Creator") return key === "creator_max";
  if (audience === "Tutor") return key === "tutor_premium_plus";
  return true;
}

export function fallbackClubCapacity(profile: any, permanentClubCount: number): ClubCapacity {
  const planKey = resolvePlanKey(profile);
  if (planKey === "institution" || planKey === "administrator") {
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

  const limit = membershipAudience(profile) === "Learner" ? 0 : (membershipAudience(profile) === "Creator" && !["creator", "creatormax"].includes(String(profile?.tier || "").toLowerCase().replace(/\s+/g, "")) ? 0 : CLUB_LIMITS[planKey]);
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
