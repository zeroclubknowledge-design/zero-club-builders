/**
 * Modes: one Zero Club account that can learn, teach and run communities.
 *
 * A person switches between Learner, Tutor and Creator instead of holding a
 * separate account for each. Institutions are organisations rather than
 * people, so they keep their own account type and never switch.
 *
 * The mode is stored as active_mode, and account_type follows it ('Tutor' in
 * Tutor mode, 'Learner' otherwise) so every screen and database function that
 * already reads account_type keeps working unchanged.
 */
import { supabase } from "@/lib/supabase";

export type Mode = "learner" | "tutor" | "creator";

export const MODES: Record<Mode, { label: string; verb: string; blurb: string; home: string }> = {
  learner: {
    label: "Learner",
    verb: "Learn",
    blurb: "Join bootcamps and clubs, ship projects and build your proof of work.",
    home: "/app",
  },
  tutor: {
    label: "Tutor",
    verb: "Teach",
    blurb: "Run bootcamps and live classes, and follow your learners' progress.",
    home: "/app/tutor-studio",
  },
  creator: {
    label: "Creator",
    verb: "Build communities",
    blurb: "Run clubs people come back to, sell in your store and earn Creator Rewards.",
    home: "/app/creator",
  },
};

export const MODE_ORDER: Mode[] = ["learner", "tutor", "creator"];

export function isInstitution(profile: any) {
  return String(profile?.account_type || "").toLowerCase() === "institution";
}

/** The mode a profile is in right now; null for institutions. */
export function modeOf(profile: any): Mode | null {
  if (!profile || isInstitution(profile)) return null;
  if (String(profile.account_type || "").toLowerCase() === "tutor") return "tutor";
  return profile.active_mode === "creator" ? "creator" : "learner";
}

/**
 * Switch the signed-in person's mode. Falls back to account_type alone when
 * the database update that adds modes has not been run yet, so Learner and
 * Tutor still switch; Creator needs the update.
 */
export async function switchMode(profileId: string, mode: Mode) {
  const { error } = await supabase.rpc("set_active_mode", { new_mode: mode });
  if (!error) return;

  const missingFunction = error.code === "PGRST202" || /set_active_mode/i.test(error.message || "");
  if (!missingFunction) throw error;
  if (mode === "creator") throw new Error("Creator mode needs the latest database update. Please try again later.");

  const { error: fallbackError } = await supabase
    .from("profiles")
    .update({ account_type: mode === "tutor" ? "Tutor" : "Learner" })
    .eq("id", profileId);
  if (fallbackError) throw fallbackError;
}

/** New members go through onboarding once. Existing accounts have a date. */
export function needsOnboarding(profile: any) {
  return Boolean(profile) && "onboarded_at" in profile && profile.onboarded_at === null && !isInstitution(profile);
}

/** Fields offered during onboarding; the same names bootcamps use as categories. */
export const INTEREST_OPTIONS = [
  "Development",
  "Design",
  "Data Science",
  "AI/ML",
  "Product",
  "Business",
  "Marketing",
  "DevOps",
  "Cybersecurity",
  "Mobile",
  "Writing",
  "Web3",
];
