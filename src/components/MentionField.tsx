import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  MENTION_QUERY_RE,
  MentionList,
  knownUsernames,
  useMentionResults,
  type MentionPerson,
} from "@/components/mentionSearch";

export type { MentionPerson };

/**
 * A text box that understands @username tags.
 *
 * - Type "@" and a list of people appears, narrowing as you type. People from
 *   the place you're in (club members, the person you're chatting with, the
 *   live room) come first; everyone else on Zero Club is searched below.
 * - Arrow keys + Enter/Tab (or a tap) pick someone; Escape closes the list.
 * - Picked tags turn Zero Club pink right inside the box, before sending.
 *
 * How the colour works: the real <textarea>/<input> keeps the caret,
 * selection, IME and autocorrect, but its own glyphs are made transparent.
 * A mirror with the exact same font, padding and scroll position is laid on
 * top and draws the same text — with tags coloured. The mirror never changes
 * letter widths (colour and background only), so the caret always lines up.
 */



type Common = {
  value: string;
  /** People from this context, offered first. */
  people?: MentionPerson[];
  /** Heading for `people`, e.g. "In this club". */
  peopleLabel?: string;
  /** Also search everyone on Zero Club (default true). */
  searchEveryone?: boolean;
  /** Where the list opens. Composers at the bottom of the screen want "top". */
  menuPlacement?: "top" | "bottom";
  /** Dark surfaces (the live room) use the dark list style. */
  tone?: "auto" | "dark";
  /** Class for the wrapper. Defaults to "relative min-w-0 flex-1". */
  wrapperClassName?: string;
};

type TextareaProps = Common & { as?: "textarea" } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value">;
type InputProps = Common & { as: "input" } & Omit<InputHTMLAttributes<HTMLInputElement>, "value">;
export type MentionFieldProps = TextareaProps | InputProps;

type Field = HTMLTextAreaElement | HTMLInputElement;

const TAG_RE = /(^|[^A-Za-z0-9_@])(@[A-Za-z0-9_-]{1,40})/g;
const QUERY_RE = MENTION_QUERY_RE;

/* Styles the mirror must copy so its text lands exactly where the field's does. */
const COPIED = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch", "fontFeatureSettings",
  "letterSpacing", "wordSpacing", "lineHeight", "textTransform", "textIndent", "textAlign", "direction", "tabSize",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "color",
] as const;

/* Usernames already looked up (knownUsernames, shared, lives in mentionSearch). */
const checkedUsernames = new Set<string>();

function setNativeValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export const MentionField = forwardRef<Field, MentionFieldProps>(function MentionField(props, forwardedRef) {
  const {
    value,
    people = [],
    peopleLabel = "In this conversation",
    searchEveryone = true,
    menuPlacement = "top",
    tone = "auto",
    wrapperClassName,
    as: _as,
    onChange,
    onKeyDown,
    onScroll,
    onSelect,
    onBlur,
    style,
    className,
    ...rest
  } = props as TextareaProps;
  const as: "textarea" | "input" = (props as { as?: "textarea" | "input" }).as || "textarea";
  void _as;

  const fieldRef = useRef<Field | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(forwardedRef, () => fieldRef.current as Field);

  const [query, setQuery] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(0);
  const [active, setActive] = useState(0);
  const [, bump] = useState(0);

  /* Context people are always valid tags. */
  useEffect(() => {
    let added = false;
    for (const p of people) {
      const u = p.username?.toLowerCase();
      if (u && !knownUsernames.has(u)) { knownUsernames.add(u); added = true; }
    }
    if (added) bump((n) => n + 1);
  }, [people]);

  /* Tags typed or pasted by hand: confirm they belong to a real person. */
  useEffect(() => {
    const handles = [...value.matchAll(TAG_RE)].map((m) => m[2].slice(1).toLowerCase()).filter((u) => !knownUsernames.has(u) && !checkedUsernames.has(u));
    if (!handles.length) return;
    const timer = window.setTimeout(async () => {
      handles.forEach((u) => checkedUsernames.add(u));
      const { data } = await supabase.from("profiles").select("username").in("username", [...new Set(handles)]);
      let added = false;
      for (const row of data || []) {
        const u = String((row as any).username || "").toLowerCase();
        if (u && !knownUsernames.has(u)) { knownUsernames.add(u); added = true; }
      }
      if (added) bump((n) => n + 1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [value]);

  /* ── which word is the caret in? ── */
  const readQuery = useCallback((el: Field) => {
    const caret = el.selectionStart ?? el.value.length;
    if (el.selectionEnd !== null && el.selectionEnd !== caret) { setQuery(null); return; }
    const before = el.value.slice(0, caret);
    const match = before.match(QUERY_RE);
    if (match) {
      setQuery(match[2]);
      setAnchor(caret - match[2].length - 1);
      setActive(0);
    } else {
      setQuery(null);
    }
  }, []);

  const { sections, flat } = useMentionResults(query, people, peopleLabel, searchEveryone);
  const open = query !== null && flat.length > 0;

  const pick = (person: MentionPerson) => {
    const el = fieldRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const insert = `@${person.username} `;
    const next = el.value.slice(0, anchor) + insert + el.value.slice(caret).replace(/^[A-Za-z0-9_-]*/, "");
    knownUsernames.add(person.username.toLowerCase());
    setNativeValue(el, next);
    setQuery(null);
    const position = anchor + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(position, position);
      syncScroll();
    });
  };

  /* ── mirror geometry ── */
  const syncScroll = () => {
    const el = fieldRef.current, mirror = mirrorRef.current;
    if (!el || !mirror) return;
    mirror.scrollTop = el.scrollTop;
    mirror.scrollLeft = el.scrollLeft;
  };

  const layout = useCallback(() => {
    const el = fieldRef.current, mirror = mirrorRef.current;
    if (!el || !mirror) return;
    const cs = window.getComputedStyle(el);
    for (const key of COPIED) (mirror.style as any)[key] = (cs as any)[key];
    mirror.style.top = `${el.offsetTop + el.clientTop}px`;
    mirror.style.left = `${el.offsetLeft + el.clientLeft}px`;
    mirror.style.width = `${el.clientWidth}px`;
    mirror.style.height = `${el.clientHeight}px`;
    syncScroll();
  }, []);

  useLayoutEffect(() => {
    layout();
    const el = fieldRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(layout);
    observer.observe(el);
    return () => observer.disconnect();
  }, [layout]);
  useLayoutEffect(() => { layout(); }, [value, layout]);

  /* ── mirror content ── */
  const segments = useMemo(() => {
    const out: { text: string; tag: boolean }[] = [];
    let last = 0;
    for (const m of value.matchAll(TAG_RE)) {
      const start = (m.index ?? 0) + m[1].length;
      const handle = m[2];
      if (start > last) out.push({ text: value.slice(last, start), tag: false });
      out.push({ text: handle, tag: knownUsernames.has(handle.slice(1).toLowerCase()) });
      last = start + handle.length;
    }
    if (last < value.length) out.push({ text: value.slice(last), tag: false });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, knownUsernames.size]);

  const handleKeyDown = (event: KeyboardEvent<Field>) => {
    if (open) {
      if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => (i + 1) % flat.length); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => (i - 1 + flat.length) % flat.length); return; }
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        pick(flat[Math.min(active, flat.length - 1)]);
        return;
      }
      if (event.key === "Escape") { event.preventDefault(); setQuery(null); return; }
    }
    (onKeyDown as any)?.(event);
  };

  const dark = tone === "dark";
  const fieldProps = {
    ...rest,
    ref: (node: Field | null) => { fieldRef.current = node; },
    value,
    className: `${className || ""} zc-mention-field`,
    style: { ...(style as any), WebkitTextFillColor: "transparent" },
    onChange: (event: any) => { (onChange as any)?.(event); readQuery(event.target); },
    onKeyDown: handleKeyDown,
    onSelect: (event: any) => { (onSelect as any)?.(event); readQuery(event.target); },
    onScroll: (event: any) => { (onScroll as any)?.(event); syncScroll(); },
    onBlur: (event: any) => { (onBlur as any)?.(event); window.setTimeout(() => setQuery(null), 150); },
    "aria-autocomplete": "list" as const,
    "aria-expanded": open,
  };

  return (
    <div className={wrapperClassName ?? "relative min-w-0 flex-1"} style={{ position: "relative" }}>
      {as === "input" ? <input {...(fieldProps as any)} /> : <textarea {...(fieldProps as any)} />}

      <div
        ref={mirrorRef}
        aria-hidden
        className="pointer-events-none absolute overflow-hidden"
        style={{
          whiteSpace: as === "input" ? "pre" : "pre-wrap",
          overflowWrap: as === "input" ? "normal" : "break-word",
          wordBreak: "normal",
          boxSizing: "border-box",
          border: 0,
          margin: 0,
          zIndex: 1,
        }}
      >
        {segments.map((seg, i) =>
          seg.tag ? (
            // Colour and background only: the mirror must keep letter widths.
            <span key={i} className={`zc-tag-ink ${dark ? "zc-tag-ink-dark" : ""}`} style={{ borderRadius: 4 }}>{seg.text}</span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
        {/* Keeps a trailing new line from collapsing, so the last line lines up. */}
        {as !== "input" && "​"}
      </div>

      {open && (
        <div
          role="listbox"
          className={`absolute left-0 z-[80] w-full min-w-[240px] max-w-[360px] overflow-hidden rounded-xl shadow-[0_18px_44px_-18px_rgba(0,0,0,0.5)] ring-1 ${menuPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2"} ${dark ? "bg-[#1b1620] ring-white/10" : "bg-card ring-border"}`}
        >
          <MentionList sections={sections} active={active} onPick={pick} onHover={setActive} dark={dark} />
        </div>
      )}
    </div>
  );
});
