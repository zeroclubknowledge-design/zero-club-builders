import { supabase } from "@/lib/supabase";

export type DistrictKey = "code" | "design" | "story" | "business";
export type QuestRoom = {
  id: string;
  title: string;
  host_id: string;
  invite_code: string;
  status: "lobby" | "active" | "won" | "lost" | "cancelled";
  health: number;
  started_at: string | null;
  expires_at: string;
  finished_at: string | null;
};
export type QuestMember = {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  ready: boolean;
  last_seen: string;
  left_at: string | null;
  contributions: number;
  xp_awarded: number;
  reward_note: string | null;
};
export type QuestMission = {
  id: string;
  district: DistrictKey;
  kind: "challenge" | "brief";
  status: "open" | "review" | "complete";
  prompt: string | null;
  choices: string[] | null;
  hint: string | null;
  author_id: string | null;
  reviewer_id: string | null;
  work: string | null;
  work_url: string | null;
  feedback: string | null;
};
export type QuestMessage = { id: string; profile_id: string; body: string; created_at: string };
export type QuestSnapshot = {
  room: QuestRoom;
  members: QuestMember[];
  missions: QuestMission[];
  messages: QuestMessage[];
  server_now: string;
};
export type QuestHome = {
  rooms: (Pick<QuestRoom, "id" | "title" | "status" | "invite_code" | "expires_at"> & {
    xp_awarded: number;
    contributions: number;
  })[];
  wins: number;
  rewarded_today: number;
  daily_limit: number;
  win_xp: number;
};
export type QuestAction =
  | "create"
  | "join"
  | "ready"
  | "start"
  | "leave"
  | "message"
  | "answer"
  | "submit"
  | "review"
  | "revise";
export type QuestActionResult = {
  room_id: string;
  left: boolean;
  notice?: string;
  correct?: boolean;
};

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export const questHome = () => rpc<QuestHome>("zero_quest_home");
export const questRoom = (room: string) => rpc<QuestSnapshot>("zero_quest_room", { p_room: room });
export const questPing = (room: string) => rpc<void>("zero_quest_ping", { p_room: room });
export const questAction = (
  room: string | undefined,
  action: QuestAction,
  payload: Record<string, unknown>,
  request: string,
) =>
  rpc<QuestActionResult>("zero_quest_action", {
    p_room: room || null,
    p_action: action,
    p_payload: payload,
    p_request: request,
  });

export function questError(error: unknown) {
  const message =
    (error as { message?: string })?.message || "Something went wrong. Please try again.";
  if (/PGRST202|schema cache|function .*zero_quest/i.test(message))
    return "Zero Quest is not available yet. Please try again after the game update.";
  if (/fetch|network/i.test(message))
    return "Connection interrupted. Your city is saved. Try again when you are connected.";
  return message;
}

export const DISTRICTS: {
  key: DistrictKey;
  name: string;
  building: string;
  color: string;
  brief: string;
  checklist: string[];
}[] = [
  {
    key: "code",
    name: "Builder District",
    building: "Innovation Lab",
    color: "#75cfff",
    brief:
      "Plan a reliable signup flow for a community learning app. Write pseudocode or a small code sample covering input validation, duplicate accounts and a useful error response.",
    checklist: [
      "Inputs and validation are clear",
      "Duplicate accounts are handled",
      "The user gets a helpful error",
    ],
  },
  {
    key: "design",
    name: "Design District",
    building: "Design Studio",
    color: "#bd9bff",
    brief:
      "Design a mobile welcome experience for a new learner. Describe three screens, the main action on each, and how someone using a screen reader can navigate them. Add a prototype link if you have one.",
    checklist: [
      "Three screens and their main actions",
      "A clear next step for the learner",
      "An accessibility consideration",
    ],
  },
  {
    key: "story",
    name: "Story District",
    building: "Community Library",
    color: "#ffbca1",
    brief:
      "Write a launch announcement for your squad city. Give it a headline, explain who it helps and why, and end with a clear invitation to participate. Use a tone a new learner can understand.",
    checklist: ["A clear headline and audience", "A concrete benefit", "A call to action"],
  },
  {
    key: "business",
    name: "Strategy District",
    building: "Opportunity Exchange",
    color: "#73e6b1",
    brief:
      "Pitch a small service your city can offer learners. State the problem, your proposed service, one way to test demand, and one metric that would tell you the service helps.",
    checklist: [
      "A specific problem and service",
      "A practical demand test",
      "A useful success metric",
    ],
  },
];
