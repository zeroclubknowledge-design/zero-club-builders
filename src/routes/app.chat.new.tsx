import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, ChevronLeft, UserPlus, MessageCircle, Check } from "@/components/icons/solar";
import { getFollowers } from "@/api";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { getFirstName } from "@/lib/utils";

export const Route = createFileRoute("/app/chat/new")({
  component: NewMessagePage,
});

function NewMessagePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: followers = [], isLoading } = useQuery({
    queryKey: ["followers", "current"],
    queryFn: getFollowers,
  });

  const filteredFollowers = useMemo(() => {
    if (!searchQuery) return followers;
    const q = searchQuery.toLowerCase();
    return followers.filter((f: any) => 
      f.full_name?.toLowerCase().includes(q) || 
      f.username?.toLowerCase().includes(q)
    );
  }, [followers, searchQuery]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[980px] items-center gap-3">
          <button 
            onClick={() => navigate({ to: '/app/chat' })} 
            className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card transition hover:bg-muted active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Messages</p>
            <h1 className="text-[19px] font-semibold tracking-tight text-foreground">New message</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[980px] gap-6 px-4 py-6 md:grid-cols-[280px_minmax(0,1fr)] md:px-7 md:py-8">
        <aside className="hidden md:block">
          <div className="sticky top-28 rounded-lg bg-[#171218] p-6 text-white">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#cc208f]"><MessageCircle className="h-5 w-5 fill-current" /></div>
            <h2 className="mt-5 text-[21px] font-semibold tracking-tight">Start a useful conversation.</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-white/60">Choose someone in your network and continue the work privately.</p>
          </div>
        </aside>

        <section>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search your network" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus className="h-12 w-full rounded-lg border border-border bg-card pl-11 pr-4 text-[14px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </div>
          <div className="mt-4 flex items-center justify-between"><h2 className="text-[12px] font-semibold uppercase text-muted-foreground">{searchQuery ? "Search results" : "Your network"}</h2><span className="text-[11px] text-muted-foreground">{filteredFollowers.length} people</span></div>

          <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card">
            {isLoading ? (
              <div className="grid min-h-52 place-items-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
            ) : filteredFollowers.length > 0 ? filteredFollowers.map((follower: any) => (
              <button key={follower.id} onClick={() => navigate({ to: "/app/chat/$id", params: { id: follower.id } })} className="group flex w-full items-center gap-3 border-b border-border p-3.5 text-left last:border-b-0 hover:bg-muted/50">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {follower.avatar_url ? <img src={follower.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center bg-primary/10 text-sm font-semibold text-primary">{(follower.full_name || follower.username || 'U').substring(0, 1).toUpperCase()}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><span className="truncate text-[14px] font-semibold text-foreground">{follower.full_name || follower.username}</span>{follower.verified && <Check className="h-3.5 w-3.5 fill-primary text-primary" />}</div>
                  <span className="text-[11.5px] text-muted-foreground">@{follower.username || getFirstName(follower)}</span>
                </div>
                <div className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground"><MessageCircle className="h-4 w-4" /></div>
              </button>
            )) : (
              <div className="flex min-h-64 flex-col items-center justify-center px-8 text-center">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-primary/10"><UserPlus className="h-5 w-5 text-primary" /></div>
                <h3 className="text-[15px] font-semibold text-foreground">No people found</h3>
                <p className="mt-1.5 max-w-xs text-[12px] leading-relaxed text-muted-foreground">{searchQuery ? "Try another name or username." : "People in your network will appear here when you are ready to message them."}</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
