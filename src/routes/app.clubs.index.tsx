import { useLoaderData, createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Hash, Lock, MessageCircle, Plus, Sparkles, ShieldCheck, ArrowRight, Loader2, Bell, Check, X, Radio, Zap, SlidersHorizontal, ChevronDown, CheckCircle2, Flame, Mic2, MoreHorizontal, LayoutGrid, ChevronRight, Trash2, Award } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerDescription } from "@/components/ui/drawer";
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";

function SwipeableNotification({ children, onDismiss }: { children: React.ReactNode, onDismiss: () => void }) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const startX = useRef(0);
  const isSwiping = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isSwiping.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping.current) return;
    const diff = e.touches[0].clientX - startX.current;
    if (diff > 0) {
      setSwipeOffset(Math.min(diff, 120));
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset > 60) {
      onDismiss();
    } else {
      setSwipeOffset(0);
    }
    isSwiping.current = false;
  };

  return (
    <div 
      className="relative w-full overflow-hidden rounded-2xl"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className="absolute inset-y-0 left-0 bg-destructive/10 text-destructive flex items-center justify-start px-4 rounded-2xl w-full transition-opacity"
        style={{ opacity: swipeOffset > 20 ? 1 : 0 }}
      >
        <Trash2 className="h-5 w-5" />
      </div>
      <div 
        className="relative z-10 transition-transform bg-card rounded-2xl"
        style={{ 
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping.current ? 'none' : 'transform 0.2s ease-out'
        }}
      >
        {children}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/app/clubs/")({
  component: Clubs,
});

function Clubs() {
  const navigate = useNavigate();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedClub, setSelectedClub] = useState<any>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [newClub, setNewClub] = useState({ name: "", description: "", category: "Study Group", price: 0 });
  const [isPaid, setIsPaid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [joiningClubId, setJoiningClubId] = useState<string | null>(null);
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [unreadClubMessages, setUnreadClubMessages] = useState<any[]>([]);
  const [showAllDiscover, setShowAllDiscover] = useState(false);

  // Move heavy data fetching to React Query to prevent route blocking
  const { data: clubData, isLoading: isClubsLoading } = useQuery({
    queryKey: ['clubs_data'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/signin";
        return null;
      }

      const [
        { data: profile },
        { data: userCreatedClubs },
        { data: joinedClubs },
        { data: featuredClubData },
        { data: sentRequests },
        { data: incomingRequestsData },
        { data: outgoingRequestsData },
        { count: totalClubsCount }
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('clubs').select('*').eq('creator_id', session.user.id),
        supabase.from('club_members').select('club_id, clubs(*)').eq('profile_id', session.user.id),
        supabase.from('clubs').select('*').eq('name', 'Zero K Bootcamp').maybeSingle(),
        supabase.from('messages').select('content').eq('sender_id', session.user.id).like('content', 'CLUB_REQUEST:%'),
        supabase.from('messages').select('*, sender:sender_id(id, username, full_name, avatar_url)').eq('receiver_id', session.user.id).like('content', 'CLUB_REQUEST:%:pending'),
        supabase.from('messages').select('*, receiver:receiver_id(id, username, full_name, avatar_url)').eq('sender_id', session.user.id).like('content', 'CLUB_REQUEST:%'),
        supabase.from('clubs').select('*', { count: 'exact', head: true })
      ]);

      let joinedIds = joinedClubs?.map(jc => jc.club_id) || [];
      const { data: discoverClubs } = await supabase
        .from('clubs')
        .select('*')
        .not('id', 'in', `(${joinedIds.length > 0 ? joinedIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
        .order('created_at', { ascending: false })
        .limit(50);

      let discoverClubsCombined = discoverClubs || [];
      if (featuredClubData && !discoverClubsCombined.some(c => c.id === featuredClubData.id)) {
        discoverClubsCombined = [featuredClubData, ...discoverClubsCombined];
      }

      const requestedClubIds = sentRequests
        ?.map(m => {
          const parts = m.content.split(':');
          return { clubId: parts[1], status: parts[3] };
        })
        .filter(r => r.clubId && (r.status === 'pending' || r.status === 'accepted'))
        .map(r => r.clubId) || [];

      const allRelevantClubIds = [
        ...joinedIds,
        ...discoverClubsCombined.map(c => c.id),
        ...(userCreatedClubs?.map(c => c.id) || [])
      ];
      const uniqueClubIds = [...new Set(allRelevantClubIds)];
      
      let membersCountMap: Record<string, number> = {};
      let onlineCountMap: Record<string, number> = {};
      let uniqueOnlineProfiles = new Set<string>();

      if (uniqueClubIds.length > 0) {
        const { data: memberRows } = await supabase
          .from('club_members')
          .select('club_id')
          .in('club_id', uniqueClubIds);
          
        if (memberRows) {
          memberRows.forEach(row => {
            membersCountMap[row.club_id] = (membersCountMap[row.club_id] || 0) + 1;
          });
        }
      }

      const enrich = (clubsArray: any[]) => clubsArray.map(c => ({ 
        ...c, 
        members_count: membersCountMap[c.id] || 0,
        online_count: onlineCountMap[c.id] || 0
      }));

      return { 
        myClubs: enrich(joinedClubs?.map(jc => jc.clubs).filter(c => c && c.category !== 'Bootcamp') || []), 
        discover: enrich(discoverClubsCombined.filter(c => c && c.category !== 'Bootcamp')),
        profile,
        userCreatedClubs: enrich(userCreatedClubs?.filter(c => c && c.category !== 'Bootcamp') || []),
        requestedClubIds,
        initialIncomingRequests: incomingRequestsData || [],
        outgoingAccepted: (outgoingRequestsData || []).filter(m => m.content.split(':')[3] === 'accepted'),
        totalOnlineBuilders: uniqueOnlineProfiles.size,
        totalClubsCount: totalClubsCount || 0
      };
    }
  });

  const {
    myClubs = [],
    discover = [],
    profile = null,
    userCreatedClubs = [],
    requestedClubIds = [],
    initialIncomingRequests = [],
    outgoingAccepted = [],
    totalOnlineBuilders = 0,
    totalClubsCount = 0
  } = clubData || {};

  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (clubData) {
      setIncomingRequests(clubData.initialIncomingRequests);
      setOutgoingRequests(clubData.outgoingAccepted);
    }
  }, [clubData]);

  useEffect(() => {
    if (!profile || myClubs.length === 0) return;
    
    async function fetchUnreadClubMessages() {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const clubIds = myClubs.map((c: any) => c.id);
      
      const { data } = await supabase
        .from('club_messages')
        .select('id, club_id, content, created_at, profile_id, profiles!inner(username, full_name, avatar_url), clubs!inner(name)')
        .in('club_id', clubIds)
        .gte('created_at', yesterday)
        .neq('profile_id', profile.id)
        .order('created_at', { ascending: false });

      if (data) {
        // Filter by unread
        const unread = data.filter((msg: any) => {
          const lastReadStr = localStorage.getItem(`last_club_read_${msg.club_id}`);
          const lastRead = lastReadStr ? new Date(lastReadStr).getTime() : 0;
          return new Date(msg.created_at).getTime() > lastRead;
        });
        
        // Group by club to show message counts per club
        const countsPerClub = new Map();
        unread.forEach((msg: any) => {
          if (!countsPerClub.has(msg.club_id)) {
            countsPerClub.set(msg.club_id, {
              club_id: msg.club_id,
              club_name: msg.clubs?.name || 'Club',
              count: 1
            });
          } else {
            const existing = countsPerClub.get(msg.club_id);
            existing.count += 1;
          }
        });
        
        setUnreadClubMessages(Array.from(countsPerClub.values()));
      }
    }
    
    fetchUnreadClubMessages();
  }, [profile, myClubs, showNotifications]);

  // Auto-join clubs for accepted requests client-side (to fully support RLS policy)

  useEffect(() => {
    if (!profile || outgoingAccepted.length === 0) return;

    outgoingAccepted.forEach(async (r: any) => {
      const parts = r.content.split(':');
      const clubId = parts[1];
      if (clubId) {
        const isMember = myClubs.some((c: any) => c.id === clubId);
        if (!isMember) {
          const { error: insErr } = await supabase
            .from('club_members')
            .insert([{
              club_id: clubId,
              profile_id: profile.id,
              role: 'Member'
            }]);
          if (!insErr) {
            toast.success(`Joined approved club!`);
            // Clean up the request so it doesn't trigger again
            await supabase.from('messages').update({ content: 'DISMISSED_CLUB_REQUEST' }).eq('id', r.id);
            setOutgoingRequests(prev => prev.filter(m => m.id !== r.id));
          } else {
            // If it failed (RLS etc), dismiss to prevent loops
            await supabase.from('messages').update({ content: 'DISMISSED_CLUB_REQUEST' }).eq('id', r.id);
            setOutgoingRequests(prev => prev.filter(m => m.id !== r.id));
          }
        } else {
          // Already a member, cleanup request to prevent infinite loops
          await supabase.from('messages').update({ content: 'DISMISSED_CLUB_REQUEST' }).eq('id', r.id);
          setOutgoingRequests(prev => prev.filter(m => m.id !== r.id));
        }
      }
    });
  }, [outgoingAccepted, profile, myClubs]);

  const handleJoinClub = async (club: any) => {
    if (!profile) return toast.error("Sign in to join clubs");
    setJoiningClubId(club.id);

    try {
      if (club.is_private) {
        const { error } = await supabase
          .from('messages')
          .insert([{
            sender_id: profile.id,
            receiver_id: club.creator_id,
            content: `CLUB_REQUEST:${club.id}:${club.name}:pending`
          }]);

        if (error) throw error;
        toast.success("Request sent to club admin!");
        window.location.reload();
      } else {
        const { error } = await supabase
          .from('club_members')
          .insert([{
            club_id: club.id,
            profile_id: profile.id,
            role: 'Member'
          }]);

        if (error) throw error;
        toast.success(`Joined ${club.name}!`);
        
        // Featured Club joining reward
        if (club.name === "Zero K Bootcamp") {
          await supabase.from('profiles').update({ xp: (profile.xp || 0) + 100 }).eq('id', profile.id);
          toast.success("You earned 100 XP for joining the featured Zero K Bootcamp!");
        }
        
        window.location.reload();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process club join");
    } finally {
      setJoiningClubId(null);
    }
  };

  const handleDecideRequest = async (messageId: string, clubId: string, applicantId: string, decision: 'accept' | 'decline') => {
    setDecidingId(messageId);
    try {
      if (decision === 'accept') {
        const msgToUpdate = incomingRequests.find(m => m.id === messageId);
        if (msgToUpdate) {
          const parts = msgToUpdate.content.split(':');
          parts[3] = 'accepted';
          const newContent = parts.join(':');

          const { error: msgError } = await supabase
            .from('messages')
            .update({ content: newContent })
            .eq('id', messageId);

          if (msgError) throw msgError;

          // Automatically add the accepted user to the club
          const { error: memberError } = await supabase
            .from('club_members')
            .insert([{
              club_id: clubId,
              profile_id: applicantId,
              role: 'Member'
            }]);

          if (memberError && memberError.code !== '23505') {
            console.error("Error adding member to club:", memberError);
          }
          
          setIncomingRequests(prev => prev.filter(m => m.id !== messageId));
          toast.success("Request approved! Builder added to your private club.");
        }
      } else {
        const msgToUpdate = incomingRequests.find(m => m.id === messageId);
        if (msgToUpdate) {
          const parts = msgToUpdate.content.split(':');
          parts[3] = 'declined';
          const newContent = parts.join(':');

          const { error: msgError } = await supabase
            .from('messages')
            .update({ content: newContent })
            .eq('id', messageId);

          if (msgError) throw msgError;

          setIncomingRequests(prev => prev.filter(m => m.id !== messageId));
          toast.error("Request declined.");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process request");
    } finally {
      setDecidingId(null);
    }
  };

  const handleDismissNotification = async (messageId: string, type: 'incoming' | 'outgoing') => {
    try {
      // Instead of DELETE which might fail silently due to RLS, we UPDATE the content so it no longer matches the CLUB_REQUEST prefix
      const { error } = await supabase
        .from('messages')
        .update({ content: 'DISMISSED_CLUB_REQUEST' })
        .eq('id', messageId);
        
      if (error) throw error;
      if (type === 'incoming') {
        setIncomingRequests(prev => prev.filter(m => m.id !== messageId));
      } else {
        setOutgoingRequests(prev => prev.filter(m => m.id !== messageId));
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to dismiss notification");
    }
  };

  const isBasic = !profile?.tier || profile.tier.toLowerCase() === 'basic';
  const hasCreatedClub = userCreatedClubs.length > 0;

  const handleCreateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isBasic && (hasCreatedClub || totalClubsCount >= 20)) {
      setShowUpgrade(true);
    } else {
      setShowCreate(true);
    }
  };

  const handleCreateClub = async () => {
    if (!newClub.name.trim()) return toast.error("Club name is required");
    
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      if (isBasic && totalClubsCount >= 20) {
        throw new Error("Platform limit reached. Upgrade to Premium to create a club.");
      }

      // Basic users can ONLY create private FREE clubs
      const isPrivate = isBasic ? true : false;
      const finalPrice = isBasic ? 0 : (isPaid ? newClub.price : 0);

      const { data: club, error } = await supabase
        .from('clubs')
        .insert([{
          name: newClub.name,
          description: newClub.description,
          category: newClub.category,
          creator_id: session.user.id,
          is_private: isPrivate,
          price: finalPrice
        }])
        .select()
        .single();

      if (error) throw error;

      // Add creator as Administrator
      await supabase.from('club_members').insert([{
        club_id: club.id,
        profile_id: session.user.id,
        role: 'Administrator'
      }]);

      toast.success(isBasic ? "Private club created! 🚀 Invite your friends now." : "Club created successfully! 🚀");
      window.location.reload(); // Refresh to show new club
    } catch (err: any) {
      toast.error(err.message || "Failed to create club");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      {/* Frosted Glass Header */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md pt-[calc(1.5rem+env(safe-area-inset-top))] pb-3 px-5 z-40 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="w-full">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Zero Club" className="h-6 w-auto object-contain" />
                <h1 className="text-[19px] font-semibold tracking-tight text-foreground">Clubs</h1>
              </div>
              <p className="text-[10px] font-medium text-muted-foreground/70 mt-0.5 whitespace-nowrap">Learn, Ship, Network & <span className="text-primary font-bold">Earn</span></p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button 
                onClick={() => setShowNotifications(true)}
                className="relative grid h-10 w-10 place-items-center rounded-full border border-border/40 bg-card text-muted-foreground hover:text-foreground hover:border-border/60 transition-all duration-300 active:scale-95 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.1)] shrink-0"
              >
                <Bell className="h-4 w-4" />
                {((incomingRequests.filter((r: any) => r.content.split(':')[3] === 'pending').length) + unreadClubMessages.length) > 0 && (
                  <span className="absolute -top-1 -right-1 grid h-4.5 w-4.5 place-items-center rounded-full bg-primary text-[8px] font-bold text-white ring-2 ring-background">
                    {(incomingRequests.filter((r: any) => r.content.split(':')[3] === 'pending').length) + unreadClubMessages.length}
                  </span>
                )}
              </button>
              <button 
                onClick={handleCreateClick}
                className="flex items-center gap-1.5 h-10 px-5 rounded-full bg-foreground text-background font-bold text-xs shadow-[0_2px_20px_-4px_rgba(0,0,0,0.15)] transition-all duration-300 active:scale-95 hover:opacity-90 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Create
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pt-24">
        {/* Top Stats */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <div className="flex flex-col items-center justify-center rounded-3xl border border-border/30 bg-card py-3.5 gap-1.5 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15)]">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
              <Users className="h-3.5 w-3.5" />
            </div>
            <div className="text-center">
              <span className="block text-sm font-semibold text-foreground tracking-tight tabular-nums">{myClubs.length}</span>
              <span className="block text-[8px] font-medium text-muted-foreground/60">Clubs Active</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-3xl border border-border/30 bg-card py-3.5 gap-1.5 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15)]">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-success/10 text-success">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            </div>
            <div className="text-center">
              <span className="block text-sm font-semibold text-foreground tracking-tight tabular-nums">{totalOnlineBuilders || 0}</span>
              <span className="block text-[8px] font-medium text-muted-foreground/60">Online Now</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-3xl border border-border/30 bg-card py-3.5 gap-1.5 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15)]">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-orange-500/10 text-orange-500">
              <Radio className="h-3.5 w-3.5" />
            </div>
            <div className="text-center">
              <span className="block text-sm font-semibold text-foreground tracking-tight tabular-nums">{myClubs.filter((c: any) => c.is_private).length}</span>
              <span className="block text-[8px] font-medium text-muted-foreground/60">Live Sessions</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-3xl border border-border/30 bg-card py-3.5 gap-1.5 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15)]">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-purple-500/10 text-purple-500">
              <Zap className="h-3.5 w-3.5 fill-current" />
            </div>
            <div className="text-center">
              <span className="block text-sm font-semibold text-foreground tracking-tight tabular-nums">+{profile?.xp || 0}</span>
              <span className="block text-[8px] font-medium text-muted-foreground/60">XP Today</span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex gap-2.5 mb-5">
          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-foreground transition-colors duration-300" />
            <input 
              placeholder="Search clubs, builders, bootcamps..." 
              className="w-full rounded-2xl bg-accent/40 border-none px-5 py-3.5 pl-12 text-sm font-medium text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-300" 
            />
          </div>
          <button className="grid h-[50px] w-[50px] place-items-center rounded-2xl border border-border/30 bg-card transition-all duration-300 active:scale-95 text-muted-foreground hover:text-foreground hover:border-border/50 shrink-0 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.1)]">
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-6 overflow-x-auto no-scrollbar border-b border-border/20 px-1 mb-6">
          {["All", "Tech", "AI", "Design", "Startup", "Writing", "Marketing", "Campus"].map((cat) => {
            const active = activeCategory === cat;
            return (
              <button 
                key={cat} 
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 pb-3 text-[14px] font-bold tracking-wide transition-all relative whitespace-nowrap ${
                  active 
                    ? "text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat}
                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Discover / Featured Clubs */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold tracking-tight flex items-center gap-2 text-foreground">
              Discover <Sparkles className="h-4 w-4 text-primary fill-primary/20" />
            </h2>
            <button 
              onClick={() => setShowAllDiscover(!showAllDiscover)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              {showAllDiscover ? "See less" : "See all"}
            </button>
          </div>
          
          <div className={showAllDiscover ? "grid grid-cols-2 gap-3 pb-4" : "flex gap-3 overflow-x-auto snap-x no-scrollbar pb-4 -mx-5 px-5"}>
            {discover
              .filter((d: any) => activeCategory === "All" || (d.category && d.category.includes(activeCategory)))
              .length > 0 ? discover
              .filter((d: any) => activeCategory === "All" || (d.category && d.category.includes(activeCategory)))
              .sort((a: any, b: any) => a.name === "Zero K Bootcamp" ? -1 : b.name === "Zero K Bootcamp" ? 1 : 0)
              .slice(0, showAllDiscover ? 50 : 6)
              .map((d: any, i: number) => {
              const bgColors = [
                "from-primary/30", "from-blue-500/30", "from-emerald-500/30", "from-orange-500/30"
              ];
              const tagColors = [
                "bg-primary", "bg-blue-500", "bg-emerald-500", "bg-orange-500"
              ];
              const isFeatured = d.name === "Zero K Bootcamp";
              const bgClass = isFeatured ? "from-amber-500/40" : bgColors[i % bgColors.length];
              const tagClass = isFeatured ? "bg-amber-500 text-black" : tagColors[i % tagColors.length];
              const isAlreadyJoined = myClubs.some((mc: any) => mc?.id === d.id);

              return (
                <article 
                  key={d.id} 
                  className={`relative ${showAllDiscover ?'w-full' : 'w-[165px]'} h-[220px] shrink-0 snap-center overflow-hidden rounded-3xl border ${
                    isFeatured 
                      ? 'border-amber-500/40 shadow-[0_4px_30px_-4px_rgba(245,158,11,0.25)] bg-gradient-to-br from-amber-950/40 via-card to-card' 
                      : 'border-border/30 bg-card shadow-[0_2px_20px_-4px_rgba(0,0,0,0.1)]'
                  } p-4 flex flex-col items-center text-center transition-all duration-300 hover:border-primary/30 hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15)] active:scale-[0.97]`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-b ${bgClass} via-transparent to-transparent opacity-40 pointer-events-none`} />
                  
                  <div className="w-full flex items-start justify-between z-10 mb-3">
                    <span className={`rounded-full ${tagClass} px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em]`}>
                      {isAlreadyJoined ? "MEMBER" : (isFeatured ? "FEATURED 🎁" : (i % 2 === 0 ? "LIVE" : "HOT"))}
                    </span>
                    {d.is_private && (
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-muted/50 text-muted-foreground backdrop-blur-md border border-border/30">
                        <Lock className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </div>
                  
                  <div className="relative mb-2 h-14 w-14 rounded-2xl bg-accent/30 border border-border/30 flex items-center justify-center overflow-hidden shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)] z-10">
                    {d.logo_url || d.banner_url ? (
                      <img src={d.logo_url || d.banner_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Hash className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  
                  <h3 className="text-[13px] font-bold text-foreground line-clamp-1 mb-0.5 z-10 w-full tracking-tight">{d.name}</h3>
                  <p className="text-[9px] text-muted-foreground/60 line-clamp-1 mb-auto z-10 w-full font-medium">{d.description || "Level up your skills"}</p>
                  
                  <div className="flex items-center gap-1 mb-3 z-10 mt-2">
                    <div className="flex -space-x-1.5">
                      <div className="h-4 w-4 rounded-full bg-blue-500 border-2 border-card" />
                      <div className="h-4 w-4 rounded-full bg-purple-500 border-2 border-card" />
                      <div className="h-4 w-4 rounded-full bg-emerald-500 border-2 border-card" />
                    </div>
                    <span className="text-[8px] text-muted-foreground/50 ml-1 font-medium">{d.members_count || 0} members</span>
                  </div>
                  
                  <div className="w-full flex items-center justify-between text-[9px] font-bold z-10 pt-2 border-t border-border/20">
                    <div className="flex items-center gap-1.5 text-success">
                      <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                      <span className="font-semibold">{d.online_count || 0} Online</span>
                    </div>
                    <span className="text-primary bg-primary/10 px-2 py-0.5 rounded-full text-[8px] font-bold border border-primary/20">2X XP</span>
                  </div>

                  {(() => {
                    const isRequested = requestedClubIds.includes(d.id);
                    return isAlreadyJoined ? (
                      <Link 
                        to="/app/clubs/chat" 
                        search={{ clubId: d.id }}
                        className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer"
                        title="Enter Club"
                      >
                        Enter
                      </Link>
                    ) : (
                      <button 
                        onClick={() => {
                          setSelectedClub(d);
                          setShowJoinModal(true);
                        }}
                        disabled={joiningClubId === d.id || isRequested}
                        className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-pointer"
                        title={isRequested ? "Requested" : "Join Club"}
                      >
                        Join
                      </button>
                    );
                  })()}
                </article>
              );
            }) : (
              <div className="w-full text-center py-8 text-xs text-muted-foreground/60 font-medium border border-dashed border-border/30 rounded-3xl bg-card/50">
                No clubs to discover right now.
              </div>
            )}
          </div>
        </div>

        {/* My Clubs */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold tracking-tight flex items-center gap-2 text-foreground">
              My Clubs <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-foreground/10 px-1.5 text-[10px] font-bold text-muted-foreground">{myClubs.length}</span>
            </h2>
            <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-300">See all</button>
          </div>

          <div className="space-y-3">
            {myClubs.length > 0 ? myClubs.map((c: any) => (
              <Link key={c.id} to="/app/clubs/chat" search={{ clubId: c.id }} className="block transition-all duration-300 active:scale-[0.98]">
                <article className="flex items-center gap-3.5 p-3.5 rounded-3xl border border-border/30 bg-card overflow-hidden hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.12)]">
                  <div className="relative shrink-0">
                    <div className="h-14 w-14 rounded-2xl bg-accent/20 border border-border/30 flex items-center justify-center overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.1)]">
                      {c.logo_url || c.banner_url ? (
                        <img src={c.logo_url || c.banner_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Hash className="h-6 w-6 text-primary/70" />
                      )}
                    </div>
                  </div>
                  
                  <div className="min-w-0 flex-1 py-0.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h4 className="truncate text-sm font-bold text-foreground tracking-tight">{c.name}</h4>
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary fill-primary/20 shrink-0" />
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground/60 font-medium mb-1.5">{c.description || "Welcome to the club!"}</p>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
                        <Users className="h-3 w-3" />
                        {c.members_count || 1} members
                      </span>
                      {(c.online_count || 0) > 0 && (
                        <span className="flex items-center gap-1 text-success font-semibold">
                          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                          {c.online_count} online
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                </article>
              </Link>
            )) : (
              <div className="py-10 text-center px-4 border border-dashed border-border/30 rounded-3xl bg-card/50">
                <p className="text-xs text-muted-foreground/60 font-medium mb-4">You haven't joined any clubs yet.</p>
                <button onClick={handleCreateClick} className="text-xs font-bold text-background bg-foreground px-5 py-2.5 rounded-full transition-all duration-300 active:scale-95 hover:opacity-90 shadow-sm">
                  Create a Club
                </button>
              </div>
            )}
            
            {myClubs.length > 0 && (
              <button className="w-full flex items-center justify-between p-4 rounded-3xl border border-border/20 bg-card/50 hover:bg-card hover:border-border/40 transition-all duration-300 group">
                <div className="flex items-center gap-2.5 text-xs font-bold text-foreground">
                  <div className="grid h-7 w-7 place-items-center rounded-xl bg-accent/30">
                    <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                  </div>
                  View all joined clubs
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground transition-all duration-300 group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Create Club Drawer */}
      <Drawer open={showCreate} onOpenChange={setShowCreate}>
        <DrawerContent className="border-none bg-background p-0">
          <div className="px-6 pt-6 pb-8">
            <DrawerHeader className="text-left mb-6 p-0">
              <DrawerTitle className="text-[19px] font-semibold tracking-tight text-foreground">
                {isBasic ? "Create Your Private Club" : "Create a New Club"}
              </DrawerTitle>
              <DrawerDescription className="text-xs font-medium text-muted-foreground/60 mt-1">
                {isBasic 
                  ? "Basic accounts can create 1 private club to invite friends and classmates." 
                  : "Build your community and lead your own cohort."}
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground ml-1">Club Name</label>
                <input 
                  value={newClub.name}
                  onChange={e => setNewClub({...newClub, name: e.target.value})}
                  placeholder="e.g. Lagos Design Squad" 
                  className="w-full rounded-2xl bg-background border border-border/40 px-5 py-4 text-sm font-medium outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all duration-300 text-foreground placeholder:text-muted-foreground/40" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground ml-1">Description</label>
                <textarea 
                  value={newClub.description}
                  onChange={e => setNewClub({...newClub, description: e.target.value})}
                  placeholder="What's this club about?" 
                  rows={3}
                  className="w-full rounded-2xl bg-background border border-border/40 px-5 py-4 text-sm font-medium outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all duration-300 text-foreground placeholder:text-muted-foreground/40 resize-none" 
                />
              </div>
              {!isBasic ? (
                <div className="space-y-2">
                  <label className="text-[11px] text-muted-foreground ml-1">Access Type</label>
                  <div className="flex gap-2">
                    {["Free", "Paid"].map(type => (
                      <button
                        key={type}
                        onClick={() => setIsPaid(type === "Paid")}
                        className={`flex-1 py-3.5 rounded-2xl text-xs font-bold border transition-all duration-300 ${
                          (type ==="Paid" && isPaid) || (type === "Free" && !isPaid)
                            ? "bg-foreground border-foreground text-background shadow-[0_2px_20px_-4px_rgba(0,0,0,0.2)]"
                            : "bg-card border-border/40 text-muted-foreground hover:border-border/60"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-card p-4 flex items-center justify-between border border-border/30">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-[11px] text-foreground">Free Access</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 font-medium">Basic Privilege</span>
                </div>
              )}

              {isPaid && !isBasic && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[11px] text-muted-foreground ml-1">Entry Fee (₦)</label>
                  <input 
                    type="number"
                    value={newClub.price}
                    onChange={e => setNewClub({...newClub, price: Number(e.target.value)})}
                    placeholder="e.g. 5000" 
                    className="w-full rounded-2xl bg-background border border-border/40 px-5 py-4 text-sm font-medium outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all duration-300 text-foreground placeholder:text-muted-foreground/40" 
                  />
                </div>
              )}

              <button 
                onClick={handleCreateClub}
                disabled={isSubmitting}
                className="w-full bg-foreground text-background font-bold py-4 rounded-full shadow-[0_2px_20px_-4px_rgba(0,0,0,0.2)] transition-all duration-300 active:scale-[0.98] mt-2 disabled:opacity-50 hover:opacity-90 text-sm"
              >
                {isSubmitting ? "Creating..." : "Launch Club"}
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Upgrade Prompt Sheet */}
      <Drawer open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DrawerContent className="border-none bg-background p-0 overflow-hidden">
          <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary via-purple-600 to-blue-500">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-14 w-14 rounded-full ring-1 ring-border bg-card flex items-center justify-center">
                <ShieldCheck className="h-8 w-8 text-white" />
              </div>
            </div>
          </div>
          
          <div className="px-6 py-8 text-center">
            <h2 className="text-[19px] font-semibold text-foreground tracking-tight">Limit Reached</h2>
            <p className="mt-3 text-sm text-muted-foreground/70 leading-relaxed font-medium">
              {totalClubsCount >= 20 && isBasic && !hasCreatedClub ? (
                <>The platform has reached its 20-club limit for basic users. Upgrade your plan to create unlimited communities.</>
              ) : (
                <>Basic accounts are limited to <span className="text-primary font-bold">1 Private Club</span>. Upgrade your plan to create unlimited public and private communities.</>
              )}
            </p>
            
            <div className="mt-8 space-y-3">
              <Link 
                to="/app/premium"
                onClick={() => setShowUpgrade(false)}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-4 font-bold text-background shadow-[0_2px_20px_-4px_rgba(0,0,0,0.2)] transition-all duration-300 active:scale-[0.98] hover:opacity-90 text-sm"
              >
                Upgrade Plan <ArrowRight className="h-4 w-4" />
              </Link>
              <button 
                onClick={() => setShowUpgrade(false)}
                className="w-full rounded-full bg-card border border-border/30 py-4 text-sm font-bold text-muted-foreground transition-all duration-300 active:scale-[0.98] hover:border-border/50"
              >
                Maybe later
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Club Notifications Drawer */}
      <Drawer open={showNotifications} onOpenChange={setShowNotifications}>
        <DrawerContent className="border-t border-border/30 bg-background p-0 max-h-[85vh] flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
          <DrawerHeader className="px-6 py-5 border-b border-border/30 shrink-0 mt-2">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 relative">
                <Bell className="h-5 w-5 text-primary" />
              {(incomingRequests.filter((r: any) => r.content.split(':')[3] === 'pending').length + unreadClubMessages.length) > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                )}
              </div>
              <div className="text-left">
                <DrawerTitle className="text-[17px] font-semibold text-foreground tracking-tight">Notifications</DrawerTitle>
                <DrawerDescription className="text-[11px] font-medium text-muted-foreground/60 mt-0.5">
                  Manage admissions and club messages
                </DrawerDescription>
              </div>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 no-scrollbar">
            {(() => {
              const pendingRequests = incomingRequests.filter((r: any) => r.content.split(':')[3] === 'pending');
              const hasNotifications = pendingRequests.length > 0 || unreadClubMessages.length > 0;

              if (!hasNotifications) {
                return (
                  <div className="py-4 px-5 flex items-center gap-4 rounded-2xl border border-border/20 bg-card/50">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-accent/20 flex items-center justify-center">
                      <Bell className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground tracking-tight">All caught up</p>
                      <p className="text-[11px] text-muted-foreground/50 mt-0.5 font-medium">You have no new notifications.</p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="flex flex-col gap-3">
                  {/* Pending Requests */}
                  {pendingRequests.map((r: any) => {
                    const parts = r.content.split(':');
                    const clubId = parts[1];
                    const clubName = parts[2];
                    const sender = r.sender || {};
                    const isExpanded = expandedRequestId === r.id;

                    return (
                      <SwipeableNotification key={r.id} onDismiss={() => handleDismissNotification(r.id, 'incoming')}>
                        <article 
                          className="flex flex-col gap-3 p-4 rounded-2xl border border-border/30 bg-card shadow-sm transition-all duration-300 hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)] cursor-pointer"
                          onClick={() => setExpandedRequestId(isExpanded ? null : r.id)}
                        >
                          <div className="flex items-center gap-3 w-full">
                            <div className="h-10 w-10 rounded-full bg-accent/30 overflow-hidden flex items-center justify-center font-bold text-xs shrink-0 border border-border/30">
                              {sender.avatar_url ? (
                                <img src={sender.avatar_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                (sender.full_name || sender.username || 'U').substring(0, 1).toUpperCase()
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <h4 className="text-[13px] font-bold truncate text-foreground flex items-center gap-1.5 tracking-tight">
                                {sender.full_name || sender.username} 
                                <span className="font-medium text-muted-foreground/50 text-[10px]">{getFirstName(sender)}</span>
                              </h4>
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-medium">
                                Wants to join <span className="font-bold text-foreground">{clubName}</span>
                              </p>
                            </div>
                            
                            <div className="shrink-0 text-muted-foreground/50">
                              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden flex items-center gap-2 pt-1"
                              >
                                <button
                                  disabled={decidingId === r.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDecideRequest(r.id, clubId, r.sender_id, 'decline');
                                  }}
                                  className="flex-1 h-9 rounded-full border border-border/40 bg-card text-muted-foreground transition-all duration-300 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 active:scale-95 disabled:opacity-50 flex items-center justify-center font-semibold text-xs"
                                >
                                  Reject
                                </button>
                                <button
                                  disabled={decidingId === r.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDecideRequest(r.id, clubId, r.sender_id, 'accept');
                                  }}
                                  className="flex-1 h-9 rounded-full bg-foreground text-background text-xs font-bold transition-all duration-300 hover:opacity-90 active:scale-95 disabled:opacity-50 shadow-sm"
                                >
                                  Accept
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </article>
                      </SwipeableNotification>
                    );
                  })}

                  {/* Club Messages */}
                  {unreadClubMessages.map((msgGroup: any) => (
                    <article 
                      key={msgGroup.club_id} 
                      onClick={() => {
                        setShowNotifications(false);
                        navigate({ to: "/app/clubs/chat", search: { clubId: msgGroup.club_id } });
                      }}
                      className="flex items-center gap-3 p-4 rounded-2xl border border-border/30 bg-card shadow-sm transition-all duration-300 hover:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)] cursor-pointer active:scale-95"
                    >
                      <div className="h-10 w-10 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center font-bold text-xs shrink-0 border border-primary/20 text-primary">
                        <MessageCircle className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-[13px] font-bold truncate text-foreground flex items-center gap-1.5 tracking-tight">
                          {msgGroup.club_name}
                        </h4>
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate font-medium">
                          <span className="font-bold text-foreground">{msgGroup.count > 24 ? '24+' : msgGroup.count}</span> unseen message{msgGroup.count !== 1 ? 's' : ''} on the club
                        </p>
                      </div>

                      <div className="shrink-0">
                        <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              );
            })()}
          </div>
        </DrawerContent>
      </Drawer>
      
      {/* Join Club Modal */}
      <Drawer open={showJoinModal} onOpenChange={setShowJoinModal}>
        <DrawerContent className="border-none bg-background p-6">
          {selectedClub && (
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 rounded-2xl bg-accent/20 border border-border/30 flex items-center justify-center mb-5 overflow-hidden shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]">
                {selectedClub.banner_url ? (
                  <img src={selectedClub.banner_url} className="h-full w-full object-cover" />
                ) : (
                  <Hash className="h-8 w-8 text-primary/70" />
                )}
              </div>
              <h2 className="text-[19px] font-semibold text-foreground mb-1 tracking-tight">Join {selectedClub.name}?</h2>
              <p className="text-sm text-muted-foreground/60 mb-8 font-medium leading-relaxed">
                {selectedClub.is_private 
                  ? "This is a private club. An admin will need to approve your request before you can enter."
                  : "You're about to instantly join this squad."}
              </p>

              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 bg-card border border-border/30 text-foreground font-bold py-3.5 rounded-full transition-all duration-300 active:scale-[0.98] hover:border-border/50 text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    handleJoinClub(selectedClub);
                    setShowJoinModal(false);
                  }}
                  disabled={joiningClubId === selectedClub.id}
                  className="flex-1 bg-foreground text-background font-bold py-3.5 rounded-full shadow-[0_2px_20px_-4px_rgba(0,0,0,0.2)] transition-all duration-300 active:scale-[0.98] hover:opacity-90 text-sm"
                >
                  {selectedClub.is_private ? "Request to Join" : "Join Now"}
                </button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
