import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Check, Loader2, Search } from "@/components/icons/glyphs";

type ClubOption = { id: string; name: string; logo_url: string | null };

export const MAX_GIFT_CLUBS = 20;

/**
 * Pick the clubs a bootcamp gift works in. The gift then pays for any bootcamp
 * in those clubs — the club's own bootcamp and every cohort's — including ones
 * the club creates after the gift is sent.
 */
export function GiftClubPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["gift-club-options", term],
    staleTime: 60_000,
    queryFn: async () => {
      const query = supabase.from("clubs").select("id,name,logo_url").is("parent_club_id", null).eq("status", "active").order("created_at", { ascending: false }).limit(30);
      if (term) query.ilike("name", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ClubOption[];
    },
  });
  const { data: chosen = [] } = useQuery({
    queryKey: ["gift-selected-clubs", selected],
    enabled: selected.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("clubs").select("id,name,logo_url").in("id", selected);
      if (error) throw error;
      return (data || []) as ClubOption[];
    },
  });
  const list = [...chosen, ...data.filter((club) => !chosen.some((item) => item.id === club.id))];
  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-3">
      <label className="relative block">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <input aria-label="Search clubs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a club" className="h-11 w-full min-w-0 rounded-lg border border-border bg-transparent pl-9 pr-3 text-sm outline-none focus:border-foreground/40" />
      </label>
      {isLoading ? (
        <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading clubs…</p>
      ) : isError ? (
        <p className="py-4 text-sm text-destructive">Clubs couldn't load. <button type="button" onClick={() => refetch()} className="underline">Try again</button></p>
      ) : (
        <div className="no-scrollbar mt-2 max-h-56 space-y-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          {list.map((club) => {
            const on = selected.includes(club.id);
            return (
              <label key={club.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted/40">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#cc208f]" checked={on} disabled={!on && selected.length >= MAX_GIFT_CLUBS} onChange={(e) => onChange(e.target.checked ? [...selected, club.id] : selected.filter((id) => id !== club.id))} />
                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-foreground/[0.06] text-[12px] font-bold">
                  {club.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full object-cover" /> : (club.name || "?").charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 break-words text-sm">{club.name}</span>
              </label>
            );
          })}
          {!list.length && <p className="py-4 text-sm text-muted-foreground">No matching clubs.</p>}
        </div>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3 w-3" />{selected.length} selected · works on every bootcamp in these clubs, including new ones</p>
    </div>
  );
}
