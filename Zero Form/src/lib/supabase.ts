import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

/**
 * The same Supabase project as Zero Club, on purpose: one `profiles` row is
 * one person across every Zero product, and one wallet and ZP ledger means
 * one balance. Signing up here creates a full Zero Club account.
 */
if (!config.supabaseUrl || !config.supabaseAnonKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (the same values as Zero Club).");
}

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: config.authStorageKey },
});
