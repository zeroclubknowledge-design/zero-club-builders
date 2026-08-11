/**
 * Zero Form templates and shared helpers.
 *
 * Zero Form is a bootcamp pre-registration system, not a general survey tool —
 * templates stay deliberately short (spec section 32).
 */

export type ZeroFormFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "textarea"
  | "select"
  | "country"
  | "multiple_choice"
  | "checkboxes"
  | "yes_no"
  | "file_upload";

/** Private bucket. Attachments are read through short-lived signed URLs. */
export const ZERO_FORM_UPLOAD_BUCKET = "zero-form-uploads";

/** Mirrors the storage bucket's own limit, so the browser can reject early. */
export const ZERO_FORM_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Kept in step with allowed_mime_types on the bucket. */
export const ZERO_FORM_ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export const ZERO_FORM_UPLOAD_ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp";

/** What a file_upload question stores in registration_data. */
export type ZeroFormUploadAnswer = {
  path: string;
  name: string;
  size: number;
};

export const isUploadAnswer = (value: unknown): value is ZeroFormUploadAnswer =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as any).path === "string" &&
  typeof (value as any).name === "string";

/** Human-readable file size for the upload control and the responses list. */
export const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * The question types a builder can choose, in the order they appear in the
 * picker. Labels are what people actually call these, not the internal names:
 * "text" is a short answer, "textarea" is a long answer, "select" is a
 * dropdown. Renaming the stored values would break every existing form, so the
 * translation lives here instead.
 */
export const ZERO_FORM_FIELD_TYPES: {
  value: ZeroFormFieldType;
  label: string;
  hint: string;
}[] = [
  { value: "text", label: "Short answer", hint: "A single line of text" },
  { value: "textarea", label: "Long answer", hint: "A paragraph" },
  { value: "multiple_choice", label: "Multiple choice", hint: "Pick one from a list" },
  { value: "checkboxes", label: "Checkboxes", hint: "Pick any number" },
  { value: "select", label: "Dropdown", hint: "Pick one, collapsed" },
  { value: "yes_no", label: "Yes / No", hint: "A two-way answer" },
  { value: "email", label: "Email", hint: "Validated email address" },
  { value: "phone", label: "Phone", hint: "Opens a numeric keypad" },
  { value: "number", label: "Number", hint: "Digits only" },
  { value: "country", label: "Country", hint: "Country name" },
  { value: "file_upload", label: "File upload", hint: "PDF, Word or image, up to 10 MB" },
];

/** Types whose answers come from a list the builder writes. */
export const CHOICE_FIELD_TYPES: ZeroFormFieldType[] = [
  "select",
  "multiple_choice",
  "checkboxes",
];

export const isChoiceField = (type: ZeroFormFieldType) => CHOICE_FIELD_TYPES.includes(type);

/** Checkboxes are the only type that stores more than one answer. */
export const isMultiValueField = (type: ZeroFormFieldType) => type === "checkboxes";

/**
 * Renders a stored answer for display in the responses table and CSV export.
 * Multi-value answers arrive as arrays and read best comma-separated: it opens
 * cleanly in Excel and Google Sheets, unlike a raw JSON array.
 */
export const formatAnswer = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  // A file answer is an object. Show the filename people recognise, never the
  // storage path, which is meaningless to a reader and leaks internal layout.
  if (isUploadAnswer(value)) return value.name;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

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
