import { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Loader2, Search, Users } from "@/components/icons/glyphs";
import { assignedBootcampTutorIds } from "./tutors";

type Person = { full_name?: string | null; username?: string | null; avatar_url?: string | null };
type Tutor = { tutor_id: string; tutor?: Person | null };
type Bootcamp = { id: string; title: string; assigned_tutor_id?: string | null; assigned_tutor_ids?: string[] | null };

/** Keep the drawer mounted; opening another bootcamp starts a fresh selection. */
export function BootcampTutorDrawer({ bootcamp, tutors, saving, onSave, onClose }: {
  bootcamp: Bootcamp | null; tutors: Tutor[]; saving: boolean;
  onSave: (ids: string[]) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState(() => assignedBootcampTutorIds(bootcamp));
  const [search, setSearch] = useState("");
  const bootcampId = bootcamp?.id;
  useEffect(() => {
    if (bootcamp) { setSelected(assignedBootcampTutorIds(bootcamp)); setSearch(""); }
    // Take a snapshot when opening, preserving unsaved choices during refetches.
  }, [bootcampId]);
  const original = assignedBootcampTutorIds(bootcamp);
  const changed = selected.length !== original.length || selected.some(id => !original.includes(id));
  const term = search.trim().toLowerCase().replace(/^@/, "");
  const options = tutors.filter(t => `${t.tutor?.full_name || ""} ${t.tutor?.username || ""}`.toLowerCase().includes(term));
  const unavailable = selected.filter(id => !tutors.some(t => t.tutor_id === id));
  const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  return <Drawer open={!!bootcamp} handleOnly onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DrawerContent hideHandle hideClose={saving} className="max-h-[90dvh] border-t border-border/40 bg-background">
      <DrawerHeader className="px-5 pb-3 pt-1 text-left">
        <DrawerTitle className="font-display text-xl font-semibold">Assign tutors</DrawerTitle>
        <DrawerDescription className="break-words text-sm">{bootcamp?.title}. Select tutors from your organization, then save. Deselect a tutor to remove their assignment.</DrawerDescription>
      </DrawerHeader>
      {!!tutors.length && <label className="relative mx-5 mb-3 block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><span className="sr-only">Search tutors</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or username" disabled={saving} className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm outline-none focus:border-primary" /></label>}
      <div className="min-h-0 max-h-[50dvh] overflow-y-auto px-5 pb-3">
        {!tutors.length && <div className="py-8 text-center"><Users className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold">No tutors yet</p><p className="mt-1 text-sm text-muted-foreground">Add tutors to your organization first, then assign them here.</p></div>}
        {!!tutors.length && !options.length && <p className="py-6 text-center text-sm text-muted-foreground">No tutors match your search.</p>}
        {options.map(tutor => {
          const person = tutor.tutor;
          const name = person?.full_name || person?.username || "Tutor";
          const checked = selected.includes(tutor.tutor_id);
          return <label key={tutor.tutor_id} className={`mb-2 flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl border p-3 ${checked ? "border-primary/40 bg-primary/[0.06]" : "border-border hover:bg-foreground/[0.03]"}`}>
            {person?.avatar_url ? <img src={person.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground/[0.06] font-semibold">{name[0].toUpperCase()}</span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{name}</span>{person?.username && <span className="block truncate text-xs text-muted-foreground">@{person.username}</span>}</span>
            <input type="checkbox" checked={checked} disabled={saving} onChange={() => toggle(tutor.tutor_id)} aria-label={`Assign ${name}`} className="h-5 w-5 shrink-0 accent-[#c3217e]" />
          </label>;
        })}
        {unavailable.map(id => <div key={id} className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm"><span>Tutor no longer in your organization</span><button type="button" disabled={saving} onClick={() => toggle(id)} className="shrink-0 rounded-full border border-border px-3 py-2 text-xs font-semibold">Remove</button></div>)}
      </div>
      <div className="border-t border-border px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">{selected.length} {selected.length === 1 ? "tutor selected" : "tutors selected"}</p>
        <div className="flex gap-3"><button type="button" disabled={saving} onClick={onClose} className="h-11 flex-1 rounded-full border border-border text-sm font-semibold disabled:opacity-50">Cancel</button><button type="button" disabled={saving || !changed || selected.length>100} onClick={() => onSave(selected)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : selected.length ? "Save tutors" : "Remove tutors"}</button></div>
      </div>
    </DrawerContent>
  </Drawer>;
}
