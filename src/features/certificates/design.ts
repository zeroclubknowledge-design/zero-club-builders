export const certificateTemplates = [
  {
    id: "folio",
    name: "The Folio",
    note: "A quiet double border and an academic seal.",
    color: "#6846c5",
    style: "border",
  },
  {
    id: "cobalt",
    name: "Cobalt Edition",
    note: "Bold typography, a blue ribbon and a full-colour reverse.",
    color: "#243be3",
    style: "ribbon",
  },
  {
    id: "spectrum",
    name: "Creative Spectrum",
    note: "A playful geometric strip for creative achievements.",
    color: "#eb5939",
    style: "left",
  },
  {
    id: "coral",
    name: "Coral Studio",
    note: "Warm geometry and a generous, open layout.",
    color: "#ee6a65",
    style: "right",
  },
  {
    id: "mosaic",
    name: "Emerald Mosaic",
    note: "Balanced teal panels and a formal centrepiece.",
    color: "#268d82",
    style: "both",
  },
  {
    id: "orbit",
    name: "Green Orbit",
    note: "Fresh green arcs with a bright contemporary accent.",
    color: "#147b6b",
    style: "orbit",
  },
] as const;
export type CertificateDesign = {
  template: string;
  use_brand: boolean;
  brand_name: string;
  brand_logo: string;
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
  return null;
}
