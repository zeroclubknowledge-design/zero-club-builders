import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { sharedSignInOff, trySharedSignIn, turnSharedSignInOff, turnSharedSignInOn } from "./sso";

/**
 * Who is using the app, resolved once and shared. The account is a Zero Club
 * account: same `profiles` row, same wallet, same ZP.
 */
export type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  coins: number | null;
  is_admin: boolean | null;
  theme_mode?: string | null;
  dark_theme?: string | null;
};

type AuthValue = { session: Session | null; profile: Profile | null; loading: boolean; refreshProfile: () => Promise<void>; signOut: () => Promise<void> };

const AuthContext = createContext<AuthValue>({ session: null, profile: null, loading: true, refreshProfile: async () => {}, signOut: async () => {} });

const THEME_KEY = "zero-theme";
const VARIANTS = ["lights-out", "dim", "rose-noir"];
/** Wear the account's Zero Club theme (profiles.theme_mode / dark_theme). */
export function applyAccountTheme(mode?: string | null, theme?: string | null) {
  const root = document.documentElement;
  root.classList.remove("dark", ...VARIANTS);
  const dark = mode === "on" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) root.classList.add("dark", VARIANTS.includes(theme || "") ? theme! : "lights-out");
  try { localStorage.setItem(THEME_KEY, JSON.stringify({ mode: mode || "off", theme: theme || "lights-out" })); } catch { /* blocked */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, coins, is_admin, theme_mode, dark_theme")
      .eq("id", uid)
      .maybeSingle();
    const row = (data as Profile | null) || null;
    if (row) applyAccountTheme(row.theme_mode, row.dark_theme);
    setProfile(row);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) { void loadProfile(data.session.user.id); return; }
      // Signed in to Zero Club in this browser? Then you're signed in here too.
      const ok = await trySharedSignIn();
      if (alive && !ok) setLoading(false);
    });
    // Signed in to Zero Club in another tab after opening this one: pick it up on return.
    let lastTry = Date.now();
    const onFocus = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastTry < 30_000 || sharedSignInOff()) return;
      lastTry = Date.now();
      void supabase.auth.getSession().then(({ data }) => { if (!data.session) void trySharedSignIn(); });
    };
    document.addEventListener("visibilitychange", onFocus);
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      setSession(next);
      if (next && (event === "SIGNED_IN" || event === "USER_UPDATED")) void loadProfile(next.user.id);
      if (event === "SIGNED_IN") turnSharedSignInOn();
      if (!next) {
        setProfile(null);
        setLoading(false);
        applyAccountTheme("off", null);
        client.clear();
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); document.removeEventListener("visibilitychange", onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthValue = {
    session,
    profile,
    loading,
    refreshProfile: async () => { if (session) await loadProfile(session.user.id); },
    signOut: async () => { turnSharedSignInOff(); await supabase.auth.signOut(); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
