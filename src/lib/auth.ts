import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

let sessionPromise: Promise<{ data: { session: Session | null }, error: any }> | null = null;
let sessionPromiseTime = 0;
let sessionInFlight = false;

supabase.auth.onAuthStateChange((event) => {
  sessionPromiseTime = 0;
  if (event !== 'INITIAL_SESSION') {
    sessionPromise = null;
    sessionInFlight = false;
  }
});

// Helper to clear Supabase stuck locks
const clearSupabaseLocks = () => {
  if (typeof window === 'undefined') return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token-lock')) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {}
};

export const getCachedSession = () => {
  const now = Date.now();
  if (sessionPromise && (sessionInFlight || now - sessionPromiseTime < 2000)) {
    return sessionPromise;
  }
  
  clearSupabaseLocks();
  sessionInFlight = true;
  const pending = supabase.auth.getSession().finally(() => {
    if (sessionPromise === pending) {
      sessionInFlight = false;
      sessionPromiseTime = Date.now();
    }
  });
  sessionPromise = pending;
  sessionPromiseTime = now;
  return sessionPromise;
};
