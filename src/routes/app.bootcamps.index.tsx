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
      <div className="fixed top-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 bg-background/80 backdrop-blur-md px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between border-b border-border">
        <h1 className="font-display text-2xl font-bold">Bootcamps</h1>
        <Link to="/app/notifications" className="grid h-10 w-10 place-items-center rounded-full bg-accent/30 transition active:scale-95 text-foreground relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-primary border-2 border-background" />
        </Link>
      </div>
      
      <div className="px-5 pt-[88px">
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-card/40 px-4 py-3">
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
                className={`shrink-0 pb-3 text-[14px] font-bold tracking-wide transition-all relative whitespace-nowrap ${
                  active 
                    ? "text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Featured - Only show when All or category is selected and we have data */}
        {isLoading && (
          <div className="mt-6 flex justify-center py-10">
             <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        
        {!isLoading && filteredCamps.length > 0 && (activeCategory === "All" || activeCategory === filteredCamps[0].category) && (
          <section className="mt-6">
            <Link 
              to="/app/bootcamps/$id" 
              params={{ id: filteredCamps[0].id }}
              className="block relative overflow-hidden rounded-3xl bg-gradient-primary p-6 shadow-glow transition active:scale-[0.98"
            >
              <span className="rounded-full bg-background/15 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Featured</span>
              <h2 className="mt-3 font-display text-2xl font-bold text-primary-foreground">{filteredCamps[0].title}</h2>
              <p className="mt-2 text-sm text-primary-foreground/85 line-clamp-2">{filteredCamps[0].description}</p>
              <div className="mt-5 flex items-center justify-between">
                <div className="text-primary-foreground"><span className="font-display text-2xl font-bold">₦{Number(filteredCamps[0].price).toLocaleString()}</span></div>
                <div className="rounded-full bg-background px-4 py-2 text-xs font-semibold text-foreground">Enroll →</div>
              </div>
            </Link>
          </section>
        )}

        {/* Grid */}
        <section className="mt-6 space-y-4 pb-10">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {activeCategory === "All" ? "All cohorts" : `${activeCategory} cohorts`}
            </h3>
            {filteredCamps.length === 0 && (
              <span className="text-[10px] text-muted-foreground italic">No results found</span>
            )}
          </div>
          
          <div className="grid gap-4">
            {filteredCamps?.map((c: any) => (
              <Link key={c.id} to="/app/bootcamps/$id" params={{ id: c.id }} className="block transition active:scale-[0.98">
                <article className="overflow-hidden rounded-3xl bg-gradient-card shadow-soft border border-border/5">
                  <div className="h-24 bg-muted relative">
                    {c.banner_url && <img src={c.banner_url} alt="" className="w-full h-full object-cover" />}
                    {!c.banner_url && <div className="w-full h-full bg-gradient-to-br from-primary/20 to-purple-500/20" />}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold tracking-wider text-primary">{c.category}</span>
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
                    <div className="mt-4 flex items-center justify-between">
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
                <div className="absolute inset-0 animate-pulse bg-primary/20 blur-2xl rounded-full" />
                <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-card border border-border/50 shadow-glow">
                  <Rocket className="h-10 w-10 text-primary" strokeWidth={1.5} />
                </div>
              </div>
              <h3 className="text-lg font-bold text-foreground">New cohorts are fueling up</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-[200px] mx-auto">
                We're curating the best builders to lead the next session in this category.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
