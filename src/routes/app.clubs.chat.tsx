import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkifiedText } from "@/components/LinkifiedText";
import { ChevronLeft, ChevronDown, Paperclip, Send, Hash, Users, Pin, ShieldAlert, GraduationCap, Mic, Settings, Trash2, Save, Camera, X, Reply, Check, Sliders, UserX, Copy, Plus, Smile, Video, Radio, Zap, CalendarDays, Clock, Sparkles, ArrowRight } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useSharedPresence } from "@/hooks/useSharedPresence";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerDescription } from "@/components/ui/drawer";
import { formatDistanceToNow } from 'date-fns';
import EmojiPicker from 'emoji-picker-react';
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";

export const Route = createFileRoute("/app/clubs/chat")({
  component: ClubChat,
  validateSearch: (search: Record<string, unknown>) => ({
    showRules: (search.showRules as string) || "false",
    clubId: (search.clubId as string) || "",
  }),
});

const defaultRooms = [
  { id: "general", name: "Stream" },
  { id: "assignments", name: "Classwork" },
  { id: "announcements", name: "Announcements" },
  { id: "q-and-a", name: "Q&A" },
];

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

const isUserOnline = (profile: any) => {
  if (!profile || !profile.updated_at) return false;
  const lastSeen = new Date(profile.updated_at);
  const diffMins = (new Date().getTime() - lastSeen.getTime()) / 60000;
  return diffMins < 15;
};

function ClubChat() {
  const { showRules: showRulesParam, clubId } = useSearch({ from: "/app/clubs/chat" });
  const navigate = useNavigate();
  const [activeRoom, setActiveRoom] = useState("general");
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [club, setClub] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { data: currentUserProfile } = useUser();
  const [showMembers, setShowMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editClub, setEditClub] = useState({ name: "", description: "", banner_url: "", logo_url: "", rules: "", category: "All" });
  const [editRooms, setEditRooms] = useState<{id: string, name: string}[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const rulesRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showRoomSwitcher, setShowRoomSwitcher] = useState(false);

  const handleScroll = () => {
    if (scrollRef.current) {
      setIsScrolled(scrollRef.current.scrollTop > 100);
    }
  };

  const [showLiveMenu, setShowLiveMenu] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [liveAdminsCount, setLiveAdminsCount] = useState(0);

  const { presenceState } = useSharedPresence(club?.id ? `live-presence-${club.id}` : "");

  useEffect(() => {
    let adminCount = 0;
    Object.values(presenceState).forEach((users: any[]) => {
      users.forEach(u => {
        if (u.isAdmin) adminCount++;
      });
    });
    setLiveAdminsCount(adminCount);
  }, [presenceState]);
  const [spaceTitle, setSpaceTitle] = useState("");
  const [spaceDate, setSpaceDate] = useState("");
  const [spaceTime, setSpaceTime] = useState("");

  const currentUserRole = currentUser ? members.find(mem => mem.profile_id === currentUser.id)?.role : undefined;
  const isAdmin = club?.creator_id === currentUser?.id || currentUserRole === 'Administrator';

  const [viewportHeight, setViewportHeight] = useState("100dvh");
  const [viewportTop, setViewportTop] = useState("0px");


  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const handleResize = () => {
      setViewportHeight(`${visualViewport.height}px`);
      setViewportTop(`${visualViewport.offsetTop}px`);
    };

    visualViewport.addEventListener("resize", handleResize);
    visualViewport.addEventListener("scroll", handleResize);
    
    handleResize();

    return () => {
      visualViewport.removeEventListener("resize", handleResize);
      visualViewport.removeEventListener("scroll", handleResize);
    };
  }, []);

  const messagesCache = useRef<Record<string, any[]>>({});

  useEffect(() => {
    async function loadClubData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setCurrentUser(session.user);

      let query = supabase
        .from('club_members')
        .select('club_id, clubs(*)')
        .eq('profile_id', session.user.id);

      if (clubId) {
        query = query.eq('club_id', clubId);
      }

      const { data: joined } = await query.limit(1).maybeSingle();

      let targetClub = joined?.clubs;

      if (!targetClub && clubId) {
        const { data: fallbackClub } = await supabase.from('clubs').select('*').eq('id', clubId).single();
        targetClub = fallbackClub;
      }

      if (targetClub) {
        setClub(targetClub);
        setEditClub({ 
          name: targetClub.name, 
          description: targetClub.description || "",
          banner_url: targetClub.banner_url || "",
          logo_url: targetClub.logo_url || "",
          rules: targetClub.rules || "Be respectful, help others, and share your work!",
          category: targetClub.category || "All"
        });
        setEditRooms(targetClub.rooms && targetClub.rooms.length > 0 ? targetClub.rooms : defaultRooms);
        
        const { data: mems } = await supabase
          .from('club_members')
          .select('*, profiles(*)')
          .eq('club_id', targetClub.id);
        setMembers(mems || []);
      }
    }
    loadClubData();
  }, [clubId]);

  useEffect(() => {
    if (!club) return;
    const fetchedRooms = club.rooms && club.rooms.length > 0 ? club.rooms : defaultRooms;
    if (!fetchedRooms.find((r: any) => r.id === activeRoom)) {
      setActiveRoom(fetchedRooms[0]?.id || "general");
      return;
    }

    let isMounted = true;

    async function loadMessages() {
      // Instant cache swap
      if (messagesCache.current[activeRoom]) {
        setMessages(messagesCache.current[activeRoom]);
      } else {
        setMessages([]);
      }

      // Fetch past messages
      const { data: msgs } = await supabase
        .from('club_messages')
        .select('*, profiles:profile_id(*)')
        .eq('club_id', club.id)
        .eq('room_id', activeRoom)
        .order('created_at', { ascending: true });

      if (!isMounted) return;

      // Fetch reactions
      const msgIds = msgs?.map(m => m.id) || [];
      const { data: rxns } = msgIds.length > 0 ? await supabase
        .from('club_message_reactions')
        .select('*')
        .in('message_id', msgIds) : { data: [] };

      if (!isMounted) return;

      const msgsWithReactions = msgs?.map(m => ({
        ...m,
        reactions: rxns?.filter(r => r.message_id === m.id) || []
      })) || [];
      
      messagesCache.current[activeRoom] = msgsWithReactions;
      setMessages(msgsWithReactions);
    }

    loadMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`club:${club.id}:${activeRoom}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'club_messages',
        filter: `club_id=eq.${club.id}`
      }, async (payload) => {
        if (payload.new.room_id !== activeRoom) return;
        
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', payload.new.profile_id)
          .single();
        
        const newMsg = { ...payload.new, profiles: prof, reactions: [] };
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          const next = [...prev, newMsg];
          messagesCache.current[activeRoom] = next;
          return next;
        });
        setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 100);
      })
      .subscribe();

    const rxnChannel = supabase
      .channel(`club_reactions:${club.id}:${activeRoom}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'club_message_reactions'
      }, (payload) => {
         setMessages(prev => {
           const next = prev.map(m => {
             if (payload.eventType === 'INSERT' && m.id === payload.new.message_id) {
               if (m.reactions?.some((r: any) => r.id === payload.new.id)) return m;
               return { ...m, reactions: [...(m.reactions || []), payload.new] };
             }
             if (payload.eventType === 'DELETE' && m.id === payload.old.message_id) {
               return { ...m, reactions: m.reactions?.filter((r: any) => r.id !== payload.old.id) || [] };
             }
             return m;
           });
           messagesCache.current[activeRoom] = next;
           return next;
         });
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      supabase.removeChannel(rxnChannel);
    };
  }, [activeRoom, club?.id]);

  // Handle invite showRules param
  useEffect(() => {
    if (showRulesParam === "true") {
      setShowRules(true);
    }
  }, [showRulesParam]);

  // Auto-resize textareas
  useEffect(() => {
    [descRef, rulesRef].forEach(ref => {
      if (ref.current) {
        ref.current.style.height = 'auto';
        ref.current.style.height = ref.current.scrollHeight + 'px';
      }
    });
  }, [editClub.description, editClub.rules, showSettings]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    if (clubId && typeof window !== 'undefined') {
      localStorage.setItem(`last_club_read_${clubId}`, new Date().toISOString());
    }
  }, [messages, clubId]);

  const handleRoleChange = async (profileId: string, newRole: string) => {
    const currentUserRole = currentUser ? members.find(mem => mem.profile_id === currentUser.id)?.role : undefined;
    const isAuthorizedEditor = club.creator_id === currentUser.id || currentUserRole === 'Administrator';
    if (!isAuthorizedEditor) return;

    const { data, error } = await supabase
      .from('club_members')
      .update({ role: newRole })
      .eq('club_id', club.id)
      .eq('profile_id', profileId)
      .select();

    if (error) {
      toast.error(error.message || "Failed to update role");
    } else if (!data || data.length === 0) {
      toast.error("Permission denied by database. You need to enable RLS UPDATE access for club_members in Supabase.");
    } else {
      toast.success(`Role updated to ${newRole}`);
      setMembers(members.map(m => m.profile_id === profileId ? { ...m, role: newRole } : m));
      if (selectedMember && selectedMember.profile_id === profileId) {
        setSelectedMember({ ...selectedMember, role: newRole });
      }
    }
  };

  const handleRemoveMember = async (profileId: string) => {
    const currentUserRole = currentUser ? members.find(mem => mem.profile_id === currentUser.id)?.role : undefined;
    const isAuthorizedEditor = club.creator_id === currentUser.id || currentUserRole === 'Administrator';
    if (!isAuthorizedEditor) return;

    const { error } = await supabase
      .from('club_members')
      .delete()
      .eq('club_id', club.id)
      .eq('profile_id', profileId);

    if (error) {
      toast.error("Failed to remove member");
    } else {
      toast.success("Member removed from squad!");
      setMembers(members.filter(m => m.profile_id !== profileId));
      setSelectedMember(null);
    }
  };

  const handleCopyInvite = () => {
    if (!club) return;
    const inviteLink = `${window.location.origin}/app?club=${club.id}`;
    navigator.clipboard.writeText(inviteLink);
    toast.success("Invite link copied to clipboard!");
  };

  const handleUpdateClub = async () => {
    if (!club || club.creator_id !== currentUser?.id) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase.from('clubs').update({
        name: editClub.name,
        description: editClub.description,
        banner_url: editClub.banner_url,
        logo_url: editClub.logo_url,
        rules: editClub.rules,
        category: editClub.category,
        rooms: editRooms
      }).eq('id', clubId);
      if (error) throw error;
      setClub({ ...club, ...editClub, rooms: editRooms });
      toast.success("Club updated! ️");
      setShowSettings(false);
    } catch (err) {
      toast.error("Failed to update club");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logo_url' | 'banner_url') => {
    const file = e.target.files?.[0];
    if (!file || !club) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${club.id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage.from('post-media').upload(filePath, file);
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage.from('post-media').getPublicUrl(filePath);
      
      const { error: updateError } = await supabase.from('clubs').update({ [field]: publicUrl }).eq('id', club.id);
      if (updateError) throw updateError;

      setEditClub({ ...editClub, [field]: publicUrl });
      toast.success(`${field === 'logo_url' ? 'Logo' : 'Banner'} updated!`);
    } catch (err: any) {
      toast.error(err.message || `Failed to upload ${field === 'logo_url' ? 'logo' : 'banner'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteClub = async () => {
    if (!club || club.creator_id !== currentUser?.id) return;
    if (!confirm("Are you sure you want to delete this club? This cannot be undone.")) return;

    try {
      const { error } = await supabase.from('clubs').delete().eq('id', club.id);
      if (error) throw error;
      toast.success("Club deleted");
      window.location.href = "/app/clubs";
    } catch (err) {
      toast.error("Failed to delete club");
    }
  };

  const handleChatMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files);
    setMediaFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setMediaPreviews(prev => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async (overrideText?: string | any) => {
    const actualOverride = typeof overrideText === 'string' ? overrideText : undefined;
    const textToSend = actualOverride || msg;
    if ((!textToSend.trim() && mediaFiles.length === 0) || !club || !currentUser) return;
    
    let text = textToSend;

    if (mediaFiles.length > 0) {
      toast.loading("Uploading media...", { id: "upload" });
      const uploadedUrls: string[] = [];
      for (const file of mediaFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${currentUser.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('post-media').upload(filePath, file);
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('post-media').getPublicUrl(filePath);
          uploadedUrls.push(publicUrl);
        }
      }
      toast.dismiss("upload");
      if (uploadedUrls.length > 0) {
        text += `\n\n$$MEDIA$$${uploadedUrls.join(',')}`;
      }
    }

    const parentId = replyingTo?.id;
    setMsg("");
    setMediaFiles([]);
    setMediaPreviews([]);
    // Reset auto-growing textarea heights in the DOM
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(t => {
      t.style.height = 'auto';
    });
    setReplyingTo(null);

    // Optimistic Update
    const tempId = crypto.randomUUID();
    const optimisticMsg = {
      id: tempId,
      club_id: club.id,
      profile_id: currentUser.id,
      content: text,
      room_id: activeRoom,
      reply_to_id: parentId,
      created_at: new Date().toISOString(),
      profiles: members.find(m => m.profile_id === currentUser.id)?.profiles || currentUser.user_metadata
    };
    
    setMessages(prev => [...prev, optimisticMsg]);

    const { data, error } = await supabase
      .from('club_messages')
      .insert([{
        club_id: club.id,
        profile_id: currentUser.id,
        content: text,
        room_id: activeRoom,
        reply_to_id: parentId
      }])
      .select('*, profiles:profile_id(*)')
      .single();

    if (error) {
      toast.error("Failed to send message");
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setMsg(text);
    } else {
      // Replace optimistic message with real data from server
      setMessages(prev => prev.map(m => m.id === tempId ? data : m));
      
      // Featured club first-message reward
      if (club.name === "Zero K Bootcamp") {
        const hasSentMessageBefore = messages.some(m => m.profile_id === currentUser.id && m.id !== tempId);
        if (!hasSentMessageBefore) {
          await supabase.from('profiles').update({ xp: (currentUser.user_metadata?.xp || currentUser.xp || 0) + 100 }).eq('id', currentUser.id);
          toast.success("You earned 100 XP for your first message in the featured Zero K Bootcamp!");
        }
      }
    }
  };

  const handleScheduleSpaceSubmit = async () => {
    if (!spaceTitle.trim()) {
      toast.error("Please enter a space topic or title");
      return;
    }
    if (!spaceDate) {
      toast.error("Please select a date");
      return;
    }
    if (!spaceTime) {
      toast.error("Please select a time");
      return;
    }

    const formattedMessage = `📅 **[SCHEDULED SPACE]** Topic: "${spaceTitle}" | Date: ${spaceDate} | Time: ${spaceTime}`;

    // Post to database
    await handleSendMessage(formattedMessage);

    // Reset state & close sheet
    setSpaceTitle("");
    setSpaceDate("");
    setSpaceTime("");
    setShowScheduleForm(false);
    setShowLiveMenu(false);
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    
    const existingReaction = msg.reactions?.find((r: any) => r.profile_id === currentUser.id && r.emoji === emoji);
    
    if (existingReaction) {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        return { ...m, reactions: m.reactions.filter((r: any) => r.id !== existingReaction.id) };
      }));
      await supabase.from('club_message_reactions').delete().eq('id', existingReaction.id);
    } else {
      const tempId = crypto.randomUUID();
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        return { ...m, reactions: [...(m.reactions || []), { id: tempId, message_id: messageId, profile_id: currentUser.id, emoji }] };
      }));
      await supabase.from('club_message_reactions').insert([{
        message_id: messageId,
        profile_id: currentUser.id,
        emoji
      }]);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'Administrator': return 'text-primary bg-primary/10 border border-primary/30 shadow-[0_0_10px_rgba(204,32,143,0.15)]';
      case 'Investor': return 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 shadow-[0_0_10px_rgba(52,211,153,0.15)]';
      case 'Product Lead': return 'text-blue-400 bg-blue-400/10 border border-blue-400/30 shadow-[0_0_10px_rgba(96,165,250,0.15)]';
      case 'Tech Lead': return 'text-purple-400 bg-purple-400/10 border border-purple-400/30 shadow-[0_0_10px_rgba(192,132,252,0.15)]';
      case 'Design Lead': return 'text-pink-400 bg-pink-400/10 border border-pink-400/30 shadow-[0_0_10px_rgba(244,114,182,0.15)]';
      case 'Business Developer': return 'text-orange-400 bg-orange-400/10 border border-orange-400/30 shadow-[0_0_10px_rgba(251,146,60,0.15)]';
      case 'Growth Hacker': return 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/30 shadow-[0_0_10px_rgba(34,211,238,0.15)]';
      default: return 'text-muted-foreground bg-white/5 border border-white/10';
    }
  };

  const onlineMembersCount = members.filter(m => isUserOnline(m.profiles)).length;

  // --- Grandfathering & Grace Period Logic ---
  const isCreator = club?.creator_id === currentUser?.id;
  const isBasic = !currentUserProfile?.tier || currentUserProfile.tier.toLowerCase() === 'basic';
  const createdAt = club?.created_at ? new Date(club.created_at) : new Date();
  const now = new Date();
  
  // Calculate exact difference
  const expiryDate = new Date(createdAt);
  expiryDate.setMonth(expiryDate.getMonth() + 6);
  
  const graceDate = new Date(expiryDate);
  graceDate.setDate(graceDate.getDate() + 3);

  const isExpired = now > graceDate;
  const isGracePeriod = now > expiryDate && now <= graceDate;
  const graceDaysLeft = Math.ceil((graceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (club && isBasic && isExpired) {
    return (
      <div className="flex fixed inset-x-0 z-[100] flex-col items-center justify-center bg-background max-w-md mx-auto h-dvh px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-2xl font-black tracking-tight mb-2">
          {isCreator ? "Subscription Required" : "Club Paused"}
        </h1>
        <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
          {isCreator 
            ? "Your 6-month free access to private clubs has expired. Please upgrade to Premium to reactivate your community." 
            : "This club is currently paused by the creator. Check back later!"}
        </p>
        
        {isCreator ? (
          <Link 
            to="/app/premium" 
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-full shadow-lg transition active:scale-95"
          >
            Upgrade to Premium
          </Link>
        ) : (
          <Link 
            to="/app/clubs" 
            className="w-full bg-foreground text-background font-bold py-4 rounded-full shadow-lg transition active:scale-95"
          >
            Back to Clubs
          </Link>
        )}
      </div>
    );
  }

  return (
    <div 
      className="flex fixed inset-x-0 z-40 flex-col bg-gradient-to-b from-accent/5 via-background to-background dark:bg-background max-w-md mx-auto overflow-hidden border-x border-border"
      style={{ height: viewportHeight, top: viewportTop }}
    >


      {/* NEW FIXED DYNAMIC HEADER */}
      <header className={`absolute top-0 inset-x-0 z-50 flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 transition-all duration-300 ${
        isScrolled ? "bg-background/80 backdrop-blur-md border-b border-border/40 shadow-sm" : "bg-gradient-to-b from-black/60 to-transparent pointer-events-none"
      }`}>
        <div className={`flex items-center gap-3 ${!isScrolled ? "pointer-events-auto" : ""}`}>
          <Link to="/app/clubs" className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90 shadow-sm border ${
            isScrolled ? "bg-accent/50 text-foreground hover:bg-accent border-border/50" : "bg-black/40 backdrop-blur-md text-white border-white/10"
          }`}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className={`flex items-center gap-2 transition-opacity duration-300 ${isScrolled ? 'opacity-100' : 'opacity-0'}`}>
            {club?.logo_url ? (
              <img src={club.logo_url} className="h-7 w-7 rounded-full object-cover border border-border/50" />
            ) : (
              <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center border border-border/50">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
            <span className="font-bold text-sm truncate max-w-[120px]">{club?.name}</span>
          </div>
        </div>
        <div className={`flex items-center gap-2 ${!isScrolled ? "pointer-events-auto" : ""}`}>
          <button 
            onClick={() => setShowMembers(true)}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 shadow-sm border ${
              isScrolled ? "bg-accent/50 text-foreground hover:bg-accent border-border/50" : "bg-black/40 backdrop-blur-md text-white border-white/10"
            }`}
          >
            <Users className="h-4 w-4" />
          </button>
          {club?.creator_id === currentUser?.id && (
            <button 
              onClick={() => setShowSettings(true)}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 shadow-sm border ${
                isScrolled ? "bg-accent/50 text-foreground hover:bg-accent border-border/50" : "bg-black/40 backdrop-blur-md text-white border-white/10"
              }`}
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Dynamic Island: Room Switcher Pill */}
      <div className={`absolute left-1/2 -translate-x-1/2 z-[60] pointer-events-auto transition-all duration-500 ease-out ${
        isScrolled 
          ? "top-[calc(5rem+env(safe-area-inset-top))] opacity-100 scale-100" 
          : "top-[calc(4rem+env(safe-area-inset-top))] opacity-0 scale-95 pointer-events-none"
      }`}>
        <button 
          onClick={() => setShowRoomSwitcher(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-background/80 backdrop-blur-xl border border-border/50 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.15)] transition-all active:scale-95 group"
        >
          <Hash className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-bold text-foreground max-w-[100px] truncate">
            {club?.rooms?.find((r: any) => r.id === activeRoom)?.name || activeRoom}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors ml-0.5" />
        </button>
      </div>

      {/* Main scrolling container */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col relative" ref={scrollRef} onScroll={handleScroll}>
        
        {/* Profile-Style Header (Scrolls) */}
        <div className="w-full shrink-0 z-10 bg-background pb-1">
        
        {/* Cover Banner with Nav Row overlaid */}
        <div className="relative w-full overflow-hidden bg-accent/20 pb-2">
          <div className="absolute inset-0">
            {club?.banner_url ? (
              <img src={club.banner_url} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-primary via-purple-600 to-blue-500" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-transparent" />
          </div>

          {/* Invisible spacer to give the banner height without obscuring content */}
          <div className="h-[calc(7rem+env(safe-area-inset-top))] w-full relative z-10"></div>
        </div>

            <Drawer open={showLiveMenu} onOpenChange={setShowLiveMenu}>
                  <DrawerContent className="h-auto max-h-[85vh] border-0 bg-transparent p-0 pb-0 shadow-none z-[90] [&>button]:hidden outline-none">
                    <div className="bg-card rounded-t-[32px] shadow-2xl overflow-hidden outline-none border-t border-border/10">

                      {/* Drag Handle */}
                      <div className="flex justify-center pt-4 pb-2">
                        <div className="w-10 h-1 rounded-full bg-border" />
                      </div>

                      {/* Header */}
                      <div className="px-6 pt-2 pb-5">
                        <div className="flex items-center gap-3 mb-1.5">
                          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/10">
                            <Zap className="w-4 h-4 text-primary-foreground fill-current" />
                          </div>
                          <div>
                            <h2 className="text-xl font-black tracking-tight text-foreground">Interactive Spaces</h2>
                            <p className="text-[10px] text-primary/70">Connect live with your community</p>
                          </div>
                        </div>
                      </div>

                      {!showScheduleForm ? (
                        <div className="px-5 pb-10 space-y-3 animate-in fade-in duration-200">

                          {isAdmin ? (
                            <>
                              {/* ── Go Live Card (Admin) ── */}
                              <button
                                onClick={() => {
                                  setShowLiveMenu(false);
                                  navigate({ to: "/app/live/$classId", params: { classId: club?.id || "unknown" } });
                                }}
                                className="w-full text-left group flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-red-500/10 to-red-500/5 border border-red-500/15 hover:from-red-500/20 hover:to-red-500/10 transition-all active:scale-[0.98"
                              >
                                <div className="relative">
                                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/25">
                                    <Radio className="w-6 h-6" />
                                  </div>
                                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-card animate-pulse" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-black text-foreground text-[15px] tracking-tight group-hover:text-red-400 transition-colors">Go Live Now</h3>
                                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Start an instant video session with your community</p>
                                </div>
                                <ArrowRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-red-400 group-hover:translate-x-1 transition-all shrink-0" />
                              </button>

                              {/* ── Schedule Space Card (Admin) ── */}
                              <button
                                onClick={() => setShowScheduleForm(true)}
                                className="group w-full flex items-center gap-4 p-4 rounded-2xl bg-accent/50 border border-border/25 hover:bg-accent transition-all active:scale-[0.98"
                              >
                                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center">
                                  <CalendarDays className="w-6 h-6 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <h3 className="font-black text-foreground text-[15px] tracking-tight group-hover:text-primary transition-colors">Schedule Space</h3>
                                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Plan a future live class, event, or discussion</p>
                                </div>
                                <ArrowRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                              </button>
                            </>
                          ) : (
                            /* ── Join Live Space (Non-Admin) ── */
                            <button
                              onClick={() => {
                                if (liveAdminsCount > 0) {
                                  setShowLiveMenu(false);
                                  navigate({ to: "/app/live/$classId", params: { classId: club?.id || "unknown" } });
                                }
                              }}
                              disabled={liveAdminsCount === 0}
                              className={`w-full text-left group flex items-center gap-4 p-4 rounded-2xl transition-all outline-none ${
                                liveAdminsCount > 0
                                  ?"bg-gradient-to-r from-red-500/10 to-red-500/5 border border-red-500/15 hover:from-red-500/20 hover:to-red-500/10 active:scale-[0.98]"
                                  : "bg-muted/30 border border-border/20 opacity-60 cursor-not-allowed"
                              }`}
                            >
                              <div className="relative">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white ${
                                  liveAdminsCount > 0 ?"bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/25" : "bg-muted-foreground/30"
                                }`}>
                                  <Video className="w-6 h-6" />
                                </div>
                                {liveAdminsCount > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-card animate-pulse" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className={`font-black text-[15px] tracking-tight transition-colors ${liveAdminsCount > 0 ?"text-foreground group-hover:text-red-400" : "text-muted-foreground"}`}>
                                  {liveAdminsCount > 0 ? "Join Live Space" : "Space is Offline"}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                  {liveAdminsCount > 0 ? "An admin is currently live! Join the interactive space." : "Wait for an admin to start a live session."}
                                </p>
                              </div>
                              {liveAdminsCount > 0 && <ArrowRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-red-400 group-hover:translate-x-1 transition-all shrink-0" />}
                            </button>
                          )}

                          {/* Decorative footer hint */}
                          <div className="flex items-center justify-center gap-2 pt-3">
                            <Sparkles className="w-3 h-3 text-primary/20" />
                            <span className="text-[10px] text-muted-foreground/30">Powered by Zero Club</span>
                            <Sparkles className="w-3 h-3 text-primary/20" />
                          </div>
                        </div>
                      ) : (
                        /* ── Schedule Space Form ── */
                        <div className="px-5 pb-10 animate-in fade-in slide-in-from-right-4 duration-300">

                          {/* Back row */}
                          <button
                            onClick={() => setShowScheduleForm(false)}
                            className="flex items-center gap-1.5 text-primary/60 hover:text-primary transition mb-5 group"
                          >
                            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                            <span className="text-xs">Back to options</span>
                          </button>

                          <div className="space-y-5">
                            {/* Title input */}
                            <div className="space-y-2">
                              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-1">
                                <Sparkles className="w-3 h-3" />
                                Space Topic
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Mastering React State Management"
                                value={spaceTitle}
                                onChange={(e) => setSpaceTitle(e.target.value)}
                                className="w-full bg-accent/40 border border-border/30 rounded-2xl px-5 py-4 text-sm font-medium outline-none text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition"
                              />
                            </div>

                            {/* Date & Time row */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-1">
                                  <CalendarDays className="w-3 h-3" />
                                  Date
                                </label>
                                <input
                                  type="date"
                                  value={spaceDate}
                                  onChange={(e) => setSpaceDate(e.target.value)}
                                  className="w-full bg-accent/40 border border-border/30 rounded-2xl px-4 py-4 text-sm font-medium outline-none text-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-1">
                                  <Clock className="w-3 h-3" />
                                  Time
                                </label>
                                <input
                                  type="time"
                                  value={spaceTime}
                                  onChange={(e) => setSpaceTime(e.target.value)}
                                  className="w-full bg-accent/40 border border-border/30 rounded-2xl px-4 py-4 text-sm font-medium outline-none text-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition"
                                />
                              </div>
                            </div>

                            {/* Submit button */}
                            <button
                              onClick={handleScheduleSpaceSubmit}
                              className="w-full flex items-center justify-center gap-2.5 py-4 bg-primary text-primary-foreground font-black rounded-2xl hover:brightness-110 transition active:scale-[0.98] shadow-lg shadow-primary/15 mt-2"
                            >
                              <CalendarDays className="w-4.5 h-4.5" />
                              Schedule Space
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </DrawerContent>
                </Drawer>
                {club?.creator_id === currentUser?.id && (
                  <Drawer open={showSettings} onOpenChange={setShowSettings}>
                    <DrawerContent className="h-[92%] border-none bg-background p-6 pt-10">
                      <DrawerHeader className="text-left mb-6">
                        <DrawerTitle className="text-xl font-bold">Club Settings</DrawerTitle>
                        <p className="text-[11px] text-muted-foreground">Manage your community workspace</p>
                      </DrawerHeader>

                      <div className="space-y-6 overflow-y-auto h-full pb-20 no-scrollbar">
                        <div className="flex flex-col mb-2">
                          <div className="relative w-full h-32 rounded-2xl bg-accent/20 border-2 border-dashed border-border overflow-visible group">
                            <div className="absolute inset-0 overflow-hidden rounded-xl">
                              {editClub.banner_url ? (
                                <img src={editClub.banner_url} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex flex-col items-center justify-center h-full">
                                  <span className="text-xs text-muted-foreground">Club Banner</span>
                                </div>
                              )}
                            </div>
                            
                            {uploading && (
                              <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center z-30 rounded-xl">
                                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}

                            <button 
                              onClick={() => {
                                fileInputRef.current?.setAttribute('data-target', 'banner_url');
                                fileInputRef.current?.click();
                              }}
                              className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 backdrop-blur-md text-white shadow-glow flex items-center justify-center hover:scale-110 transition-transform z-20"
                            >
                              <Camera className="h-4 w-4" />
                            </button>

                            {/* Logo overlapping the banner */}
                            <div className="absolute -bottom-6 left-4 z-40">
                              <div className="relative group">
                                <div className="h-16 w-16 rounded-xl bg-accent/20 border-4 border-background overflow-hidden flex items-center justify-center shadow-lg">
                                  {editClub.logo_url || editClub.banner_url ? (
                                    <img src={editClub.logo_url || editClub.banner_url} className="h-full w-full object-cover" />
                                  ) : (
                                    <Hash className="h-6 w-6 text-muted-foreground" />
                                  )}
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    fileInputRef.current?.setAttribute('data-target', 'logo_url');
                                    fileInputRef.current?.click();
                                  }}
                                  className="absolute -right-2 -bottom-2 h-7 w-7 rounded-full bg-primary text-white shadow-glow flex items-center justify-center hover:scale-110 transition-transform z-50"
                                >
                                  <Camera className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="h-8" /> {/* Spacing for the overlapping logo */}

                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={(e) => {
                              const target = fileInputRef.current?.getAttribute('data-target') as 'logo_url' | 'banner_url';
                              if (target) handleImageUpload(e, target);
                            }} 
                            className="hidden" 
                            accept="image/*"
                          />
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] text-muted-foreground ml-1">Club Name</label>
                            <input 
                              value={editClub.name}
                              onChange={e => setEditClub({...editClub, name: e.target.value})}
                              className="w-full bg-accent/10 border-b-2 border-transparent border-b-border rounded-t-xl px-4 py-3.5 text-sm font-semibold outline-none focus:bg-accent/20 focus:border-b-primary transition-all text-foreground" 
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] text-muted-foreground ml-1">Description</label>
                            <textarea 
                              ref={descRef}
                              value={editClub.description}
                              onChange={e => setEditClub({...editClub, description: e.target.value})}
                              placeholder="What is this club about?"
                              className="w-full bg-accent/10 border-b-2 border-transparent border-b-border rounded-t-xl px-4 py-3.5 text-sm font-semibold outline-none focus:bg-accent/20 focus:border-b-primary transition-all text-foreground resize-none no-scrollbar min-h-[80px]" 
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] text-muted-foreground ml-1">Categories</label>
                            <div className="flex flex-wrap gap-2">
                              {["Tech", "AI", "Design", "Startup", "Writing", "Marketing", "Campus"].map(cat => {
                                const isSelected = editClub.category?.includes(cat);
                                return (
                                  <button
                                    key={cat}
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      let currentCats = editClub.category?.split(',').map(c => c.trim()).filter(Boolean) || [];
                                      currentCats = currentCats.filter(c => c !== "All");
                                      if (isSelected) {
                                        currentCats = currentCats.filter(c => c !== cat);
                                      } else {
                                        currentCats.push(cat);
                                      }
                                      setEditClub({...editClub, category: currentCats.length > 0 ? currentCats.join(', ') : "All"});
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${isSelected ?'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background text-muted-foreground border-border/40 hover:border-border'}`}
                                  >
                                    {cat}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] text-muted-foreground ml-1">Class Rules</label>
                            <textarea 
                              ref={rulesRef}
                              value={editClub.rules}
                              onChange={e => setEditClub({...editClub, rules: e.target.value})}
                              placeholder="Set the standards for your squad..."
                              className="w-full bg-accent/10 border-b-2 border-transparent border-b-border rounded-t-xl px-4 py-3.5 text-sm font-semibold outline-none focus:bg-accent/20 focus:border-b-primary transition-all text-foreground resize-none no-scrollbar min-h-[120px]" 
                            />
                          </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-border/50">
                          <h3 className="text-[11px] font-bold text-foreground flex items-center gap-2">
                            <Hash className="h-3.5 w-3.5 text-primary" /> Club Sections
                          </h3>
                          <div className="space-y-2">
                            {editRooms.map((r, i) => (
                              <div key={r.id} className="flex gap-2">
                                <input 
                                  value={r.name}
                                  onChange={(e) => {
                                    const newRooms = [...editRooms];
                                    newRooms[i].name = e.target.value;
                                    setEditRooms(newRooms);
                                  }}
                                  className="flex-1 rounded-xl bg-accent/10 border border-border/50 px-4 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors text-foreground"
                                />
                                <button 
                                  onClick={() => setEditRooms(editRooms.filter((_, idx) => idx !== i))}
                                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                            <button 
                              onClick={() => {
                                const newId = `room-${Math.random().toString(36).substr(2, 9)}`;
                                setEditRooms([...editRooms, { id: newId, name: "New Section" }]);
                              }}
                              className="w-full py-2.5 rounded-xl border border-dashed border-primary/40 text-primary text-xs font-bold hover:bg-primary/5 transition flex items-center justify-center gap-1.5"
                            >
                              <Plus className="h-3.5 w-3.5" /> Add Section
                            </button>
                          </div>
                        </div>

                        <div className="pt-4 space-y-3">
                          <button 
                            onClick={handleUpdateClub}
                            disabled={isUpdating}
                            className="w-full bg-primary text-white font-bold py-4 rounded-2xl shadow-glow flex items-center justify-center gap-2 transition active:scale-95"
                          >
                            <Save className="h-4 w-4" /> {isUpdating ? "Saving..." : "Save Changes"}
                          </button>
                          <button 
                            onClick={handleDeleteClub}
                            className="w-full bg-destructive/10 text-destructive font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition active:bg-destructive/20"
                          >
                            <Trash2 className="h-4 w-4" /> Delete Club
                          </button>
                        </div>
                      </div>
                    </DrawerContent>
                  </Drawer>
                )}

                <Drawer open={showMembers} onOpenChange={(open) => {
                  setShowMembers(open);
                  if (!open) setSelectedMember(null);
                }}>
                  <DrawerContent className="h-[85%] border-none bg-background p-6 overflow-hidden flex flex-col">
                    <div className="relative w-full h-full overflow-hidden">
                      <div 
                        className="flex w-[200%] h-full transition-transform duration-300 ease-in-out"
                        style={{ transform: selectedMember ? 'translateX(-50%)' : 'translateX(0%)' }}
                      >
                        {/* PANEL 1: CLUB SQUAD MEMBER LIST */}
                        <div className="w-1/2 h-full flex flex-col shrink-0 px-1 overflow-y-auto no-scrollbar">
                          <DrawerHeader className="text-left mb-6 shrink-0 pr-10">
                            <DrawerTitle className="text-2xl font-bold tracking-tight">Club Squad</DrawerTitle>
                            <p className="text-xs text-muted-foreground">The team building {club?.name}</p>
                          </DrawerHeader>

                          {club && (() => {
                            const currentUserRole = currentUser ? members.find(mem => mem.profile_id === currentUser.id)?.role : undefined;
                            const isAdmin = club.creator_id === currentUser?.id || currentUserRole === 'Administrator';
                            return (
                              <div className="mb-6 p-4 rounded-2xl bg-accent/20 border border-border/80 backdrop-blur-md flex items-center justify-between shrink-0">
                                <div className="text-left flex flex-col">
                                  <button
                                    onClick={handleCopyInvite}
                                    disabled={!isAdmin}
                                    className={`text-sm font-bold text-left transition ${
                                      isAdmin 
                                        ?'text-primary hover:underline cursor-pointer' 
                                        : 'text-muted-foreground cursor-default'
                                    }`}
                                  >
                                    Invite a Friend
                                  </button>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {isAdmin ? "Share this club squad link to recruit more builders" : "Squad invites are managed by admins"}
                                  </p>
                                </div>
                                {isAdmin && (
                                  <button 
                                    onClick={handleCopyInvite}
                                    className="flex items-center justify-center h-8 w-8 rounded-xl bg-accent/30 hover:bg-accent/50 text-foreground transition active:scale-95"
                                    title="Copy Invite Link"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })()}

                          <div className="space-y-3 pb-10 flex-1">
                            {[...members].sort((a, b) => {
                              // Creator first
                              if (a.profile_id === club?.creator_id) return -1;
                              if (b.profile_id === club?.creator_id) return 1;
                              // Then Administrators
                              if (a.role === 'Administrator' && b.role !== 'Administrator') return -1;
                              if (b.role === 'Administrator' && a.role !== 'Administrator') return 1;
                              // Then any other upgraded roles
                              const roleA = a.role || 'Member';
                              const roleB = b.role || 'Member';
                              if (roleA !== 'Member' && roleB === 'Member') return -1;
                              if (roleB !== 'Member' && roleA === 'Member') return 1;
                              return 0;
                            }).map((m) => {
                              const currentUserRole = currentUser ? members.find(mem => mem.profile_id === currentUser.id)?.role : undefined;
                              const isAuthorizedEditor = club?.creator_id === currentUser?.id || currentUserRole === 'Administrator';
                              const canEditMember = isAuthorizedEditor && m.profile_id !== currentUser?.id;

                              return (
                                <div 
                                  key={m.profile_id} 
                                  onClick={() => {
                                    if (canEditMember) {
                                      setSelectedMember(m);
                                    }
                                  }}
                                  className={`flex items-center justify-between p-4 rounded-2xl bg-accent/10 border border-border/80 backdrop-blur-md transition-all duration-300 ${
                                    canEditMember 
                                      ?'cursor-pointer hover:border-primary/40 hover:bg-accent/20 active:scale-[0.99]' 
                                      : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="relative h-10 w-10 rounded-full bg-muted overflow-hidden shrink-0 border border-border/50 shadow-sm">
                                      {m.profiles?.avatar_url ? (
                                        <img src={m.profiles.avatar_url} className="h-full w-full object-cover" />
                                      ) : (
                                        <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                          {m.profiles?.username?.[0]?.toUpperCase()}
                                        </div>
                                      )}
                                      {isUserOnline(m.profiles) && (
                                        <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success border-2 border-[#0A0A0E" />
                                      )}
                                    </div>
                                    <div className="text-left">
                                      <div className="text-sm font-bold text-foreground">
                                        {m.profiles?.full_name || m.profiles?.username}
                                      </div>
                                      <div className={`mt-1 inline-block px-2 py-0.5 rounded text-[8px] ${getRoleColor(m.role)}`}>
                                        {m.role}
                                      </div>
                                    </div>
                                  </div>

                                  {m.profile_id === club?.creator_id ? (
                                    <span className="text-[8px] text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full bg-amber-500/5">
                                      Creator
                                    </span>
                                  ) : (
                                    canEditMember && (
                                      <span className="text-xs font-black text-primary hover:underline transition px-2.5 py-1">
                                        Edit
                                      </span>
                                    )
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* PANEL 2: MEMBER SETTINGS VIEW */}
                        <div className="w-1/2 h-full flex flex-col shrink-0 px-2 overflow-y-auto no-scrollbar">
                          <div className="shrink-0 flex flex-col gap-4 mb-6 pr-10">
                            <button 
                              onClick={() => setSelectedMember(null)}
                              className="self-start flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition py-1 px-2.5 rounded-full bg-accent/20 border border-border"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" /> Back to Squad
                            </button>
                            
                            <div className="text-left">
                              <h3 className="text-xl font-black tracking-tight text-foreground">Member Settings</h3>
                              <p className="text-xs text-muted-foreground">Modify squad privileges and roles</p>
                            </div>
                          </div>

                          {selectedMember && (
                            <div className="shrink-0 flex items-center gap-4 p-4 rounded-3xl bg-accent/15 border border-border/80 backdrop-blur-md mb-6">
                              <div className="h-14 w-14 rounded-full bg-muted overflow-hidden shrink-0">
                                {selectedMember.profiles?.avatar_url ? (
                                  <img src={selectedMember.profiles.avatar_url} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base">
                                    {selectedMember.profiles?.username?.[0]?.toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="text-left">
                                <h4 className="text-sm font-bold text-foreground">{selectedMember.profiles?.full_name || selectedMember.profiles?.username}</h4>
                                <p className="text-xs text-muted-foreground">{getFirstName(selectedMember.profiles)}</p>
                                <div className="mt-1.5">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[8px] ${getRoleColor(selectedMember.role)}`}>
                                    {selectedMember.role}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex-1 space-y-2">
                            <label className="text-[10px] text-muted-foreground block text-left ml-1 mb-2">Select Squad Role</label>
                            {[
                              { name: 'Member', desc: 'Standard squad member with access to all rooms.' },
                              { name: 'Administrator', desc: 'Full co-management rights, can edit settings.' },
                              { name: 'Investor', desc: 'Financial partner and strategic advisor.' },
                              { name: 'Business Developer', desc: 'Handles squad outreach and growth partnerships.' },
                              { name: 'Product Lead', desc: 'Directs development schedules and releases.' },
                              { name: 'Design Lead', desc: 'Shapes squad visual styling, graphics, and brand.' },
                              { name: 'Tech Lead', desc: 'Manages architecture, pipelines, and engineering.' },
                              { name: 'Growth Hacker', desc: 'Maintains viral loops, social expansion, and metrics.' }
                            ].map((roleOption) => {
                              const isActive = selectedMember?.role === roleOption.name;
                              return (
                                <button
                                  key={roleOption.name}
                                  onClick={() => {
                                    if (selectedMember) {
                                      handleRoleChange(selectedMember.profile_id, roleOption.name);
                                    }
                                  }}
                                  className={`w-full text-left p-3.5 rounded-2xl border transition duration-300 flex items-center justify-between gap-3 ${
                                    isActive 
                                      ?'bg-primary/10 border-primary text-foreground'
                                      : 'bg-card border-border hover:bg-accent/20 text-foreground'
                                  }`}
                                >
                                  <div className="text-left">
                                    <p className="text-xs font-bold">{roleOption.name}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{roleOption.desc}</p>
                                  </div>
                                  {isActive && (
                                    <div className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                                      <Check className="h-3.5 w-3.5" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {selectedMember && (
                            <div className="pt-6 border-t border-border/50 mt-6 pb-10 shrink-0">
                              <button
                                onClick={() => handleRemoveMember(selectedMember.profile_id)}
                                className="w-full bg-destructive/10 hover:bg-destructive/20 text-destructive font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition active:scale-95 text-xs"
                              >
                                <UserX className="h-4 w-4" /> Remove From Squad
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </DrawerContent>
                </Drawer>

            <Drawer open={showRoomSwitcher} onOpenChange={setShowRoomSwitcher}>
              <DrawerContent className="border-t border-border/40 bg-background/95 backdrop-blur-xl">
                <div className="px-5 pt-6 pb-10">
                  <DrawerHeader className="px-0 pt-0 text-left mb-6">
                    <DrawerTitle className="text-xl font-black text-foreground">Channels</DrawerTitle>
                    <DrawerDescription className="text-xs font-medium text-muted-foreground/60 mt-1">
                      Switch to a different section
                    </DrawerDescription>
                  </DrawerHeader>

                  <div className="space-y-2">
                    {club?.rooms?.map((r: any) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setActiveRoom(r.id);
                          setShowRoomSwitcher(false);
                          scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
                        }}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-300 active:scale-[0.98] border ${
                          activeRoom === r.id
                            ? "bg-primary/10 border-primary/20 shadow-sm"
                            : "bg-card border-border/40 hover:bg-accent/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`grid h-8 w-8 place-items-center rounded-xl ${
                            activeRoom === r.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}>
                            <Hash className="h-4 w-4" />
                          </div>
                          <span className={`text-sm font-bold ${
                            activeRoom === r.id ? "text-primary" : "text-foreground"
                          }`}>
                            {r.name}
                          </span>
                        </div>
                        {activeRoom === r.id && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              </DrawerContent>
            </Drawer>

        <div className="px-5 relative z-10">
          {/* Avatar + Go Live button */}
          <div className="-mt-10 flex items-end justify-between">
            <div className="grid h-20 w-20 place-items-center border-4 border-background overflow-hidden bg-muted rounded-[28%] transition-all duration-500 shadow-sm">
              {club?.logo_url ? (
                <img src={club.logo_url} className="h-full w-full object-cover" />
              ) : (
                <Hash className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            
            <div className="mb-1 flex items-center gap-2">
              {isAdmin ? (
                <button 
                  onClick={() => {
                    setShowScheduleForm(false);
                    setShowLiveMenu(true);
                  }} 
                  className="flex items-center gap-1.5 h-8 px-4 rounded-full transition active:scale-95 shadow-sm border bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20"
                >
                  <Video className="h-4 w-4" />
                  <span className="text-xs font-bold mt-0.5">Go Live</span>
                </button>
              ) : (
                <button 
                  onClick={() => {
                    if (liveAdminsCount > 0) {
                      setShowScheduleForm(false);
                      setShowLiveMenu(true);
                    }
                  }} 
                  disabled={liveAdminsCount === 0}
                  className={`flex items-center gap-1.5 h-8 px-4 rounded-full transition active:scale-95 shadow-sm border ${
                    liveAdminsCount > 0 
                      ? "bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20 animate-pulse" 
                      : "bg-accent border-border/50 text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  <Video className="h-4 w-4" />
                  <span className="text-xs font-bold mt-0.5">
                    {liveAdminsCount > 0 ? "Join Live" : "Offline"}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Identity */}
          <div className="mt-2 pb-1">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground leading-tight">
              {club?.name || "Loading..."}
            </h2>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 text-success font-bold">
                <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_6px_rgba(34,197,94,0.8)] animate-pulse" />
                {onlineMembersCount} online
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {members.length > 0 ? members.length : (club?.members_count || 1)} members
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> 
                {club?.created_at ? new Date(club.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : 'Recently'}
              </span>
            </div>
          </div>
        </div>

        </div>

        {/* Tab Navigation - Sticky Header */}
        <div className="sticky top-0 z-30 pt-1 mt-1 shrink-0 flex gap-2 border-b border-border bg-background/95 backdrop-blur-xl overflow-x-auto no-scrollbar px-2 shadow-sm">
          {(club?.rooms?.length > 0 ? club.rooms : defaultRooms).map((room: any) => (
            <button
              key={room.id}
              onClick={() => setActiveRoom(room.id)}
              className={`flex-none px-4 py-3 text-xs sm:text-sm font-semibold text-center transition-all border-b-[3px] whitespace-nowrap ${
                activeRoom === room.id 
                  ?"border-primary text-foreground font-bold" 
                  : "border-transparent text-muted-foreground hover:text-foreground/80"
              }`}
            >
              {room.name}
            </button>
          ))}
        </div>

      {/* Pinned Rules */}
      <button 
        onClick={() => setShowRules(true)}
        className="w-full shrink-0 flex items-center gap-2.5 px-4 py-2 bg-accent/5 border-b border-border text-left active:bg-accent/10 transition-colors"
      >
        <Pin className="h-3 w-3 text-primary shrink-0" />
        <p className="truncate text-[11px] text-muted-foreground flex-1">
          <span className="font-bold text-primary mr-1.5">Pinned:</span>
          {club?.rules || "Be respectful, help others, and share your work!"}
        </p>
      </button>

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="relative w-full max-w-sm bg-gradient-to-b from-card to-card/90 rounded-[28px] shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[70vh">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Class Rules</h3>
                  <p className="text-[9px] text-muted-foreground">{club?.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowRules(false)}
                className="h-7 w-7 rounded-full bg-white/5 flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar">
              <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {club?.rules || "Be respectful, help others, and share your work!"}
              </div>
            </div>
            
            <div className="p-4 bg-white/5">
              <button 
                onClick={() => setShowRules(false)}
                className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl shadow-glow transition active:scale-95"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grace Period Warning Banner */}
      {club && isBasic && isGracePeriod && (
        <div className="w-full bg-amber-500/10 border-y border-amber-500/20 px-4 py-3 shrink-0">
          <div className="flex gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <h4 className="text-[10px] text-amber-500 mb-0.5">
                {isCreator ? "Subscription Expiring" : "Action Required"}
              </h4>
              <p className="text-xs text-foreground/80 font-medium">
                {isCreator 
                  ? `Your 6-month free period has ended! You have ${graceDaysLeft} days left to upgrade to Premium before this club is paused.`
                  : `This club's subscription expires in ${graceDaysLeft} days. Remind the admin to upgrade!`}
              </p>
              {isCreator && (
                <Link to="/app/premium" className="inline-block mt-2 text-[10px] font-bold text-amber-500 bg-amber-500/20 px-3 py-1.5 rounded-full hover:bg-amber-500/30 transition">
                  Upgrade Now
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <main className="w-full px-4 py-3 flex flex-col shrink-0 mt-auto">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 opacity-60">
            <Hash className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-bold text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">Be the first to post in #{activeRoom}</p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble 
            key={m.id} 
            message={m} 
            isMe={m.profile_id === currentUser?.id}
            currentUser={currentUser}
            members={members}
            repliedMessage={m.reply_to_id ? messages.find(prev => prev.id === m.reply_to_id) : null}
            onReply={setReplyingTo}
            onReact={handleReact}
            getRoleColor={getRoleColor}
            room={activeRoom}
          />
        ))}
      </main>
      </div>

      {/* Input */}
      <div className="w-full shrink-0 bg-background border-t border-border px-3 py-2.5 z-10">
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-accent/10 p-2 border-l-3 border-primary">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                <Reply className="h-2.5 w-2.5" /> Replying to {replyingTo.profiles?.full_name || replyingTo.profiles?.username}
              </span>
              <p className="truncate text-[11px] text-muted-foreground">{replyingTo.content}</p>
            </div>
            <button 
              onClick={() => setReplyingTo(null)}
              className="ml-2 h-5 w-5 rounded-full bg-accent/20 flex items-center justify-center text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        
        {mediaPreviews.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar py-2">
            {mediaPreviews.map((preview, idx) => (
              <div key={idx} className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-border">
                {preview.startsWith('data:video') ? (
                  <video src={preview} className="h-full w-full object-cover" />
                ) : (
                  <img src={preview} className="h-full w-full object-cover" />
                )}
                <button 
                  onClick={() => removeMedia(idx)}
                  className="absolute top-1 right-1 h-4 w-4 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-destructive transition"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-end gap-2">
          {/* Current User Avatar */}
          <div className="h-9 w-9 shrink-0 rounded-full bg-accent/30 border border-border/50 overflow-hidden flex items-center justify-center font-bold text-xs text-muted-foreground mb-0.5">
            {currentUserProfile?.avatar_url ? (
              <img src={currentUserProfile.avatar_url} className="h-full w-full object-cover" />
            ) : (
              (currentUserProfile?.full_name || currentUserProfile?.username || 'U').substring(0, 1).toUpperCase()
            )}
          </div>

          <div className="flex-1 flex items-end gap-1.5 rounded-2xl border border-border bg-card px-3 py-1 focus-within:border-primary/50 transition-colors">
          <textarea 
            value={msg}
            onChange={(e) => {
              setMsg(e.target.value);
              const target = e.target;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 80)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={activeRoom === 'general' ? "Write a message..." : `Post in ${activeRoom}...`}
            className="flex-1 resize-none bg-transparent py-2 text-sm outline-none text-foreground placeholder:text-muted-foreground no-scrollbar"
            rows={1}
            style={{ minHeight: '36px', maxHeight: '80px', height: '36px' }}
          />
          <div className="flex items-center gap-0.5 pb-1 shrink-0">
            <input 
              type="file" 
              ref={mediaInputRef} 
              onChange={handleChatMediaUpload} 
              className="hidden" 
              multiple 
              accept="image/*,video/*"
            />
            <button 
              onClick={() => mediaInputRef.current?.click()}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground active:scale-95 hover:text-foreground transition"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button 
              onClick={handleSendMessage}
              disabled={!msg.trim() && mediaFiles.length === 0}
              className={`grid h-8 w-8 place-items-center rounded-full transition active:scale-95 ${
                msg.trim() || mediaFiles.length > 0 ?'bg-primary text-white' : 'text-muted-foreground'
              }`}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, isMe, currentUser, members, repliedMessage, onReply, onReact, getRoleColor, room }: any) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const { data: currentUserProfile } = useUser();
  const startX = useRef(0);
  const startY = useRef(0);
  const isSwiping = useRef(false);
  const maxSwipe = 60;
  
  const member = members.find((mem: any) => mem.profile_id === message.profile_id);
  const role = member?.role || 'Member';
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const groupedReactions = message.reactions?.reduce((acc: any, r: any) => {
    acc[r.emoji] = acc[r.emoji] || { count: 0, me: false };
    acc[r.emoji].count++;
    if (r.profile_id === currentUser?.id) acc[r.emoji].me = true;
    return acc;
  }, {}) || {};
  
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      if (isSwiping.current) {
        setShowEmojiPicker(true);
        if (window.navigator.vibrate) window.navigator.vibrate(50);
      }
    }, 400);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    } else {
      startX.current = e.clientX;
      startY.current = e.clientY;
    }
    isSwiping.current = true;
    startLongPress();
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isSwiping.current) return;
    let currentX = 0;
    let currentY = 0;
    
    if ('touches' in e) {
      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
    } else {
      currentX = e.clientX;
      currentY = e.clientY;
    }
    
    const diffX = currentX - startX.current;
    const diffY = currentY - startY.current;

    // Cancel long press if moved significantly
    if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
      cancelLongPress();
    }

    // If vertical scrolling is more prominent than horizontal, cancel the swipe to let the page scroll
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) {
      isSwiping.current = false;
      setSwipeOffset(0);
      return;
    }

    if (diffX > 0 && !isMe) {
      const offset = Math.min(diffX, maxSwipe);
      setSwipeOffset(offset);
      if (offset >= 45 && swipeOffset < 45) {
        if (window.navigator.vibrate) window.navigator.vibrate(10);
      }
    } else if (diffX < 0 && isMe) {
      const offset = Math.max(diffX, -maxSwipe);
      setSwipeOffset(offset);
      if (offset <= -45 && swipeOffset > -45) {
        if (window.navigator.vibrate) window.navigator.vibrate(10);
      }
    }
  };

  const handleTouchEnd = () => {
    cancelLongPress();
    if (Math.abs(swipeOffset) >= 45 && isSwiping.current) {
      onReply(message);
    }
    setSwipeOffset(0);
    isSwiping.current = false;
  };

  return (
    <div 
      id={`message-${message.id}`}
      className={`relative py-1.5 flex w-full transition-colors duration-500 ${isMe ?'justify-end' : 'justify-start'}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseMove={handleTouchMove}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
    >
      {/* Swipe reply icon for received */}
      {!isMe && (
        <div 
          className="absolute left-1 top-1/2 -translate-y-1/2 transition-opacity z-0"
          style={{ opacity: swipeOffset / 45, transform: `scale(${Math.min(swipeOffset / 45, 1)})` }}
        >
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
            <Reply className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
      )}
      {/* Swipe reply icon for sent */}
      {isMe && (
        <div 
          className="absolute right-1 top-1/2 -translate-y-1/2 transition-opacity z-0"
          style={{ opacity: -swipeOffset / 45, transform: `scale(${Math.min(-swipeOffset / 45, 1)})` }}
        >
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
            <Reply className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
      )}

      <div 
        className={`flex gap-2.5 relative z-10 max-w-[85%] ${isMe ?'flex-row-reverse' : 'flex-row'}`}
        style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none' }}
      >
        {/* Avatar (only for received messages) */}
        {!isMe && (
          <div className="h-8 w-8 shrink-0 rounded-full bg-accent/30 border border-border overflow-hidden flex items-center justify-center text-xs font-bold text-muted-foreground self-end mb-1">
            {message.profiles?.avatar_url ? (
              <img src={message.profiles.avatar_url} className="h-full w-full object-cover" />
            ) : (
              message.profiles?.username?.[0]?.toUpperCase()
            )}
          </div>
        )}

        {/* Content Container */}
        <div className={`flex flex-col ${isMe ?'items-end' : 'items-start'} min-w-0`}>
          
          {/* Reply preview */}
          {repliedMessage && (
            <div 
              onClick={() => {
                const el = document.getElementById(`message-${repliedMessage.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.style.backgroundColor = 'rgba(var(--primary), 0.2)';
                  setTimeout(() => {
                    el.style.backgroundColor = 'transparent';
                  }, 1500);
                }
              }}
              className={`mb-1 flex items-center gap-1.5 opacity-80 text-[11px] cursor-pointer hover:opacity-100 transition-opacity ${isMe ?'mr-2' : 'ml-2'}`}
            >
              <Reply className="h-3 w-3 shrink-0" />
              <span className="font-bold whitespace-nowrap">{repliedMessage.profiles?.username || 'Someone'}</span>
              <span className="truncate max-w-[120px] text-muted-foreground">{repliedMessage.content}</span>
            </div>
          )}

          {/* Bubble */}
          <div className={`relative group px-3.5 py-2.5 ${isMe ?'bg-primary border border-primary/20 rounded-[22px] rounded-br-sm text-right' : 'bg-muted border border-border/50 rounded-[22px] rounded-bl-sm text-left'}`}>
            
            {/* Sender Name for Received */}
            {!isMe && (
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[12px] font-bold text-foreground">{message.profiles?.full_name || message.profiles?.username}</span>
                {role !== 'Member' && (
                  <span className={`text-[7px] font-bold uppercase px-1 py-0.5 rounded ${getRoleColor(role)}`}>
                    {role}
                  </span>
                )}
              </div>
            )}

            {/* Room badges */}
            {room === 'assignments' && (
              <div className="mb-1.5 inline-flex items-center gap-1.5 bg-primary/10 text-primary px-2 py-1 rounded-md border border-primary/20">
                <GraduationCap className="h-3 w-3" />
                <span className="text-[9px]">Assignment</span>
              </div>
            )}
            {room === 'announcements' && (
              <div className="mb-1.5 inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-500 px-2 py-1 rounded-md border border-amber-500/20">
                <ShieldAlert className="h-3 w-3" />
                <span className="text-[9px]">Announcement</span>
              </div>
            )}

            {message.content.startsWith("📅 **[SCHEDULED SPACE]**") ? (() => {
              const topicMatch = message.content.match(/Topic:\s*"([^"]+)"/);
              const dateMatch = message.content.match(/Date:\s*([^\s|]+)/);
              const timeMatch = message.content.match(/Time:\s*([^\s|]+)/);
              
              const spaceTopic = topicMatch ? topicMatch[1] : "Live Space";
              const spaceDateStr = dateMatch ? dateMatch[1] : "";
              const spaceTimeStr = timeMatch ? timeMatch[1] : "";
              
              return (
                <div className="mt-1 flex flex-col gap-3 bg-card border border-border/40 p-4 rounded-2xl max-w-sm w-full text-left shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-sm">
                      <Video className="w-5 h-5 text-red-500 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] text-primary">Live Space Event</span>
                      <h4 className="font-black text-sm text-foreground tracking-tight truncate mt-0.5">{spaceTopic}</h4>
                    </div>
                  </div>

                  <div className="h-px bg-border/40 w-full" />

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex flex-col gap-0.5 text-muted-foreground bg-background border border-border/40 px-3 py-1.5 rounded-xl">
                      <span className="text-muted-foreground text-[8px] shrink-0">Date</span>
                      <span className="font-bold truncate text-foreground">{spaceDateStr}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 text-muted-foreground bg-background border border-border/40 px-3 py-1.5 rounded-xl">
                      <span className="text-muted-foreground text-[8px] shrink-0">Time</span>
                      <span className="font-bold truncate text-foreground">{spaceTimeStr}</span>
                    </div>
                  </div>

                  <Link 
                    to="/app/live/$classId" 
                    params={{ classId: message.club_id || "unknown" }}
                    className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold text-center rounded-xl transition active:scale-95 text-xs flex items-center justify-center gap-2 shadow-sm shadow-red-500/20"
                  >
                    <Video className="w-4 h-4" />
                    Join Scheduled Space
                  </Link>
                </div>
              );
            })() : (
              <>
                <p className={`text-[14px] leading-relaxed whitespace-pre-wrap text-left break-words ${isMe ?'text-primary-foreground' : 'text-foreground'}`}>
                  <LinkifiedText text={message.content.split('$$MEDIA$$')[0].trim()} linkColor={isMe ? "text-primary-foreground underline font-bold hover:opacity-80" : "text-primary underline font-bold hover:opacity-80"} />
                  {!message.content.includes('$$MEDIA$$') && <span className="inline-block w-12" />} {/* Space for timestamp */}
                </p>
                
                {message.content.includes('$$MEDIA$$') && (
                  <div className={`mt-2 rounded-xl overflow-hidden transition-colors ${
                    message.content.split('$$MEDIA$$')[1].split(',').length >= 2 
                      ? "grid grid-cols-2 gap-0.5 max-h-[240px] border border-white/10 bg-white/5" 
                      : "flex justify-start border border-white/10"
                  }`}>
                    {message.content.split('$$MEDIA$$')[1].split(',').map((url: string, i: number) => {
                      const isVideo = url.toLowerCase().match(/\.(mp4|webm|ogg)$/);
                      return (
                        <div key={i} className={`relative overflow-hidden w-full ${
                          message.content.split('$$MEDIA$$')[1].split(',').length === 1 ? "max-h-[300px]" : "aspect-square"
                        }`}>
                          {isVideo ? (
                            <video src={url} controls className="h-full w-full object-cover" />
                          ) : (
                            <img src={url} className="h-full w-full object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(url, '_blank')} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            
            {message.content.includes('$$MEDIA$$') && <div className="h-4" />} {/* Space for timestamp when media is present */}
            
            <span className={`text-[10px] absolute bottom-2 right-3 ${isMe ?'text-primary-foreground/70' : 'text-muted-foreground'}`}>{time}</span>

            {/* Tap outside overlay */}
            {(showEmojiPicker || showFullPicker) && (
              <div 
                className="fixed inset-0 z-40" 
                onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(false); setShowFullPicker(false); }} 
                onTouchStart={(e) => { e.stopPropagation(); setShowEmojiPicker(false); setShowFullPicker(false); }} 
              />
            )}

            {/* Emoji Picker Popover */}
            {showEmojiPicker && (
              <div 
                className={`absolute z-50 flex flex-row gap-1.5 p-2 bg-card/95 backdrop-blur-xl border border-border/80 rounded-full shadow-2xl animate-in zoom-in duration-200 -top-14 ${isMe ?'right-0' : 'left-0'}`}
              >
                {EMOJI_OPTIONS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={(e) => { e.stopPropagation(); onReact(message.id, emoji); setShowEmojiPicker(false); }}
                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent/60 transition-colors text-xl active:scale-90"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowFullPicker(true); setShowEmojiPicker(false); }}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent/60 transition-colors text-xl active:scale-90 bg-accent/20 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Full Emoji Picker Popover */}
            {showFullPicker && (
              <div 
                className={`absolute z-50 shadow-2xl animate-in zoom-in duration-200 ${isMe ?'right-0 -top-[320px]' : 'left-0 -top-[320px]'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <EmojiPicker 
                  onEmojiClick={(emojiData) => {
                    onReact(message.id, emojiData.emoji);
                    setShowFullPicker(false);
                  }} 
                  theme={'dark' as any}
                  lazyLoadEmojis={true}
                  searchDisabled={false}
                  skinTonesDisabled={true}
                  width={280}
                  height={300}
                />
              </div>
            )}
          </div>

          {/* Reactions display */}
          {Object.keys(groupedReactions).length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ?'justify-end' : 'justify-start'}`}>
              {Object.entries(groupedReactions).map(([emoji, data]: [string, any]) => (
                <button
                  key={emoji}
                  onClick={() => onReact(message.id, emoji)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold transition-colors ${
                    data.me ?'bg-primary/20 border-primary/30 text-primary' : 'bg-accent/30 border-white/5 text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  <span>{emoji}</span>
                  <span>{data.count}</span>
                </button>
              ))}
              <button 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex items-center justify-center h-[22px] w-[22px] rounded-full bg-accent/30 border border-white/5 text-muted-foreground hover:bg-accent/50 transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

