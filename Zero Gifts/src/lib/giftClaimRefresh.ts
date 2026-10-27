import { supabase } from "@/lib/supabase";

/** Reclaim due reservations before displaying inventory, also between cron ticks. */
export async function refreshGiftClaims() {
  const { error } = await supabase.rpc("refresh_zero_gift_claims" as never, {} as never);
  // Keep existing gifts usable while the new migration is being deployed.
  if (error && !["42883", "PGRST202"].includes(error.code || "")) throw error;
}
