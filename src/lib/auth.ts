import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

let sessionPromise: Promise<{ data: { session: Session | null }, error: any }> | null = null;
let sessionPromiseTime = 0;

supabase.auth.onAuthStateChange(() => {
  sessionPromiseTime = 0;
});

export const getCachedSession = () => {
  const now = Date.now();
  if (sessionPromise && now - sessionPromiseTime < 2000) {
    return sessionPromise;
  }
  sessionPromise = supabase.auth.getSession();
  sessionPromiseTime = now;
  return sessionPromise;
};
