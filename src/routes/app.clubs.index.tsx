import { useLoaderData, createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Hash, Lock, MessageCircle, Plus, ShieldCheck, ArrowRight, Loader2, Bell, Check, X, Radio, Zap, SlidersHorizontal, ChevronDown, CheckCircle2, Flame, Mic2, MoreHorizontal, LayoutGrid, ChevronRight, Trash2, Award, GraduationCap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerDescription } from "@/components/ui/drawer";
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";
import { fallbackClubCapacity, isBootcampCohortClub, type ClubCapacity } from "@/features/membership/plans";

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
      className="relative w-full overflow-hidden rounded-lg"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className="absolute inset-y-0 left-0 flex w-full items-center justify-start rounded-lg bg-destructive/10 px-4 text-destructive transition-opacity"
        style={{ opacity: swipeOffset > 20 ? 1 : 0 }}
      >
        <Trash2 className="h-5 w-5" />
      </div>
      <div 
        className="relative z-10 rounded-lg bg-card transition-transform"
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
  const { details: currencyDetails } = useWalletCurrency();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedClub, setSelectedClub] = useState<any>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [newClub, setNewClub] = useState({ name: "", description: "", category: "Study Group", price: 0 });
  const [isPaid, setIsPaid] = useState(false);
  const [clubDraftReady, setClubDraftReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [joiningClubId, setJoiningClubId] = useState<string | null>(null);
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [unreadClubMessages, setUnreadClubMessages] = useState<any[]>([]);
  const [showAllDiscover, setShowAllDiscover] = useState(false);
  // Which of the two peer tabs is showing. Falls back to My Clubs below when
  // there are no bootcamp clubs, so the Boot Clubs tab can never be selected
  // while hidden - which would leave the page looking empty.
  const [clubsTabRaw, setClubsTab] = useState<"mine" | "boot">("mine");

  useEffect(() => {
    try {
      const storedDraft = sessionStorage.getItem("zc:club-create-draft");
      if (storedDraft) {
        const parsedDraft = JSON.parse(storedDraft);
        setNewClub((current) => ({
          name: typeof parsedDraft.name === "string" ? parsedDraft.name : current.name,
          description: typeof parsedDraft.description === "string" ? parsedDraft.description : current.description,
          category: typeof parsedDraft.category === "string" ? parsedDraft.category : current.category,
          price: typeof parsedDraft.price === "number" ? parsedDraft.price : current.price,
        }));
        setIsPaid(parsedDraft.isPaid === true);
      }
    } catch {
      // Ignore malformed drafts and browsers that disable session storage.
    } finally {
      setClubDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!clubDraftReady) return;

    try {
      sessionStorage.setItem(
        "zc:club-create-draft",
        JSON.stringify({ ...newClub, isPaid }),
      );
    } catch {
      // Keep the form usable when session storage is unavailable.
    }
  }, [clubDraftReady, isPaid, newClub]);

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
        { data: capacityData }
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('clubs').select('*, bootcamps(ends_at)').eq('creator_id', session.user.id),
        supabase.from('club_members').select('club_id, clubs(*, bootcamps(ends_at))').eq('profile_id', session.user.id),
        supabase.from('clubs').select('*').eq('name', 'Zero K Bootcamp').maybeSingle(),
        supabase.from('messages').select('content').eq('sender_id', session.user.id).like('content', 'CLUB_REQUEST:%'),
        supabase.from('messages').select('*, sender:sender_id(id, username, full_name, avatar_url)').eq('receiver_id', session.user.id).like('content', 'CLUB_REQUEST:%:pending'),
        supabase.from('messages').select('*, receiver:receiver_id(id, username, full_name, avatar_url)').eq('sender_id', session.user.id).like('content', 'CLUB_REQUEST:%'),
        supabase.rpc('get_my_club_capacity')
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

      // Cohort clubs are filtered out of My Clubs and Discover above, because
      // they are temporary and belong to a bootcamp rather than being joinable
      // communities. That left them with nowhere to appear at all, so they get
      // their own section. Joined and created are merged: a tutor sees the club
      // for a bootcamp they run even before anyone joins it.
      const cohortClubs = [
        ...(joinedClubs?.map(jc => jc.clubs as any) || []),
        ...(userCreatedClubs || []),
      ].filter(c => c && isBootcampCohortClub(c));

      const bootClubs = enrich(
        Array.from(new Map(cohortClubs.map(c => [c.id, c])).values())
      );

      return {
        bootClubs,
        myClubs: enrich(joinedClubs?.map(jc => jc.clubs as any).filter(c => c && !isBootcampCohortClub(c)) || []),
        discover: enrich(discoverClubsCombined.filter(c => c && !isBootcampCohortClub(c))),
        profile,
        userCreatedClubs: enrich(userCreatedClubs?.filter(c => c && !isBootcampCohortClub(c)) || []),
        capacityData,
        requestedClubIds,
        initialIncomingRequests: incomingRequestsData || [],
        outgoingAccepted: (outgoingRequestsData || []).filter(m => m.content.split(':')[3] === 'accepted'),
        totalOnlineBuilders: uniqueOnlineProfiles.size,
      };
    }
  });

  const {
    bootClubs = [],
    myClubs = [],
    discover = [],
    profile = null,
    userCreatedClubs = [],
    requestedClubIds = [],
    initialIncomingRequests = [],
    outgoingAccepted = [],
    totalOnlineBuilders = 0,
    capacityData = null,
  } = clubData || {};

  const clubsTab = bootClubs.length === 0 ? "mine" : clubsTabRaw;

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

  const clubCapacity: ClubCapacity = capacityData || fallbackClubCapacity(profile, userCreatedClubs.length);
  const capacityLabel = `${clubCapacity.permanent_club_count} owned`;
  const capacityCaption = clubCapacity.permanent_club_limit === null
    ? "Permanent Clubs"
    : `${clubCapacity.permanent_club_limit} allowed on plan`;

  const handleCreateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!clubCapacity.can_create) {
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

      if (!clubCapacity.can_create) throw new Error(clubCapacity.upgrade_message || "Your current plan does not allow another permanent Club.");

      const finalPrice = isPaid ? newClub.price : 0;

      const { data: club, error } = await supabase
        .from('clubs')
        .insert([{
          name: newClub.name,
          description: newClub.description,
           category: newClub.category,
           creator_id: session.user.id,
           club_type: 'permanent',
           is_private: false,
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

      const firstClubPremium = String(clubCapacity.plan_key) === 'creator' && clubCapacity.permanent_club_count === 0 && !profile?.first_club_benefit_redeemed;
      try {
        sessionStorage.removeItem("zc:club-create-draft");
      } catch {
        // The Club exists already; draft cleanup is best effort.
      }
      setNewClub({ name: "", description: "", category: "Study Group", price: 0 });
      setIsPaid(false);
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ["clubs_data"] });
      toast.success(firstClubPremium ? "Club created with 6 months of premium Club experience." : "Club created successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to create club");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f7f5] pb-20 dark:bg-background">
      {/* Frosted Glass Header */}
      <div className="fixed left-1/2 top-0 z-40 w-full max-w-md -translate-x-1/2 border-b border-border/60 bg-background px-5 pb-3 pt-[calc(1.5rem+env(safe-area-inset-top))] md:sticky md:left-0 md:max-w-none md:translate-x-0 md:px-8 md:pt-5 lg:px-10">
        <div className="mx-auto w-full max-w-[1200px]">
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
                className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border/60 bg-card text-muted-foreground transition hover:border-border hover:bg-accent/50 hover:text-foreground active:scale-95"
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
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#171218] px-5 text-xs font-semibold text-[#f8f1e7] transition active:scale-95 hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Create
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-5 pt-24 md:px-8 md:pb-12 md:pt-6 lg:px-10">
        {/* Top Stats */}
        <div className="grid grid-cols-4 gap-2 md:gap-4 mb-5 md:mb-8">
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card py-3.5 transition hover:border-primary/20">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
              <Users className="h-3.5 w-3.5" />
            </div>
            <div className="text-center">
              <span className="block text-sm font-semibold text-foreground tracking-tight tabular-nums">{capacityLabel}</span>
              <span className="block text-[8px] font-medium leading-tight text-muted-foreground/60">{capacityCaption}</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card py-3.5 transition hover:border-primary/20">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-success/10 text-success">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            </div>
            <div className="text-center">
              <span className="block text-sm font-semibold text-foreground tracking-tight tabular-nums">{totalOnlineBuilders || 0}</span>
              <span className="block text-[8px] font-medium text-muted-foreground/60">Online Now</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card py-3.5 transition hover:border-primary/20">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-orange-500/10 text-orange-500">
              <Radio className="h-3.5 w-3.5" />
            </div>
            <div className="text-center">
              <span className="block text-sm font-semibold text-foreground tracking-tight tabular-nums">{myClubs.filter((c: any) => c.is_private).length}</span>
              <span className="block text-[8px] font-medium text-muted-foreground/60">Live Sessions</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card py-3.5 transition hover:border-primary/20">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-purple-500/10 text-purple-500">
              <Zap className="h-3.5 w-3.5 fill-current" />
            </div>
            <div className="text-center">
              <span className="block text-sm font-semibold text-foreground tracking-tight tabular-nums">+{profile?.xp || 0}</span>
              <span className="block text-[8px] font-medium text-muted-foreground/60">Total XP</span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex gap-2.5 mb-5">
          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-foreground transition-colors duration-300" />
            <input 
              placeholder="Search clubs, builders, bootcamps..." 
              className="w-full rounded-lg border border-border/60 bg-card px-5 py-3.5 pl-12 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <button className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-lg border border-border/60 bg-card text-muted-foreground transition hover:border-border hover:bg-accent/50 hover:text-foreground active:scale-95">
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
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Discover
            </h2>
            <button 
              onClick={() => setShowAllDiscover(!showAllDiscover)}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              {showAllDiscover ? "See less" : "See all"}
            </button>
          </div>
          
          <div className={showAllDiscover ? "grid grid-cols-1 gap-3 pb-4 min-[430px]:grid-cols-2 md:grid-cols-3 md:gap-4 xl:grid-cols-4" : "no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-4 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 xl:grid-cols-4"}>
            {discover
              .filter((d: any) => activeCategory === "All" || (d.category && d.category.includes(activeCategory)))
              .length > 0 ? discover
              .filter((d: any) => activeCategory === "All" || (d.category && d.category.includes(activeCategory)))
              .sort((a: any, b: any) => a.name === "Zero K Bootcamp" ? -1 : b.name === "Zero K Bootcamp" ? 1 : 0)
              .slice(0, showAllDiscover ? 50 : 6)
              .map((d: any, i: number) => {
              const isFeatured = d.name === "Zero K Bootcamp";
              const tagClass = isFeatured
                ? "bg-amber-400 text-[#171218]"
                : "bg-[#171218] text-[#f8f1e7]";
              const isAlreadyJoined = myClubs.some((mc: any) => mc?.id === d.id);

              return (
                <article 
                  key={d.id} 
                  className={`relative ${showAllDiscover ? 'w-full' : 'w-[210px] sm:w-[220px] md:w-full'} flex h-[236px] shrink-0 snap-center flex-col items-center overflow-hidden rounded-lg border p-4 text-center shadow-[0_10px_26px_-22px_rgba(23,18,24,0.45)] transition md:h-[240px] ${
                    isFeatured 
                      ? 'border-amber-500/50 bg-card'
                      : 'border-border bg-card'
                  } hover:border-primary/40 active:scale-[0.97]`}
                >
                  <div className="pointer-events-none absolute inset-0 bg-primary/[0.025]" />
                  
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
                  
                  <div className="relative z-10 mb-2.5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-accent/30 shadow-sm">
                    {d.logo_url || d.banner_url ? (
                      <img src={d.logo_url || d.banner_url} alt={`${d.name} logo`} className="h-full w-full object-cover" />
                    ) : (
                      <Hash className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  
                  <h3 className="z-10 mb-0.5 w-full line-clamp-1 text-[14px] font-bold tracking-tight text-foreground">{d.name}</h3>
                  <p className="z-10 mb-auto w-full line-clamp-2 text-[10px] font-medium leading-4 text-muted-foreground">{d.description || "Level up your skills"}</p>
                  
                  <div className="flex items-center gap-1 mb-3 z-10 mt-2">
                    <div className="flex -space-x-1.5">
                      <div className="h-4 w-4 rounded-full bg-blue-500 border-2 border-card" />
                      <div className="h-4 w-4 rounded-full bg-purple-500 border-2 border-card" />
                      <div className="h-4 w-4 rounded-full bg-emerald-500 border-2 border-card" />
                    </div>
                    <span className="ml-1 text-[9px] font-medium text-muted-foreground">{d.members_count || 0} members</span>
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
              <div className="w-full rounded-lg border border-dashed border-border/50 bg-card/50 py-8 text-center text-xs font-medium text-muted-foreground/60">
                No clubs to discover right now.
              </div>
            )}
          </div>
        </div>

        {/* My Clubs and Boot Clubs are two tabs over one list, rather than two
            stacked sections. Side by side they fit a phone without pushing the
            bootcamp clubs far below the fold, and the single list underneath
            keeps every card at the same full width. */}
        <div className="mb-4 min-w-0">
          <div className="mb-4 flex items-center gap-5 border-b border-border/30">
            <button
              onClick={() => setClubsTab("mine")}
              className={`relative -mb-px flex items-center gap-2 pb-2.5 text-[15px] font-semibold tracking-tight transition ${
                clubsTab === "mine" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              My Clubs
              <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-foreground/10 px-1.5 text-[10px] font-bold text-muted-foreground">
                {myClubs.length}
              </span>
              {clubsTab === "mine" && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-foreground" />
              )}
            </button>

            {bootClubs.length > 0 && (
              <button
                onClick={() => setClubsTab("boot")}
                className={`relative -mb-px flex items-center gap-2 pb-2.5 text-[15px] font-semibold tracking-tight transition ${
                  clubsTab === "boot" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Boot Clubs
                <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
                  {bootClubs.length}
                </span>
                {clubsTab === "boot" && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-foreground" />
                )}
              </button>
            )}
          </div>

          {/* My Clubs */}
          <section className={clubsTab === "mine" ? "" : "hidden"}>
          {/* min-w-0 on the grid stops a long club name from widening the
              track and pushing every card past the edge of a phone screen. */}
          <div className="grid min-w-0 gap-3 md:grid-cols-2 md:gap-4">
            {myClubs.length > 0 ? myClubs.map((c: any) => (
              <Link key={c.id} to="/app/clubs/chat" search={{ clubId: c.id }} className="block min-w-0 transition-all duration-300 active:scale-[0.98]">
                <article className="flex w-full min-w-0 items-center gap-3.5 overflow-hidden rounded-lg border border-border/60 bg-card p-3.5 transition hover:border-primary/30">
                  <div className="relative shrink-0">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-accent/20">
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
              <div className="rounded-lg border border-dashed border-border/50 bg-card/50 px-4 py-10 text-center md:col-span-2">
                <p className="text-xs text-muted-foreground/60 font-medium mb-4">You haven't joined any clubs yet.</p>
                <button onClick={handleCreateClick} className="rounded-full bg-[#171218] px-5 py-2.5 text-xs font-bold text-[#f8f1e7] shadow-sm transition-all duration-300 active:scale-95 hover:opacity-90">
                  Create a Club
                </button>
              </div>
            )}
            
            {myClubs.length > 0 && (
              <button className="group flex w-full min-w-0 items-center justify-between rounded-lg border border-border/50 bg-card/50 p-4 transition hover:border-border hover:bg-card md:col-span-2">
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
          </section>

          {/* Bootcamp Clubs: temporary clubs attached to bootcamps. Hidden
              entirely when there are none. */}
          {bootClubs.length > 0 && (
            <section className={clubsTab === "boot" ? "" : "hidden"}>
              <div className="grid min-w-0 gap-3 md:grid-cols-2 md:gap-4">
                {bootClubs.map((c: any) => {
                  const endsAt = c.bootcamps?.ends_at ? new Date(c.bootcamps.ends_at) : null;
                  const ended = endsAt ? endsAt < new Date() : false;

                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate({ to: "/app/clubs/chat", search: { clubId: c.id } as any })}
                      className="flex w-full min-w-0 items-center gap-3.5 overflow-hidden rounded-lg border border-border/60 bg-card p-3.5 text-left transition hover:border-primary/30"
                    >
                      {/* The club's own logo, matching how My Clubs cards
                          render. The graduation icon is only a fallback for a
                          club that has not been given one. */}
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-accent/20 text-primary">
                        {c.logo_url || c.banner_url ? (
                          <img src={c.logo_url || c.banner_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <GraduationCap className="h-6 w-6" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 py-0.5">
                        <span className="mb-0.5 flex items-center gap-1.5">
                          <span className="truncate text-sm font-bold tracking-tight text-foreground">{c.name}</span>
                          {ended && (
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                              Ended
                            </span>
                          )}
                        </span>
                        <span className="mb-1.5 block truncate text-[11px] font-medium text-muted-foreground/60">
                          {ended ? "Read-only archive" : endsAt ? `Ends ${endsAt.toLocaleDateString()}` : "Runs with the bootcamp"}
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {c.members_count || 0} members
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Create Club Drawer */}
      <Drawer open={showCreate} onOpenChange={setShowCreate} repositionInputs={false}>
        <DrawerContent className="mx-auto max-h-[90dvh] max-w-lg border-none bg-background p-0">
          <div className="px-4 pb-6 pt-1 sm:px-6 sm:pb-8 sm:pt-6">
            <DrawerHeader className="mb-3 p-0 text-left sm:mb-6">
              <DrawerTitle className="text-[17px] font-semibold tracking-tight text-foreground sm:text-[19px]">
                Create a permanent Club
              </DrawerTitle>
              <DrawerDescription className="text-xs font-medium text-muted-foreground/60 mt-1">
                {clubCapacity.permanent_club_limit === null
                  ? `${clubCapacity.plan_name} supports organisation-specific Club capacity.`
                  : `${capacityLabel} permanent Clubs used on ${clubCapacity.plan_name}. Bootcamp cohort Clubs do not count.`}
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground ml-1">Club Name</label>
                <input 
                  value={newClub.name}
                  onChange={e => setNewClub(current => ({ ...current, name: e.target.value }))}
                  placeholder="e.g. Lagos Design Squad" 
                  className="w-full rounded-lg border border-border/60 bg-background px-5 py-4 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] text-muted-foreground ml-1">Description</label>
                <textarea 
                  value={newClub.description}
                  onChange={e => setNewClub(current => ({ ...current, description: e.target.value }))}
                  placeholder="What's this club about?" 
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border/60 bg-background px-5 py-4 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>
              {clubCapacity.can_create ? (
                <div className="space-y-2">
                  <label className="text-[11px] text-muted-foreground ml-1">Access Type</label>
                  <div className="flex gap-2">
                    {["Free", "Paid"].map(type => (
                      <button
                        type="button"
                        key={type}
                        onClick={() => setIsPaid(type === "Paid")}
                        className={`flex-1 rounded-lg border py-3.5 text-xs font-semibold transition ${
                          (type ==="Paid" && isPaid) || (type === "Free" && !isPaid)
                            ? "border-[#171218] bg-[#171218] text-[#f8f1e7] shadow-[0_2px_20px_-4px_rgba(0,0,0,0.2)]"
                            : "bg-card border-border/40 text-muted-foreground hover:border-border/60"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {isPaid && clubCapacity.can_create && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[11px] text-muted-foreground ml-1">Entry Fee ({currencyDetails.symbol})</label>
                  <input 
                    type="number"
                    value={newClub.price}
                    onChange={e => setNewClub(current => ({ ...current, price: Number(e.target.value) }))}
                    placeholder="e.g. 5000" 
                    className="w-full rounded-lg border border-border/60 bg-background px-5 py-4 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              )}

              <button 
                type="button"
                onClick={handleCreateClub}
                disabled={isSubmitting}
                className="mt-2 w-full rounded-full bg-[#171218] py-4 text-sm font-bold text-[#f8f1e7] shadow-[0_2px_20px_-4px_rgba(0,0,0,0.2)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50 hover:opacity-90"
              >
                {isSubmitting ? "Creating..." : "Launch Club"}
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Upgrade Prompt Sheet */}
      <Drawer open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DrawerContent className="mx-auto max-w-lg overflow-hidden border-none bg-background p-0">
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
              {clubCapacity.upgrade_message || "Your current plan does not allow another permanent Club."}
            </p>
            
            <div className="mt-8 space-y-3">
              <Link 
                to="/app/premium"
                onClick={() => setShowUpgrade(false)}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#171218] py-4 text-sm font-bold text-[#f8f1e7] shadow-[0_2px_20px_-4px_rgba(0,0,0,0.2)] transition-all duration-300 active:scale-[0.98] hover:opacity-90"
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
        <DrawerContent desktopVariant="panel" className="mx-auto flex max-h-[85vh] max-w-[620px] flex-col border-t border-border/60 bg-background p-0 shadow-[0_-16px_40px_-24px_rgba(0,0,0,0.45)]">
          <DrawerHeader className="mt-0 shrink-0 border-b border-border/30 px-4 py-3 sm:mt-2 sm:px-6 sm:py-5">
            <div className="flex items-center gap-4">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
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
                  <div className="flex items-center gap-4 rounded-lg border border-border/50 bg-card/50 px-5 py-4">
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
                          className="flex cursor-pointer flex-col gap-3 rounded-lg border border-border/60 bg-card p-4 transition hover:border-primary/20"
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
                                  className="h-9 flex-1 rounded-full bg-[#171218] text-xs font-bold text-[#f8f1e7] shadow-sm transition-all duration-300 hover:opacity-90 active:scale-95 disabled:opacity-50"
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
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-card p-4 transition hover:border-primary/20 active:scale-95"
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
        <DrawerContent className="mx-auto max-w-lg overflow-hidden border-border bg-background p-0">
          {selectedClub && (
            <div>
              <div className="relative h-28 overflow-hidden bg-[#171218]">
                {selectedClub.banner_url && <img src={selectedClub.banner_url} alt="" className="h-full w-full object-cover opacity-55" />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#171218] to-transparent" />
                <div className="absolute bottom-4 left-5 flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-black/30 backdrop-blur-md">
                {selectedClub.banner_url ? (
                  <img src={selectedClub.banner_url} className="h-full w-full object-cover" />
                ) : (
                    <Hash className="h-6 w-6 text-white" />
                )}
                </div>
              </div>
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase text-primary">{selectedClub.is_private ? <Lock className="h-3.5 w-3.5 fill-current" /> : <Users className="h-3.5 w-3.5 fill-current" />}{selectedClub.is_private ? "Private community" : "Open community"}</div>
                <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-foreground">{selectedClub.is_private ? "Request to join" : "Join club"}</h2>
                <p className="mt-1 text-[14px] font-medium text-foreground">{selectedClub.name}</p>
                <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{selectedClub.is_private ? "Your profile and public proof will be shared with the club administrators. You will be notified as soon as they decide." : "Join the conversation, participate in club work, and connect with members immediately."}</p>

                {selectedClub.is_private && <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/[0.045] p-3.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="text-[12px] font-semibold text-foreground">Admin approval required</p><p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">Sending a request does not grant access until an administrator approves it.</p></div></div>}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setShowJoinModal(false)}
                  className="h-11 rounded-lg border border-border bg-card text-[13px] font-semibold text-foreground hover:bg-muted"
                >
                  Not now
                </button>
                <button 
                  onClick={() => {
                    handleJoinClub(selectedClub);
                    setShowJoinModal(false);
                  }}
                  disabled={joiningClubId === selectedClub.id}
                  className="h-11 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {joiningClubId === selectedClub.id ? "Sending..." : selectedClub.is_private ? "Send request" : "Join now"}
                </button>
              </div>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
