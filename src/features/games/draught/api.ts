import { supabase } from "@/lib/supabase";
import type { DraughtMove, Side } from "./engine";
export type DraughtPlayer = { id: string; name: string; photo: string | null };
export type DraughtRoom = {
  id: string;
  code: string;
  red_id: string;
  black_id: string | null;
  board: number[];
  turn: Side;
  forced: number | null;
  version: number;
  status: "waiting" | "active" | "finished" | "cancelled";
  winner: string | null;
  reason: string | null;
  red_ms: number;
  black_ms: number;
  moved_at: string | null;
  draw_offer: string | null;
  red_seen: string;
  black_seen: string | null;
};
export type DraughtSnapshot = {
  room: DraughtRoom;
  players: DraughtPlayer[];
  moves: DraughtMove[];
  server_now: string;
};
export type DraughtAction =
  "create" | "join" | "move" | "resign" | "offer_draw" | "accept_draw" | "decline_draw";
async function rpc<T>(name: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export const draughtHome = () =>
  rpc<Pick<DraughtRoom, "id" | "code" | "status" | "winner" | "reason">[]>("zero_draught_home");
export const draughtRoom = (room: string) =>
  rpc<DraughtSnapshot>("zero_draught_room", { p_room: room });
export const draughtPing = (room: string) => rpc<void>("zero_draught_ping", { p_room: room });
export const draughtAction = (
  room: string | undefined,
  action: DraughtAction,
  payload: Record<string, unknown>,
  request: string,
) =>
  rpc<{ room_id: string }>("zero_draught_action", {
    p_room: room || null,
    p_action: action,
    p_payload: payload,
    p_request: request,
  });
export function draughtError(error: unknown) {
  const message = (error as { message?: string })?.message || "Please try again.";
  return /PGRST202|schema cache|function .*zero_draught/i.test(message)
    ? "Multiplayer is not available yet. You can still play against the computer."
    : /fetch|network/i.test(message)
      ? "Connection interrupted. Your match is saved. Reconnect to continue."
      : message;
}
