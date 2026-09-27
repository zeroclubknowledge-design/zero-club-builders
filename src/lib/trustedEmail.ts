/**
 * Only real, reputable email providers can create a Zero Club account.
 *
 * The rule itself lives in the database (public.is_email_domain_allowed and a
 * trigger on auth.users), so nothing — this screen, an old app build, or a
 * direct API call — can get around it. This file only asks the database first
 * so the person gets a clear sentence instead of a generic sign-up error.
 */
import { supabase } from "@/lib/supabase";

export const UNTRUSTED_EMAIL_MESSAGE =
  "Please use an email from a trusted provider such as Gmail, Yahoo, Outlook or iCloud. Temporary and unknown email services can't be used on Zero Club.";

/** Obvious typos of the big providers, so we can suggest the fix. */
const TYPO_FIXES: Record<string, string> = {
  "gmai.com": "gmail.com", "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.con": "gmail.com", "gnail.com": "gmail.com", "yahoo.co": "yahoo.com", "yaho.com": "yahoo.com",
  "hotmail.co": "hotmail.com", "outlok.com": "outlook.com", "icloud.co": "icloud.com",
};

export function suggestEmailFix(email: string): string | null {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return null;
  const fixed = TYPO_FIXES[domain];
  return fixed ? `${local}@${fixed}` : null;
}

/** true when the address can sign up; errs on the side of letting the server decide. */
export async function isTrustedEmail(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_email_domain_allowed", { email: email.trim() });
  if (error) return true; // the database trigger is still the real gate
  return Boolean(data);
}

/** Turns the trigger's error into the friendly sentence. */
export function isUntrustedEmailError(message?: string) {
  return /EMAIL_DOMAIN_NOT_ALLOWED|Database error saving new user/i.test(message || "");
}
