export const certificateTemplates = [
  {
    id: "folio",
    name: "The Folio",
    note: "An engraved double frame, a fine seal and a quiet academic centrepiece.",
    color: "#6846c5",
    style: "border",
  },
  {
    id: "cobalt",
    name: "Cobalt Edition",
    note: "A ribbon masthead and formal rules — the classic institutional finish.",
    color: "#243be3",
    style: "ribbon",
  },
  {
    id: "spectrum",
    name: "Creative Spectrum",
    note: "A bold geometric spine with editorial typography for creative work.",
    color: "#eb5939",
    style: "left",
  },
  {
    id: "coral",
    name: "Coral Studio",
    note: "A modern asymmetric rhythm with a colour-blocked right edge.",
    color: "#ee6a65",
    style: "right",
  },
  {
    id: "mosaic",
    name: "Emerald Mosaic",
    note: "Symmetrical panels and a ceremonial centrepiece, suited to cohorts.",
    color: "#268d82",
    style: "both",
  },
  {
    id: "orbit",
    name: "Green Orbit",
    note: "Fine orbital linework around a restrained, contemporary layout.",
    color: "#147b6b",
    style: "orbit",
  },
] as const;

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
  template: string;
  use_brand: boolean;
  brand_name: string;
  brand_logo: string;
  /** Signature line colour for branded certificates. Optional on older designs. */
  brand_accent?: string;
  signature_url: string;
  signer_name: string;
  signer_title: string;
  back_text: string;
};

export const emptyCertificateDesign: CertificateDesign = {
  template: "",
  use_brand: false,
  brand_name: "",
  brand_logo: "",
  brand_accent: "#cc208f",
  signature_url: "",
  signer_name: "",
  signer_title: "Instructor",
  back_text:
    "Awarded in recognition of practical learning, commitment and demonstrated achievement.",
};

export function certificateDesignError(design: CertificateDesign | null) {
  if (!design || !certificateTemplates.some((t) => t.id === design.template))
    return "Choose a certificate template.";
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
  return null;
}

/** Six-digit hex only; anything else falls back so artwork never receives junk. */
export function safeAccent(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
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
