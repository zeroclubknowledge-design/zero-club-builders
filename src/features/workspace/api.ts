import { supabase } from "@/lib/supabase";

/**
 * Team workspaces: an organization's own space for the Zero Club people on
 * its team. Every read and write goes through security-definer functions that
 * check the caller's workspace role server-side (see workspace_role()).
 */

export type WorkspaceRole = "owner" | "admin" | "staff" | "member";

export type WorkspaceChannel = { id: string; name: string; topic: string | null; kind: "channel" | "announcements"; unread: number };
export type WorkspacePerson = {
  id: string;
  username: string | null;
  name: string;
  avatar_url: string | null;
  role: WorkspaceRole;
  status: "active" | "invited";
  title: string | null;
  joined_at?: string | null;
  invited_at?: string | null;
  last_seen_at?: string | null;
  bio?: string | null;
  location?: string | null;
};
export type WorkspaceMeeting = {
  id: string;
  title: string;
  agenda?: string | null;
  starts_at: string;
  duration_min: number;
  location: string | null;
  cancelled?: boolean;
  upcoming?: boolean;
  host?: { id: string; name: string; avatar_url: string | null } | null;
  my_response: "going" | "maybe" | "declined" | null;
  going?: number;
  maybe?: number;
  can_manage?: boolean;
};
export type Workspace = {
  org: {
    id: string;
    username: string | null;
    name: string;
    avatar_url: string | null;
    banner_url: string | null;
    kind: "institutional" | "company" | null;
    tagline: string | null;
    about: string | null;
    industry: string | null;
    website: string | null;
    city: string | null;
    country: string | null;
  };
  me: { role: WorkspaceRole; title: string | null; joined_at: string | null };
  counts: { members: number; staff: number; invited: number | null; programmes: number; communities: number; upcoming_meetings: number };
  channels: WorkspaceChannel[];
  announcements: { id: string; content: string; created_at: string; sender: { id: string; name: string; avatar_url: string | null } }[];
  meetings: WorkspaceMeeting[];
  training: { bootcamp_id: string; title: string; banner_url: string | null; starts_at: string | null; note: string | null; enrolled: boolean }[];
};

export type WorkspaceMessage = {
  id: string;
  channel_id: string;
  org_id: string;
  sender_id: string;
  content: string;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  removed_at: string | null;
};

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, (args || {}) as never);
  if (error) throw error;
  return data as T;
}

export const workspaceApi = {
  myTeams: () => call<any[]>("get_my_teams").then((d) => d || []),
  get: (org: string) => call<Workspace>("get_workspace", { p_org: org }),
  people: (org: string) => call<WorkspacePerson[]>("get_workspace_people", { p_org: org }).then((d) => d || []),
  programmes: (org: string) => call<any[]>("get_workspace_programmes", { p_org: org }).then((d) => d || []),
  communities: (org: string) => call<any[]>("get_workspace_communities", { p_org: org }).then((d) => d || []),
  meetings: (org: string) => call<WorkspaceMeeting[]>("get_workspace_meetings", { p_org: org }).then((d) => d || []),
  send: (channel: string, content: string) => call<WorkspaceMessage>("send_workspace_message", { p_channel: channel, p_content: content }),
  remove: (message: string) => call<void>("remove_workspace_message", { p_message: message }),
  markRead: (channel: string) => call<void>("mark_workspace_read", { p_channel: channel }),
  createChannel: (org: string, name: string, topic?: string) => call<WorkspaceChannel>("create_workspace_channel", { p_org: org, p_name: name, p_topic: topic || null }),
  archiveChannel: (channel: string) => call<void>("archive_workspace_channel", { p_channel: channel }),
  saveMeeting: (org: string, m: { title: string; starts_at: string; duration_min: number; location?: string; agenda?: string; id?: string }) =>
    call<WorkspaceMeeting>("save_workspace_meeting", {
      p_org: org,
      p_title: m.title,
      p_starts_at: m.starts_at,
      p_duration: m.duration_min,
      p_location: m.location || null,
      p_agenda: m.agenda || null,
      p_meeting: m.id || null,
    }),
  cancelMeeting: (meeting: string) => call<void>("cancel_workspace_meeting", { p_meeting: meeting }),
  rsvp: (meeting: string, response: "going" | "maybe" | "declined") => call<void>("rsvp_workspace_meeting", { p_meeting: meeting, p_response: response }),
  setRole: (member: string, role: "admin" | "staff" | "member", title?: string | null) =>
    call<void>("set_team_member_role", { p_member: member, p_role: role, p_title: title ?? null }),
  dossier: (org: string, member: string) => call<any>("get_team_member_dossier", { p_org: org, p_member: member }),
  invite: (member: string, title?: string) => call<void>("invite_team_member", { p_member: member, p_title: title || null }),
  removeMember: (org: string, member: string) => call<void>("leave_or_remove_team_member", { p_org: org, p_member: member }),
  respond: (org: string, accept: boolean) => call<void>("respond_team_invite", { p_org: org, p_accept: accept }),
  searchPeople: (q: string) => call<any[]>("search_business_talent", { p_query: q, p_interest: null, p_limit: 20 }).then((d) => d || []),
  messages: async (channel: string, before?: string) => {
    let q = supabase
      .from("workspace_messages" as never)
      .select("*")
      .eq("channel_id", channel)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(60);
    if (before) q = q.lt("created_at", before);
    const { data, error } = await q;
    if (error) throw error;
    return ((data || []) as unknown as WorkspaceMessage[]).reverse();
  },
};

export const ROLE_LABEL = (role: WorkspaceRole, kind: string | null) =>
  role === "owner" ? "Organization" : role === "admin" ? "Admin" : role === "staff" ? (kind === "institutional" ? "Teaching staff" : "Staff") : "Member";

export const staffLabel = (kind: string | null) => (kind === "institutional" ? "Teaching staff" : "Staff");
