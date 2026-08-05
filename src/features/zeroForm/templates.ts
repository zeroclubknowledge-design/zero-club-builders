/**
 * Zero Form templates and shared helpers.
 *
 * Zero Form is a bootcamp pre-registration system, not a general survey tool —
 * templates stay deliberately short (spec section 32).
 */

export type ZeroFormFieldType = "text" | "email" | "phone" | "number" | "textarea" | "select" | "country";

export type ZeroFormField = {
  field_key: string;
  field_type: ZeroFormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  position: number;
  options?: string[];
};

export type ZeroFormTemplate = {
  id: string;
  name: string;
  description: string;
  fields: ZeroFormField[];
};

const EXPERIENCE_OPTIONS = ["Complete beginner", "Some experience", "Intermediate", "Advanced"];

const field = (
  key: string,
  label: string,
  type: ZeroFormFieldType,
  position: number,
  required = false,
  placeholder?: string,
  options?: string[],
): ZeroFormField => ({
  field_key: key,
  label,
  field_type: type,
  position,
  required,
  placeholder,
  options,
});

export const ZERO_FORM_TEMPLATES: ZeroFormTemplate[] = [
  {
    id: "standard",
    name: "Standard registration",
    description: "The essentials for any bootcamp — name, contact details and experience.",
    fields: [
      field("full_name", "Full name", "text", 0, true, "Ada Obi"),
      field("email", "Email", "email", 1, true, "you@email.com"),
      field("phone", "Phone number", "phone", 2, true, "+234 800 000 0000"),
      field("country", "Country", "country", 3, true, "Nigeria"),
      field("experience_level", "Experience level", "select", 4, true, undefined, EXPERIENCE_OPTIONS),
    ],
  },
  {
    id: "professional",
    name: "Professional bootcamp",
    description: "For working professionals — adds occupation and learning goals.",
    fields: [
      field("full_name", "Full name", "text", 0, true, "Ada Obi"),
      field("email", "Email", "email", 1, true, "you@email.com"),
      field("phone", "Phone number", "phone", 2, true, "+234 800 000 0000"),
      field("occupation", "Occupation", "text", 3, true, "Product designer"),
      field("experience_level", "Experience level", "select", 4, true, undefined, EXPERIENCE_OPTIONS),
      field("learning_goal", "What do you want to learn?", "textarea", 5, false, "Tell us what success looks like for you"),
    ],
  },
  {
    id: "student",
    name: "Student bootcamp",
    description: "For school and university cohorts — captures school and level.",
    fields: [
      field("full_name", "Full name", "text", 0, true, "Ada Obi"),
      field("email", "Email", "email", 1, true, "you@email.com"),
      field("phone", "Phone number", "phone", 2, true, "+234 800 000 0000"),
      field("school", "School", "text", 3, true, "University of Lagos"),
      field("level", "Level or class", "text", 4, true, "300 level"),
      field("experience_level", "Experience level", "select", 5, true, undefined, EXPERIENCE_OPTIONS),
    ],
  },
  {
    id: "custom",
    name: "Custom",
    description: "Start with the basics and add your own questions.",
    fields: [
      field("full_name", "Full name", "text", 0, true, "Ada Obi"),
      field("email", "Email", "email", 1, true, "you@email.com"),
      field("phone", "Phone number", "phone", 2, true, "+234 800 000 0000"),
    ],
  },
];

export const getTemplate = (id: string) =>
  ZERO_FORM_TEMPLATES.find((template) => template.id === id) || ZERO_FORM_TEMPLATES[0];

/** Percentage saved by registering early, rounded for display. */
export const earlyBirdSaving = (regular: number, early: number) => {
  const r = Number(regular) || 0;
  const e = Number(early) || 0;
  if (r <= 0 || e >= r) return 0;
  return Math.round(((r - e) / r) * 100);
};

/** Human-friendly label for the server-reported form state. */
export const ZERO_FORM_STATE_LABEL: Record<string, string> = {
  draft: "Draft",
  open: "Registration open",
  deadline_passed: "Registration closed",
  closed: "Closed",
  full: "Fully booked",
  bootcamp_started: "Bootcamp live",
};

export const formatCountdown = (iso?: string | null) => {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return "Started";
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const minutes = Math.max(1, Math.floor(diff / 60000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
};

export const zeroFormUrl = (slug: string) => {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.zeroclubs.xyz";
  return `${origin}/form/${slug}`;
};
