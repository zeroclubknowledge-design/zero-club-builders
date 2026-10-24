import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "@/components/icons/glyphs";

/*
 * Zero Club's own picker, used everywhere instead of the phone's built-in
 * <select> dialog. Drop-in: it takes the same <option> children, value /
 * defaultValue, onChange(e => e.target.value), className, disabled, required
 * and name as a native select, so swapping one for the other changes nothing
 * else in the screen.
 *
 * Phones: a bottom sheet of option cards. Larger screens: a card list that
 * opens under (or above) the field. Long lists get a search box.
 */

type Opt = { value: string; label: string; disabled: boolean };
type ChangeEvent = { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } };

export type CardSelectProps = {
  value?: string | number | null;
  defaultValue?: string | number;
  onChange?: (event: ChangeEvent) => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  title?: string;
  /** Heading on the phone sheet; falls back to aria-label, then "Choose an option". */
  label?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function collect(children: ReactNode, out: Opt[] = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<any>;
    if (el.type === Fragment || el.type === "optgroup") return collect(el.props.children, out);
    if (el.type === "option") {
      const label = textOf(el.props.children);
      out.push({ value: el.props.value !== undefined ? String(el.props.value) : label, label, disabled: Boolean(el.props.disabled) });
    }
  });
  return out;
}

export function CardSelect(props: CardSelectProps) {
  const { value, defaultValue, onChange, children, className = "", disabled, required, name, id, title, label, placeholder } = props;
  const options = useMemo(() => collect(children), [children]);
  const controlled = value !== undefined;
  const [inner, setInner] = useState(() => String(defaultValue ?? options[0]?.value ?? ""));
  const current = controlled ? String(value ?? "") : inner;
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const heading = label || props["aria-label"] || placeholder || "Choose an option";

  const choose = useCallback(
    (v: string) => {
      if (!controlled) setInner(v);
      setOpen(false);
      setQuery("");
      if (v !== current) onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } });
      triggerRef.current?.focus();
    },
    [controlled, current, onChange, name],
  );

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        title={title}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const enabled = options.filter((o) => !o.disabled);
            const at = enabled.findIndex((o) => o.value === current);
            const next = enabled[(at + (e.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length];
            if (next) choose(next.value);
          }
        }}
        className={`inline-flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected && selected.value !== "" ? "" : "opacity-60"}`}>
          {selected?.label || placeholder || "Select…"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {name && <input type="hidden" name={name} value={current} required={required} />}
      {open && (
        <Panel
          anchor={triggerRef.current}
          listId={listId}
          heading={heading}
          options={options}
          current={current}
          query={query}
          setQuery={setQuery}
          onChoose={choose}
          onClose={() => { setOpen(false); setQuery(""); }}
        />
      )}
    </>
  );
}

function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return phone;
}

function Panel({
  anchor, listId, heading, options, current, query, setQuery, onChoose, onClose,
}: {
  anchor: HTMLElement | null;
  listId: string;
  heading: string;
  options: Opt[];
  current: string;
  query: string;
  setQuery: (q: string) => void;
  onChoose: (v: string) => void;
  onClose: () => void;
}) {
  const phone = useIsPhone();
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  // Inside a dialog or drawer, render inside it: those trap focus and close on
  // taps outside themselves.
  const host = (anchor?.closest('[role="dialog"]') as HTMLElement | null) || (typeof document !== "undefined" ? document.body : null);
  const searchable = options.length > 8;
  const shown = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  useLayoutEffect(() => {
    if (phone || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      // A transformed host makes "fixed" relative to it.
      const h = host && host !== document.body && getComputedStyle(host).transform !== "none" ? host.getBoundingClientRect() : null;
      const offX = h?.left || 0;
      const offY = h?.top || 0;
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const width = Math.max(r.width, 240);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8) - offX;
      if (below >= 220 || below >= above) setPos({ top: r.bottom + 6 - offY, left, width, maxHeight: Math.min(360, below) });
      else setPos({ bottom: (h ? h.bottom : window.innerHeight) - r.top + 6, left, width, maxHeight: Math.min(360, above) });
    };
    place();
    /* Scrolling the list itself must not re-place the panel: that re-render
       used to jump the list back to the chosen option, so it never scrolled. */
    const onScroll = (e: Event) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      place();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [phone, anchor, host]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", onKey, true);
    let previous = "";
    if (phone) {
      previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (phone) document.body.style.overflow = previous;
    };
  }, [onClose, phone]);

  // Bring the chosen option into view once, when the list opens.
  const listRef = useRef<HTMLDivElement>(null);
  const revealed = useRef(false);
  useEffect(() => {
    if (revealed.current || (!phone && !pos)) return;
    revealed.current = true;
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [pos, phone]);

  if (!host) return null;

  const list = (
    <div ref={listRef} id={listId} role="listbox" aria-label={heading} className="space-y-1.5 p-2">
      {shown.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">Nothing matches “{query}”.</p>}
      {shown.map((o) => {
        const on = o.value === current;
        return (
          <button
            key={`${o.value}-${o.label}`}
            type="button"
            role="option"
            aria-selected={on}
            disabled={o.disabled}
            onClick={() => onChoose(o.value)}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[14.5px] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${
              on ? "bg-[#cc208f]/[0.09] font-semibold text-foreground ring-2 ring-[#cc208f]/45" : "bg-foreground/[0.035] text-foreground hover:bg-foreground/[0.07]"
            }`}
          >
            <span className="min-w-0 flex-1 break-words leading-snug">{o.label || "—"}</span>
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition ${on ? "bg-[#cc208f] text-white" : "ring-2 ring-foreground/20"}`}>
              {on && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );

  const search = searchable && (
    <label className="mx-2 mt-2 flex h-10 items-center gap-2 rounded-xl bg-foreground/[0.05] px-3">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        autoFocus={!phone}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );

  return createPortal(
    phone ? (
      <div ref={rootRef} className="fixed inset-0 z-[10050] flex items-end" style={{ pointerEvents: "auto" }} data-card-select="">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
        <div className="zc-card-select-sheet relative flex max-h-[78dvh] w-full flex-col rounded-t-[28px] bg-card pb-[env(safe-area-inset-bottom)] text-foreground shadow-[0_-20px_50px_-15px_rgba(0,0,0,0.5)]">
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-foreground/15" />
          <div className="flex items-center gap-2 px-5 pb-1 pt-3">
            <p className="min-w-0 flex-1 text-[16px] font-semibold">{heading}</p>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-foreground/[0.06]">
              <X className="h-4 w-4" />
            </button>
          </div>
          {search}
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3" style={{ scrollbarWidth: "none" }}>{list}</div>
        </div>
      </div>
    ) : (
      <div ref={rootRef} className="fixed inset-0 z-[10050]" style={{ pointerEvents: "auto" }} data-card-select="" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {pos && (
          <div
            className="absolute flex flex-col overflow-hidden rounded-2xl bg-card text-foreground shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] ring-1 ring-foreground/[0.08]"
            style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          >
            {search}
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ scrollbarWidth: "none" }}>{list}</div>
          </div>
        )}
      </div>
    ),
    host,
  );
}
