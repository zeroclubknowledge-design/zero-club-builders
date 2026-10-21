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
  /** ZP each player put in (0 = friendly match). */
  stake?: number;
};
export type DraughtSnapshot = {
  room: DraughtRoom;
  /** "spectator" when watching someone else's match. Older servers omit it. */
  viewer?: "player" | "spectator";
  /** ZP currently held for this match. */
  pot?: number;
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

export type DraughtStakeInfo = { zp: number; stakeable: number; cap: number; account_ready: boolean };
export type DraughtInvite = {
  status: DraughtRoom["status"];
  stake: number;
  open: boolean;
  host: DraughtPlayer;
};
export type DraughtLiveMatch = {
  id: string;
  stake: number;
  ply: number;
  moved_at: string;
  comments: number;
  red: DraughtPlayer;
  black: DraughtPlayer;
};
export type DraughtComment = {
  id: string;
  room_id: string;
  profile_id: string;
  body: string;
  created_at: string;
  author?: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null;
};

/** True when the server hasn't been given watching and stakes yet. */
export const isMissingFeature = (error: unknown) =>
  /PGRST202|schema cache|does not exist|42883|42P01/i.test(
    `${(error as { code?: string })?.code || ""} ${(error as { message?: string })?.message || ""}`,
  );

export const draughtStakeInfo = () => rpc<DraughtStakeInfo>("zero_draught_stake_info");
export const draughtInvite = (code: string) => rpc<DraughtInvite>("zero_draught_invite", { p_code: code });
export const draughtLive = () => rpc<DraughtLiveMatch[]>("zero_draught_live");
export const draughtComment = (room: string, body: string) =>
  rpc<DraughtComment>("zero_draught_comment", { p_room: room, p_body: body });
export async function draughtComments(room: string) {
  const { data, error } = await supabase
    .from("zero_draught_comments" as never)
    .select("id, room_id, profile_id, body, created_at, author:profiles!zero_draught_comments_profile_id_fkey(id, full_name, username, avatar_url)")
    .eq("room_id", room)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data || []) as unknown as DraughtComment[];
}
