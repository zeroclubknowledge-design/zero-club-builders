import { supabase } from "@/lib/supabase";

/*
 * Private group chats on the Messages page. They are not clubs: no discovery,
 * no rooms, just a group of people, an invite link and a group call.
 *
 * Every write goes through a database function that checks membership and
 * roles; the tables themselves are read-only to the app (RLS: members only).
 */

export type GroupRole = "owner" | "admin" | "member";

export interface GroupSummary {
  id: string;
  name: string;
  avatar_url: string | null;
  last_message_at: string;
  call_active: boolean;
  muted: boolean;
  role: GroupRole;
  member_count: number;
  unread: number;
  last: { content: string; kind: string; sender_id: string | null; sender_name: string | null } | null;
}

export interface ChatGroup {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by: string | null;
  invite_code: string;
  invite_enabled: boolean;
  admins_only_send: boolean;
  call_active_since: string | null;
  call_started_by: string | null;
  pinned_message_id: string | null;
  created_at: string;
}

export interface GroupMember {
  profile_id: string;
  role: GroupRole;
  muted: boolean;
  joined_at: string;
  last_read_at: string;
  profile: { id: string; username: string | null; full_name: string | null; avatar_url: string | null } | null;
}

export interface GroupPoll {
  question: string;
  options: string[];
  multi: boolean;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string | null;
  kind: "text" | "system" | "call" | "poll";
  content: string;
  reply_to_id: string | null;
  poll: GroupPoll | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  pending?: boolean;
}

export interface GroupReaction { message_id: string; profile_id: string; emoji: string }
export interface GroupVote { message_id: string; profile_id: string; option_index: number }

type Result = { ok: boolean; reason?: string; [key: string]: unknown };

const REASONS: Record<string, string> = {
  not_authenticated: "Sign in first.",
  name_required: "Give the group a name.",
  too_many: "A group can have up to 256 people.",
  slow_down: "You've made a lot of groups this hour. Try again a bit later.",
  invalid_link: "This invite link has expired or was reset.",
  group_full: "This group is full (256 people).",
  not_admin: "Only group admins can do that.",
  owner_only: "Only the group owner can do that.",
  not_allowed: "You can't do that.",
  not_member: "You're not in this group.",
};

export function reasonText(reason?: string) {
  return (reason && REASONS[reason]) || "Something went wrong. Try again.";
}

async function call<T = Result>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as any, args as any);
  if (error) throw error;
  return data as T;
}

/** Throws a readable error when the function answers { ok: false }. */
async function act(fn: string, args: Record<string, unknown> = {}) {
  const res = await call<Result>(fn, args);
  if (res && res.ok === false) throw new Error(reasonText(res.reason));
  return res;
}

/** Set when someone opens an invite before signing in; the app picks it up after. */
export const PENDING_GROUP_INVITE = "zc:pending-group-invite";

export const groupInviteUrl = (code: string) =>
  `${typeof window !== "undefined" ? window.location.origin : "https://www.zeroclubs.xyz"}/g/${code}`;

export const myGroups = () => call<GroupSummary[]>("my_chat_groups").then((r) => r || []);

export async function getGroup(id: string) {
  const { data, error } = await supabase.from("chat_groups" as any).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as ChatGroup) || null;
}

export async function getMembers(groupId: string) {
  const { data, error } = await supabase
    .from("chat_group_members" as any)
    .select("profile_id, role, muted, joined_at, last_read_at")
    .eq("group_id", groupId);
  if (error) throw error;
  const rows = (data || []) as unknown as Omit<GroupMember, "profile">[];
  const ids = rows.map((r) => r.profile_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, username, full_name, avatar_url").in("id", ids)
    : { data: [] as any[] };
  const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
  const order: Record<GroupRole, number> = { owner: 0, admin: 1, member: 2 };
  return rows
    .map((r) => ({ ...r, profile: byId.get(r.profile_id) || null }))
    .sort((a, b) => order[a.role] - order[b.role] || (a.profile?.full_name || a.profile?.username || "").localeCompare(b.profile?.full_name || b.profile?.username || "")) as GroupMember[];
}

export const MESSAGE_PAGE = 60;

export async function getMessages(groupId: string, before?: string) {
  let q = supabase.from("chat_group_messages" as any).select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(MESSAGE_PAGE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as unknown as GroupMessage[]).reverse();
}

export async function getReactionsAndVotes(messageIds: string[]) {
  if (!messageIds.length) return { reactions: [] as GroupReaction[], votes: [] as GroupVote[] };
  const [r, v] = await Promise.all([
    supabase.from("chat_group_reactions" as any).select("message_id, profile_id, emoji").in("message_id", messageIds),
    supabase.from("chat_group_poll_votes" as any).select("message_id, profile_id, option_index").in("message_id", messageIds),
  ]);
  return { reactions: (r.data || []) as unknown as GroupReaction[], votes: (v.data || []) as unknown as GroupVote[] };
}

export const createGroup = (name: string, memberIds: string[], description?: string, avatarUrl?: string | null) =>
  act("create_chat_group", { p_name: name, p_member_ids: memberIds, p_description: description || null, p_avatar_url: avatarUrl || null }) as Promise<Result & { id: string; added: number; skipped: number }>;

export const sendMessage = (groupId: string, content: string, replyTo?: string | null) =>
  call<GroupMessage>("send_chat_group_message", { p_group: groupId, p_content: content, p_reply_to: replyTo || null });

export const sendPoll = (groupId: string, poll: GroupPoll) =>
  call<GroupMessage>("send_chat_group_message", { p_group: groupId, p_content: "", p_poll: poll });

export const editMessage = (id: string, content: string) => act("edit_chat_group_message", { p_message: id, p_content: content });
export const removeMessage = (id: string) => act("remove_chat_group_message", { p_message: id });
export const pinMessage = (groupId: string, messageId: string | null) => act("pin_chat_group_message", { p_group: groupId, p_message: messageId });
export const react = (messageId: string, emoji: string) => act("react_chat_group_message", { p_message: messageId, p_emoji: emoji });
export const vote = (messageId: string, option: number) => act("vote_chat_group_poll", { p_message: messageId, p_option: option });
export const markRead = (groupId: string) => call("mark_chat_group_read", { p_group: groupId }).catch(() => undefined);
export const setMuted = (groupId: string, muted: boolean) => call("set_chat_group_muted", { p_group: groupId, p_muted: muted });
export const addMembers = (groupId: string, ids: string[]) => act("add_chat_group_members", { p_group: groupId, p_member_ids: ids }) as Promise<Result & { added: number }>;
export const removeMember = (groupId: string, profileId: string) => act("remove_chat_group_member", { p_group: groupId, p_profile: profileId });
export const setRole = (groupId: string, profileId: string, role: "admin" | "member") => act("set_chat_group_role", { p_group: groupId, p_profile: profileId, p_role: role });
export const leaveGroup = (groupId: string) => act("leave_chat_group", { p_group: groupId });
export const resetInvite = (groupId: string) => act("reset_chat_group_invite", { p_group: groupId }) as Promise<Result & { invite_code: string }>;
export const updateGroup = (groupId: string, changes: { name?: string; description?: string; avatarUrl?: string; clearAvatar?: boolean; adminsOnlySend?: boolean; inviteEnabled?: boolean }) =>
  act("update_chat_group", {
    p_group: groupId,
    p_name: changes.name ?? null,
    p_description: changes.description ?? null,
    p_avatar_url: changes.avatarUrl ?? null,
    p_admins_only_send: changes.adminsOnlySend ?? null,
    p_invite_enabled: changes.inviteEnabled ?? null,
    p_clear_avatar: changes.clearAvatar ?? false,
  });

export const previewInvite = (code: string) =>
  call<{ found: boolean; id?: string; name?: string; description?: string | null; avatar_url?: string | null; member_count?: number; is_member?: boolean; faces?: { avatar_url: string | null; name: string | null }[] }>("chat_group_preview", { p_code: code });
export const joinGroup = (code: string) => act("join_chat_group", { p_code: code }) as Promise<Result & { id: string }>;

export const startCall = (groupId: string) => act("start_chat_group_call", { p_group: groupId }) as Promise<Result & { channel: string; started: boolean; name: string }>;
export const endCall = (groupId: string) => call("end_chat_group_call", { p_group: groupId }).catch(() => undefined);

/** People you can add: anyone you follow or who follows you. */
export async function addablePeople(myId: string) {
  const { data } = await supabase
    .from("follows")
    .select("follower_id, following_id")
    .or(`follower_id.eq.${myId},following_id.eq.${myId}`)
    .limit(2000);
  const ids = [...new Set((data || []).map((f: any) => (f.follower_id === myId ? f.following_id : f.follower_id)))].filter((id) => id && id !== myId);
  if (!ids.length) return [] as { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[];
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows } = await supabase.from("profiles").select("id, username, full_name, avatar_url").in("id", ids.slice(i, i + 200));
    out.push(...(rows || []));
  }
  return out.sort((a, b) => (a.full_name || a.username || "").localeCompare(b.full_name || b.username || "")) as { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[];
}

export const displayName = (p?: { full_name?: string | null; username?: string | null } | null) =>
  p?.full_name?.trim() || p?.username || "Someone";
