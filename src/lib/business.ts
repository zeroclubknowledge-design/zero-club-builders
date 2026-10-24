/**
 * Business accounts: organizations on Zero Club.
 *
 * A business account belongs to an organization, not a person. Like a person
 * switching Learner · Tutor · Creator, an organization switches between two
 * modes:
 *   - Institutional: a tech hub. Runs the Digital Hub (bootcamps, tutors,
 *     learners). Opens once Zero Club approves the hub application.
 *   - Company: a company or business owner. Hires talent, sponsors
 *     challenges, trains its team and runs a company page.
 *
 * The mode is stored as business_mode, and account_type follows it
 * ('Institution' or 'Business') so everything that already reads
 * account_type keeps working.
 */
import { supabase } from "@/lib/supabase";

export type BusinessMode = "institutional" | "company";

export const BUSINESS_MODES: Record<BusinessMode, { label: string; short: string; blurb: string; home: string }> = {
  institutional: {
    label: "Institutional",
    short: "Institution",
    blurb: "Run a tech hub: bootcamps, tutors and learner outcomes.",
    home: "/app/institution-studio",
  },
  company: {
    label: "Company",
    short: "Company",
    blurb: "Hire builders, sponsor challenges, train your team and grow your page.",
    home: "/app/business",
  },
};

export const BUSINESS_MODE_ORDER: BusinessMode[] = ["company", "institutional"];

export function isBusiness(profile: any) {
  return profile?.account_kind === "business";
}

export function businessModeOf(profile: any): BusinessMode | null {
  if (!isBusiness(profile)) return null;
  return profile.business_mode === "institutional" ? "institutional" : "company";
}

/** Brand-new business accounts set up their organization once. */
export function needsBusinessOnboarding(profile: any) {
  return isBusiness(profile) && "business_onboarded_at" in profile && !profile.business_onboarded_at;
}

export class InstitutionNotApprovedError extends Error {
  constructor() {
    super("Institutional mode opens once Zero Club approves your Digital Hub application.");
    this.name = "InstitutionNotApprovedError";
  }
}

export async function switchBusinessMode(mode: BusinessMode) {
  const { error } = await supabase.rpc("set_business_mode" as never, { new_mode: mode } as never);
  if (!error) return;
  if (/INSTITUTION_NOT_APPROVED/.test(error.message || "")) throw new InstitutionNotApprovedError();
  throw error;
}

export const BUSINESS_INDUSTRIES = [
  "Technology",
  "Education",
  "Finance & Fintech",
  "Media & Creative",
  "Retail & E-commerce",
  "Health",
  "Agriculture",
  "Logistics",
  "Energy",
  "Real Estate",
  "Hospitality",
  "Consulting",
  "Non-profit",
  "Government",
  "Other",
];

export const BUSINESS_SIZES = ["Just me", "2–10", "11–50", "51–200", "201–1,000", "1,000+"];

export const BUSINESS_GOALS: Record<BusinessMode, { key: string; label: string }[]> = {
  company: [
    { key: "hire", label: "Hire builders" },
    { key: "gigs", label: "Post gigs & projects" },
    { key: "sponsor", label: "Sponsor challenges" },
    { key: "reach", label: "Reach learners" },
    { key: "train", label: "Train my team" },
    { key: "brand", label: "Grow our brand" },
  ],
  institutional: [
    { key: "bootcamps", label: "Run bootcamps" },
    { key: "tutors", label: "Manage tutors" },
    { key: "cohorts", label: "Track bootcamps" },
    { key: "admissions", label: "Take admissions" },
    { key: "outcomes", label: "Show outcomes" },
    { key: "hire", label: "Place graduates" },
  ],
};

export type BusinessProfile = {
  profile_id: string;
  org_name: string;
  org_kind: BusinessMode;
  industry: string | null;
  size: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  tagline: string | null;
  about: string | null;
  founded_year: number | null;
  contact_email: string | null;
  contact_phone: string | null;
  goals: string[];
  hiring: boolean;
};

export async function saveBusinessProfile(payload: Record<string, unknown>, finishOnboarding = false) {
  const { data, error } = await supabase.rpc("save_business_profile" as never, { payload, p_finish_onboarding: finishOnboarding } as never);
  if (error) throw error;
  return data as unknown as BusinessProfile;
}

export const prettyUrl = (url?: string | null) => (url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
export const externalHref = (url?: string | null) => (!url ? "" : /^https?:\/\//i.test(url) ? url : `https://${url}`);
