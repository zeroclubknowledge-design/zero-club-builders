import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Search } from "@/components/icons/glyphs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase";
import type { GiftRecipient } from "@/features/membership/giftCatalog";

function MemberPhoto({ member }: { member: GiftRecipient }) {
  return <Avatar className="h-11 w-11"><AvatarImage src={member.avatar_url || undefined} alt={`${member.full_name || member.username} profile picture`} className="object-cover" /><AvatarFallback className="bg-primary/10 font-semibold text-primary">{member.username[0]?.toUpperCase()}</AvatarFallback></Avatar>;
}

export function GiftRecipientPicker({ value, onChange, selected, onSelect }: {
  value: string; onChange: (value: string) => void;
  selected: GiftRecipient | null; onSelect: (member: GiftRecipient) => void;
}) {
  const id = useId();
  const prefix = value.trim().replace(/^@+/, "").trim().toLowerCase();
  const [lookup, setLookup] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => { const timer = setTimeout(() => setLookup(prefix), 200); return () => clearTimeout(timer); }, [prefix]);
  const search = useQuery({
    queryKey: ["admin-gift-recipient-suggestions", lookup],
    enabled: !!lookup && !selected, retry: false, staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_search_gift_recipients", { p_prefix: lookup });
      if (error) throw error;
      return (data || []) as GiftRecipient[];
    },
  });
  // Never show results from a previous prefix or keep a previous recipient selected.
  const matches = lookup === prefix ? search.data || [] : [];
  const pending = lookup !== prefix || search.isFetching;
  const expanded = open && !!prefix && !selected;
  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, expanded, id]);
  const choose = (member: GiftRecipient) => {
    onChange(`@${member.username}`); onSelect(member); setOpen(false); setActive(-1);
  };
  return <div onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <label className="mt-3 block text-sm font-medium" htmlFor={`${id}-input`}>Username</label>
    <div className="relative mt-2">
      <Search className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-muted-foreground" />
      <input id={`${id}-input`} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-results`} aria-activedescendant={expanded && matches[active] ? `${id}-option-${active}` : undefined} aria-describedby={`${id}-status`} autoComplete="off" placeholder="Start typing a username" value={value} required
        className="min-h-12 w-full min-w-0 rounded-xl border border-border bg-background pl-10 pr-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 sm:text-sm"
        onFocus={() => setOpen(true)}
        onChange={event => { onChange(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === "Escape") { setOpen(false); setActive(-1); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActive(index => matches.length ? event.key === "ArrowDown" ? (index + 1) % matches.length : (index <= 0 ? matches.length : index) - 1 : -1);
          }
          if (event.key === "Enter" && !selected) {
            event.preventDefault(); if (expanded && !pending && matches.length) choose(matches[active] || matches[0]);
          }
        }} />
      {expanded && <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div id={`${id}-results`} role="listbox" aria-label="Matching members" className="max-h-72 overflow-y-auto overscroll-contain">
          {!pending && matches.map((member, index) => <button key={member.id} id={`${id}-option-${index}`} type="button" role="option" aria-selected={active === index}
            className={`flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-primary/5 ${active === index ? "bg-primary/10" : ""}`}
            onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(member)}>
            <MemberPhoto member={member} /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{member.full_name || member.username}</span><span className="block truncate text-xs text-muted-foreground">@{member.username} · {member.account_type}</span></span>
          </button>)}
        </div>
        <div role="status" aria-live="polite" className="px-3 py-2 text-xs text-muted-foreground">
          {pending ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Finding members…</span> : search.isError ? <span>Could not load suggestions. <button type="button" className="underline" onClick={() => search.refetch()}>Try again</button></span> : matches.length ? "Select a member. Keep typing to narrow the results." : "No active members start with this username."}
        </div>
      </div>}
    </div>
    <div id={`${id}-status`} className="mt-2 text-sm" aria-live="polite">
      {selected ? <div className="flex items-center gap-3 rounded-xl bg-primary/5 p-3"><MemberPhoto member={selected} /><div className="min-w-0"><p className="truncate font-semibold">{selected.full_name || selected.username}</p><p className="truncate text-xs text-muted-foreground">@{selected.username} · {selected.account_type}</p></div><Check className="ml-auto h-5 w-5 shrink-0 text-primary" /></div> : <p className="text-muted-foreground">Type the first letter, then select the member you want to gift.</p>}
    </div>
  </div>;
}
