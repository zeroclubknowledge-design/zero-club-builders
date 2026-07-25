import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Bell, BookOpen, Building2, Search, Users, X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { getBootcamps } from "@/api";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/app/bootcamps/")({
  component: Bootcamps,
});

const relationCount = (value: any) => Number(Array.isArray(value) ? value[0]?.count : value?.count) || 0;
const formatPrice = (price: unknown) => Number(price || 0) > 0 ? `₦${Number(price).toLocaleString()}` : 'Free';

function BootcampCover({ bootcamp, className = '' }: { bootcamp: any; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#171318] ${className}`}>
      {bootcamp.banner_url ? (
        <img src={bootcamp.banner_url} alt={`${bootcamp.title} bootcamp`} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-primary/[0.08]">
          <BookOpen className="h-9 w-9 text-primary/60" />
        </div>
      )}
      {bootcamp.profiles?.account_type === 'Institution' && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-background/95 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-foreground shadow-sm backdrop-blur-sm">
          <Building2 className="h-3 w-3" /> Institution
        </span>
      )}
    </div>
  );
}

function Bootcamps() {
  const { data: bootcamps = [], isLoading } = useQuery({
    queryKey: ['bootcamps'],
    queryFn: () => getBootcamps(),
  });
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = useMemo(() => [
    'All',
    ...Array.from(new Set(bootcamps.map((camp: any) => camp.category).filter(Boolean))) as string[],
  ], [bootcamps]);

  const filteredCamps = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return bootcamps.filter((camp: any) => {
      const matchesCategory = activeCategory === 'All' || camp.category === activeCategory;
      const searchable = [camp.title, camp.description, camp.category, camp.profiles?.full_name, camp.profiles?.username]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });
  }, [bootcamps, activeCategory, searchQuery]);

  const showFeatured = activeCategory === 'All' && !searchQuery.trim() && filteredCamps.length > 0;
  const featured = showFeatured ? filteredCamps[0] : null;
  const catalogue = featured ? filteredCamps.slice(1) : filteredCamps;
  const totalLearners = bootcamps.reduce((total: number, camp: any) => total + relationCount(camp.enrollments), 0);
  const institutionCount = bootcamps.filter((camp: any) => camp.profiles?.account_type === 'Institution').length;

  return (
    <div className="min-h-screen bg-[#f8f7f5] pb-24 dark:bg-background md:pb-12">
      <header className="sticky top-0 z-40 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-3.5 md:px-7">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight md:text-[20px]">Bootcamps</h1>
            <p className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">Structured learning led by working tutors and institutions</p>
          </div>
          <Link to="/app/notifications" aria-label="Notifications" className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent">
            <Bell className="h-[17px] w-[17px]" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-background" />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 py-5 md:px-7 md:py-7">
        <section className="border-b border-border/70 pb-5 md:flex md:items-end md:justify-between md:gap-8 md:pb-7">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Learning catalogue</p>
            <h2 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-foreground md:text-[30px]">Learn with a cohort. Leave with proof.</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground md:text-[14px]">Find live, structured programmes where lessons lead to shipped work, feedback, and visible progress.</p>
          </div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-card py-3 md:mt-0 md:min-w-[330px]">
            <div className="px-3 text-center"><p className="text-[17px] font-semibold tabular-nums">{bootcamps.length}</p><p className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">Cohorts</p></div>
            <div className="px-3 text-center"><p className="text-[17px] font-semibold tabular-nums">{totalLearners}</p><p className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">Learners</p></div>
            <div className="px-3 text-center"><p className="text-[17px] font-semibold tabular-nums">{institutionCount}</p><p className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">Institutions</p></div>
          </div>
        </section>

        <section className="py-5">
          <div className="space-y-3">
            <label className="flex h-12 w-full items-center gap-3 rounded-lg border border-border bg-card px-4 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10 md:h-[52px]">
              <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search skills, bootcamps, tutors or institutions" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground" />
              {searchQuery && <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5" /></button>}
            </label>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
              {categories.map((category) => (
                <button key={category} onClick={() => setActiveCategory(category)} className={`h-9 shrink-0 rounded-lg border px-3.5 text-[11.5px] font-semibold transition-colors ${activeCategory === category ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}>
                  {category}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between px-0.5 text-[10.5px] text-muted-foreground">
            <span>{isLoading ? 'Loading programmes...' : `${filteredCamps.length} ${filteredCamps.length === 1 ? 'programme' : 'programmes'} found`}</span>
            {(activeCategory !== 'All' || searchQuery) && <button onClick={() => { setActiveCategory('All'); setSearchQuery(''); }} className="font-semibold text-foreground">Reset filters</button>}
          </div>
        </section>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="overflow-hidden rounded-lg border border-border bg-card"><div className="aspect-[16/9] shimmer bg-foreground/[0.05]" /><div className="space-y-3 p-4"><div className="h-3 w-20 rounded shimmer bg-foreground/[0.05]" /><div className="h-5 w-4/5 rounded shimmer bg-foreground/[0.05]" /><div className="h-3 w-full rounded shimmer bg-foreground/[0.05]" /></div></div>)}
          </div>
        ) : (
          <>
            {featured && (
              <section className="mb-6">
                <div className="mb-3 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Featured programme</h3><span className="text-[10.5px] text-muted-foreground">Newest active cohort</span></div>
                <Link to="/app/bootcamps/$id" params={{ id: featured.id }} className="grid overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/20 md:grid-cols-[42%_minmax(0,1fr)]">
                  <BootcampCover bootcamp={featured} className="aspect-[16/9] md:aspect-auto md:min-h-[245px]" />
                  <div className="flex min-w-0 flex-col p-5 md:p-7">
                    <div className="flex items-center justify-between gap-4"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">{featured.category}</span><span className="text-[13px] font-semibold tabular-nums">{formatPrice(featured.price)}</span></div>
                    <h3 className="mt-3 text-[21px] font-semibold leading-tight tracking-tight md:text-[25px]">{featured.title}</h3>
                    <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground md:text-[13.5px]">{featured.description || 'A structured learning experience built around practical work and community feedback.'}</p>
                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {relationCount(featured.enrollments)} learners</span>
                      <span className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> {relationCount(featured.modules)} sections</span>
                      <span>By {featured.profiles?.full_name || featured.profiles?.username}</span>
                    </div>
                    <div className="mt-auto pt-6"><span className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-[12px] font-semibold text-background">View programme <ArrowRight className="h-4 w-4" /></span></div>
                  </div>
                </Link>
              </section>
            )}

            {catalogue.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{activeCategory === 'All' ? 'All programmes' : activeCategory}</h3><span className="text-[10.5px] text-muted-foreground">{catalogue.length} available</span></div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {catalogue.map((camp: any) => (
                    <Link key={camp.id} to="/app/bootcamps/$id" params={{ id: camp.id }} className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-foreground/20 hover:shadow-soft">
                      <BootcampCover bootcamp={camp} className="aspect-[16/9] shrink-0" />
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-center justify-between gap-3"><span className="truncate text-[9.5px] font-semibold uppercase tracking-[0.1em] text-primary">{camp.category}</span><span className="shrink-0 text-[12px] font-semibold tabular-nums">{formatPrice(camp.price)}</span></div>
                        <h4 className="mt-2 line-clamp-2 text-[16px] font-semibold leading-snug tracking-tight group-hover:text-primary">{camp.title}</h4>
                        <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">{camp.description || 'Structured lessons, feedback, and practical work.'}</p>
                        <div className="mt-4 flex items-center gap-2.5 border-t border-border/60 pt-3">
                          <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">{camp.profiles?.avatar_url ? <img src={camp.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : (camp.profiles?.full_name || camp.profiles?.username || 'T').substring(0, 1).toUpperCase()}</div>
                          <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">{camp.profiles?.full_name || camp.profiles?.username}</span>
                          <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"><Users className="h-3 w-3" /> {relationCount(camp.enrollments)}</span>
                          <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"><BookOpen className="h-3 w-3" /> {relationCount(camp.modules)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {filteredCamps.length === 0 && (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-border bg-card px-6 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-lg border border-border"><Search className="h-5 w-5 text-muted-foreground" /></div>
                <h3 className="mt-4 text-[16px] font-semibold tracking-tight">No matching bootcamps</h3>
                <p className="mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">Try another skill, tutor, institution, or reset the current category.</p>
                <button onClick={() => { setActiveCategory('All'); setSearchQuery(''); }} className="mt-5 rounded-lg bg-foreground px-4 py-2.5 text-[12px] font-semibold text-background">Reset search</button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
