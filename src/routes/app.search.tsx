import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, X, Search as SearchIcon } from "@/components/icons/glyphs";
import { searchEverything } from "@/api";
import { useUser } from "@/hooks/useUser";
import { useFollow } from "@/hooks/useFollow";
import { useGoBack } from "@/hooks/useGoBack";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { displayName } from "@/lib/utils";

export const Route = createFileRoute("/app/search")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === "string" && search.q ? { q: search.q } : {},
  component: SearchPage,
});

const FILTERS = ["All", "People", "Posts", "Clubs", "Bootcamps"] as const;
type Filter = (typeof FILTERS)[number];

function Avatar({ src, name, square = false }: { src?: string | null; name: string; square?: boolean }) {
  return (
    <div className={`h-12 w-12 shrink-0 overflow-hidden bg-foreground/[0.06] ${square ? "rounded-xl" : "rounded-full"}`}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[15px] font-semibold uppercase text-muted-foreground">
          {name.substring(0, 1)}
        </div>
      )}
    </div>
  );
}

function PersonRow({ person, query }: { person: any; query: string }) {
  const { isFollowing, isSelf, toggleFollow, loading } = useFollow(person.id);
  const role = person.account_type === "Institution" ? "Institution" : person.account_type === "Tutor" ? "Tutor" : "Builder";
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Link to="/app/profile/$id" params={{ id: person.username || person.id }} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar src={person.avatar_url} name={person.username || "?"} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-foreground">{displayName(person)}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {role}
            {person.username ? ` · @${person.username}` : ""}
          </p>
          {person.bio && query && person.bio.toLowerCase().includes(query.toLowerCase()) && (
            <p className="truncate text-[13px] text-muted-foreground">{person.bio}</p>
          )}
        </div>
      </Link>
      {!isSelf && (
        <button
          onClick={() => toggleFollow()}
          disabled={loading}
          className={`h-8 shrink-0 rounded-full px-4 text-[14px] font-semibold tap disabled:opacity-50 ${
            isFollowing ? "text-muted-foreground" : "border-[1.5px] border-foreground text-foreground hover:bg-foreground/[0.04]"
          }`}
        >
          {isFollowing ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}

function Section({ title, onSeeAll, children }: { title: string; onSeeAll?: () => void; children: React.ReactNode }) {
  return (
    <section className="mt-2 bg-card py-3 md:rounded-xl md:border md:border-border">
      <h2 className="px-4 pb-1 font-display text-[16px] font-semibold text-foreground">{title}</h2>
      {children}
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="mt-1 w-full border-t border-border pt-3 text-center text-[14px] font-semibold text-muted-foreground hover:text-foreground"
        >
          See all {title.toLowerCase()}
        </button>
      )}
    </section>
  );
}

function SearchPage() {
  const { q = "" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const goBack = useGoBack("/app");
  const { data: currentUser } = useUser();
  const { format } = useWalletCurrency();
  const [text, setText] = useState(q);
  const [query, setQuery] = useState(q);
  const [filter, setFilter] = useState<Filter>("All");
  const [commentPost, setCommentPost] = useState<any>(null);

  // Search a moment after typing stops, and keep the words in the address so
  // back from a result lands on the same results.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = text.trim();
      setQuery(next);
      navigate({ search: next ? { q: next } : {}, replace: true });
    }, 350);
    return () => window.clearTimeout(handle);
  }, [text]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", query],
    enabled: query.length >= 2,
    staleTime: 1000 * 30,
    queryFn: () => searchEverything(query),
  });

  const results = data || { posts: [], bootcamps: [], profiles: [], clubs: [] };
  const empty =
    !isFetching &&
    query.length >= 2 &&
    results.posts.length + results.bootcamps.length + results.profiles.length + results.clubs.length === 0;
  const show = (f: Filter) => filter === "All" || filter === f;
  const limit = (items: any[], f: Filter) => (filter === f ? items : items.slice(0, 3));

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-1 px-2">
          <button onClick={goBack} aria-label="Back" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <label className="mr-2 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-foreground/[0.05] px-3">
            <SearchIcon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search people, clubs, notes"
              aria-label="Search"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {text && (
              <button onClick={() => setText("")} aria-label="Clear search" className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-border px-4 pb-3">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-8 shrink-0 rounded-full px-3.5 text-[14px] font-semibold tap ${
                filter === f ? "bg-foreground text-background" : "border border-foreground/30 text-foreground/75 hover:bg-foreground/[0.04]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      <main className="w-full md:mx-auto md:max-w-[680px]">
        {query.length < 2 ? (
          <p className="mt-2 bg-card px-4 py-10 text-center text-[14px] text-muted-foreground md:rounded-xl">
            Search for builders, tutors, clubs, bootcamps and posts.
          </p>
        ) : isFetching && !data ? (
          <div className="mt-2 flex flex-col items-center bg-card py-16 md:rounded-xl">
            <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div className="h-full w-1/3 rounded-full bg-accent animate-progress" />
            </div>
            <p className="mt-4 text-[14px] text-muted-foreground">Searching the Club</p>
          </div>
        ) : empty ? (
          <div className="mt-2 flex flex-col items-center bg-card px-8 py-16 text-center md:rounded-xl">
            <h2 className="font-display text-[18px] font-semibold text-foreground">Nothing matched</h2>
            <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
              No builders, clubs, bootcamps or posts for “{query}”.
            </p>
          </div>
        ) : (
          <>
            {show("People") && results.profiles.length > 0 && (
              <Section title="People" onSeeAll={filter === "All" && results.profiles.length > 3 ? () => setFilter("People") : undefined}>
                {limit(results.profiles, "People").map((person: any) => (
                  <PersonRow key={person.id} person={person} query={query} />
                ))}
              </Section>
            )}

            {show("Clubs") && results.clubs.length > 0 && (
              <Section title="Clubs" onSeeAll={filter === "All" && results.clubs.length > 3 ? () => setFilter("Clubs") : undefined}>
                {limit(results.clubs, "Clubs").map((club: any) => (
                  <Link key={club.id} to="/club/$id" params={{ id: club.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-foreground/[0.02]">
                    <Avatar src={club.avatar_url || club.banner_url} name={club.name || "?"} square />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-foreground">{club.name}</p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {club.is_private ? "Private" : club.requires_approval ? "Approval needed" : "Open"}
                        {club.category ? ` · ${club.category}` : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </Section>
            )}

            {show("Bootcamps") && results.bootcamps.length > 0 && (
              <Section title="Bootcamps" onSeeAll={filter === "All" && results.bootcamps.length > 3 ? () => setFilter("Bootcamps") : undefined}>
                {limit(results.bootcamps, "Bootcamps").map((camp: any) => (
                  <Link key={camp.id} to="/app/bootcamps/$id" params={{ id: camp.id }} className="flex gap-3 px-4 py-2.5 hover:bg-foreground/[0.02]">
                    <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-foreground/[0.06]">
                      {camp.banner_url && <img src={camp.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-[15px] font-semibold text-foreground">{camp.title}</p>
                      <p className="mt-0.5 truncate text-[13px] text-muted-foreground">By {displayName(camp.profiles, "a tutor")}</p>
                      <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-foreground">
                        {Number(camp.price) > 0 ? format(Number(camp.price)) : "Free"}
                      </p>
                    </div>
                  </Link>
                ))}
              </Section>
            )}

            {show("Posts") && results.posts.length > 0 && (
              <div>
                <h2 className="mt-2 bg-card px-4 pt-3 font-display text-[16px] font-semibold text-foreground md:rounded-t-xl">Posts</h2>
                {limit(results.posts, "Posts").map((post: any) => (
                  <PostCard key={post.id} post={post} currentUser={currentUser} onCommentClick={setCommentPost} />
                ))}
                {filter === "All" && results.posts.length > 3 && (
                  <button
                    onClick={() => setFilter("Posts")}
                    className="mt-2 w-full bg-card py-3 text-center text-[14px] font-semibold text-muted-foreground hover:text-foreground md:rounded-xl"
                  >
                    See all posts
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <CommentDrawer post={commentPost} isOpen={!!commentPost} onOpenChange={(open) => !open && setCommentPost(null)} />
      {/* The last card runs to the bottom of the screen, so the page never
          ends in a strip of bare background under the tab bar. */}
      <div aria-hidden className="min-h-24 flex-1 bg-card md:bg-transparent" />
    </div>
  );
}
