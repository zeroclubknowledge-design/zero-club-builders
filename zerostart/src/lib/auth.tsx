import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { applyAccountTheme, resetTheme, watchAccountTheme } from "./theme";
import { sharedSignInOff, trySharedSignIn, turnSharedSignInOff, turnSharedSignInOn } from "./sso";
import type { Profile } from "@/types";

/**
 * Who is using the app, resolved once and shared.
 *
 * The profile is fetched alongside the session rather than left to each screen,
 * because almost every screen needs the id and several need the handle — and a
 * component that fetches its own profile is a component that flashes a
 * signed-out state on every mount.
 */

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  session: null, profile: null, isAdmin: false, loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let current: Session | null = null;
    let initializing = true;
    let lastAttempt = 0;
    const restore = async () => {
      initializing = true;
      lastAttempt = Date.now();
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        current = data.session;
        setSession(current);
        if (!current) await trySharedSignIn();
      } finally {
        initializing = false;
        if (alive && !current) { resetTheme(); setLoading(false); }
      }
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      current = next;
      if (event === "SIGNED_IN") turnSharedSignInOn();
      setSession(next);
      if (!next) {
        if (!initializing) resetTheme();
        setProfile(null);
        setIsAdmin(false);
        if (!initializing) setLoading(false);
      }
    });
    void restore().catch(() => { /* The normal sign-in remains available. */ });
    const onReturn = () => {
      if (!alive || initializing || current || sharedSignInOff() || document.visibilityState !== "visible" || Date.now() - lastAttempt < 15000) return;
      void restore().catch(() => {});
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;

    let alive = true;
    setProfile(null);
    setIsAdmin(false);
    setLoading(true);
    supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, banner_url, is_admin, theme_mode, dark_theme")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const row = data as (Profile & { is_admin?: boolean; theme_mode?: string | null; dark_theme?: string | null }) | null;
        if (row) applyAccountTheme(row.theme_mode, row.dark_theme);
        setProfile(row);
        setIsAdmin(Boolean(row?.is_admin));
        setLoading(false);
      }, () => { if (alive) setLoading(false); });

    /* Changed the theme in Zero Club in another tab? Pick it up on return. */
    const stopThemeWatch = watchAccountTheme(async () => {
      const { data, error } = await supabase.from("profiles")
        .select("theme_mode, dark_theme").eq("id", uid).maybeSingle();
      return error ? null : data;
    });

    return () => { alive = false; stopThemeWatch(); };
  }, [session?.user?.id]);

  const signOut = async () => {
    turnSharedSignInOff();
    const { error } = await supabase.auth.signOut();
    if (error) { turnSharedSignInOn(); throw error; }
  };

  return (
    <AuthContext.Provider value={{ session, profile, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
