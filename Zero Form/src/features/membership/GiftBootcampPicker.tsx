import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Check, Loader2, Search } from "@/components/icons/glyphs";

export function GiftBootcampPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ["gift-bootcamp-options", term], staleTime: 60_000, queryFn: async () => {
    const query = supabase.from("bootcamps").select("id,title").eq("status", "active").order("created_at", { ascending: false }).limit(30);
    if (term) query.ilike("title", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await query;
    if (error) throw error; return data || [];
  } });
  const { data: chosen = [] } = useQuery({ queryKey: ["gift-selected-bootcamps", selected], enabled: selected.length > 0, queryFn: async () => {
    const { data, error } = await supabase.from("bootcamps").select("id,title").in("id", selected);
    if (error) throw error; return data || [];
  } });
  const filtered = [...chosen, ...data.filter(camp => !chosen.some(item => item.id === camp.id))];
  return <div className="mt-3 rounded-xl border border-border bg-card p-3">
    <label className="relative block"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><input aria-label="Search gift bootcamps" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a bootcamp" className="h-11 w-full min-w-0 rounded-lg border border-border bg-transparent pl-9 pr-3 text-sm outline-none focus:border-foreground/40" /></label>
    {isLoading ? <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading bootcamps…</p> : isError ? <p className="py-4 text-sm text-destructive">Bootcamps couldn't load. <button type="button" onClick={() => refetch()} className="underline">Try again</button></p> : <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
      {filtered.map(camp => <label key={camp.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted/40"><input type="checkbox" className="h-4 w-4 shrink-0 accent-[#cc208f]" checked={selected.includes(camp.id)} disabled={!selected.includes(camp.id) && selected.length >= 100} onChange={e => onChange(e.target.checked ? [...selected, camp.id] : selected.filter(id => id !== camp.id))} /><span className="min-w-0 break-words text-sm">{camp.title}</span></label>)}
      {!filtered.length && <p className="py-4 text-sm text-muted-foreground">No matching bootcamps.</p>}
    </div>}
    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3 w-3" />{selected.length} selected · valid for these bootcamps and their Zero Forms</p>
  </div>;
}
