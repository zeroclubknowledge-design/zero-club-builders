/**
 * What Zero Store sells.
 *
 * The old list was seven flat words — Template, E-book, Design kit, Code,
 * Course asset, Audio, Other — which is a filter, not a shop. It could not
 * tell a prompt pack from a Figma file, and it had nowhere at all to put the
 * thing people most want to buy from each other right now: access to paid AI
 * tools.
 *
 * So categories are two levels. The top level is broad enough to browse and
 * small enough to fit across a phone; the second is specific enough that a
 * listing describes itself before anyone opens it. A seller picks a group and
 * then a type, which is faster than scrolling one long list and produces far
 * better filtering than free text ever did.
 */

export type StoreCategory = {
  id: string;
  label: string;
  /** Shown on the browse row. Kept to one word where possible. */
  short: string;
  blurb: string;
  types: string[];
};

export const STORE_CATEGORIES: StoreCategory[] = [
  {
    id: "templates",
    label: "Templates",
    short: "Templates",
    blurb: "Start from something that already works",
    types: [
      "Prompt pack",
      "Website template",
      "Web design (Figma)",
      "Flyer & poster design",
      "Social media kit",
      "Notion template",
      "Pitch deck",
      "Spreadsheet & tracker",
      "Resume & portfolio",
    ],
  },
  {
    id: "ai-tools",
    label: "AI tools & access",
    short: "AI tools",
    blurb: "Subscriptions, seats and model access",
    types: [
      "ChatGPT",
      "Claude",
      "Gemini AI Pro",
      "OpenAI model access",
      "Lovable",
      "Higgsfield",
      "Midjourney",
      "Perplexity",
      "Cursor",
      "Other AI tool",
    ],
  },
  {
    id: "ebooks",
    label: "Ebooks & guides",
    short: "Ebooks",
    blurb: "Written down so you do not have to work it out",
    types: ["Ebook", "Playbook", "Checklist", "Case study", "Newsletter archive"],
  },
  {
    id: "code",
    label: "Code & scripts",
    short: "Code",
    blurb: "Things that run",
    types: [
      "Starter kit",
      "Component library",
      "Automation script",
      "API & integration",
      "Bot",
      "Plugin & extension",
    ],
  },
  {
    id: "design",
    label: "Design assets",
    short: "Design",
    blurb: "Pieces to build with",
    types: ["Icon set", "Illustration pack", "Font", "Mockup", "Photo pack", "Video LUT & preset"],
  },
  {
    id: "audio",
    label: "Audio",
    short: "Audio",
    blurb: "Sound you can license",
    types: ["Beat", "Sound effects", "Sample pack", "Voice-over", "Podcast intro"],
  },
  {
    id: "learning",
    label: "Courses & coaching",
    short: "Learning",
    blurb: "Someone taking you through it",
    types: ["Mini course", "Workshop recording", "1:1 session", "Portfolio review", "Mentorship"],
  },
  {
    id: "services",
    label: "Services",
    short: "Services",
    blurb: "Work done for you",
    types: ["Design work", "Development work", "Writing & editing", "Audit & feedback", "Setup & migration"],
  },
  {
    id: "other",
    label: "Something else",
    short: "Other",
    blurb: "Everything that does not fit a box",
    types: ["Other"],
  },
];

export const CATEGORY_BY_ID = new Map(STORE_CATEGORIES.map((entry) => [entry.id, entry]));

/**
 * Listings created before this catalogue existed hold one of the old seven
 * words. They are read into the closest group rather than migrated, so nobody
 * has to reopen a listing they already published for it to appear in the right
 * place. Anything unrecognised falls to "other", which is honest — better than
 * a wrong category that looks deliberate.
 */
const LEGACY: Record<string, string> = {
  template: "templates",
  templates: "templates",
  "e-book": "ebooks",
  ebook: "ebooks",
  "design kit": "design",
  design: "design",
  code: "code",
  "course asset": "learning",
  course: "learning",
  audio: "audio",
  other: "other",
};

export function categoryIdFor(rawCategory?: string | null): string {
  const raw = String(rawCategory || "").trim();
  if (!raw) return "other";

  const lower = raw.toLowerCase();
  if (CATEGORY_BY_ID.has(lower)) return lower;
  if (LEGACY[lower]) return LEGACY[lower];

  // A stored value may be a *type* rather than a group, e.g. "Prompt pack".
  const owner = STORE_CATEGORIES.find((entry) =>
    entry.types.some((type) => type.toLowerCase() === lower),
  );
  return owner?.id || "other";
}

export function categoryLabelFor(rawCategory?: string | null): string {
  return CATEGORY_BY_ID.get(categoryIdFor(rawCategory))?.label || "Something else";
}

/**
 * What the seller typed, when it is more specific than the group.
 * A card showing "Prompt pack" says more than one showing "Templates".
 */
export function typeLabelFor(rawCategory?: string | null, rawType?: string | null): string {
  const type = String(rawType || "").trim();
  if (type) return type;

  const raw = String(rawCategory || "").trim();
  const isGroup = CATEGORY_BY_ID.has(raw.toLowerCase()) || Boolean(LEGACY[raw.toLowerCase()]);
  return isGroup ? categoryLabelFor(raw) : raw || "Product";
}
