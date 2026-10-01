import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RichText } from "@/components/RichText";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Lock, MessageCircle, Plus, ShieldCheck, ArrowRight, Bell, ChevronDown, ChevronRight, Trash2, Check } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { RequestFundsButton } from "@/components/RequestFundsButton";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { useState, useEffect, useRef, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
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
      className="relative w-full overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className="absolute inset-y-0 left-0 flex w-full items-center justify-start bg-[#e0245e]/10 px-4 text-[#e0245e] transition-opacity"
        style={{ opacity: swipeOffset > 20 ? 1 : 0 }}
      >
        <Trash2 className="h-5 w-5" />
      </div>
      <div 
        className="relative z-10 bg-background transition-transform"
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
  const { details: currencyDetails, format } = useWalletCurrency();

  /* What it costs to get in, in one short phrase. A club with free access set
     is free whatever fee is stored against it, so the flag wins over the
     number — the same order the join function applies them in. */
  const clubPriceLabel = (club: any) => {
    const fee = Number(club?.subscription_fee) || 0;
    if (club?.access_free || fee <= 0) return "Free";
    return `${format(fee)}/month`;
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedClub, setSelectedClub] = useState<any>(null);

  /* Private clubs have always been by request. Public ones can now ask for the
     same, without having to hide themselves to get it. */
  const joinNeedsApproval = Boolean(selectedClub?.is_private || selectedClub?.requires_approval);
  const [activeCategory, setActiveCategory] = useState("All");
  const [clubSearch, setClubSearch] = useState("");
  const [clubScope, setClubScope] = useState<"all" | "discover" | "mine" | "boot">("all");
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
    staleTime: 1000 * 60 * 3,
    gcTime: 1000 * 60 * 15,
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

  // Group and deduplicate pending requests by sender_id and club_id
  const pendingRequestsGrouped = useMemo(() => {
    const pendingRaw = incomingRequests.filter((r: any) => {
      if (!r || !r.content) return false;
      const str = String(r.content);
      return str.startsWith('CLUB_REQUEST:') && str.endsWith(':pending');
    });

    const map = new Map<string, { request: any; allIds: string[] }>();
    for (const req of pendingRaw) {
      const parts = req.content.split(':');
      const clubId = parts[1];
      const senderId = req.sender_id || req.sender?.id || 'unknown';
      const key = `${senderId}:${clubId}`;
      if (!map.has(key)) {
        map.set(key, { request: req, allIds: [req.id] });
      } else {
        map.get(key)!.allIds.push(req.id);
      }
    }
    return Array.from(map.values());
  }, [incomingRequests]);

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
      /*
       * Through the database, not around it.
       *
       * This used to insert straight into club_members, which meant a club's
       * subscription fee was a number on a form and nothing else — anyone
       * could join a paid club for free, and a hand-written request could
       * bypass it entirely. join_club charges the wallet and creates the
       * membership in one transaction, so there is no moment where somebody
       * is inside without having paid.
       *
       * The request path goes through it too. Whether a club wants approval is
       * the club's own setting, and the client asking "is this private?" was a
       * second copy of that rule that could disagree with the first — a public
       * club that had turned approval on was letting people walk in.
       */
      const { data, error } = await supabase.rpc('join_club', { p_club_id: club.id });
      if (error) throw error;

      const result = data as any;

      if (result?.status === 'requested') {
        toast.success("Request sent to the club admin", {
          description: "You will hear back as soon as they decide.",
        });
        window.location.reload();
        return;
      }

      if (result?.status === 'insufficient_funds') {
        toast.error(`${format(Number(result.fee) || 0)} is needed to join this club.`, {
          description: `Add ${format(Number(result.shortfall) || 0)} to your wallet to continue.`,
          action: { label: "Add money", onClick: () => navigate({ to: "/app/wallet/add-money" }) },
        });
        return;
      }

      const paid = Number(result?.paid) || 0;
      toast.success(paid > 0 ? `Joined ${club.name} for ${format(paid)}` : `Joined ${club.name}!`);

      // Featured Club joining reward
      if (club.name === "Zero K Bootcamp") {
        toast.success("You earned 100 XP for joining the featured Zero K Bootcamp!");
      }

      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to process club join");
    } finally {
      setJoiningClubId(null);
    }
  };

  const handleDecideRequest = async (messageId: string, clubId: string, applicantId: string, decision: 'accept' | 'decline', allIds?: string[]) => {
    setDecidingId(messageId);
    try {
      const idsToTarget = Array.from(new Set([
        ...(allIds || [messageId]),
        ...incomingRequests
          .filter(m => {
            const parts = m.content?.split(':') || [];
            return m.sender_id === applicantId && parts[1] === clubId && parts[3] === 'pending';
          })
          .map(m => m.id)
      ]));

      if (decision === 'accept') {
        for (const id of idsToTarget) {
          const msgToUpdate = incomingRequests.find(m => m.id === id);
          if (msgToUpdate) {
            const parts = msgToUpdate.content.split(':');
            parts[3] = 'accepted';
            const newContent = parts.join(':');

            await supabase
              .from('messages')
              .update({ content: newContent, is_read: true })
              .eq('id', id);
          }
        }

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
        
        setIncomingRequests(prev => prev.filter(m => !idsToTarget.includes(m.id)));
        toast.success("Request approved! Builder added to your private club.");
      } else {
        for (const id of idsToTarget) {
          const msgToUpdate = incomingRequests.find(m => m.id === id);
          if (msgToUpdate) {
            const parts = msgToUpdate.content.split(':');
            parts[3] = 'declined';
            const newContent = parts.join(':');

            await supabase
              .from('messages')
              .update({ content: newContent, is_read: true })
              .eq('id', id);
          }
        }

        setIncomingRequests(prev => prev.filter(m => !idsToTarget.includes(m.id)));
        toast.error("Request declined.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process request");
    } finally {
      setDecidingId(null);
    }
  };

  const handleDismissNotification = async (messageId: string, type: 'incoming' | 'outgoing', allIds?: string[]) => {
    try {
      const idsToTarget = allIds && allIds.length > 0 ? allIds : [messageId];
      // Instead of DELETE which might fail silently due to RLS, we UPDATE the content so it no longer matches the CLUB_REQUEST prefix
      const { error } = await supabase
        .from('messages')
        .update({ content: 'DISMISSED_CLUB_REQUEST', is_read: true })
        .in('id', idsToTarget);
        
      if (error) throw error;
      if (type === 'incoming') {
        setIncomingRequests(prev => prev.filter(m => !idsToTarget.includes(m.id)));
      } else {
        setOutgoingRequests(prev => prev.filter(m => !idsToTarget.includes(m.id)));
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

  const normalizedClubSearch = clubSearch.trim().toLocaleLowerCase();
  const matchesClubName = (club: any) =>
    !normalizedClubSearch || String(club?.name || "").toLocaleLowerCase().includes(normalizedClubSearch);
  const filteredDiscover = discover.filter((club: any) =>
    matchesClubName(club) &&
    (activeCategory === "All" || String(club.category || "").toLocaleLowerCase().includes(activeCategory.toLocaleLowerCase()))
  );
  const filteredMyClubs = myClubs.filter(matchesClubName);
  const filteredBootClubs = bootClubs.filter(matchesClubName);
  const visibleClubsTab = clubScope === "mine" ? "mine" : clubScope === "boot" ? "boot" : clubsTab;
  const showDiscoverSection = clubScope === "all" || clubScope === "discover";
  const showJoinedSections = clubScope === "all" || clubScope === "mine" || clubScope === "boot";

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

  const clubAvatar = (club: any, size = "h-12 w-12") => (
    <span className={`${size} ${size.includes("rounded-") ? "" : "rounded-xl"} grid shrink-0 place-items-center overflow-hidden bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground`}>
      {club?.logo_url || club?.banner_url ? (
        <img src={club.logo_url || club.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        String(club?.name || "?").substring(0, 2).toUpperCase()
      )}
    </span>
  );
  const clubRequests = pendingRequestsGrouped.length + unreadClubMessages.length;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto w-full max-w-[900px] px-4 md:px-6">
          <div className="flex h-14 items-center justify-between gap-2">
            <h1 className="font-display text-[24px] font-semibold tracking-[-0.02em] text-foreground">Clubs</h1>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNotifications(true)}
                aria-label={clubRequests > 0 ? `Club requests and messages, ${clubRequests} new` : "Club requests and messages"}
                className="relative grid h-10 w-10 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
              >
                <Bell className="h-[22px] w-[22px]" />
                {clubRequests > 0 && (
                  <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-foreground ring-2 ring-card">
                    {clubRequests}
                  </span>
                )}
              </button>
              <button
                onClick={handleCreateClick}
                className="flex h-9 items-center gap-1 rounded-full bg-foreground px-3.5 text-[14px] font-semibold text-background tap hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> New club
              </button>
            </div>
          </div>
          <label className="flex h-9 items-center gap-2 rounded-lg bg-foreground/[0.05] px-3">
            <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
            <input
              value={clubSearch}
              onChange={(event) => setClubSearch(event.target.value)}
              placeholder="Search clubs by name"
              aria-label="Search clubs by name"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto border-b border-border px-4 pb-3 pt-2.5 md:mx-0 md:px-0">
            {[
              { id: "all", label: "All clubs" },
              { id: "mine", label: "My clubs" },
              { id: "discover", label: "Discover" },
              ...(bootClubs.length > 0 ? [{ id: "boot", label: "Boot clubs" }] : []),
            ].map((option) => (
              <button
                type="button"
                key={option.id}
                onClick={() => setClubScope(option.id as "all" | "discover" | "mine" | "boot")}
                className={`h-8 shrink-0 rounded-full px-3.5 text-[14px] font-semibold tap ${
                  clubScope === option.id ? "bg-foreground text-background" : "border border-foreground/30 text-foreground/75 hover:bg-foreground/[0.04]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="zc-page-width mx-auto w-full max-w-[900px]">
        <p className="bg-card px-4 py-2.5 text-[13px] text-muted-foreground md:mt-2 md:rounded-xl md:px-6">
          <b className="font-semibold text-foreground">{capacityLabel}</b> · {capacityCaption}
          {(totalOnlineBuilders || 0) > 0 && (
            <>
              <span className="mx-1.5" aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {totalOnlineBuilders} online now
              </span>
            </>
          )}
        </p>

        {/* Your own clubs come first. Somebody opening this page is far more
            often returning to a club they are in than looking for a new one. */}
        {showJoinedSections && (
          <section className="mt-2 bg-card md:rounded-xl md:border md:border-border">
            <div className="flex items-center gap-[22px] border-b border-border px-4 md:px-6">
              <button
                onClick={() => setClubsTab("mine")}
                className={`relative flex h-11 items-center gap-1.5 text-[14px] font-semibold ${visibleClubsTab === "mine" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                My clubs <span className="text-[12px] font-medium text-muted-foreground">{filteredMyClubs.length}</span>
                {visibleClubsTab === "mine" && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground" />}
              </button>
              {(bootClubs.length > 0 || clubScope === "boot") && (
                <button
                  onClick={() => setClubsTab("boot")}
                  className={`relative flex h-11 items-center gap-1.5 text-[14px] font-semibold ${visibleClubsTab === "boot" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Boot clubs <span className="text-[12px] font-medium text-muted-foreground">{filteredBootClubs.length}</span>
                  {visibleClubsTab === "boot" && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground" />}
                </button>
              )}
            </div>

            {visibleClubsTab === "mine" ? (
              filteredMyClubs.length > 0 ? (
                <div className="md:grid md:grid-cols-2 md:gap-x-6 md:px-2">
                  {filteredMyClubs.map((c: any) => (
                    <Link key={c.id} to="/app/clubs/chat" search={{ clubId: c.id }} className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-foreground/[0.02]">
                      {clubAvatar(c)}
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[15px] font-semibold text-foreground">{c.name}</span>
                          {c.is_private && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                        </span>
                        <span className="block truncate text-[13px] text-muted-foreground">
                          {(c.members_count || 1).toLocaleString()} {(c.members_count || 1) === 1 ? "member" : "members"}
                          {(c.online_count || 0) > 0 && <span className="font-semibold text-success"> · {c.online_count} online</span>}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-10 text-center">
                  <p className="text-[14px] text-muted-foreground">
                    {clubSearch ? `No joined club name matches “${clubSearch.trim()}”.` : "You haven't joined any clubs yet."}
                  </p>
                  {!clubSearch && (
                    <button onClick={handleCreateClick} className="mt-4 h-10 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background tap">
                      Create a club
                    </button>
                  )}
                </div>
              )
            ) : filteredBootClubs.length > 0 ? (
              <div className="md:grid md:grid-cols-2 md:gap-x-6 md:px-2">
                {filteredBootClubs.map((c: any) => {
                  const endsAt = c.bootcamps?.ends_at ? new Date(c.bootcamps.ends_at) : null;
                  const ended = endsAt ? endsAt < new Date() : false;
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate({ to: "/app/clubs/chat", search: { clubId: c.id } as any })}
                      className="flex w-full min-w-0 items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-foreground/[0.02]"
                    >
                      {clubAvatar(c)}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-foreground">{c.name}</span>
                        <span className="block truncate text-[13px] text-muted-foreground">
                          {(c.members_count || 0).toLocaleString()} members · {ended ? "Read-only archive" : endsAt ? `Ends ${endsAt.toLocaleDateString()}` : "Runs with the bootcamp"}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${ended ? "bg-foreground/[0.06] text-muted-foreground" : "bg-accent/10 text-accent"}`}>
                        {ended ? "Ended" : "Bootcamp"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-6 py-10 text-center text-[14px] text-muted-foreground">
                {clubSearch ? `No Boot Club name matches “${clubSearch.trim()}”.` : "No Boot Clubs are available yet."}
              </p>
            )}
          </section>
        )}

        {showDiscoverSection && (
          <section className="mt-2 bg-card px-4 pb-4 pt-3 md:rounded-xl md:border md:border-border md:px-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[18px] font-semibold text-foreground">Discover</h2>
              {filteredDiscover.length > 6 && (
                <button onClick={() => setShowAllDiscover(!showAllDiscover)} className="text-[14px] font-semibold text-muted-foreground hover:text-foreground">
                  {showAllDiscover ? "See less" : "See all"}
                </button>
              )}
            </div>
            <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
              {["All", "Tech", "AI", "Design", "Startup", "Writing", "Marketing", "Campus"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`h-8 shrink-0 rounded-full px-3.5 text-[14px] font-semibold tap ${
                    activeCategory === cat ? "bg-foreground text-background" : "border border-foreground/30 text-foreground/75 hover:bg-foreground/[0.04]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {filteredDiscover.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3">
                {filteredDiscover
                  .sort((a: any, b: any) => a.name === "Zero K Bootcamp" ? -1 : b.name === "Zero K Bootcamp" ? 1 : 0)
                  .slice(0, showAllDiscover ? 50 : 6)
                  .map((d: any) => {
                    const isFeatured = d.name === "Zero K Bootcamp";
                    const isAlreadyJoined = myClubs.some((mc: any) => mc?.id === d.id);
                    const isRequested = requestedClubIds.includes(d.id);
                    const needsApproval = Boolean(d.is_private || d.requires_approval);
                    return (
                      <article
                        key={d.id}
                        // The whole card opens the join sheet, not just the small button.
                        onClick={isAlreadyJoined || isRequested ? undefined : () => { setSelectedClub(d); setShowJoinModal(true); }}
                        onKeyDown={isAlreadyJoined || isRequested ? undefined : (e) => {
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedClub(d); setShowJoinModal(true); }
                        }}
                        role={isAlreadyJoined || isRequested ? undefined : "button"}
                        tabIndex={isAlreadyJoined || isRequested ? undefined : 0}
                        aria-label={isAlreadyJoined || isRequested ? undefined : `View ${d.name}`}
                        className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-border text-center ${isAlreadyJoined || isRequested ? "" : "cursor-pointer transition active:scale-[0.98]"}`}
                      >
                        <div className="relative h-14 bg-foreground/[0.06]">
                          {d.banner_url && <img src={d.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
                          {isFeatured && <span className="absolute left-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-semibold text-foreground">Featured</span>}
                        </div>
                        {/* relative + z-10: the banner is positioned, so without its own
                            stacking the logo was painted underneath it. */}
                        <div className="relative z-10 -mt-7 flex justify-center">
                          {/* A solid square tile behind the logo. Many logos are round images on a
                              transparent background, and the old see-through tile let the banner
                              show around them, so they read as circles. */}
                          <span className="block overflow-hidden rounded-[14px] border-[3px] border-card bg-card shadow-[0_6px_16px_-8px_rgba(0,0,0,0.45)]">
                            {clubAvatar(d, "h-[52px] w-[52px] rounded-[11px]")}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col px-2.5 pb-3 pt-1.5">
                          <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">{d.name}</p>
                          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                            {needsApproval ? "Approval" : "Open"} · {(d.members_count || 0).toLocaleString()} members
                          </p>
                          <p className="truncate text-[12px] text-muted-foreground">{clubPriceLabel(d)}</p>
                          <div className="mt-auto pt-2.5">
                            {isAlreadyJoined ? (
                              <Link to="/app/clubs/chat" search={{ clubId: d.id }} className="flex h-8 items-center justify-center rounded-full bg-foreground/[0.06] text-[14px] font-semibold text-foreground tap">
                                Open
                              </Link>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedClub(d);
                                  setShowJoinModal(true);
                                }}
                                disabled={joiningClubId === d.id || isRequested}
                                className="flex h-8 w-full items-center justify-center rounded-full border-[1.5px] border-foreground text-[14px] font-semibold text-foreground tap hover:bg-foreground/[0.04] disabled:border-foreground/20 disabled:text-muted-foreground"
                              >
                                {isRequested ? "Requested" : needsApproval ? "Request" : "Join"}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
              </div>
            ) : (
              <p className="py-8 text-center text-[14px] text-muted-foreground">
                {clubSearch ? `No club name matches “${clubSearch.trim()}”.` : "No clubs to discover right now."}
              </p>
            )}
          </section>
        )}
      </div>

      {/* Create Club Drawer */}
      <Drawer open={showCreate} onOpenChange={setShowCreate} repositionInputs={false}>
        <DrawerContent className="mx-auto max-h-[90dvh] max-w-lg border-none bg-background p-0">
          <DrawerHeader className="gap-0 px-5 pb-3 pt-1 sm:gap-0 sm:px-5 sm:pb-3 sm:pt-1">
            <DrawerTitle className="font-display text-[20px] font-semibold leading-tight text-foreground">
              Create a permanent Club
            </DrawerTitle>
            <DrawerDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
              {clubCapacity.permanent_club_limit === null
                ? `${clubCapacity.plan_name} supports organisation-specific Club capacity.`
                : `${capacityLabel} permanent Clubs used on ${clubCapacity.plan_name}. Bootcamp cohort Clubs do not count.`}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Club name</label>
              <input
                value={newClub.name}
                onChange={e => setNewClub(current => ({ ...current, name: e.target.value }))}
                placeholder="e.g. Lagos Design Squad"
                className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Description</label>
              <textarea
                value={newClub.description}
                onChange={e => setNewClub(current => ({ ...current, description: e.target.value }))}
                placeholder="What's this club about?"
                rows={3}
                className="w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
              />
            </div>
            {clubCapacity.can_create ? (
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Access</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {["Free", "Paid"].map(type => {
                    const selected = (type === "Paid" && isPaid) || (type === "Free" && !isPaid);
                    return (
                      <button
                        type="button"
                        key={type}
                        onClick={() => setIsPaid(type === "Paid")}
                        aria-pressed={selected}
                        className={`flex items-center justify-between gap-3 rounded-2xl border-[1.5px] p-4 text-left transition-colors ${
                          selected
                            ? "border-[#cc208f] bg-[#cc208f]/[0.06]"
                            : "border-foreground/12 hover:bg-foreground/[0.03]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-foreground">{type}</span>
                          <span className="mt-0.5 block text-[13px] text-muted-foreground">
                            {type === "Paid" ? "Set an entry fee" : "No entry fee"}
                          </span>
                        </span>
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                            selected ? "bg-[#cc208f] text-white" : "border-[1.5px] border-foreground/25"
                          }`}
                        >
                          {selected ? <Check className="h-3 w-3" /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {isPaid && clubCapacity.can_create && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">Entry fee ({currencyDetails.symbol})</label>
                <input
                  type="number"
                  value={newClub.price}
                  onChange={e => setNewClub(current => ({ ...current, price: Number(e.target.value) }))}
                  placeholder="e.g. 5000"
                  className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleCreateClub}
              disabled={isSubmitting}
              className="!mt-6 h-12 w-full rounded-full bg-foreground text-[16px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isSubmitting ? "Creating..." : "Launch Club"}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Upgrade Prompt Sheet */}
      <Drawer open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DrawerContent className="mx-auto max-w-lg overflow-hidden border-none bg-background p-0">
          <div className="flex flex-col items-center px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[#cc208f]/10 text-[#cc208f]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <DrawerTitle className="mt-4 font-display text-[20px] font-semibold leading-tight text-foreground">Limit reached</DrawerTitle>
            <DrawerDescription className="mt-1 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
              {clubCapacity.upgrade_message || "Your current plan does not allow another permanent Club."}
            </DrawerDescription>

            <div className="mt-7 w-full space-y-2.5">
              <Link
                to="/app/premium"
                onClick={() => setShowUpgrade(false)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background transition-opacity hover:opacity-90"
              >
                Upgrade plan <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                onClick={() => setShowUpgrade(false)}
                className="h-12 w-full rounded-full border-[1.5px] border-foreground/25 text-[16px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.04]"
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
          <DrawerHeader className="shrink-0 gap-0 px-5 pb-3 pt-1 sm:gap-0 sm:px-5 sm:pb-3 sm:pt-1">
            <div className="flex items-center gap-2">
              <DrawerTitle className="font-display text-[20px] font-semibold leading-tight text-foreground">Notifications</DrawerTitle>
              {(pendingRequestsGrouped.length + unreadClubMessages.length) > 0 && (
                <span className="rounded-full bg-[#cc208f]/10 px-2.5 py-0.5 text-[12px] font-semibold tabular-nums text-[#a3186f]">
                  {pendingRequestsGrouped.length + unreadClubMessages.length}
                </span>
              )}
            </div>
            <DrawerDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
              Manage admissions and club messages
            </DrawerDescription>
          </DrawerHeader>

          <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1">
            {(() => {
              const hasNotifications = pendingRequestsGrouped.length > 0 || unreadClubMessages.length > 0;

              if (!hasNotifications) {
                return (
                  <div className="flex flex-col items-center px-4 py-10 text-center">
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground">
                      <Bell className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-[16px] font-semibold text-foreground">All caught up</p>
                    <p className="mt-1 text-[14px] text-muted-foreground">You have no new notifications.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-5">
                  {pendingRequestsGrouped.length > 0 && (
                    <section>
                      <h3 className="mb-1 text-[13px] font-semibold text-muted-foreground">Join requests</h3>
                      <div className="divide-y divide-border/60">
                        {pendingRequestsGrouped.map(({ request: r, allIds }) => {
                          const parts = r.content.split(':');
                          const clubId = parts[1];
                          const clubName = parts[2];
                          const sender = r.sender || {};
                          const isExpanded = expandedRequestId === r.id;

                          return (
                            <SwipeableNotification key={r.id} onDismiss={() => handleDismissNotification(r.id, 'incoming', allIds)}>
                              <article
                                className="cursor-pointer py-3"
                                onClick={() => setExpandedRequestId(isExpanded ? null : r.id)}
                              >
                                <div className="flex w-full items-center gap-3">
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-foreground">
                                    {sender.avatar_url ? (
                                      <img src={sender.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                                    ) : (
                                      (sender.full_name || sender.username || 'U').substring(0, 1).toUpperCase()
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <h4 className="flex items-baseline gap-1.5 truncate text-[15px] font-semibold text-foreground">
                                      <span className="truncate">{sender.full_name || sender.username}</span>
                                      <span className="shrink-0 text-[13px] font-normal text-muted-foreground">{getFirstName(sender)}</span>
                                    </h4>
                                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                                      Wants to join <span className="font-semibold text-foreground">{clubName}</span>
                                    </p>
                                  </div>

                                  <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>

                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="flex items-center gap-2.5 pl-14 pt-3">
                                        <button
                                          disabled={decidingId !== null && (decidingId === r.id || allIds.includes(decidingId))}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDecideRequest(r.id, clubId, r.sender_id, 'decline', allIds);
                                          }}
                                          className="h-10 flex-1 rounded-full bg-[#e0245e]/10 text-[14px] font-semibold text-[#e0245e] transition-opacity hover:opacity-80 disabled:opacity-40"
                                        >
                                          Reject
                                        </button>
                                        <button
                                          disabled={decidingId !== null && (decidingId === r.id || allIds.includes(decidingId))}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDecideRequest(r.id, clubId, r.sender_id, 'accept', allIds);
                                          }}
                                          className="h-10 flex-1 rounded-full bg-foreground text-[14px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                                        >
                                          Accept
                                        </button>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </article>
                            </SwipeableNotification>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {unreadClubMessages.length > 0 && (
                    <section>
                      <h3 className="mb-1 text-[13px] font-semibold text-muted-foreground">Club messages</h3>
                      <div className="divide-y divide-border/60">
                        {unreadClubMessages.map((msgGroup: any) => (
                          <article
                            key={msgGroup.club_id}
                            onClick={() => {
                              setShowNotifications(false);
                              navigate({ to: "/app/clubs/chat", search: { clubId: msgGroup.club_id } });
                            }}
                            className="flex cursor-pointer items-center gap-3 py-3 transition-opacity active:opacity-70"
                          >
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#cc208f]/10 text-[#cc208f]">
                              <MessageCircle className="h-5 w-5" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <h4 className="truncate text-[15px] font-semibold text-foreground">
                                {msgGroup.club_name}
                              </h4>
                              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                                <span className="font-semibold tabular-nums text-foreground">{msgGroup.count > 24 ? '24+' : msgGroup.count}</span> unseen message{msgGroup.count !== 1 ? 's' : ''} on the club
                              </p>
                            </div>

                            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              );
            })()}
          </div>
        </DrawerContent>
      </Drawer>
      
      {/* Join Club Modal */}
      <Drawer open={showJoinModal} onOpenChange={setShowJoinModal}>
        <DrawerContent className="mx-auto max-h-[92dvh] max-w-lg overflow-hidden border-border bg-background p-0">
          {selectedClub && (
            <div key={selectedClub.id} className="flex max-h-[calc(92dvh-24px)] flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {/* ── Hero: the club's banner, easing in with a slow settle ── */}
                <div className="relative mx-3 mt-1 h-44 overflow-hidden rounded-[22px] bg-[#1b1420]">
                  {selectedClub.banner_url ? (
                    <img
                      src={selectedClub.banner_url}
                      alt=""
                      className="zc-join-banner h-full w-full object-cover"
                      decoding="async"
                    />
                  ) : (
                    <div className="zc-join-banner h-full w-full bg-[radial-gradient(120%_90%_at_15%_10%,#cc208f_0%,transparent_55%),radial-gradient(90%_80%_at_90%_100%,#6d28d9_0%,transparent_60%),linear-gradient(135deg,#1b1420,#2a1830)]" />
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                  {Boolean((selectedClub as any).category) && (
                    <span className="zc-join-rise absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md" style={{ animationDelay: "120ms" }}>
                      {(selectedClub as any).category}
                    </span>
                  )}
                  <span className="zc-join-rise absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md" style={{ animationDelay: "160ms" }}>
                    {selectedClub.is_private ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                    {selectedClub.is_private ? "Private" : joinNeedsApproval ? "Approval" : "Open"}
                  </span>
                </div>

                {/* ── Identity: logo overlapping the banner edge ── */}
                <div className="relative z-10 -mt-9 flex items-end gap-3 px-6">
                  <div className="zc-join-pop h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[20px] border-4 border-background bg-background shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)]">
                    {selectedClub.logo_url ? (
                      <img src={selectedClub.logo_url} alt="" className="h-full w-full object-cover" decoding="async" />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-foreground/[0.06] text-[20px] font-semibold text-muted-foreground">
                        {String(selectedClub.name || "?").substring(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-6 pb-8 pt-3">
                  <DrawerTitle className="zc-join-rise font-display text-[22px] font-semibold leading-tight tracking-tight text-foreground" style={{ animationDelay: "140ms" }}>
                    {selectedClub.name}
                  </DrawerTitle>
                  <p className="zc-join-rise mt-1 text-[13px] font-medium text-muted-foreground" style={{ animationDelay: "190ms" }}>
                    {(selectedClub.members_count || 0).toLocaleString()} {(selectedClub.members_count || 0) === 1 ? "member" : "members"}
                    {" · "}
                    {clubPriceLabel(selectedClub)}
                  </p>

                  {/* ── What the club is about ── */}
                  <div className="zc-join-rise mt-4" style={{ animationDelay: "240ms" }}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">About</p>
                    <DrawerDescription asChild>
                      <div className="mt-1.5 text-[14.5px] leading-relaxed text-foreground/85">
                        {String((selectedClub as any).description || "").trim()
                          ? <RichText content={(selectedClub as any).description} />
                          : "This club hasn't written a description yet. Join to see what members are working on."}
                      </div>
                    </DrawerDescription>
                  </div>

                  {joinNeedsApproval && (
                    <div className="zc-join-rise mt-4 flex items-start gap-3 rounded-2xl bg-[#cc208f]/[0.07] p-4" style={{ animationDelay: "290ms" }}>
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#cc208f]" />
                      <div>
                        <p className="text-[14px] font-semibold text-foreground">Admins review requests</p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">Your profile and public proof are shared with the club admins. You'll be notified as soon as they decide.</p>
                      </div>
                    </div>
                  )}

                  {/* Say the price before they tap, not after the wallet moves. */}
                  {!joinNeedsApproval && !selectedClub.access_free && Number(selectedClub.subscription_fee) > 0 && (
                    <div className="zc-join-rise mt-4 rounded-2xl bg-foreground/[0.04] p-4" style={{ animationDelay: "290ms" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-muted-foreground">Membership fee</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                            Charged once from your Zero Club wallet when you join.
                          </p>
                        </div>
                        <p className="shrink-0 font-display text-[22px] font-semibold tabular-nums leading-tight text-foreground">
                          {format(Number(selectedClub.subscription_fee))}
                        </p>
                      </div>
                      <div className="mt-3">
                        <RequestFundsButton
                          amount={Number(selectedClub.subscription_fee)}
                          purpose={`Membership of ${selectedClub.name} on Zero Club`}
                          label="Ask someone to cover this"
                          className="flex h-11 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-foreground/15 bg-card text-[14px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.04]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Actions stay pinned, however long the description is ── */}
              <div className="zc-join-rise grid shrink-0 grid-cols-2 gap-2.5 border-t border-border/60 bg-background px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3" style={{ animationDelay: "320ms" }}>
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="h-12 rounded-full border-[1.5px] border-foreground/20 text-[15px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.04] active:scale-[0.98]"
                >
                  Not now
                </button>
                <button
                  onClick={() => {
                    handleJoinClub(selectedClub);
                    setShowJoinModal(false);
                  }}
                  disabled={joiningClubId === selectedClub.id}
                  className="h-12 rounded-full bg-[#cc208f] text-[15px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(204,32,143,0.8)] transition hover:bg-[#b01c7b] active:scale-[0.98] disabled:opacity-40"
                >
                  {joiningClubId === selectedClub.id ? "Sending…" : joinNeedsApproval ? "Send request" : "Join now"}
                </button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
      {/* The last card runs to the bottom of the screen, so the page never
          ends in a strip of bare background under the tab bar. */}
      <div aria-hidden className="min-h-24 flex-1 bg-card md:bg-transparent" />
    </div>
  );
}
