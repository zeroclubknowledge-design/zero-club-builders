import { supabase } from "./supabase";

/** Atomic eligible gift credit + wallet checkout; original service rules run server-side. */
export function payWithGiftCredit(action: "join_club" | "pay_fund_link_from_wallet", args: Record<string, unknown>, apply = true, requestId = crypto.randomUUID()) {
  return supabase.rpc("pay_with_gift_credit", { p_action: action, p_args: args, p_apply_gift: apply, p_request_id: requestId });
}
