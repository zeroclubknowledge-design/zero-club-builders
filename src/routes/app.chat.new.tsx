import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, MessageCircle, UserPlus, X } from "@/components/icons/glyphs";
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
    <div className="flex min-h-screen flex-col bg-card">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={() => navigate({ to: '/app/chat' })}
            aria-label="Close"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <X className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold text-foreground">New message</h1>
        </div>
        <label className="mx-auto flex w-full max-w-[680px] items-center gap-2 border-b border-border px-4 pb-2.5 pt-1">
          <span className="text-[15px] text-muted-foreground">To:</span>
          <input
            type="text"
            placeholder="Search your followers"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col pb-10">
        <h2 className="px-4 pb-1.5 pt-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {searchQuery ? "Results" : "Your followers"}{!isLoading && ` · ${filteredFollowers.length}`}
        </h2>
        {isLoading ? (
          <div className="grid min-h-52 place-items-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" /></div>
        ) : filteredFollowers.length > 0 ? filteredFollowers.map((follower: any) => (
          <button
            key={follower.id}
            onClick={() => navigate({ to: "/app/chat/$id", params: { id: follower.id } })}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-foreground/[0.03]"
          >
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
              {follower.avatar_url
                ? <img src={follower.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                : <div className="grid h-full place-items-center bg-accent/10 text-[14px] font-semibold text-accent">{(follower.full_name || follower.username || 'U').substring(0, 1).toUpperCase()}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate text-[15px] font-semibold text-foreground">{follower.full_name || follower.username}</span>
                {follower.verified && <BadgeCheck className="h-4 w-4 shrink-0 fill-[#cc208f] text-white" />}
              </div>
              <span className="block truncate text-[13px] text-muted-foreground">@{follower.username || getFirstName(follower)}</span>
            </div>
            <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
        )) : (
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05]"><UserPlus className="h-5 w-5 text-muted-foreground" /></div>
            <h3 className="text-[16px] font-semibold text-foreground">No people found</h3>
            <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted-foreground">{searchQuery ? "Try another name or username." : "People who follow you show up here, ready to message."}</p>
          </div>
        )}
      </main>
    </div>
  );
}
