import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type SessionWaitOptions = {
  attempts?: number;
  intervalMs?: number;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getSettledSession(
  initialSession?: Session | null,
  { attempts = 10, intervalMs = 120 }: SessionWaitOptions = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) return session;
    if (attempt < attempts - 1) await delay(intervalMs);
  }

  return initialSession ?? null;
}
