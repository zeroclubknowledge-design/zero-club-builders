import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, ChevronLeft, UserPlus, MessageCircle, Check } from "lucide-react";
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
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/50 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] space-y-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.history.back()} 
            className="grid h-10 w-10 place-items-center rounded-full bg-accent/20 border border-border transition active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">New Message</h1>
            <p className="text-[11px] text-muted-foreground">Select a builder</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            type="text"
            placeholder="Search followers..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl bg-accent/20 border border-border p-3.5 pl-12 text-sm text-foreground outline-none transition focus:border-primary/50 focus:bg-accent/30 placeholder:text-muted-foreground/60"
          />
        </div>
      </header>

      <div className="flex flex-col flex-1 divide-y divide-border/20">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          filteredFollowers.map((follower: any) => (
            <button 
              key={follower.id} 
              onClick={() => navigate({ to: "/app/chat/$id", params: { id: follower.id } })}
              className="flex items-center gap-4 p-4 transition active:bg-accent/10 text-left group"
            >
              <div className="h-12 w-12 rounded-2xl bg-muted overflow-hidden border border-border/50 group-active:scale-95 transition-transform shadow-sm">
                {follower.avatar_url ? (
                  <img src={follower.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-muted to-accent flex items-center justify-center font-bold text-muted-foreground text-lg">
                    {(follower.full_name || follower.username || 'U').substring(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-foreground truncate">{follower.full_name || follower.username}</span>
                  {follower.verified && <Check className="h-3 w-3 text-primary fill-primary" />}
                </div>
                <span className="text-xs text-muted-foreground">{getFirstName(follower)}</span>
              </div>
              <MessageCircle className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))
        )}

        {!isLoading && filteredFollowers.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center py-32 text-center px-10">
            <div className="h-20 w-20 rounded-3xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-6">
              <UserPlus className="h-10 w-10 text-primary opacity-40" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-foreground">No followers found</h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[240px]">
              {searchQuery ? "No builders match your search." : "Followers who you follow back will appear here to start a chat."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
