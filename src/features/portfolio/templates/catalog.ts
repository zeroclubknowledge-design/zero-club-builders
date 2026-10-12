import type { PortfolioTemplate } from "../types";

/** What the template picker shows. `swatch` paints the little preview tile. */
export const TEMPLATE_CATALOG: {
  id: PortfolioTemplate;
  name: string;
  blurb: string;
  premium: boolean;
  swatch: { bg: string; fg: string; light: boolean };
}[] = [
  {
    id: "minimal",
    name: "Zero Minimal",
    blurb: "Dark, quiet, work first",
    premium: false,
    swatch: { bg: "#0a0a0b", fg: "#fafafa", light: false },
  },
  {
    id: "signal",
    name: "Signal",
    blurb: "Profile card + bento. For builders",
    premium: true,
    swatch: { bg: "#0a0b0a", fg: "#f4f5f4", light: false },
  },
  {
    id: "spotlight",
    name: "Spotlight",
    blurb: "Cinematic, editorial, big name",
    premium: true,
    swatch: { bg: "#000000", fg: "#ffffff", light: false },
  },
  {
    id: "statement",
    name: "Statement",
    blurb: "Oversized type, visual work",
    premium: true,
    swatch: { bg: "#0e0e0e", fg: "#f2f2f2", light: false },
  },
  {
    id: "bright",
    name: "Bright",
    blurb: "Light and friendly. Great first portfolio",
    premium: true,
    swatch: { bg: "#faf9f6", fg: "#111111", light: true },
  },
  {
    id: "gallery",
    name: "Gallery",
    blurb: "Image wall for artists & photographers",
    premium: true,
    swatch: { bg: "#f7f6f3", fg: "#121212", light: true },
  },
];
