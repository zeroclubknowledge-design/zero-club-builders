import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, Users, Loader2 } from "@/components/icons/glyphs";
import { addablePeople, displayName } from "./api";

/** A group's photo, or a soft gradient tile with its initials. */
export function GroupAvatar({ name, url, size = 48, className = "" }: { name: string; url?: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "G";
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#d22c8b_0%,#7c3aed_100%)] font-semibold text-white ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : initials}
    </span>
  );
}

export function PersonAvatar({ person, size = 40 }: { person?: { avatar_url?: string | null; full_name?: string | null; username?: string | null } | null; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] font-semibold text-muted-foreground" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {person?.avatar_url ? (
        <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        displayName(person).charAt(0).toUpperCase()
      )}
    </span>
  );
}

/**
 * Pick people to add: anyone you follow or who follows you. `exclude` hides
 * people already in the group.
 */
export function PeoplePicker({
  myId,
  selected,
  onChange,
  exclude = [],
}: {
  myId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  exclude?: string[];
}) {
  const [q, setQ] = useState("");
  const { data: people = [], isLoading } = useQuery({
    queryKey: ["group-addable", myId],
    queryFn: () => addablePeople(myId),
    enabled: Boolean(myId),
    staleTime: 60_000,
  });
  const excluded = useMemo(() => new Set(exclude), [exclude]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return people.filter(
      (p) => !excluded.has(p.id) && (!term || (p.full_name || "").toLowerCase().includes(term) || (p.username || "").toLowerCase().includes(term)),
    );
  }, [people, q, excluded]);
  const chosen = people.filter((p) => selected.includes(p.id));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div>
      {chosen.length > 0 && (
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-3 pt-1">
          {chosen.map((p) => (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} className="flex w-14 shrink-0 flex-col items-center gap-1">
              <span className="relative">
                <PersonAvatar person={p} size={48} />
                <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-foreground text-[11px] font-bold text-background ring-2 ring-card">×</span>
              </span>
              <span className="w-full truncate text-center text-[11px] text-muted-foreground">{displayName(p).split(" ")[0]}</span>
            </button>
          ))}
        </div>
      )}
      <label className="mx-4 flex h-10 items-center gap-2 rounded-xl bg-foreground/[0.05] px-3">
        <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people you follow or who follow you"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="mt-2">
        {isLoading ? (
          <div className="grid h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center px-8 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05]"><Users className="h-5 w-5 text-muted-foreground" /></span>
            <p className="mt-3 text-[14px] font-semibold">{q ? "No one found" : "No one to add yet"}</p>
            <p className="mt-1 max-w-[260px] text-[13px] text-muted-foreground">
              {q ? "Try another name." : "Follow people to add them here — or share the group link once it's made."}
            </p>
          </div>
        ) : (
          list.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggle(p.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-foreground/[0.03]">
                <PersonAvatar person={p} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{displayName(p)}</span>
                  {p.username && <span className="block truncate text-[13px] text-muted-foreground">@{p.username}</span>}
                </span>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition ${on ? "bg-[#c3217e] text-white" : "ring-2 ring-foreground/20"}`}>
                  {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
