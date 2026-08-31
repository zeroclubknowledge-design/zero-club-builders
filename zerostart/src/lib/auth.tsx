import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
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

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next);
      if (!next) {
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;

    let alive = true;
    supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, is_admin")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const row = data as (Profile & { is_admin?: boolean }) | null;
        setProfile(row);
        setIsAdmin(Boolean(row?.is_admin));
        setLoading(false);
      });

    return () => { alive = false; };
  }, [session?.user?.id]);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthContext.Provider value={{ session, profile, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
