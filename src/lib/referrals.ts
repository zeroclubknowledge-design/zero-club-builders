import { supabase } from "@/lib/supabase";

/** Return the stored spelling so signup metadata matches the database trigger. */
export async function resolveReferralCode(input: string) {
  const code = input.trim();
  if (!code) return null;
  // Escape LIKE wildcards: a referral code must match the entire value.
  const pattern = code.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await supabase
    .from("profiles")
    .select("id, referral_code")
    .ilike("referral_code", pattern)
    .maybeSingle();
  if (error) throw new Error("We couldn't check your referral code. Please try again.");
  if (!data) throw new Error("That referral code is invalid. Check the code or clear it to continue.");
  return data;
}
