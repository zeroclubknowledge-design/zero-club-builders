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

export type MentionPerson = {
  id?: string | null;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
  /** Small label on the right, e.g. "Host" or "Admin". */
  badge?: string | null;
};

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

const PINK = "#cc208f";
const TAG_RE = /(^|[^A-Za-z0-9_@])(@[A-Za-z0-9_-]{1,40})/g;
const QUERY_RE = /(^|[^A-Za-z0-9_@])@([A-Za-z0-9_-]{0,40})$/;

/* Styles the mirror must copy so its text lands exactly where the field's does. */
const COPIED = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch", "fontFeatureSettings",
  "letterSpacing", "wordSpacing", "lineHeight", "textTransform", "textIndent", "textAlign", "direction", "tabSize",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "color",
] as const;

/* Usernames confirmed to exist, shared by every field so a tag stays pink everywhere. */
const knownUsernames = new Set<string>();
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
  const [remote, setRemote] = useState<MentionPerson[]>([]);
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

  /* ── search everyone ── */
  useEffect(() => {
    if (query === null || !searchEveryone || query.length < 1) { setRemote([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .or(`username.ilike.${query}%,full_name.ilike.%${query}%`)
        .not("username", "is", null)
        .limit(8);
      if (!cancelled) setRemote(((data || []) as MentionPerson[]).filter((p) => p.username));
    }, 160);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, searchEveryone]);

  const sections = useMemo(() => {
    if (query === null) return [] as { label: string; items: MentionPerson[] }[];
    const term = query.toLowerCase();
    const seen = new Set<string>();
    const matches = (p: MentionPerson) =>
      !term || p.username.toLowerCase().includes(term) || String(p.full_name || "").toLowerCase().includes(term);
    const rank = (p: MentionPerson) => (p.username.toLowerCase().startsWith(term) ? 0 : 1);
    const local = people
      .filter((p) => p.username && matches(p))
      .filter((p) => { const k = p.username.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 6);
    const others = remote
      .filter((p) => { const k = p.username.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 6);
    return [
      ...(local.length ? [{ label: peopleLabel, items: local }] : []),
      ...(others.length ? [{ label: "On Zero Club", items: others }] : []),
    ];
  }, [query, people, remote, peopleLabel]);
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
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

  let index = -1;
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
            <span key={i} style={{ color: dark ? "#f06ac3" : PINK, background: dark ? "rgba(240,106,195,0.16)" : "rgba(204,32,143,0.10)", borderRadius: 4 }}>{seg.text}</span>
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
          <div className="max-h-[260px] overflow-y-auto py-1">
            {sections.map((section) => (
              <div key={section.label}>
                <p className={`px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide ${dark ? "text-white/45" : "text-muted-foreground"}`}>{section.label}</p>
                {section.items.map((person) => {
                  index += 1;
                  const selected = index === active;
                  const i = index;
                  return (
                    <button
                      key={person.username}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(event) => { event.preventDefault(); pick(person); }}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${selected ? (dark ? "bg-white/[0.08]" : "bg-[#cc208f]/[0.08]") : ""}`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full text-[12px] font-semibold ${dark ? "bg-white/10 text-white/80" : "bg-muted text-muted-foreground"}`}>
                        {person.avatar_url
                          ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                          : (person.full_name || person.username || "?")[0].toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13.5px] font-semibold ${dark ? "text-white" : "text-foreground"}`}>{person.full_name || person.username}</span>
                        <span className="block truncate text-[12px]" style={{ color: dark ? "#f06ac3" : PINK }}>@{person.username}</span>
                      </span>
                      {person.badge && <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${dark ? "text-[#f28fd0]" : "text-muted-foreground"}`}>{person.badge}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
