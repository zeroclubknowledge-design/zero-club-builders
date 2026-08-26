import { Extension } from "@tiptap/react";

/**
 * Highlighting, without a new dependency.
 *
 * @tiptap/extension-highlight would be the obvious answer, and it will not
 * install against the versions this project pins. It is also a whole package
 * for one attribute: highlight is a background colour on a span, and TextStyle
 * already owns that span — the Color extension works exactly this way, it just
 * happens to set `color` instead.
 *
 * So this adds `backgroundColor` to the same span. One file, no install, and
 * text that is both coloured and highlighted stays a single span rather than
 * two nested ones.
 */
export const Highlighter = Extension.create({
  name: "highlighter",

  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (element) => element.style.backgroundColor?.replace(/["']/g, "") || null,
            renderHTML: (attributes) => {
              if (!attributes.backgroundColor) return {};
              return {
                style: `background-color: ${attributes.backgroundColor}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setHighlight:
        (color: string) =>
        ({ chain }: any) =>
          chain().setMark("textStyle", { backgroundColor: color }).run(),

      unsetHighlight:
        () =>
        ({ chain }: any) =>
          chain().setMark("textStyle", { backgroundColor: null }).removeEmptyTextStyle().run(),
    } as any;
  },
});

/**
 * Ink colours for long-form writing.
 *
 * The old set was the Tailwind 500 ramp — twelve fully saturated hues plus pure
 * white and pure black. On a page of serif body text those read as marker pen:
 * #22c55e against #f8f7f5 is a highlighter, not an editorial choice, and pure
 * black is heavier than the body colour it sits amongst.
 *
 * These are darkened and desaturated to sit alongside prose, and each one is
 * legible on both the light page and the dark one — a note written in one
 * theme is read in the other.
 */
export const NOTE_TEXT_COLORS: { name: string; value: string }[] = [
  { name: "Default", value: "" },
  { name: "Brand", value: "#cc208f" },
  { name: "Crimson", value: "#c0392b" },
  { name: "Amber", value: "#a86a12" },
  { name: "Forest", value: "#2f7a4f" },
  { name: "Ocean", value: "#1f6f8b" },
  { name: "Indigo", value: "#4b4fa8" },
  { name: "Plum", value: "#7d3c73" },
  { name: "Slate", value: "#5b6470" },
];

/**
 * Highlights are the opposite problem: they have to be pale enough that the
 * text on top of them stays readable, which the 500 ramp never is.
 */
export const NOTE_HIGHLIGHTS: { name: string; value: string }[] = [
  { name: "None", value: "" },
  { name: "Butter", value: "#fdf0b8" },
  { name: "Mint", value: "#c9f0d8" },
  { name: "Sky", value: "#cfe6f7" },
  { name: "Lilac", value: "#e2d9f7" },
  { name: "Rose", value: "#fbd9e6" },
  { name: "Sand", value: "#ece3d4" },
];
