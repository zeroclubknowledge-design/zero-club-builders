import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import { supabase } from "@/lib/supabase";

/**
 * A text box that understands @username tags — ZeroStart's copy of Zero
 * Club's MentionField, so tagging works the same in both products.
 *
 * Type "@" and a letter: people on Zero Club appear (by username or name),
 * narrowing as you type. Arrows + Enter/Tab or a tap pick someone; Esc
 * closes the list. Picked tags turn brand pink inside the box.
 *
 * The real <textarea> keeps caret, selection and autocorrect, with its own
 * glyphs transparent; a mirror with identical font and padding draws the
 * same text on top, tags coloured. Colour and background only, so widths —
 * and the caret — never shift.
 */

type Person = { id?: string | null; username: string; full_name?: string | null; avatar_url?: string | null };

export type MentionFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & {
  value: string;
  /** Where the list opens. */
  menuPlacement?: "top" | "bottom";
  /** Class for the wrapper. */
  wrapperClassName?: string;
};

const TAG_RE = /(^|[^A-Za-z0-9_@])(@[A-Za-z0-9_-]{1,40})/g;
const QUERY_RE = /(^|[^A-Za-z0-9_@])@([A-Za-z0-9_-]{0,40})$/;
const COPIED = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch", "fontFeatureSettings",
  "letterSpacing", "wordSpacing", "lineHeight", "textTransform", "textIndent", "textAlign", "direction", "tabSize",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "color",
] as const;

const knownUsernames = new Set<string>();
const checkedUsernames = new Set<string>();

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export const MentionField = forwardRef<HTMLTextAreaElement, MentionFieldProps>(function MentionField(props, forwardedRef) {
  const { value, menuPlacement = "bottom", wrapperClassName, onChange, onKeyDown, onScroll, onSelect, onBlur, style, className, ...rest } = props;
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(forwardedRef, () => fieldRef.current as HTMLTextAreaElement);

  const [query, setQuery] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(0);
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<Person[]>([]);
  const [, bump] = useState(0);

  /* Tags typed or pasted by hand: confirm they belong to a real person. */
  useEffect(() => {
    const handles = [...value.matchAll(TAG_RE)]
      .map((m) => m[2].slice(1).toLowerCase())
      .filter((u) => !knownUsernames.has(u) && !checkedUsernames.has(u));
    if (!handles.length) return;
    const timer = window.setTimeout(async () => {
      handles.forEach((u) => checkedUsernames.add(u));
      const { data } = await supabase.from("profiles").select("username").in("username", [...new Set(handles)]);
      let added = false;
      for (const row of data || []) {
        const u = String((row as { username?: string }).username || "").toLowerCase();
        if (u && !knownUsernames.has(u)) { knownUsernames.add(u); added = true; }
      }
      if (added) bump((n) => n + 1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [value]);

  const readQuery = useCallback((el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? el.value.length;
    if (el.selectionEnd !== null && el.selectionEnd !== caret) { setQuery(null); return; }
    const match = el.value.slice(0, caret).match(QUERY_RE);
    if (match) {
      setQuery(match[2]);
      setAnchor(caret - match[2].length - 1);
      setActive(0);
    } else setQuery(null);
  }, []);

  useEffect(() => {
    if (query === null || query.length < 1) { setResults([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .or(`username.ilike.${query}%,full_name.ilike.%${query}%`)
        .not("username", "is", null)
        .limit(8);
      if (cancelled) return;
      const term = query.toLowerCase();
      const rank = (p: Person) => (p.username.toLowerCase().startsWith(term) ? 0 : 1);
      setResults(((data || []) as Person[]).filter((p) => p.username).sort((a, b) => rank(a) - rank(b)).slice(0, 6));
    }, 160);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const open = query !== null && results.length > 0;

  const syncScroll = () => {
    const el = fieldRef.current, mirror = mirrorRef.current;
    if (!el || !mirror) return;
    mirror.scrollTop = el.scrollTop;
    mirror.scrollLeft = el.scrollLeft;
  };

  const pick = (person: Person) => {
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

  const layout = useCallback(() => {
    const el = fieldRef.current, mirror = mirrorRef.current;
    if (!el || !mirror) return;
    const cs = window.getComputedStyle(el);
    for (const key of COPIED) (mirror.style as unknown as Record<string, string>)[key] = (cs as unknown as Record<string, string>)[key];
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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => (i + 1) % results.length); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); return; }
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        pick(results[Math.min(active, results.length - 1)]);
        return;
      }
      if (event.key === "Escape") { event.preventDefault(); setQuery(null); return; }
    }
    onKeyDown?.(event);
  };

  return (
    <div className={wrapperClassName ?? "relative w-full"} style={{ position: "relative" }}>
      <textarea
        {...rest}
        ref={(node) => { fieldRef.current = node; }}
        value={value}
        className={`${className || ""} zs-mention-field`}
        style={{ ...style, WebkitTextFillColor: "transparent" }}
        onChange={(event) => { onChange?.(event); readQuery(event.target); }}
        onKeyDown={handleKeyDown}
        onSelect={(event) => { onSelect?.(event); readQuery(event.currentTarget); }}
        onScroll={(event) => { onScroll?.(event); syncScroll(); }}
        onBlur={(event) => { onBlur?.(event); window.setTimeout(() => setQuery(null), 150); }}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      <div
        ref={mirrorRef}
        aria-hidden
        className="pointer-events-none absolute overflow-hidden"
        style={{ whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "normal", boxSizing: "border-box", border: 0, margin: 0, zIndex: 1 }}
      >
        {segments.map((seg, i) => (seg.tag ? <span key={i} className="zs-tag-ink" style={{ borderRadius: 4 }}>{seg.text}</span> : <span key={i}>{seg.text}</span>))}
        {"​"}
      </div>

      {open && (
        <div
          role="listbox"
          aria-label="People to tag"
          className={`absolute left-0 z-[80] w-full min-w-[240px] max-w-[360px] overflow-hidden rounded-xl bg-surface shadow-[0_18px_44px_-18px_rgba(0,0,0,0.5)] ring-1 ring-line ${
            menuPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="max-h-[260px] overflow-y-auto overscroll-contain py-1">
            <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">On Zero Club</p>
            {results.map((person, i) => (
              <button
                key={person.username}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(event) => { event.preventDefault(); pick(person); }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${i === active ? "bg-accent-soft" : ""}`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-[12px] font-semibold text-ink-muted ring-1 ring-line">
                  {person.avatar_url ? (
                    <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    (person.full_name || person.username || "?")[0].toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{person.full_name || person.username}</span>
                  <span className="block truncate text-[12px] text-accent">@{person.username}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
