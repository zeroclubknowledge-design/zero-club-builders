import { supabase } from "@/lib/supabase";
import type { SpaceMarketState, SpaceSupply } from "./spaceSupplies";

export async function getSpaceMarket(): Promise<SpaceMarketState> {
  const { data, error } = await supabase.rpc("zero_space_market");
  if (error) throw error;
  return data as SpaceMarketState;
}

export async function transactSpaceSupply(item: SpaceSupply, action: "buy" | "use", request: string): Promise<SpaceMarketState> {
  const { data, error } = await supabase.rpc("zero_space_supply", { p_item: item, p_action: action, p_request: request });
  if (error) throw error;
  return data as SpaceMarketState;
}

export function spaceMarketError(error: unknown) {
  const message = (error as { message?: string })?.message || "Please try again.";
  if (/PGRST202|zero_space_market|zero_space_supply|schema cache/i.test(message)) return "The marketplace is not available yet. You can still play with free pickups.";
  if (/fetch|network/i.test(message)) return "Connection interrupted. Try again to safely complete this action.";
  return message;
}
