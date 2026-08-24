import { useEffect, useRef, useState } from "react";
import { Loader2, Users, X } from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";

/**
 * Credit, given to people who can be found.
 *
 * A free-text "collaborators" box would be simpler to build and worth very
 * little: a name typed into it links to nobody, proves nothing, and cannot be
 * disputed by the person it names. So a collaborator here is a Zero Club
 * profile or it is not a collaborator — the handle is checked against real
 * accounts before it can be added, and what gets stored is the profile id.
 *
 * The lookup is deliberately by prefix on the handle rather than a general
 * search. Somebody adding a collaborator already knows who they mean.
 */

export type Collaborator = {
  id: string;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

export function CollaboratorPicker({
  value,
  onChange,
  excludeId,
  max = 8,
}: {
  value: Collaborator[];
  onChange: (next: Collaborator[]) => void;
  /** Usually the author. Crediting yourself as a collaborator is noise. */
  excludeId?: string;
  max?: number;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Collaborator[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = query.trim().replace(/^@/, "");
    if (handle.length < 2) {
      setResults([]);
      return;
    }

    // Debounced, or every keystroke of a handle is its own round trip.
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .ilike("username", `${handle}%`)
        .limit(6);

      if (cancelled) return;
      const chosen = new Set(value.map((person) => person.id));
      setResults(
        (data || []).filter((person) => person.id !== excludeId && !chosen.has(person.id)),
      );
      setSearching(false);
      setOpen(true);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setSearching(false);
    };
  }, [query, value, excludeId]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const add = (person: Collaborator) => {
    if (value.length >= max) return;
    onChange([...value, person]);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const remove = (id: string) => onChange(value.filter((person) => person.id !== id));

  return (
    <div ref={wrapper} className="relative">
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((person) => (
            <span
              key={person.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-1 pr-2 text-[12px] font-semibold text-primary"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/20 text-[9px]">
                {person.avatar_url
                  ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  : (person.username || "?")[0].toUpperCase()}
              </span>
              @{person.username}
              <button
                type="button"
                onClick={() => remove(person.id)}
                aria-label={`Remove ${person.username}`}
                className="grid h-4 w-4 place-items-center rounded-full transition hover:bg-primary/20"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Users className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={value.length >= max ? `Up to ${max} collaborators` : "Add a collaborator by @handle"}
          disabled={value.length >= max}
          className="w-full rounded-lg border border-border bg-background px-4 py-3.5 pl-11 text-sm outline-none transition-colors focus:border-primary disabled:opacity-60"
        />
        {searching && <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl bg-card shadow-[var(--shadow-lift)]">
          {results.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => add(person)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-accent/50"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                {person.avatar_url
                  ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  : (person.full_name || person.username || "?")[0].toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground">{person.full_name || person.username}</span>
                <span className="block truncate text-[11px] text-muted-foreground">@{person.username}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Says why nothing was found, rather than showing an empty box. The
          answer is nearly always that the person has not joined yet. */}
      {open && !searching && query.trim().replace(/^@/, "").length >= 2 && results.length === 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          No Zero Club account matches that handle. Collaborators have to be on Zero Club so the
          credit links to a real profile.
        </p>
      )}
    </div>
  );
}
