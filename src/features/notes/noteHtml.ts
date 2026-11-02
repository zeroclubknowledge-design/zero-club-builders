/** Repair paragraph fragments left when a text block is split around media. */
export function normalizeNoteHtml(content = ""): string {
  let openParagraphs = 0;
  return content
    .replace(/(?:&lt;|&#0*60;)\s*(\/?)\s*p\s*(?:&gt;|&#0*62;)/gi, "<$1p>")
    .replace(/<\/?p\b[^>]*>/gi, tag => {
      if (/^<\//.test(tag)) {
        if (!openParagraphs) return "";
        openParagraphs--;
      } else openParagraphs++;
      return tag;
    })
    .replace(/<p\b[^>]*>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/p>/gi, "")
    .trim();
}
