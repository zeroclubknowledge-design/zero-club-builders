import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * The people search and suggestion list behind every "@" in Zero Club:
 * plain boxes (MentionField) and rich editors (useEditorMentions) share it,
 * so tagging looks and behaves the same wherever someone writes.
 */

export type MentionPerson = {
  id?: string | null;
  username: string;
  full_name?: string | null;
  avatar_url?: string | null;
  /** Small label on the right, e.g. "Host" or "Admin". */
  badge?: string | null;
};

export type MentionSection = { label: string; items: MentionPerson[] };

/** "@" + what's been typed of a username, right before the caret. */
export const MENTION_QUERY_RE = /(^|[^A-Za-z0-9_@])@([A-Za-z0-9_-]{0,40})$/;

/** Usernames confirmed to exist, shared by every field so a tag stays pink everywhere. */
export const knownUsernames = new Set<string>();

/**
 * People matching `query`: context people first (club members, the chat),
 * then everyone on Zero Club by username or name. `query === null` = closed.
 */
export function useMentionResults(
  query: string | null,
  people: MentionPerson[] = [],
  peopleLabel = "In this conversation",
  searchEveryone = true,
) {
  const [remote, setRemote] = useState<MentionPerson[]>([]);

  useEffect(() => {
    if (query === null || !searchEveryone || query.length < 1) {
      setRemote([]);
      return;
    }
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
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, searchEveryone]);

  const sections = useMemo(() => {
    if (query === null) return [] as MentionSection[];
    const term = query.toLowerCase();
    const seen = new Set<string>();
    const matches = (p: MentionPerson) =>
      !term || p.username.toLowerCase().includes(term) || String(p.full_name || "").toLowerCase().includes(term);
    const rank = (p: MentionPerson) => (p.username.toLowerCase().startsWith(term) ? 0 : 1);
    const unseen = (p: MentionPerson) => {
      const k = p.username.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    };
    const local = people.filter((p) => p.username && matches(p)).filter(unseen).sort((a, b) => rank(a) - rank(b)).slice(0, 6);
    const others = remote.filter(unseen).sort((a, b) => rank(a) - rank(b)).slice(0, 6);
    return [
      ...(local.length ? [{ label: peopleLabel, items: local }] : []),
      ...(others.length ? [{ label: "On Zero Club", items: others }] : []),
    ];
  }, [query, people, remote, peopleLabel]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  return { sections, flat };
}

const PINK = "#c3217e";

/** The suggestion list: sections of people with photo, name and @username. */
export function MentionList({
  sections,
  active,
  onPick,
  onHover,
  dark,
}: {
  sections: MentionSection[];
  active: number;
  onPick: (person: MentionPerson) => void;
  onHover: (index: number) => void;
  dark?: boolean;
}) {
  let index = -1;
  return (
    <div className="max-h-[260px] overflow-y-auto overscroll-contain py-1">
      {sections.map((section) => (
        <div key={section.label}>
          <p className={`px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide ${dark ? "text-white/45" : "text-muted-foreground"}`}>
            {section.label}
          </p>
          {section.items.map((person) => {
            index += 1;
            const selected = index === active;
            const i = index;
            const everyone = person.username === "everyone" && !person.id;
            return (
              <button
                key={person.username}
                type="button"
                role="option"
                aria-selected={selected}
                // mousedown, not click: keeps focus (and the caret) in the text box.
                onMouseDown={(event) => {
                  event.preventDefault();
                  onPick(person);
                }}
                onMouseEnter={() => onHover(i)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${
                  selected ? (dark ? "bg-white/[0.08]" : "bg-[#c3217e]/[0.08]") : ""
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full text-[12px] font-semibold ${
                    everyone ? "text-[15px] text-white" : dark ? "bg-white/10 text-white/80" : "bg-muted text-muted-foreground"
                  }`}
                  style={everyone ? { background: PINK } : undefined}
                >
                  {everyone ? (
                    "@"
                  ) : person.avatar_url ? (
                    <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    (person.full_name || person.username || "?")[0].toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13.5px] font-semibold ${dark ? "text-white" : "text-foreground"}`}>
                    {person.full_name || person.username}
                  </span>
                  <span className={`block truncate text-[12px] zc-tag-ink-text ${dark ? "zc-tag-ink-dark" : ""}`}>@{person.username}</span>
                </span>
                {person.badge && (
                  <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${dark ? "text-[#f089c4]" : "text-muted-foreground"}`}>
                    {person.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
