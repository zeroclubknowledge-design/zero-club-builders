import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const GOOGLE_SIGNUP_CONTEXT_KEY = "zero_club_google_signup_context";
const CONTEXT_MAX_AGE_MS = 30 * 60 * 1000;

type GoogleSignupContext = {
  referralCode?: string;
  startedAt: number;
};

let googleEnabled: Promise<boolean> | null = null;

/**
 * Whether Google sign-in is switched on for this Supabase project.
 *
 * Asked once from the public auth settings. While the provider is off, the
 * Google button is hidden instead of sending people to Supabase's raw
 * "Unsupported provider: provider is not enabled" error page.
 */
export function isGoogleSignInEnabled(): Promise<boolean> {
  if (!googleEnabled) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    googleEnabled = fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((settings) => Boolean(settings?.external?.google))
      .catch(() => false);
  }
  return googleEnabled;
}

export async function startGoogleAuthentication({
  destination,
  signupContext,
}: {
  destination: string;
  signupContext?: Omit<GoogleSignupContext, "startedAt">;
}) {
  if (signupContext) {
    localStorage.setItem(
      GOOGLE_SIGNUP_CONTEXT_KEY,
      JSON.stringify({ ...signupContext, startedAt: Date.now() }),
    );
  } else {
    localStorage.removeItem(GOOGLE_SIGNUP_CONTEXT_KEY);
  }

  if (!(await isGoogleSignInEnabled())) {
    localStorage.removeItem(GOOGLE_SIGNUP_CONTEXT_KEY);
    return new Error("Google sign-in isn't available right now. Please continue with your email.");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL(destination, window.location.origin).toString(),
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      },
    },
  });

  if (error && signupContext) localStorage.removeItem(GOOGLE_SIGNUP_CONTEXT_KEY);
  return error;
}

/** Applies the referral code entered immediately before a brand-new Google signup. */
export async function completePendingGoogleSignup(user: User) {
  const stored = localStorage.getItem(GOOGLE_SIGNUP_CONTEXT_KEY);
  if (!stored) return;

  let context: GoogleSignupContext;
  try {
    context = JSON.parse(stored) as GoogleSignupContext;
  } catch {
    localStorage.removeItem(GOOGLE_SIGNUP_CONTEXT_KEY);
    return;
  }

  const createdAt = new Date(user.created_at).getTime();
  const lastSignInAt = new Date(user.last_sign_in_at || user.created_at).getTime();
  const isFreshAccount = Math.abs(lastSignInAt - createdAt) < 5 * 60 * 1000;
  const isFreshContext = Date.now() - Number(context.startedAt || 0) < CONTEXT_MAX_AGE_MS;

  if (!isFreshAccount || !isFreshContext) {
    localStorage.removeItem(GOOGLE_SIGNUP_CONTEXT_KEY);
    return;
  }

  const referralCode = context.referralCode?.trim();
  if (referralCode) {
    const { data: referrer } = await supabase
      .from("profiles")
      .select("id")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (referrer?.id && referrer.id !== user.id) {
      await supabase
        .from("profiles")
        .update({ referred_by: referrer.id })
        .eq("id", user.id)
        .is("referred_by", null);
    }
  }

  localStorage.removeItem(GOOGLE_SIGNUP_CONTEXT_KEY);
}
