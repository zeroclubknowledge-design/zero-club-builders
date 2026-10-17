import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { supabase } from "@/lib/supabase";

/**
 * A text box for a Zero Club username that suggests people from the first
 * letter typed — with or without "@" — so nobody has to type a whole handle.
 * Use this anywhere a username is entered (house rule for every product).
 *
 * The value is what's in the box; picking a suggestion fills in the username
 * and calls onPick with the person.
 */
export type PickedUser = { id: string; username: string; full_name: string | null; avatar_url: string | null; account_type?: string | null };

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  onPick?: (user: PickedUser) => void;
  /** Narrow the suggestions, e.g. only tutors or only organizations. */
  filter?: (user: PickedUser) => boolean;
  /** Extra filter applied in the query: "personal" or "business" accounts only. */
  accountKind?: "personal" | "business";
  /** Wrapper class; defaults to a relative block. */
  wrapperClassName?: string;
};

export function searchUsernames(term: string, accountKind?: "personal" | "business", limit = 8) {
  const q = term.trim().replace(/^@+/, "").replace(/[%_,()]/g, "");
  if (!q) return Promise.resolve([] as PickedUser[]);
  let query = supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, account_type")
    .or(`username.ilike.${q}%,full_name.ilike.${q}%,full_name.ilike.% ${q}%`)
    .not("username", "is", null)
    .order("xp", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (accountKind) query = query.eq("account_kind", accountKind);
  return query.then(({ data }) => {
    const rows = (data || []) as PickedUser[];
    const lower = q.toLowerCase();
    // Exact and prefix username matches first.
    return rows.sort((a, b) => {
      const score = (u: PickedUser) => (u.username?.toLowerCase() === lower ? 0 : u.username?.toLowerCase().startsWith(lower) ? 1 : 2);
      return score(a) - score(b);
    });
  });
}

export function UsernamePicker({ value, onChange, onPick, filter, accountKind, wrapperClassName = "relative", className = "", ...rest }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PickedUser[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const picked = useRef<string | null>(null);

  useEffect(() => {
    const term = value.trim().replace(/^@+/, "");
    if (!term || picked.current === term) {
      setResults([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = window.setTimeout(() => {
      void searchUsernames(term, accountKind).then((rows) => {
        if (!alive) return;
        setResults(filter ? rows.filter(filter) : rows);
        setActive(0);
        setLoading(false);
      });
    }, 120);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [value, accountKind, filter]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (u: PickedUser) => {
    picked.current = u.username;
    onChange(u.username);
    onPick?.(u);
    setOpen(false);
  };

  const showList = open && value.trim().replace(/^@+/, "").length > 0 && (results.length > 0 || loading);

  return (
    <div ref={wrapRef} className={wrapperClassName}>
      <input
        {...rest}
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          picked.current = null;
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          rest.onFocus?.(e);
        }}
        onKeyDown={(e) => {
          if (showList && results.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % results.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); return; }
            if (e.key === "Enter" || e.key === "Tab") {
              if (results[active] && picked.current !== value.trim().replace(/^@+/, "")) {
                e.preventDefault();
                choose(results[active]);
                return;
              }
            }
          }
          if (e.key === "Escape") setOpen(false);
          rest.onKeyDown?.(e);
        }}
        className={className}
      />
      {showList && (
        <div id={`${id}-list`} role="listbox" className="absolute left-0 right-0 top-full z-[10200] mt-1.5 max-h-[300px] overflow-y-auto rounded-xl bg-popover py-1 shadow-[0_18px_44px_-18px_rgba(0,0,0,0.5)] ring-1 ring-border">
          {results.map((u, i) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(u); }}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${i === active ? "bg-[#cc208f]/[0.08]" : ""}`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[12px] font-semibold text-muted-foreground">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : (u.full_name || u.username || "?").charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-foreground">{u.full_name || u.username}</span>
                <span className="block truncate text-[12px] text-[#cc208f]">@{u.username}{u.account_type ? <span className="text-muted-foreground"> · {u.account_type}</span> : null}</span>
              </span>
            </button>
          ))}
          {loading && results.length === 0 && <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">Searching…</p>}
        </div>
      )}
    </div>
  );
}
