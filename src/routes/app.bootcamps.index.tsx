import { useLoaderData, createFileRoute, Link } from "@tanstack/react-router";
import { Search, Clock, Users, Star, Bell, Rocket } from "lucide-react";
import { useState } from "react";
import { getBootcamps } from "@/api";

import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/app/bootcamps/")({
  component: Bootcamps,
});

function Bootcamps() {
  const { data: bootcampsData = [], isLoading } = useQuery({
    queryKey: ['bootcamps'],
    queryFn: () => getBootcamps()
  });
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCamps = bootcampsData?.filter((c: any) => {
    const matchesCategory = activeCategory === "All" || c.category === activeCategory;
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex flex-col">
      <div className="fixed top-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 md:sticky md:left-0 md:translate-x-0 md:max-w-none bg-background/85 backdrop-blur-xl backdrop-saturate-150 px-5 md:px-8 lg:px-10 pb-3.5 pt-[calc(1rem+env(safe-area-inset-top))] md:pt-5 flex items-center justify-between border-b hairline">
        <h1 className="font-display text-[19px] md:text-[22px] font-semibold tracking-tight">Bootcamps</h1>
        <Link to="/app/notifications" className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04] text-foreground relative">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-primary border-2 border-background" />
        </Link>
      </div>
      
      <div className="px-5 pt-[88px] md:px-8 lg:px-10 md:pt-0 md:pb-12 w-full max-w-[1200px]">
        <div className="mt-5 flex items-center gap-2.5 rounded-full bg-foreground/[0.04] ring-1 ring-transparent focus-within:ring-primary/40 focus-within:bg-background px-4 py-3 transition-all">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input 
            placeholder="Search by skill or tutor" 
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="mt-4 flex gap-6 overflow-x-auto no-scrollbar border-b border-border/20 px-1">
          {["All", "Design", "Dev", "Growth", "Motion", "AI"].map((c) => {
            const active = activeCategory === c;
            return (
              <button 
                key={c} 
                onClick={() => setActiveCategory(c)}
                className={`shrink-0 pb-3 text-[13.5px] font-semibold tracking-tight transition-colors relative whitespace-nowrap ${
                  active 
                    ? "text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Featured - Only show when All or category is selected and we have data */}
        {isLoading && (
          <div className="mt-6 flex justify-center py-10">
             <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]"><div className="h-full w-1/3 rounded-full bg-primary animate-progress" /></div>
          </div>
        )}
        
        {!isLoading && filteredCamps.length > 0 && (activeCategory === "All" || activeCategory === filteredCamps[0].category) && (
          <section className="mt-6">
            <Link 
              to="/app/bootcamps/$id" 
              params={{ id: filteredCamps[0].id }}
              className="block relative overflow-hidden rounded-3xl bg-[#141117] ring-1 ring-white/[0.06] p-6 md:p-8 lg:p-10 shadow-lift tap"
            >
              <div className="pointer-events-none absolute -top-20 -right-12 h-56 w-56 md:h-80 md:w-80 rounded-full bg-[#cc208f]/25 blur-[80px]" /><span className="relative rounded-full bg-white/[0.08] ring-1 ring-white/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/80">Featured</span>
              <h2 className="relative mt-3 font-display text-[22px] md:text-[28px] lg:text-[32px] font-semibold tracking-tight text-white md:max-w-2xl">{filteredCamps[0].title}</h2>
              <p className="relative mt-2 text-[13.5px] md:text-[15px] leading-relaxed text-white/60 line-clamp-2 md:max-w-xl">{filteredCamps[0].description}</p>
              <div className="relative mt-5 flex items-center justify-between">
                <div className="text-white"><span className="font-display text-[22px] font-semibold tracking-tight tabular-nums">₦{Number(filteredCamps[0].price).toLocaleString()}</span></div>
                <div className="rounded-full bg-white px-4 py-2 text-xs font-semibold tracking-tight text-black">Enroll →</div>
              </div>
            </Link>
          </section>
        )}

        {/* Grid */}
        <section className="mt-6 space-y-4 pb-20">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {activeCategory === "All" ? "All cohorts" : `${activeCategory} cohorts`}
            </h3>
            {filteredCamps.length === 0 && (
              <span className="text-[10px] text-muted-foreground italic">No results found</span>
            )}
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 md:gap-5">
            {filteredCamps?.map((c: any) => (
              <Link key={c.id} to="/app/bootcamps/$id" params={{ id: c.id }} className="block tap h-full">
                <article className="overflow-hidden rounded-3xl bg-card ring-1 ring-border shadow-soft hover:ring-foreground/15 hover:shadow-lift transition-all h-full flex flex-col">
                  <div className="h-24 md:h-32 bg-muted relative shrink-0">
                    {c.banner_url && <img src={c.banner_url} alt="" className="w-full h-full object-cover" />}
                    {!c.banner_url && <div className="w-full h-full bg-gradient-to-br from-primary/20 to-purple-500/20" />}
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">{c.category}</span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 fill-warning text-warning" /> 5.0
                      </div>
                    </div>
                    <h4 className="mt-2 font-display text-lg font-semibold leading-tight line-clamp-1">{c.title}</h4>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{c.profiles?.full_name || c.profiles?.username}</span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" /> 0
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-4">
                      <span className="font-display font-bold">₦{Number(c.price).toLocaleString()}</span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" /> 4 weeks
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>

          {filteredCamps.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="relative mb-6">
                
                <div className="relative grid h-14 w-14 place-items-center rounded-full ring-1 ring-border">
                  <Rocket className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
                </div>
              </div>
              <h3 className="text-[17px] font-semibold tracking-tight text-foreground">New cohorts are fueling up</h3>
              <p className="mt-1.5 text-[13.5px] text-muted-foreground max-w-[220px] mx-auto leading-relaxed">
                We're curating the best builders to lead the next session in this category.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
