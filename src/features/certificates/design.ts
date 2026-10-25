export const certificateTemplates = [
  {
    id: "folio",
    name: "The Folio",
    note: "Ivory paper, engraved gold rules and classical serif lettering. A formal academic finish.",
    color: "#956e36",
    style: "border",
    pro: false,
    signatures: 1,
  },
  {
    id: "cobalt",
    name: "Cobalt Edition",
    note: "Architectural navy details and a crisp institutional layout, with a matching credential record.",
    color: "#294b9b",
    style: "ribbon",
    pro: false,
    signatures: 1,
  },
  {
    id: "spectrum",
    name: "Creative Spectrum",
    note: "An editorial composition with a charcoal spine, bronze linework and generous white space.",
    color: "#a45e35",
    style: "left",
    pro: false,
    signatures: 1,
  },
  {
    id: "coral",
    name: "Coral Studio",
    note: "Warm porcelain, sculpted terracotta curves and a refined contemporary signature.",
    color: "#a65448",
    style: "right",
    pro: false,
    signatures: 1,
  },
  {
    id: "mosaic",
    name: "Emerald Mosaic",
    note: "Fine emerald marquetry, balanced ceremonial typography and a detailed completion seal.",
    color: "#346451",
    style: "both",
    pro: false,
    signatures: 1,
  },
  {
    id: "orbit",
    name: "Green Orbit",
    note: "Technical linework in midnight teal, precise typography and a clean verification record.",
    color: "#1b7077",
    style: "orbit",
    pro: false,
    signatures: 1,
  },
  /* ── PRO collection ─────────────────────────────────────────────────── */
  {
    id: "vivid",
    name: "Vivid Band",
    note: "A bold side band with a vertical wordmark, framed learner name, two signatures and a dated seal.",
    color: "#cc208f",
    style: "band",
    pro: true,
    signatures: 2,
  },
  {
    id: "achieve",
    name: "Achievement",
    note: "A patterned header, the learner's name in flowing script, a medal and two signatures.",
    color: "#cc208f",
    style: "header",
    pro: true,
    signatures: 2,
  },
  {
    id: "collective",
    name: "Creative Collective",
    note: "Full-colour contour lines, a floating logo card and a ribbon medal.",
    color: "#cc208f",
    style: "full",
    pro: true,
    signatures: 1,
  },
  {
    id: "aurora",
    name: "Aurora",
    note: "A glowing gradient, stacked arches and a starburst for creative programmes.",
    color: "#cc208f",
    style: "gradient",
    pro: true,
    signatures: 1,
  },
  {
    id: "union",
    name: "Union",
    note: "Confident type, sweeping curves, the issue date up top and two signatures.",
    color: "#cc208f",
    style: "curves",
    pro: true,
    signatures: 2,
  },
] as const;

export type CertificateTemplate = (typeof certificateTemplates)[number];
export const templateById = (id?: string) => certificateTemplates.find((t) => t.id === id);
/** True for designs that carry a second signature (the co-signer assigned to the bootcamp). */
export const needsCosigner = (id?: string) => (templateById(id)?.signatures ?? 1) > 1;

/** Brand colours offered in the studio. Any valid six-digit hex also works. */
export const certificateAccents = [
  "#cc208f",
  "#243be3",
  "#0f6b52",
  "#6846c5",
  "#c8451f",
  "#b8860b",
  "#0f172a",
  "#268d82",
] as const;

export type CertificateDesign = {
  /** Artwork edition saved with the design. */
  artwork_version?: 2;
  template: string;
  use_brand: boolean;
  brand_name: string;
  brand_logo: string;
  /** Signature line colour for branded certificates. Optional on older designs. */
  brand_accent?: string;
  /** How large the brand logo prints, 1 (default) to 2. Optional on older designs. */
  brand_logo_scale?: number;
  signature_url: string;
  signer_name: string;
  signer_title: string;
  back_text: string;
  appearance?: CertificateAppearance;
  /**
   * The second signatory on two-signature designs. The bootcamp creator picks
   * the person; they sign from their own account, and `signature_url` is only
   * filled in on issued certificates (and in their own signing preview).
   */
  cosigner?: CertificateCosigner | null;
};

export type CertificateCosigner = {
  profile_id?: string;
  username?: string;
  name: string;
  title: string;
  signature_url?: string;
  signed_at?: string;
};

export const emptyCertificateDesign: CertificateDesign = {
  artwork_version: 2,
  template: "",
  use_brand: false,
  brand_name: "",
  brand_logo: "",
  brand_accent: "#cc208f",
  brand_logo_scale: 1,
  signature_url: "",
  signer_name: "",
  signer_title: "Instructor",
  back_text:
    "Awarded in recognition of practical learning, commitment and demonstrated achievement.",
};

export function certificateDesignError(design: CertificateDesign | null, options: { forDefaults?: boolean } = {}) {
  if (!design || !certificateTemplates.some((t) => t.id === design.template))
    return "Choose a certificate template.";
  if (needsCosigner(design.template) && !options.forDefaults) {
    if (!design.cosigner?.profile_id) return "Choose the second signatory for this certificate.";
    if (!design.cosigner.name?.trim()) return "Add the second signatory's name.";
  }
  if (!design.signature_url) return "Draw your signature or upload a transparent PNG signature.";
  if (!design.signer_name.trim()) return "Add the name of the person signing the certificate.";
  if (design.use_brand && (!design.brand_logo || !design.brand_name.trim()))
    return "Add your brand name and logo to use your own branding.";
  if (
    design.use_brand &&
    design.brand_accent &&
    !/^#[0-9a-f]{6}$/i.test(design.brand_accent.trim())
  )
    return "Choose a valid brand colour.";
  return certificateAppearanceError(design.appearance);
}

export const certificateFonts = {
  arial: { label: "Modern · Arial", family: "Arial, Helvetica, sans-serif" },
  georgia: { label: "Classic · Georgia", family: "Georgia, 'Times New Roman', serif" },
  times: { label: "Formal · Times", family: "'Times New Roman', Times, serif" },
  trebuchet: { label: "Contemporary · Trebuchet", family: "'Trebuchet MS', Arial, sans-serif" },
  montserrat: { label: "Geometric · Montserrat", family: "Montserrat, Arial, Helvetica, sans-serif" },
  script: { label: "Script · Great Vibes", family: "'Great Vibes', 'Brush Script MT', cursive" },
} as const;
export type CertificateFont = keyof typeof certificateFonts;
export type CertificateAppearance = {
  background_color?: string; back_background_color?: string;
  text_color?: string; secondary_text_color?: string; title_color?: string;
  recipient_color?: string; course_color?: string; accent_color?: string;
  border_color?: string; panel_color?: string; panel_text_color?: string;
  signature_background_color?: string;
  body_font?: CertificateFont; heading_font?: CertificateFont; recipient_font?: CertificateFont;
  title_size?: number; recipient_size?: number; course_size?: number;
  alignment?: "template" | "left" | "center";
  show_ornaments?: boolean; show_seal?: boolean; show_texture?: boolean;
  heading?: string; recipient_label?: string; completion_text?: string; recognition_text?: string;
};
export type CertificatePalette = { paper: string; ink: string; muted: string; accent: string; deep: string; metal: string };
export const certificatePalettes: Record<string, CertificatePalette> = {
  folio: { paper: "#fcf9f2", ink: "#282b31", muted: "#727067", accent: "#956e36", deep: "#273338", metal: "#b69862" },
  cobalt: { paper: "#ffffff", ink: "#14263e", muted: "#637082", accent: "#294b9b", deep: "#14263e", metal: "#a1b5d5" },
  spectrum: { paper: "#faf8f4", ink: "#282624", muted: "#77716a", accent: "#a45e35", deep: "#312e2a", metal: "#ba956e" },
  coral: { paper: "#fffaf6", ink: "#422e2d", muted: "#897370", accent: "#a65448", deep: "#643c37", metal: "#c49a82" },
  mosaic: { paper: "#fcfcf7", ink: "#203d36", muted: "#65766c", accent: "#346451", deep: "#173f34", metal: "#b3a272" },
  orbit: { paper: "#f8fbfc", ink: "#15343f", muted: "#60757d", accent: "#1b7077", deep: "#112f3b", metal: "#79b2b7" },
  vivid: { paper: "#ffffff", ink: "#1f1f22", muted: "#4a4a50", accent: "#cc208f", deep: "#cc208f", metal: "#ffc800" },
  achieve: { paper: "#ffffff", ink: "#151515", muted: "#3a3a3a", accent: "#cc208f", deep: "#cc208f", metal: "#ffc800" },
  collective: { paper: "#cc208f", ink: "#ffffff", muted: "#fde4f3", accent: "#ffc800", deep: "#ffffff", metal: "#e65bbb" },
  aurora: { paper: "#cc208f", ink: "#ffffff", muted: "#ffe6f4", accent: "#ffc800", deep: "#f28c38", metal: "#f2a623" },
  union: { paper: "#cc208f", ink: "#ffffff", muted: "#ffe6f4", accent: "#ffc800", deep: "#ffffff", metal: "#ffc800" },
};
export const certificateColorLabels = {
  background_color: "Front background", back_background_color: "Back background",
  text_color: "Main text", secondary_text_color: "Supporting text", title_color: "Certificate heading",
  recipient_color: "Learner name", course_color: "Programme title", accent_color: "Accent",
  border_color: "Borders and linework", panel_color: "Decorative panels", panel_text_color: "Panel text",
  signature_background_color: "Signature backing",
} as const;
export function certificatePalette(design: CertificateDesign, side: "front" | "back" = "front"): CertificatePalette {
  const base = certificatePalettes[design.template] || certificatePalettes.folio;
  const a = design.appearance || {};
  return {
    paper: safeAccent(side === "back" ? a.back_background_color || a.background_color : a.background_color, base.paper),
    ink: safeAccent(a.text_color, base.ink), muted: safeAccent(a.secondary_text_color, base.muted),
    accent: safeAccent(a.accent_color, design.use_brand ? safeAccent(design.brand_accent, "#cc208f") : base.accent),
    deep: safeAccent(a.panel_color, base.deep), metal: safeAccent(a.border_color, base.metal),
  };
}
export function certificateAppearanceError(appearance?: CertificateAppearance) {
  if (!appearance) return null;
  if (typeof appearance !== "object" || Array.isArray(appearance)) return "Choose valid certificate appearance settings.";
  for (const [key,label] of Object.entries(certificateColorLabels)) {
    const value = appearance[key as keyof typeof certificateColorLabels];
    if (value !== undefined && value !== "" && (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value.trim()))) return `Choose a valid six-digit hex colour for ${label.toLowerCase()}.`;
  }
  for (const key of ["body_font", "heading_font", "recipient_font"] as const)
    if (appearance[key] !== undefined && !Object.hasOwn(certificateFonts,appearance[key]!)) return "Choose one of the certificate fonts.";
  for (const [key,min,max] of [["title_size",28,48],["recipient_size",24,50],["course_size",14,24]] as const)
    if (appearance[key] !== undefined && (!Number.isFinite(appearance[key]) || appearance[key]! < min || appearance[key]! > max)) return "Choose a text size within the displayed range.";
  if (appearance.alignment && !["template","left","center"].includes(appearance.alignment)) return "Choose a valid text alignment.";
  for (const key of ["show_seal","show_texture","show_ornaments"] as const)
    if (appearance[key] !== undefined && typeof appearance[key] !== "boolean") return "Choose valid decoration options.";
  for (const key of ["heading","recipient_label","completion_text","recognition_text"] as const)
    if (appearance[key] !== undefined && (typeof appearance[key] !== "string" || appearance[key]!.length > 120)) return "Keep each certificate text line within 120 characters.";
  return null;
}
export function certificateFont(value: CertificateFont | undefined, fallback: string) {
  return value && Object.hasOwn(certificateFonts,value) ? certificateFonts[value].family : fallback;
}

export const LOGO_SCALE_MIN = 1;
export const LOGO_SCALE_MAX = 2;

/** The brand logo's size multiplier, clamped so it never pushes into the text. */
export function logoScale(design: Pick<CertificateDesign, "use_brand" | "brand_logo_scale">) {
  if (!design.use_brand) return 1;
  const s = Number(design.brand_logo_scale);
  return Number.isFinite(s) ? Math.min(LOGO_SCALE_MAX, Math.max(LOGO_SCALE_MIN, s)) : 1;
}

/** Six-digit hex only; anything else falls back so artwork never receives junk. */
export function safeAccent(value: string | undefined, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

/**
 * White or near-black, whichever reads on the given colour.
 * Relative luminance, so a gold or mint brand stays legible instead of
 * inheriting white text that disappears into the paper.
 */
export function readableOn(hex: string) {
  const value = safeAccent(hex, "#cc208f").slice(1);
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.52 ? "#17181b" : "#ffffff";
}
