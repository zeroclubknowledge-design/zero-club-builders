import { supabase } from "@/lib/supabase";

export type TutorApplicationStatus = "pending" | "approved" | "rejected";

export interface TutorApplication {
  id: string;
  profile_id: string;
  status: TutorApplicationStatus;
  headline: string;
  location: string | null;
  experience_years: string | null;
  bio: string | null;
  subjects: string[];
  levels: string[];
  formats: string[];
  teaching_experience: string;
  linkedin_url: string | null;
  portfolio_url: string | null;
  intro_video_url: string | null;
  sample_title: string;
  sample_outline: string;
  availability: string[];
  weekly_hours: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface TutorApplicationDraft {
  headline: string;
  location: string;
  experience_years: string;
  bio: string;
  subjects: string[];
  levels: string[];
  formats: string[];
  teaching_experience: string;
  linkedin_url: string;
  portfolio_url: string;
  intro_video_url: string;
  sample_title: string;
  sample_outline: string;
  availability: string[];
  weekly_hours: string;
  agreed: boolean;
}

export const EMPTY_DRAFT: TutorApplicationDraft = {
  headline: "",
  location: "",
  experience_years: "",
  bio: "",
  subjects: [],
  levels: [],
  formats: [],
  teaching_experience: "",
  linkedin_url: "",
  portfolio_url: "",
  intro_video_url: "",
  sample_title: "",
  sample_outline: "",
  availability: [],
  weekly_hours: "",
  agreed: false,
};

export async function getTutorStatus() {
  const { data, error } = await supabase.rpc("tutor_application_me");
  if (error) throw error;
  return data as { signed_in: boolean; approved?: boolean; application?: TutorApplication | null };
}

export const SUBMIT_REFUSAL: Record<string, string> = {
  headline: "Add a professional headline (at least 8 characters).",
  subjects: "Pick at least one subject you'll teach.",
  experience: "Tell us a bit more about your teaching or industry experience (at least 60 characters).",
  sample: "Give your sample class a title and a short outline (at least 60 characters).",
  proof: "Add your LinkedIn or a portfolio link so the team can verify your work.",
  agreement: "Please accept the Tutor standards to continue.",
  already_pending: "You already have an application in review.",
  already_tutor: "You're already an approved tutor.",
  institution: "Institution accounts publish bootcamps from Institution Studio.",
};

export async function submitTutorApplication(draft: TutorApplicationDraft) {
  const { data, error } = await supabase.rpc("submit_tutor_application", { p: draft });
  if (error) throw error;
  return data as { ok: boolean; reason?: string; id?: string };
}

export type AdminTutorApplication = TutorApplication & {
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  member_since: string;
  profile_bio: string | null;
  posts: number;
  followers: number;
};

export async function adminTutorApplications(status: TutorApplicationStatus | "all") {
  const { data, error } = await supabase.rpc("admin_tutor_applications", { p_status: status });
  if (error) throw error;
  return (data || []) as AdminTutorApplication[];
}

export async function adminReviewTutorApplication(id: string, approve: boolean, note?: string) {
  const { data, error } = await supabase.rpc("admin_review_tutor_application", { p_id: id, p_approve: approve, p_note: note || null });
  if (error) throw error;
  return data as { ok: boolean; reason?: string };
}
