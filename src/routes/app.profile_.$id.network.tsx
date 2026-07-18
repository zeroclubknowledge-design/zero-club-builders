import { useLoaderData, createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  BadgeCheck, ChevronLeft, Users, Loader2, Hash, CheckCircle2, Shield, X
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getProfile } from "@/api";
import { getFirstName } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { LinkifiedText } from "@/components/LinkifiedText";

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
  const [activeTab, setActiveTab] = useState<"following" | "followers" | "clubs">("following");
  const [isFollowing, setIsFollowing] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
        .eq('profile_id', profile.id);
      
      const clubIds = members?.map(m => m.club_id) || [];
      if (clubIds.length === 0) return [];
      
      const { data } = await supabase
        .from('clubs')
        .select('*')
        .in('id', clubIds)
        .order('created_at', { ascending: false });
        
      return data || [];
    }
  });

  const displayName = profile.full_name || profile.username;
  const isOwnProfile = currentUser?.id === profile.id;
  const visibleUsers = activeTab === "following" ? (following ?? []) : (followers ?? []);
  const visibleClubs = clubs ?? [];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className={`fixed top-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-md md:sticky md:left-0 md:translate-x-0 md:max-w-none h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] transition-all duration-300 ${
        scrolled 
          ? "bg-background/80 backdrop-blur-2xl border-b border-border/10 shadow-[0_1px_20px_rgba(0,0,0,0.08)]" 
          : "bg-background border-b border-border/20"
      }`}>
        <div className="relative z-20 flex items-center px-4 h-full gap-3">
          <button 
            onClick={() => navigate({ to: "/app/profile/$id", params: { id: profile.username || profile.id } })}
            className="grid h-9 w-9 place-items-center rounded-full transition-all active:scale-95 bg-accent/50 text-foreground hover:bg-accent"
          >
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
          
          <div>
            <h1 className="font-display max-w-[12rem] truncate text-sm font-bold leading-tight text-foreground">
              {displayName}
            </h1>
            <p className="text-[10px] text-muted-foreground">
              Network
            </p>
          </div>
        </div>
      </header>

      <main className="pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-6 max-w-md mx-auto md:max-w-[720px] md:mx-8 lg:mx-10">
        {/* Tabs */}
        <div className="flex px-4 border-b border-border/20 mt-2">
          {["following", "followers", "clubs"].map((t) => (
            <button 
              key={t}
              onClick={() => setActiveTab(t as any)}
              className={`flex-1 pb-3 pt-2 text-[13px] font-bold tracking-wide transition-all relative capitalize ${
                activeTab === t 
                  ? "text-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
              {activeTab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-foreground rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-2.5 pb-20">
          {activeTab === "following" || activeTab === "followers" ? (
            // Users List
            (activeTab === "following" ? followingLoading : followersLoading) ? (
              <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : visibleUsers.length > 0 ? (
              visibleUsers.map((user: any) => (
                <Link key={user.id} to="/app/profile/$id" params={{ id: user.username || user.id }} className="flex items-center gap-3 p-3.5 rounded-2xl bg-accent/10 border border-border/10 hover:bg-accent/20 transition-all active:scale-[0.98]">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-accent border border-border/20 flex items-center justify-center font-bold text-muted-foreground text-xs">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      user.username?.charAt(0).toUpperCase() || "U"
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground text-[14px] truncate">{user.full_name || user.username}</span>
                      {user.tier === 'Premium' && <BadgeCheck className="h-3.5 w-3.5 fill-[#cc208f] text-white shrink-0" />}
                      {user.tier === 'Premium+' && <BadgeCheck className="h-3.5 w-3.5 fill-[#ffcf00] text-black shrink-0" />}
                    </div>
                    <div className="text-[12px] text-muted-foreground">@{user.username || user.id.substring(0, 8)}</div>
                    {user.bio && <div className="text-[12px] text-muted-foreground/80 mt-0.5 line-clamp-1"><LinkifiedText text={user.bio} /></div>}
                  </div>
                </Link>
              ))
            ) : (
              <div className="py-12 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  {activeTab === "following" ? "Not following anyone yet" : "No followers yet"}
                </p>
              </div>
            )
          ) : (
            // Clubs List
            clubsLoading ? (
              <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : profile?.hide_clubs_unless_following && !isFollowing && !isOwnProfile ? (
              <div className="py-12 text-center">
                <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  Follow {getFirstName(profile)} to see their clubs
                </p>
              </div>
            ) : visibleClubs.length > 0 ? (
              visibleClubs.map((c: any) => (
                <Link key={c.id} to="/app/clubs/chat" search={{ clubId: c.id }} className="block transition active:scale-[0.98]">
                  <article className="flex items-center gap-3.5 p-4 rounded-2xl bg-accent/10 border border-border/10 hover:bg-accent/20 transition-all">
                    <div className="shrink-0">
                      <div className="h-12 w-12 rounded-xl bg-accent/30 border border-border/30 flex items-center justify-center overflow-hidden">
                        {c.logo_url || c.banner_url ? (
                          <img src={c.logo_url || c.banner_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Hash className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h4 className="truncate text-[14px] font-bold text-foreground tracking-tight">{c.name}</h4>
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary fill-primary/20 shrink-0" />
                      </div>
                      <p className="truncate text-[12px] text-muted-foreground">{c.description || "Welcome to the club!"}</p>
                    </div>

                    <div className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-accent/40 rounded-full px-2.5 py-1 border border-border/20">
                      <Users className="h-3 w-3" />
                      {c.members_count || 1}
                    </div>
                  </article>
                </Link>
              ))
            ) : (
              <div className="py-12 text-center">
                <Hash className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  Not a member of any clubs
                </p>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}
