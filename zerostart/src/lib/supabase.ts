import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

/**
 * The same Supabase project as Zero Club.
 *
 * One `profiles` table means one account across the ecosystem, and one
 * `zp_events` ledger means one balance. The alternative — a second database
 * with a sync layer — produces two balances that can disagree, which for a
 * rewards currency is the worst possible outcome.
 */
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // A distinct key so signing out of one product does not sign you out of
    // the other unexpectedly during development on the same host.
    storageKey: "zerostart-auth",
  },
});
