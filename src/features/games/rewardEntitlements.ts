import { resolvePlanKey } from "@/features/membership/plans";

export type ZeroGameRewardAllowance = {
  plan_key: string;
  weekly_limit: number;
  weekly_used: number;
  weekly_remaining: number;
  daily_limit: number | null;
  daily_used: number;
  daily_remaining: number | null;
  can_create: boolean;
  resets_at?: string | null;
};

export const ZERO_GAME_REWARD_LIMITS: Record<string, { weekly: number; daily: number | null }> = {
  learner_basic: { weekly: 2, daily: null },
  learner_premium: { weekly: 5, daily: null },
  creator: { weekly: 5, daily: null },
  tutor_basic: { weekly: 2, daily: null },
  tutor_premium: { weekly: 5, daily: null },
  tutor_premium_plus: { weekly: 14, daily: 2 },
  institution: { weekly: 5, daily: null },
  institution_small: { weekly: 5, daily: null },
  institution_large: { weekly: 14, daily: 2 },
  institution_custom: { weekly: 14, daily: 2 },
  administrator: { weekly: 14, daily: 2 },
};

export function fallbackZeroGameRewardAllowance(profile: any): ZeroGameRewardAllowance {
  const planKey = profile?.is_admin ? "administrator" : resolvePlanKey(profile);
  const limits = ZERO_GAME_REWARD_LIMITS[planKey] || ZERO_GAME_REWARD_LIMITS.learner_basic;

  return {
    plan_key: planKey,
    weekly_limit: limits.weekly,
    weekly_used: 0,
    weekly_remaining: limits.weekly,
    daily_limit: limits.daily,
    daily_used: 0,
    daily_remaining: limits.daily,
    can_create: true,
    resets_at: null,
  };
}

export function zeroGameAllowanceName(planKey: string) {
  switch (planKey) {
    case "learner_premium": return "Learner Premium";
    case "creator": return "Creator";
    case "tutor_basic": return "Tutor Basic";
    case "tutor_premium": return "Tutor Premium";
    case "tutor_premium_plus": return "Tutor Premium+";
    case "institution_small": return "Institution Small";
    case "institution_large": return "Institution Large";
    case "institution_custom": return "Institution Custom";
    case "administrator": return "Administrator";
    default: return "Learner Basic";
  }
}
