import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  const currentId = useRef<string | null>(null);
  const loadVersion = useRef(0);
  const mounted = useRef(true);

  const loadProfile = async (uid: string) => {
    if (currentId.current !== uid) return;
    const version = ++loadVersion.current;
    setLoading(true);
    try {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, coins, is_admin, theme_mode, dark_theme")
      .eq("id", uid)
      .maybeSingle();
    const row = (data as Profile | null) || null;
    if (!mounted.current || currentId.current !== uid || version !== loadVersion.current) return;
    if (row) applyAccountTheme(row.theme_mode, row.dark_theme);
    setProfile(row);
    } finally {
      if (mounted.current && currentId.current === uid && version === loadVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    mounted.current = true;
    let initializing = true;
    let authRevision = 0;
    const acceptSession = (next: Session | null) => {
      const id = next?.user.id || null;
      if (id !== currentId.current) {
        currentId.current = id;
        loadVersion.current++;
        setProfile(null);
        setLoading(true);
        void client.cancelQueries();
        client.clear();
      }
      setSession(next);
    };
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      if (authRevision === 0) acceptSession(data.session);
      if (currentId.current) { void loadProfile(currentId.current).catch(()=>{}); return; }
      // Signed in to Zero Club in this browser? Then you're signed in here too.
      const ok = await trySharedSignIn();
      if (alive && !ok && !currentId.current) setLoading(false);
    }).catch(()=>{if(alive && !currentId.current)setLoading(false);}).finally(()=>{initializing=false;});
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
      authRevision++;
      acceptSession(next);
      // Auth listeners run under Supabase's session lock. Fetch afterwards.
      if (next && (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED")) setTimeout(()=>{
        if(alive && currentId.current===next.user.id)void loadProfile(next.user.id).catch(()=>{});
      },0);
      if (event === "SIGNED_IN") turnSharedSignInOn();
      if (!next) {
        setProfile(null);
        if (!initializing) { setLoading(false); applyAccountTheme("off", null); }
        client.clear();
      }
    });
    return () => { alive = false; mounted.current=false; loadVersion.current++; sub.subscription.unsubscribe(); document.removeEventListener("visibilitychange", onFocus); };
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
