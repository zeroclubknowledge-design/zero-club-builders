import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import {
  MENTION_QUERY_RE,
  MentionList,
  knownUsernames,
  useMentionResults,
  type MentionPerson,
} from "@/components/mentionSearch";

/**
 * "@" tagging for rich (TipTap) editors: posts, notes, club and studio
 * descriptions. Type "@" and a letter and the same people list as every
 * other Zero Club box opens right under the caret; arrows + Enter/Tab or a
 * tap pick someone, Esc closes it. A picked person is inserted as a pink
 * tag (the editor's `mentionMark`, when it has one) followed by a space.
 *
 *   const mentions = useEditorMentions(editor);
 *   …
 *   {mentions.menu}
 */
export function useEditorMentions(
  editor: Editor | null,
  options: {
    people?: MentionPerson[];
    peopleLabel?: string;
    /** Mark for the tag when the editor has no `mentionMark` (notes use "bold"). */
    fallbackMark?: string;
  } = {},
): { menu: ReactNode; open: boolean } {
  const [query, setQuery] = useState<string | null>(null);
  const [from, setFrom] = useState(0);
  const [active, setActive] = useState(0);
  const [, reposition] = useState(0);
  const { sections, flat } = useMentionResults(query, options.people, options.peopleLabel);
  const open = query !== null && flat.length > 0;

  // Read what's being typed before the caret, on every edit and caret move.
  useEffect(() => {
    if (!editor) return;
    const read = () => {
      const selection = editor.state.selection;
      if (!selection.empty || !editor.isFocused) {
        setQuery(null);
        return;
      }
      const $pos = selection.$from;
      const before = $pos.parent.textBetween(Math.max(0, $pos.parentOffset - 42), $pos.parentOffset, undefined, "￼");
      const match = before.match(MENTION_QUERY_RE);
      if (!match) {
        setQuery(null);
        return;
      }
      setFrom(selection.from - match[2].length - 1);
      setQuery((previous) => {
        if (previous !== match[2]) setActive(0);
        return match[2];
      });
    };
    const close = () => window.setTimeout(() => setQuery(null), 150);
    editor.on("update", read);
    editor.on("selectionUpdate", read);
    editor.on("focus", read);
    editor.on("blur", close);
    return () => {
      editor.off("update", read);
      editor.off("selectionUpdate", read);
      editor.off("focus", read);
      editor.off("blur", close);
    };
  }, [editor]);

  const pick = useCallback(
    (person: MentionPerson) => {
      if (!editor) return;
      const to = editor.state.selection.from;
      const markName = editor.schema.marks.mentionMark
        ? "mentionMark"
        : options.fallbackMark && editor.schema.marks[options.fallbackMark]
          ? options.fallbackMark
          : null;
      const tag = `@${person.username}`;
      knownUsernames.add(person.username.toLowerCase());
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent([
          markName ? { type: "text", text: tag, marks: [{ type: markName }] } : { type: "text", text: tag },
          // A plain space after it, so typing carries on outside the tag.
          { type: "text", text: " " },
        ])
        .run();
      setQuery(null);
    },
    [editor, from, options.fallbackMark],
  );

  // Keys go to the list while it's open (capture phase: before the editor's own handling).
  const state = useRef({ open, flat, active, pick });
  state.current = { open, flat, active, pick };
  useEffect(() => {
    const host = editor?.view?.dom?.parentElement;
    if (!host) return;
    const onKey = (event: KeyboardEvent) => {
      const s = state.current;
      if (!s.open || !s.flat.length) return;
      const n = s.flat.length;
      if (event.key === "ArrowDown") setActive((i) => (i + 1) % n);
      else if (event.key === "ArrowUp") setActive((i) => (i - 1 + n) % n);
      else if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") s.pick(s.flat[Math.min(s.active, n - 1)]);
      else if (event.key === "Escape") setQuery(null);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    host.addEventListener("keydown", onKey, true);
    return () => host.removeEventListener("keydown", onKey, true);
  }, [editor]);

  // Follow the caret when the page scrolls or the keyboard resizes the view.
  useEffect(() => {
    if (!open) return;
    const move = () => reposition((n) => n + 1);
    window.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    window.visualViewport?.addEventListener("resize", move);
    window.visualViewport?.addEventListener("scroll", move);
    return () => {
      window.removeEventListener("scroll", move, true);
      window.removeEventListener("resize", move);
      window.visualViewport?.removeEventListener("resize", move);
      window.visualViewport?.removeEventListener("scroll", move);
    };
  }, [open]);

  let menu: ReactNode = null;
  if (open && editor && typeof document !== "undefined") {
    let caret = { left: 16, top: 80, bottom: 100 };
    try {
      caret = editor.view.coordsAtPos(Math.min(from, editor.state.doc.content.size));
    } catch {
      /* position gone mid-edit: keep the fallback */
    }
    const vv = window.visualViewport;
    const viewTop = vv ? vv.offsetTop : 0;
    const viewHeight = vv ? vv.height : window.innerHeight;
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(caret.left - 12, window.innerWidth - width - 8));
    const below = viewTop + viewHeight - caret.bottom - 8;
    const above = caret.top - viewTop - 8;
    // Under the line being typed; above it when the keyboard leaves no room below.
    const placeBelow = below >= 200 || below >= above;
    const style = placeBelow
      ? { top: caret.bottom + 6, left, width, maxHeight: Math.max(140, Math.min(280, below)) }
      : { bottom: window.innerHeight - caret.top + 6, left, width, maxHeight: Math.max(140, Math.min(280, above)) };

    menu = createPortal(
      <div
        role="listbox"
        aria-label="People to tag"
        className="fixed z-[10060] flex flex-col overflow-hidden rounded-xl bg-card text-foreground shadow-[0_18px_44px_-18px_rgba(0,0,0,0.5)] ring-1 ring-border animate-in fade-in zoom-in-95 duration-150"
        style={style}
      >
        <MentionList sections={sections} active={active} onPick={pick} onHover={setActive} />
      </div>,
      document.body,
    );
  }

  return { menu, open };
}
