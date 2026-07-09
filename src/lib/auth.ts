import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

let sessionPromise: Promise<{ data: { session: Session | null }, error: any }> | null = null;
let sessionPromiseTime = 0;

supabase.auth.onAuthStateChange(() => {
  sessionPromiseTime = 0;
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
  if (sessionPromise && now - sessionPromiseTime < 2000) {
    return sessionPromise;
  }
  
  clearSupabaseLocks();
  sessionPromise = supabase.auth.getSession();
  sessionPromiseTime = now;
  return sessionPromise;
};
