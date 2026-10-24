import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Check, Compass, Loader2, Search, Users, X } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatWalletAmount } from "@/hooks/useWalletCurrency";

type BrowseForm = {
  id: string; slug: string; title: string; description: string | null; banner_url: string | null;
  regular_price: number | null; early_bird_price: number | null; pricing_enabled: boolean | null;
  registration_deadline: string | null; seats_left: number | null;
  bootcamp_title: string; category: string | null; starts_at: string | null;
  club_id: string; club_name: string; club_logo: string | null; cohort_name: string | null; registered: boolean;
};
type BrowseClub = { id: string; name: string; logo_url: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function priceLabel(form: BrowseForm) {
  if (form.pricing_enabled === false) return "Free";
  const regular = Number(form.regular_price || 0);
  const early = Number(form.early_bird_price || 0);
  const now = early > 0 && early < regular ? early : regular;
  return now > 0 ? formatWalletAmount(now) : "Free";
}

/**
 * Every open Zero Form from every public club, so anyone can find a bootcamp
 * and register in one tap. Lists only forms people can still register for
 * (server: browse_zero_forms → published and zero_form_state = 'open').
 */
export function BrowseForms({ compact = false }: { compact?: boolean }) {
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [club, setClub] = useState<string | null>(null);
  useEffect(() => { const t = window.setTimeout(() => setTerm(search.trim()), 250); return () => window.clearTimeout(t); }, [search]);

  // Clubs for the filter come from the unfiltered list, so chips don't vanish while searching.
  const all = useQuery({
    queryKey: ["browse-zero-forms", "all", session?.user.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("browse_zero_forms" as never, {} as never);
      if (error) throw error;
      return data as unknown as { forms: BrowseForm[]; clubs: BrowseClub[] };
    },
    staleTime: 60_000,
  });
  const filtered = useQuery({
    queryKey: ["browse-zero-forms", term, club, session?.user.id ?? null],
    enabled: !!term || !!club,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("browse_zero_forms" as never, { p_search: term || null, p_club: club } as never);
      if (error) throw error;
      return data as unknown as { forms: BrowseForm[]; clubs: BrowseClub[] };
    },
    staleTime: 30_000,
  });

  const source = term || club ? filtered : all;
  const forms = source.data?.forms || [];
  const clubs = [...(all.data?.clubs || [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#cc208f]">Open for registration</p>
          <h1 className={`mt-1 font-display font-bold leading-tight tracking-tight ${compact ? "text-[22px]" : "text-[26px] sm:text-[30px]"}`}>Find a bootcamp to join</h1>
          <p className="mt-1 max-w-[560px] text-[14px] leading-relaxed text-muted-foreground">Every open Zero Form from every club on Zero Club. Pick one and register.</p>
        </div>
      </div>

      <label className="relative block">
        <span className="sr-only">Search Zero Forms</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search bootcamps, skills or clubs"
          className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-11 text-[15px] outline-none transition placeholder:text-muted-foreground/70 focus:border-[#cc208f]/50 focus:ring-4 focus:ring-[#cc208f]/10"
        />
        {search && (
          <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06]">
            <X className="h-4 w-4" />
          </button>
        )}
      </label>

      {clubs.length > 1 && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
          <Chip on={!club} onClick={() => setClub(null)}>All clubs</Chip>
          {clubs.map((c) => (
            <Chip key={c.id} on={club === c.id} onClick={() => setClub(club === c.id ? null : c.id)}>
              <ClubMark name={c.name} logo={c.logo_url} size={20} />
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-4">
        {source.isLoading ? (
          <div className="grid place-items-center rounded-[22px] border border-border bg-card py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : source.error ? (
          <div className="rounded-[22px] border border-border bg-card p-6 text-center text-[14px] text-muted-foreground">
            Couldn't load Zero Forms. <button type="button" onClick={() => void source.refetch()} className="font-semibold text-foreground underline">Try again</button>
          </div>
        ) : forms.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-border bg-card px-6 py-14 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]"><Compass className="h-6 w-6" /></span>
            <h3 className="mt-3 text-[16px] font-bold">{term || club ? "No open forms match" : "No open registrations right now"}</h3>
            <p className="mx-auto mt-1 max-w-[340px] text-[13.5px] text-muted-foreground">
              {term || club ? "Try another search or club." : "When a club opens registration for a bootcamp, it shows up here."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {forms.map((form) => <FormCard key={form.id} form={form} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function FormCard({ form }: { form: BrowseForm }) {
  const seatsLow = form.seats_left !== null && form.seats_left <= 10;
  return (
    <Link to="/form/$slug" params={{ slug: form.slug }} className="group flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]">
      <div className="relative aspect-[16/9] bg-cover bg-center" style={{ backgroundImage: form.banner_url ? `url(${form.banner_url})` : "linear-gradient(120deg,#e94fb0,#b62ba4 55%,#7c3aed)" }}>
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-bold text-white backdrop-blur">{priceLabel(form)}</span>
        {form.registered && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11.5px] font-bold text-white"><Check className="h-3.5 w-3.5" /> Registered</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
          <ClubMark name={form.club_name} logo={form.club_logo} size={20} />
          <span className="truncate">{form.club_name}{form.cohort_name && form.cohort_name !== form.club_name ? ` · ${form.cohort_name}` : ""}</span>
        </p>
        <h3 className="mt-2 line-clamp-2 text-[16px] font-bold leading-snug">{form.title}</h3>
        {form.description && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{form.description}</p>}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
          {form.starts_at && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Starts {day(form.starts_at)}</span>}
          {form.seats_left !== null && <span className={`inline-flex items-center gap-1 ${seatsLow ? "font-semibold text-amber-600" : ""}`}><Users className="h-3.5 w-3.5" /> {form.seats_left} seat{form.seats_left === 1 ? "" : "s"} left</span>}
          {form.category && <span>{form.category}</span>}
        </div>
        {form.registration_deadline && <p className="mt-1 text-[12px] text-muted-foreground">Register by {day(form.registration_deadline)}</p>}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13.5px] font-semibold text-[#cc208f]">
          {form.registered ? "View my registration" : "Register"} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition ${on ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );
}

function ClubMark({ name, logo, size }: { name: string; logo: string | null; size: number }) {
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-md bg-foreground/[0.08] text-[10px] font-bold text-foreground" style={{ width: size, height: size }}>
      {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}
