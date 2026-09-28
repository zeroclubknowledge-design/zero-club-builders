import { useLoaderData, createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, BadgeCheck, Users, Loader2, Hash, Search, Shield } from "@/components/icons/glyphs";
import { useFollow } from "@/hooks/useFollow";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getFirstName } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/app/profile_/$id/network")({
  loader: async ({ params: { id } }) => {
    const { data: { session } } = await supabase.auth.getSession();
    
    // Fetch profile
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const query = supabase.from('profiles').select('*');
    const { data: profile, error } = await (isUuid 
      ? query.eq('id', id) 
      : query.ilike('username', id)
    ).maybeSingle();

    if (error || !profile) {
      throw redirect({ to: '/app' });
    }
    
    return { profile, currentUser: session?.user || null };
  },
  component: ProfileNetwork
});

function ProfileNetwork() {
  const navigate = useNavigate();
  const { profile, currentUser } = useLoaderData({ from: "/app/profile_/$id/network" });
  const [activeTab, setActiveTab] = useState<"following" | "followers" | "clubs">("followers");
  const [search, setSearch] = useState("");
  const [isFollowing, setIsFollowing] = useState(false);
  useEffect(() => {
    async function checkFollow() {
      if (!currentUser || currentUser.id === profile.id) return;
      const { data } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', currentUser.id)
        .eq('following_id', profile.id)
        .maybeSingle();
      setIsFollowing(!!data);
    }
    checkFollow();
  }, [profile.id, currentUser]);

  const { data: following, isLoading: followingLoading } = useQuery({
    queryKey: ['following', profile.id],
    queryFn: async () => {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', profile.id);
      const ids = follows?.map(f => f.following_id) || [];
      if (ids.length === 0) return [];
      const { data } = await supabase.from('profiles').select('*').in('id', ids);
      return data || [];
    }
  });

  const { data: followers, isLoading: followersLoading } = useQuery({
    queryKey: ['followers', profile.id],
    queryFn: async () => {
      const { data: follows } = await supabase.from('follows').select('follower_id').eq('following_id', profile.id);
      const ids = follows?.map(f => f.follower_id) || [];
      if (ids.length === 0) return [];
      const { data } = await supabase.from('profiles').select('*').in('id', ids);
      return data || [];
    }
  });

  const { data: clubs, isLoading: clubsLoading } = useQuery({
    queryKey: ['profileClubs', profile.id],
    queryFn: async () => {
      const { data: members } = await supabase
        .from('club_members')
        .select('club_id')
        .eq('profile_id', profile.id)
        .eq('status', 'active');
      
      const clubIds = [...new Set(members?.map(m => m.club_id) || [])];
      if (clubIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .in('id', clubIds)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const { data: clubMembers, error: membersError } = await supabase
        .from('club_members')
        .select('club_id')
        .in('club_id', clubIds)
        .eq('status', 'active');
      if (membersError) throw membersError;

      const membersByClub = (clubMembers || []).reduce<Record<string, number>>((counts, member) => {
        counts[member.club_id] = (counts[member.club_id] || 0) + 1;
        return counts;
      }, {});

      return (data || []).map((club) => ({
        ...club,
        members_count: membersByClub[club.id] || 0,
      }));
    }
  });

  const displayName = profile.full_name || profile.username;
  const isOwnProfile = currentUser?.id === profile.id;
  const needle = search.trim().toLowerCase();
  const matches = (user: any) =>
    !needle || [user.full_name, user.username].filter(Boolean).join(" ").toLowerCase().includes(needle);
  const visibleUsers = (activeTab === "following" ? (following ?? []) : (followers ?? [])).filter(matches);
  const visibleClubs = (clubs ?? []).filter((club: any) => !needle || String(club.name || "").toLowerCase().includes(needle));
  const tabs = [
    { id: "followers" as const, label: "Followers", count: followers?.length },
    { id: "following" as const, label: "Following", count: following?.length },
    { id: "clubs" as const, label: "Clubs", count: clubs?.length },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-50 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={() => navigate({ to: "/app/profile/$id", params: { id: profile.username || profile.id } })}
            aria-label="Back to profile"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="min-w-0 flex-1 truncate font-display text-[18px] font-semibold text-foreground">{displayName}</h1>
        </div>
        <div className="zc-page-width mx-auto grid w-full max-w-[680px] grid-cols-3 border-b border-border text-center text-[14px] font-semibold">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex h-11 items-center justify-center gap-1 transition-colors ${
                activeTab === tab.id ? "text-foreground shadow-[inset_0_-2px_0_currentColor]" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {typeof tab.count === "number" && <span className="tabular-nums">{tab.count.toLocaleString()}</span>}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="zc-page-width mx-auto w-full max-w-[680px] px-3 py-2.5">
          <label className="flex h-[38px] items-center gap-2 rounded-full bg-foreground/[0.06] px-3">
            <Search className="h-[17px] w-[17px] shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${activeTab}`}
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
      </header>

      <main className="zc-page-width mx-auto mt-2 flex w-full max-w-[680px] flex-1 flex-col bg-card md:mb-6 md:rounded-xl md:border md:border-border">
        {activeTab === "following" || activeTab === "followers" ? (
          (activeTab === "following" ? followingLoading : followersLoading) ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : visibleUsers.length > 0 ? (
            visibleUsers.map((user: any) => (
              <div key={user.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <Link to="/app/profile/$id" params={{ id: user.username || user.id }} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[15px] font-semibold text-muted-foreground">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      (user.full_name || user.username || "U").charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[15px] font-semibold text-foreground">{user.full_name || user.username}</span>
                      {user.tier === 'Premium' && <BadgeCheck className="h-4 w-4 shrink-0 fill-[#cc208f] text-white" />}
                      {user.tier === 'Premium+' && <BadgeCheck className="h-4 w-4 shrink-0 fill-[#e0a800] text-white" />}
                    </div>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {user.bio ? String(user.bio).replace(/\s+/g, " ") : `@${user.username || user.id.substring(0, 8)}`}
                    </p>
                  </div>
                </Link>
                <RowFollowButton userId={user.id} followsYou={isOwnProfile && activeTab === "followers"} />
              </div>
            ))
          ) : (
            <div className="px-6 py-16 text-center">
              <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-[15px] font-semibold text-foreground">
                {needle ? "No one matches that" : activeTab === "following" ? "Not following anyone yet" : "No followers yet"}
              </p>
            </div>
          )
        ) : clubsLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : profile?.hide_clubs_unless_following && !isFollowing && !isOwnProfile ? (
          <div className="px-6 py-16 text-center">
            <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-[15px] font-semibold text-foreground">Follow {getFirstName(profile)} to see their clubs</p>
          </div>
        ) : visibleClubs.length > 0 ? (
          visibleClubs.map((c: any) => (
            <Link key={c.id} to="/app/clubs/chat" search={{ clubId: c.id }} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-foreground/[0.02]">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                {c.logo_url || c.banner_url ? (
                  <img src={c.logo_url || c.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <Hash className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-[15px] font-semibold text-foreground">{c.name}</h4>
                <p className="truncate text-[13px] text-muted-foreground">
                  {Number(c.members_count || 0).toLocaleString()} {Number(c.members_count) === 1 ? "member" : "members"}
                  {c.description ? ` · ${c.description}` : ""}
                </p>
              </div>
            </Link>
          ))
        ) : (
          <div className="px-6 py-16 text-center">
            <Hash className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-[15px] font-semibold text-foreground">{needle ? "No clubs match that" : "Not a member of any clubs"}</p>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Follow straight from the list, through the same hook every other follow
 * button uses, so the state agrees with the rest of the app.
 */
function RowFollowButton({ userId, followsYou }: { userId: string; followsYou: boolean }) {
  const { isFollowing, isSelf, loading, toggleFollow, currentUser } = useFollow(userId);
  if (!currentUser || isSelf) return null;

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        try {
          await toggleFollow();
        } catch (error: any) {
          toast.error(error?.message || "Could not update follow");
        }
      }}
      className={`h-8 shrink-0 rounded-full px-3.5 text-[14px] font-semibold transition disabled:opacity-60 ${
        isFollowing
          ? "border border-foreground/30 text-muted-foreground hover:border-foreground/50"
          : "border-[1.5px] border-foreground text-foreground hover:bg-foreground/[0.04]"
      }`}
    >
      {isFollowing ? "Following" : followsYou ? "Follow back" : "Follow"}
    </button>
  );
}
