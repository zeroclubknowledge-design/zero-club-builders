import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkifiedText } from "@/components/LinkifiedText";
import { ChevronLeft, ChevronDown, ChevronRight, Paperclip, Send, Hash, Users, Pin, ShieldAlert, GraduationCap, Mic, Settings, Trash2, Save, Camera, X, Reply, Check, Sliders, UserX, Copy, Plus, Smile, Video, Radio, Zap, CalendarDays, Clock, Sparkles, ArrowRight, Search, User, MessageSquare, Megaphone, ClipboardCheck, HelpCircle, LockKeyhole, FileText, BookOpenCheck, Image, Film, File, Download, Square, Gift, Trophy, WalletCards, Loader2, UserPlus, Share2, Wallet, ShieldCheck } from "@/components/icons/solar";
import { copyToClipboard, shareOrCopy } from "@/lib/share";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useSharedPresence } from "@/hooks/useSharedPresence";
import { decodeChatMedia, encodeChatMedia, getChatMediaType, useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerDescription } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from 'date-fns';
import EmojiPicker from 'emoji-picker-react';
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
export const Route = createFileRoute("/app/clubs/chat")({
  component: ClubChat,
  validateSearch: (search: Record<string, unknown>): { showRules?: string; clubId?: string } => {
    const next: { showRules?: string; clubId?: string } = {};
    if (typeof search.showRules === "string" && search.showRules) next.showRules = search.showRules;
    if (typeof search.clubId === "string" && search.clubId) next.clubId = search.clubId;
    return next;
  },
});

const defaultRooms = [
  { id: "general", name: "Discussion" },
  { id: "assignments", name: "Classwork" },
  { id: "announcements", name: "Announcements" },
  { id: "q-and-a", name: "Q&A" },
];

const getClubRooms = (rooms: any) => {
  const source = Array.isArray(rooms) && rooms.length > 0 ? rooms : defaultRooms;
  return source.map((room: any) => {
    const legacyDefault = room?.id === "general" && ["stream", "streaming"].includes(String(room?.name || "").trim().toLowerCase());
    return legacyDefault ? { ...room, name: "Discussion" } : room;
  });
};

/** Keeps draft keystrokes from redrawing the full club and message history. */
function ClubMessageComposer({
  placeholder,
  hasMedia,
  controls,
  onSend,
  members = [],
}: {
  placeholder: string;
  hasMedia: boolean;
  controls: ReactNode;
  onSend: (text: string) => Promise<boolean>;
  members?: any[];
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /*
   * Tagging someone in the room.
   *
   * The picker inserts the *username*, not the display name, because the
   * renderer turns @username into a link to that profile — a display name with
   * a space in it would highlight only its first word and point at a handle
   * that does not exist.
   *
   * Only people in this club are offered. A club chat is a room, and the names
   * that should come to hand are the names of people in it.
   */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const mentionMatches = (() => {
    if (mentionQuery === null) return [];
    const term = mentionQuery.toLowerCase();
    const seen = new Set<string>();
    return members
      .map((member: any) => member.profiles || member)
      .filter((person: any) => {
        const username = String(person?.username || "").toLowerCase();
        if (!username || seen.has(username)) return false;
        seen.add(username);
        if (term === "") return true;
        return (
          username.includes(term) ||
          String(person.full_name || "").toLowerCase().includes(term)
        );
      })
      .slice(0, 6);
  })();

  // Only the word the caret is sitting in, so an @ earlier in the sentence
  // does not reopen the list while the rest is typed.
  const readMentionQuery = (value: string) => {
    const match = value.match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const applyMention = (username: string) => {
    setDraft((current) => current.replace(/(^|\s)@([^\s@]*)$/, (_m, before: string) => `${before}@${username} `));
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const submit = async () => {
    if ((!draft.trim() && !hasMedia) || sending) return;
    const text = draft;
    setDraft("");
    setMentionQuery(null);
    if (textareaRef.current) textareaRef.current.style.height = "36px";
    setSending(true);
    try {
      const sent = await onSend(text);
      if (!sent && text.trim()) setDraft((current) => current || text);
    } catch {
      if (text.trim()) setDraft((current) => current || text);
      toast.error("Could not send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative flex flex-1 items-end gap-1.5 rounded-2xl border border-border bg-card px-3 py-1 transition-colors focus-within:border-primary/50">
      {mentionMatches.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl bg-card shadow-[0_18px_44px_-20px_rgba(0,0,0,0.45)] ring-1 ring-border">
          {mentionMatches.map((person: any) => (
            <button
              key={person.id || person.username}
              type="button"
              onMouseDown={(event) => { event.preventDefault(); applyMention(person.username); }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-accent/50"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                {person.avatar_url
                  ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" />
                  : (person.full_name || person.username || "?")[0].toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold tracking-tight text-foreground">
                  {person.full_name || person.username}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">@{person.username}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          readMentionQuery(event.target.value);
          event.target.style.height = "auto";
          event.target.style.height = `${Math.min(event.target.scrollHeight, 80)}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setMentionQuery(null); return; }
          if (event.key === "Enter" && mentionMatches.length > 0 && !event.shiftKey) {
            // Finish the tag rather than sending "@ben" as literal text.
            event.preventDefault();
            applyMention(mentionMatches[0].username);
            return;
          }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        className="flex-1 resize-none bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground no-scrollbar"
        rows={1}
        style={{ minHeight: "36px", maxHeight: "80px", height: "36px" }}
      />
      <div className="flex shrink-0 items-center gap-0.5 pb-1">
        {controls}
        <button
          onClick={() => void submit()}
          disabled={sending || (!draft.trim() && !hasMedia)}
          aria-label="Send message"
          className={`grid h-8 w-8 place-items-center rounded-full transition active:scale-95 ${
            draft.trim() || hasMedia ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

const CLUB_GIVEAWAY_PREFIX = '::ZEROCLUB_GIVEAWAY::';
const GIVEAWAY_ENTRY_EMOJI = '🎟️';

type ClubGiveaway = {
  giveawayId?: string;
  title: string;
  prize?: string;
  amountPerWinner?: number;
  totalAmount?: number;
  description: string;
  endsAt: string;
  winners: number;
};

const parseClubGiveaway = (content: string): ClubGiveaway | null => {
  if (!content?.startsWith(CLUB_GIVEAWAY_PREFIX)) return null;
  try {
    return JSON.parse(content.slice(CLUB_GIVEAWAY_PREFIX.length));
  } catch {
    return null;
  }
};

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
  const [messages, setMessages] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [club, setClub] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { data: currentUserProfile, refetch: refetchCurrentUser } = useUser();
  const { details: walletCurrency, format: formatWalletAmount, toBaseAmount } = useWalletCurrency();
  const [showMembers, setShowMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [squadActionMember, setSquadActionMember] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editClub, setEditClub] = useState({
    name: "", description: "", banner_url: "", logo_url: "", rules: "", category: "All",
    subscription_fee: 0, access_free: false, is_private: false, requires_approval: false,
  });
  const [editRooms, setEditRooms] = useState<{id: string, name: string}[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const { isRecording, recordingSeconds, startRecording, stopRecording } = useVoiceRecorder((file) => {
    setMediaFiles((files) => [...files, file]);
    setMediaPreviews((previews) => [...previews, URL.createObjectURL(file)]);
  });
  const descRef = useRef<HTMLTextAreaElement>(null);
  const rulesRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showRoomSwitcher, setShowRoomSwitcher] = useState(false);
  const [squadSearch, setSquadSearch] = useState("");
  const [showGiveaway, setShowGiveaway] = useState(false);
  const [isCreatingGiveaway, setIsCreatingGiveaway] = useState(false);
  const [giveaway, setGiveaway] = useState<ClubGiveaway>({
    title: "",
    amountPerWinner: undefined,
    description: "",
    endsAt: "",
    winners: 1,
  });

  const handleScroll = () => {
    if (scrollRef.current) {
      setIsScrolled(scrollRef.current.scrollTop > 100);
    }
  };

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }
    try {
      await startRecording();
    } catch (error: any) {
      toast.error(error.message || 'Microphone access is required to record a voice note.');
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
  const giveawayWinnerCount = Math.max(1, Math.min(20, Number(giveaway.winners) || 1));
  const giveawayPrizeBase = Math.round(toBaseAmount(Number(giveaway.amountPerWinner || 0)));
  const giveawayTotalBase = giveawayPrizeBase * giveawayWinnerCount;
  const canFundGiveaway = giveawayTotalBase > 0 && giveawayTotalBase <= Number(currentUserProfile?.coins || 0);
  const openMemberProfile = (profile: any, profileId?: string) => {
    const id = profile?.username || profile?.id || profileId;
    if (!id) return;
    navigate({ to: '/app/profile/$id', params: { id } });
  };

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

      let targetClub = joined?.clubs as any;

      if (!targetClub && clubId) {
        const { data: fallbackClub } = await supabase.from('clubs').select('*').eq('id', clubId).single();
        targetClub = fallbackClub;
      }

      if (targetClub) {
        targetClub = { ...targetClub, rooms: getClubRooms(targetClub.rooms) };
        setClub(targetClub);
        setEditClub({ 
          name: targetClub.name, 
          description: targetClub.description || "",
          banner_url: targetClub.banner_url || "",
          logo_url: targetClub.logo_url || "",
          rules: targetClub.rules || "Be respectful, help others, and share your work!",
          category: targetClub.category || "All",
          subscription_fee: Number(targetClub.subscription_fee) || 0,
          access_free: Boolean(targetClub.access_free),
          is_private: Boolean(targetClub.is_private),
          requires_approval: Boolean(targetClub.requires_approval),
        });
        setEditRooms(targetClub.rooms);
        
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
    const fetchedRooms = getClubRooms(club.rooms);
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
      
      setMessages((current) => {
        const unchanged = current.length === msgsWithReactions.length
          && current.every((message, index) => {
            const incoming = msgsWithReactions[index];
            if (!incoming || message.id !== incoming.id || message.content !== incoming.content) return false;
            const currentReactions = (message.reactions || []).map((reaction: any) => reaction.id).join(':');
            const incomingReactions = (incoming.reactions || []).map((reaction: any) => reaction.id).join(':');
            return currentReactions === incomingReactions;
          });
        if (unchanged) return current;
        messagesCache.current[activeRoom] = msgsWithReactions;
        return msgsWithReactions;
      });
    }

    void loadMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`club:${club.id}:${activeRoom}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public', 
        table: 'club_messages',
        filter: `club_id=eq.${club.id}`
      }, (payload) => {
        const changedMessage = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (changedMessage.room_id && changedMessage.room_id !== activeRoom) return;
        void loadMessages();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void loadMessages();
      });

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

    // Reconcile occasionally so a brief connection change cannot leave the
    // conversation stale after Realtime reconnects.
    const catchUpTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadMessages();
    }, 15_000);

    const catchUpOnFocus = () => { void loadMessages(); };
    window.addEventListener('focus', catchUpOnFocus);

    return () => {
      isMounted = false;
      window.clearInterval(catchUpTimer);
      window.removeEventListener('focus', catchUpOnFocus);
      void supabase.removeChannel(channel);
      void supabase.removeChannel(rxnChannel);
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

  /* ── Adding builders directly ──
     Searches every profile rather than the member list, which is what the
     squad search above it does. Anyone already in the club is filtered out so
     an admin never taps Add on someone who is already there. */
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<any[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  /* "Nobody matched" and "the query was refused" are different answers and
     used to look the same on screen. */
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const q = addQuery.trim();
    if (q.length < 2) {
      setAddResults([]);
      setAddSearching(false);
      return;
    }
    let cancelled = false;
    setAddSearching(true);
    const timer = setTimeout(async () => {
      /*
       * Three things were quietly turning a good search into "No one new
       * found":
       *
       *   • a leading @. People type the handle as they see it — @benson —
       *     and `username ilike '%@benson%'` matches nobody, because the @ is
       *     not part of the stored username;
       *   • commas and parentheses, which are the syntax of PostgREST's or()
       *     filter. One in the query and the whole filter is malformed;
       *   • the error itself. This read `const { data } =`, so a rejected
       *     query and a genuine no-match were indistinguishable — both came
       *     back empty and both said nobody was found.
       *
       * The limit is raised too: it used to fetch 8 rows and then remove
       * current members, so searching a club where the first 8 matches are
       * already inside returned an empty list.
       */
      const term = q.replace(/^@+/, "").replace(/[,()]/g, " ").trim();
      if (!term) {
        if (!cancelled) { setAddResults([]); setAddSearching(false); }
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .or(`username.ilike.%${term}%,full_name.ilike.%${term}%`)
        .limit(30);

      if (cancelled) return;

      if (error) {
        setAddError(error.message);
        setAddResults([]);
        setAddSearching(false);
        return;
      }

      const existing = new Set(members.map((m) => m.profile_id));
      setAddError(null);
      setAddResults((data || []).filter((p: any) => !existing.has(p.id)).slice(0, 12));
      setAddSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addQuery, isAdmin, members]);

  const handleAddMember = async (person: any) => {
    if (!club) return;
    setAddingId(person.id);
    try {
      const { data, error } = await supabase.rpc("add_club_member", {
        p_club_id: club.id,
        p_profile_id: person.id,
        p_role: "Member",
      });
      if (error) throw error;

      if ((data as any)?.added === false) {
        toast("Already in the squad");
      } else {
        toast.success(`${person.full_name || person.username} added to the squad`);
      }

      // Re-read rather than patching state by hand, so the row carries the
      // same shape (profiles joined) as every other member.
      const { data: mems } = await supabase
        .from("club_members")
        .select("*, profiles(*)")
        .eq("club_id", club.id);
      setMembers(mems || []);
      setAddResults((prev) => prev.filter((p) => p.id !== person.id));
    } catch (error: any) {
      toast.error(error?.message || "Could not add that member");
    } finally {
      setAddingId(null);
    }
  };

  // /club/<id> rather than /app?club=<id>: the public page carries the club's
  // name and picture in its HTML, so the link previews properly when shared.
  // Anyone signed in is forwarded straight into the app from there.
  const inviteLink = () => `${window.location.origin}/club/${club?.id}`;

  const handleCopyInvite = () => {
    if (!club) return;
    // Goes through the shared helper for the older-webview fallback, rather
    // than calling navigator.clipboard directly and failing silently.
    copyToClipboard(inviteLink(), "Invite link copied");
  };

  const handleShareInvite = () => {
    if (!club) return;
    shareOrCopy({
      title: club.name,
      text: `Join ${club.name} on Zero Club`,
      url: inviteLink(),
      copiedMessage: "Invite link copied",
    });
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

      /* The fee goes through its own function rather than the update above.
         It decides who may be charged for entry, so the check that only the
         owner can change it belongs in the database, not in this handler. */
      const fee = Math.max(0, Number(editClub.subscription_fee) || 0);
      const { error: feeError } = await supabase.rpc('set_club_access', {
        p_club_id: clubId,
        p_fee: fee,
        p_free: Boolean(editClub.access_free),
      });
      if (feeError) throw feeError;

      /* Same reasoning as the fee: who is allowed in is the database's rule to
         keep, so it is set through a function that checks the owner. */
      const { error: admissionError } = await supabase.rpc('set_club_admission', {
        p_club_id: clubId,
        p_requires_approval: Boolean(editClub.requires_approval),
      });
      if (admissionError) throw admissionError;

      setClub({ ...club, ...editClub, subscription_fee: fee, rooms: editRooms });
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

  const handleSendMessage = async (overrideText?: string | any, overrideReplyToId?: string | null) => {
    const actualOverride = typeof overrideText === 'string' ? overrideText : undefined;
    const textToSend = actualOverride ?? "";
    if ((!textToSend.trim() && mediaFiles.length === 0) || !club || !currentUser) return false;
    
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
          uploadedUrls.push(encodeChatMedia(getChatMediaType(file), publicUrl, file.name));
        }
      }
      toast.dismiss("upload");
      if (uploadedUrls.length > 0) {
        text += `\n\n$$MEDIA$$${uploadedUrls.join(',')}`;
      }
    }

    const parentId = overrideReplyToId !== undefined ? overrideReplyToId : replyingTo?.id;

    if (activeRoom === 'announcements' && !isAdmin) {
      toast.error("Only club admins can publish announcements.");
      return false;
    }
    if (activeRoom === 'assignments' && !isAdmin && !parentId) {
      toast.error("Only club admins can create assignments.");
      return false;
    }
    setMediaFiles([]);
    setMediaPreviews([]);
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
      return false;
    } else {
      // Replace optimistic message with real data from server
      setMessages(prev => {
        const next = prev
          .filter(m => m.id !== data.id || m.id === tempId)
          .map(m => m.id === tempId ? { ...data, reactions: m.reactions || [] } : m);
        messagesCache.current[activeRoom] = next;
        return next;
      });
      
      // Featured club first-message reward
      if (club.name === "Zero K Bootcamp") {
        const hasSentMessageBefore = messages.some(m => m.profile_id === currentUser.id && m.id !== tempId);
        if (!hasSentMessageBefore) {
          toast.success("You earned 100 XP for your first message in the featured Zero K Bootcamp!");
        }
      }
      return true;
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

  const handleCreateGiveaway = async () => {
    if (!isAdmin) {
      toast.error("Only club admins can create giveaways.");
      return;
    }
    const winnerCount = Math.max(1, Math.min(20, Number(giveaway.winners) || 1));
    const displayAmount = Number(giveaway.amountPerWinner || 0);
    const amountPerWinner = Math.round(toBaseAmount(displayAmount));
    const totalAmount = amountPerWinner * winnerCount;

    if (!giveaway.title.trim() || amountPerWinner <= 0 || !giveaway.endsAt) {
      toast.error("Add a title, prize amount, and closing date.");
      return;
    }
    if (new Date(giveaway.endsAt).getTime() <= Date.now()) {
      toast.error("Choose a future closing date.");
      return;
    }
    if (totalAmount > Number(currentUserProfile?.coins || 0)) {
      toast.error(`You need ${formatWalletAmount(totalAmount)} in your wallet to fund this giveaway.`);
      return;
    }

    setIsCreatingGiveaway(true);
    try {
      const { data, error } = await supabase.rpc("create_club_giveaway", {
        p_club_id: club.id,
        p_title: giveaway.title.trim(),
        p_description: giveaway.description.trim(),
        p_amount_per_winner: amountPerWinner,
        p_winner_count: winnerCount,
        p_ends_at: new Date(giveaway.endsAt).toISOString(),
      });
      if (error) throw error;

      const messageId = data?.message_id;
      if (messageId) {
        const { data: publishedMessage } = await supabase
          .from("club_messages")
          .select("*, profiles:profile_id(*)")
          .eq("id", messageId)
          .single();
        if (publishedMessage) {
          setMessages((current) => current.some((message) => message.id === publishedMessage.id)
            ? current
            : [...current, { ...publishedMessage, reactions: [] }]);
        }
      }

      setGiveaway({ title: "", amountPerWinner: undefined, description: "", endsAt: "", winners: 1 });
      setShowGiveaway(false);
      await refetchCurrentUser();
      toast.success(`${formatWalletAmount(totalAmount)} has been locked for the winners.`);
    } catch (error: any) {
      toast.error(error.message || "Could not publish the giveaway.");
    } finally {
      setIsCreatingGiveaway(false);
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const giveawayMessage = parseClubGiveaway(msg.content);
    if (emoji === GIVEAWAY_ENTRY_EMOJI && giveawayMessage?.giveawayId) {
      const alreadyEntered = msg.reactions?.some((reaction: any) =>
        reaction.profile_id === currentUser.id && reaction.emoji === GIVEAWAY_ENTRY_EMOJI
      );
      if (alreadyEntered) return;

      const tempId = crypto.randomUUID();
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, reactions: [...(message.reactions || []), { id: tempId, message_id: messageId, profile_id: currentUser.id, emoji }] }
        : message));

      const { data, error } = await supabase.rpc("enter_club_giveaway", {
        p_giveaway_id: giveawayMessage.giveawayId,
      });
      if (error) {
        setMessages((current) => current.map((message) => message.id === messageId
          ? { ...message, reactions: message.reactions?.filter((reaction: any) => reaction.id !== tempId) || [] }
          : message));
        toast.error(error.message || "Could not enter the giveaway.");
        return;
      }

      setMessages((current) => current.map((message) => message.id === messageId
        ? {
            ...message,
            reactions: message.reactions?.map((reaction: any) => reaction.id === tempId
              ? { ...reaction, id: data?.id || tempId }
              : reaction) || [],
          }
        : message));
      toast.success("Your giveaway entry is confirmed.");
      return;
    }
    
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
      case 'Administrator': return 'text-primary bg-primary/8 ring-1 ring-primary/20';
      case 'Investor': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 ring-1 ring-emerald-500/20';
      case 'Product Lead': return 'text-blue-600 dark:text-blue-400 bg-blue-500/8 ring-1 ring-blue-500/20';
      case 'Tech Lead': return 'text-violet-600 dark:text-violet-400 bg-violet-500/8 ring-1 ring-violet-500/20';
      case 'Design Lead': return 'text-pink-600 dark:text-pink-400 bg-pink-500/8 ring-1 ring-pink-500/20';
      case 'Business Developer': return 'text-orange-600 dark:text-orange-400 bg-orange-500/8 ring-1 ring-orange-500/20';
      case 'Growth Hacker': return 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/8 ring-1 ring-cyan-500/20';
      default: return 'text-muted-foreground bg-foreground/[0.04] ring-1 ring-border';
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
      <div className="zc-keep-width fixed inset-x-0 z-[100] mx-auto flex h-dvh max-w-md flex-col items-center justify-center bg-background px-6 text-center md:left-[280px] md:right-0 md:mx-0 md:max-w-none xl:right-[336px]">
        <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-[21px] font-semibold tracking-tight mb-2">
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
      className="zc-keep-width fixed inset-x-0 z-40 mx-auto flex max-w-md flex-col overflow-hidden border-x border-border bg-gradient-to-b from-accent/5 via-background to-background dark:bg-background md:left-[280px] md:right-0 md:mx-0 md:max-w-none xl:right-[336px]"
      style={{ height: viewportHeight, top: viewportTop }}
    >


      {/* NEW FIXED DYNAMIC HEADER */}
      <header className={`absolute top-0 inset-x-0 z-50 flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 transition-all duration-300 ${
        isScrolled ? "bg-background/80 backdrop-blur-md border-b border-border/40 shadow-sm" : "bg-gradient-to-b from-black/60 to-transparent pointer-events-none"
      }`}>
        <div className={`flex items-center gap-3 ${!isScrolled ? "pointer-events-auto" : ""}`}>
          <Link to="/app/clubs" className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/10 bg-foreground text-background shadow-sm transition hover:opacity-90 active:scale-90">
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
          {/* Live is the one thing here that is time-sensitive: a session is
              happening now or it is not. That belongs in the header where it is
              always visible, rather than two taps inside a menu. Assessments
              moved the other way — they are a place you go, so they sit with
              the other sections. */}
          <button
            onClick={() => {
              if (!isAdmin && liveAdminsCount === 0) return;
              /* Straight into the room. This opened the live *menu*, which put
                 a screen of choices between the button and the thing it is
                 named after — and for a learner joining a session already in
                 progress there was only ever one choice on it. Scheduling
                 still lives on the Go Live button further down the club. */
              navigate({ to: "/app/live/$classId", params: { classId: club?.id || clubId || "unknown" } });
            }}
            disabled={!isAdmin && liveAdminsCount === 0}
            title={isAdmin ? "Go live" : liveAdminsCount > 0 ? "Join the live session" : "Nobody is live right now"}
            aria-label={isAdmin ? "Go live" : liveAdminsCount > 0 ? "Join the live session" : "Nobody is live right now"}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition active:scale-95 ${
              liveAdminsCount > 0
                ? "border-red-500/40 bg-red-500 text-white hover:bg-red-600"
                : isAdmin
                  ? "border-foreground/10 bg-foreground text-background hover:opacity-90"
                  : "border-border bg-card text-muted-foreground"
            }`}
          >
            <Video className="h-4 w-4" />
            {liveAdminsCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-red-400 ring-2 ring-background" />
            )}
          </button>
          <button
            onClick={() => setShowMembers(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/10 bg-foreground text-background shadow-sm transition hover:opacity-90 active:scale-95"
          >
            <Users className="h-4 w-4" />
          </button>
          {club?.creator_id === currentUser?.id && (
            <button 
              onClick={() => setShowSettings(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/10 bg-foreground text-background shadow-sm transition hover:opacity-90 active:scale-95"
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
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col relative" ref={scrollRef} onScroll={handleScroll}>
        
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
                  <DrawerContent className="mx-auto h-auto max-h-[88dvh] max-w-[680px] overflow-hidden rounded-t-lg border border-border bg-background p-0 shadow-2xl z-[90] [&>div:first-child]:hidden outline-none">
                    <div className="overflow-y-auto bg-background outline-none">

                      {/* Drag Handle */}
                      <div className="flex justify-center pt-4 pb-2">
                        <div className="h-1 w-10 rounded-full bg-border" />
                      </div>

                      {/* Header */}
                      <div className="px-6 pt-2 pb-5">
                        <div className="mb-1.5 flex items-center gap-3">
                          {/* A video camera, not a lightning bolt. These are
                              live rooms — the icon should say what the tool
                              does rather than gesture at energy. */}
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                            <Video className="h-[18px] w-[18px] text-primary-foreground" strokeWidth={1.9} />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-primary">Live club tools</p>
                            <h2 className="text-[19px] font-semibold tracking-tight text-foreground">Interactive Spaces</h2>
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
                                className="group flex w-full items-center gap-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] p-4 text-left transition-all hover:bg-red-500/10 active:scale-[0.99]"
                              >
                                <div className="relative">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-red-500 text-white">
                                    <Radio className="w-6 h-6" />
                                  </div>
                                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-card animate-pulse" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-foreground text-[15px] tracking-tight group-hover:text-red-400 transition-colors">Go Live Now</h3>
                                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Start an instant video session with your community</p>
                                </div>
                                <ArrowRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-red-400 group-hover:translate-x-1 transition-all shrink-0" />
                              </button>

                              {/* ── Schedule Space Card (Admin) ── */}
                              <button
                                onClick={() => setShowScheduleForm(true)}
                                className="group flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40 hover:bg-accent/30 active:scale-[0.99]"
                              >
                                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-primary/15 bg-primary/10">
                                  <CalendarDays className="w-6 h-6 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <h3 className="font-semibold text-foreground text-[15px] tracking-tight group-hover:text-primary transition-colors">Schedule Space</h3>
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
                              className={`group flex w-full items-center gap-4 p-4 text-left outline-none transition-all ${
                                liveAdminsCount > 0
                                  ?"rounded-lg bg-red-500/[0.06] border border-red-500/20 hover:bg-red-500/10 active:scale-[0.99]"
                                  : "rounded-lg bg-muted/30 border border-border opacity-60 cursor-not-allowed"
                              }`}
                            >
                              <div className="relative">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-md text-white ${
                                  liveAdminsCount > 0 ?"bg-red-500" : "bg-muted-foreground/30"
                                }`}>
                                  <Video className="w-6 h-6" />
                                </div>
                                {liveAdminsCount > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-card animate-pulse" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className={`font-semibold text-[15px] tracking-tight transition-colors ${liveAdminsCount > 0 ?"text-foreground group-hover:text-red-400" : "text-muted-foreground"}`}>
                                  {liveAdminsCount > 0 ? "Join Live Space" : "Space is Offline"}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                  {liveAdminsCount > 0 ? "An admin is currently live! Join the interactive space." : "Wait for an admin to start a live session."}
                                </p>
                              </div>
                              {liveAdminsCount > 0 && <ArrowRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-red-400 group-hover:translate-x-1 transition-all shrink-0" />}
                            </button>
                          )}

                          <p className="px-1 pt-2 text-center text-[11px] text-muted-foreground">Live sessions open inside the club and keep members in context.</p>
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
                                className="w-full rounded-md border border-border bg-card px-4 py-3.5 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-primary"
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
                                  className="w-full rounded-md border border-border bg-card px-3 py-3.5 text-sm font-medium text-foreground outline-none transition focus:border-primary"
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
                                  className="w-full rounded-md border border-border bg-card px-3 py-3.5 text-sm font-medium text-foreground outline-none transition focus:border-primary"
                                />
                              </div>
                            </div>

                            {/* Submit button */}
                            <button
                              onClick={handleScheduleSpaceSubmit}
                              className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-md bg-foreground py-3.5 font-semibold tracking-tight text-background transition hover:opacity-90 active:scale-[0.99]"
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
                  <DrawerContent desktopVariant="panel" className="mx-auto h-[92%] max-w-[760px] border-none bg-background px-4 pb-4 pt-1 sm:p-6 sm:pt-8">
                      <DrawerHeader className="mb-3 p-0 text-left sm:mb-6 sm:p-4">
                        <DrawerTitle className="text-[17px] font-semibold sm:text-xl">Club Settings</DrawerTitle>
                        <p className="text-[11px] text-muted-foreground">Manage your community workspace</p>
                      </DrawerHeader>

                      <div className="space-y-6 overflow-y-auto h-full pb-20 no-scrollbar">
                        <div className="flex flex-col mb-2">
                          <div className="group relative h-32 w-full overflow-visible rounded-lg border-2 border-dashed border-border bg-accent/20">
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
                                  className="absolute -right-2 -bottom-2 h-7 w-7 rounded-full bg-primary text-primary-foreground shadow-glow flex items-center justify-center hover:scale-110 transition-transform z-50"
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
                              className="w-full rounded-lg border border-border/60 bg-card px-4 py-3.5 text-sm font-medium text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] text-muted-foreground ml-1">Description</label>
                            <textarea 
                              ref={descRef}
                              value={editClub.description}
                              onChange={e => setEditClub({...editClub, description: e.target.value})}
                              placeholder="What is this club about?"
                              className="min-h-[80px] w-full resize-none rounded-lg border border-border/60 bg-card px-4 py-3.5 text-sm font-medium text-foreground outline-none transition no-scrollbar focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
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
                              className="min-h-[120px] w-full resize-none rounded-lg border border-border/60 bg-card px-4 py-3.5 text-sm font-medium text-foreground outline-none transition no-scrollbar focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                            />
                          </div>
                        </div>

                        {/* ── Access ──────────────────────────────────── */}
                        <div className="space-y-4 pt-4 border-t border-border/50">
                          <h3 className="text-[11px] font-bold text-foreground flex items-center gap-2">
                            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Who gets in
                          </h3>

                          {/* Being findable and being open are different
                              things. A private club is by request either way,
                              so the switch is only offered where it changes
                              something. */}
                          {editClub.is_private ? (
                            <p className="rounded-lg bg-card px-4 py-3.5 text-[11px] leading-relaxed text-muted-foreground">
                              This club is private, so every join is a request you approve. Make it
                              public if you want people to find it on their own.
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setEditClub({ ...editClub, requires_approval: !editClub.requires_approval })
                              }
                              className="flex w-full items-center justify-between gap-3 rounded-lg bg-card px-4 py-3.5 text-left"
                            >
                              <span className="min-w-0">
                                <span className="block text-[13px] font-semibold text-foreground">
                                  {editClub.requires_approval ? "Approve each member" : "Open to everyone"}
                                </span>
                                <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted-foreground">
                                  {editClub.requires_approval
                                    ? "People send a request and wait for you. The club stays public and findable."
                                    : "Anyone who finds the club can join straight away."}
                                </span>
                              </span>
                              <span className={`h-6 w-11 shrink-0 rounded-full p-1 transition ${editClub.requires_approval ? "bg-primary" : "bg-accent"}`}>
                                <span className={`block h-4 w-4 rounded-full bg-background transition-transform ${editClub.requires_approval ? "translate-x-5" : ""}`} />
                              </span>
                            </button>
                          )}
                        </div>

                        <div className="space-y-4 pt-4 border-t border-border/50">
                          <h3 className="text-[11px] font-bold text-foreground flex items-center gap-2">
                            <Wallet className="h-3.5 w-3.5 text-primary" /> Membership
                          </h3>

                          {/* One switch, stated as what it turns ON. "Free
                              access" as a toggle read backwards: switching it
                              on sounded like enabling something, when it was
                              really turning charging off. */}
                          <button
                            type="button"
                            onClick={() => setEditClub({ ...editClub, access_free: !editClub.access_free })}
                            className="flex w-full items-center justify-between gap-3 rounded-lg bg-card px-4 py-3.5 text-left"
                          >
                            <span className="min-w-0">
                              <span className="block text-[13px] font-semibold text-foreground">
                                {editClub.access_free ? "Free access" : "Subscription on"}
                              </span>
                              <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted-foreground">
                                {editClub.access_free
                                  ? "Anyone can join without paying. Your fee is saved for when you switch it back on."
                                  : "Members pay to join. Switch off any time to open the doors without losing the fee."}
                              </span>
                            </span>
                            <span className={`h-6 w-11 shrink-0 rounded-full p-1 transition ${editClub.access_free ? "bg-accent" : "bg-primary"}`}>
                              <span className={`block h-4 w-4 rounded-full bg-background transition-transform ${editClub.access_free ? "" : "translate-x-5"}`} />
                            </span>
                          </button>

                          {/* The amount only matters while the subscription is
                              on, so it steps back when it is not. */}
                          <div className={`space-y-2 transition-opacity ${editClub.access_free ? "opacity-45" : ""}`}>
                            <label className="ml-1 text-[10px] text-muted-foreground">
                              What it costs to join ({walletCurrency.symbol})
                            </label>
                            <input
                              inputMode="decimal"
                              value={editClub.subscription_fee || ""}
                              onChange={(e) =>
                                setEditClub({
                                  ...editClub,
                                  subscription_fee: Number(e.target.value.replace(/[^\d.]/g, "")) || 0,
                                })
                              }
                              placeholder="0"
                              className="w-full rounded-lg border border-border/60 bg-card px-4 py-3.5 text-sm font-semibold tabular-nums text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                            />
                            <p className="ml-1 text-[10.5px] leading-relaxed text-muted-foreground">
                              Charged once from the member's Zero Club wallet and paid straight into
                              yours. Nobody gets in without paying — unless you add them by username.
                            </p>
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
                                  className="flex-1 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
                                />
                                <button 
                                  onClick={() => setEditRooms(editRooms.filter((_, idx) => idx !== i))}
                                  className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive transition hover:bg-destructive/20"
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
                              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2.5 text-xs font-semibold text-primary transition hover:bg-primary/5"
                            >
                              <Plus className="h-3.5 w-3.5" /> Add Section
                            </button>
                          </div>
                        </div>

                        <div className="pt-4 space-y-3">
                          <button 
                            onClick={handleUpdateClub}
                            disabled={isUpdating}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground py-4 font-semibold text-background transition hover:opacity-90 active:scale-[0.98]"
                          >
                            <Save className="h-4 w-4" /> {isUpdating ? "Saving..." : "Save Changes"}
                          </button>
                          <button 
                            onClick={handleDeleteClub}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 py-4 font-semibold text-destructive transition active:bg-destructive/20"
                          >
                            <Trash2 className="h-4 w-4" /> Delete Club
                          </button>
                        </div>
                      </div>
                    </DrawerContent>
                  </Drawer>
                )}

                {/* repositionInputs={false}
                    Vaul's default is to shove the whole drawer upwards by the
                    keyboard height whenever an input takes focus. This drawer
                    is already 88dvh tall, so that push carried the top of the
                    panel — the search field and the first results — clean off
                    the screen the moment you started typing a username.

                    The lift is unnecessary here anyway: the search sits at the
                    top of its panel and the results scroll beneath it, so the
                    keyboard was never covering the field to begin with. */}
                <Drawer repositionInputs={false} open={showMembers} onOpenChange={(open) => {
                  setShowMembers(open);
                  if (!open) {
                    setSelectedMember(null);
                    setSquadActionMember(null);
                    // Reopening should land on the squad, not on a stale
                    // search from last time.
                    setShowAddPanel(false);
                    setAddQuery("");
                  }
                }}>
                  <DrawerContent desktopVariant="panel" className="mx-auto flex h-[88dvh] max-w-[760px] flex-col overflow-hidden border-none bg-background p-4 sm:h-[85%] sm:p-6">
                    {/* Second guard. Focusing an input makes the browser call
                        scrollIntoView, which walks up and scrolls the nearest
                        scrollable ancestor — including one with
                        overflow-hidden, which then stays offset with no
                        scrollbar to drag it back. Forcing it to zero means the
                        panel cannot drift out of frame. */}
                    <div
                      className="relative w-full h-full overflow-hidden"
                      onScroll={(event) => {
                        const el = event.currentTarget;
                        if (el.scrollTop !== 0) el.scrollTop = 0;
                        if (el.scrollLeft !== 0) el.scrollLeft = 0;
                      }}
                    >
                      {/* Three panels now: the squad, one member's settings, and
                          adding someone. Each gets the drawer's full height,
                          which on a phone is the difference between a usable
                          screen and a cramped strip. */}
                      <div
                        className="flex w-[300%] h-full transition-transform duration-300 ease-in-out"
                        style={{
                          transform: selectedMember
                            ? 'translateX(-33.3333%)'
                            : showAddPanel
                              ? 'translateX(-66.6667%)'
                              : 'translateX(0%)',
                        }}
                      >
                        {/* PANEL 1: CLUB SQUAD MEMBER LIST */}
                        <div data-vaul-no-drag className="h-full w-1/3 shrink-0 touch-pan-y overflow-y-auto overscroll-contain px-1 no-scrollbar">
                          <DrawerHeader className="mb-3 shrink-0 p-0 pr-10 text-left sm:mb-6 sm:p-4 sm:pr-10">
                            <DrawerTitle className="text-[18px] font-semibold tracking-tight sm:text-2xl">Club Squad</DrawerTitle>
                            <p className="text-xs text-muted-foreground">The team building {club?.name}</p>
                          </DrawerHeader>

                          {/* Sharing is for everyone in the squad. Any member
                              can bring a friend to a club they belong to —
                              that is how a club grows. Adding someone outright
                              stays with admins, below. */}
                          {club && (
                            <div className="mb-6 shrink-0 rounded-lg border border-border/70 bg-card p-4">
                              <p className="text-left text-sm font-bold text-foreground">Invite a friend</p>
                              <p className="mt-0.5 text-left text-[10px] text-muted-foreground">
                                Share {club.name} with anyone — they can join from the link.
                              </p>
                              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                                <button
                                  onClick={handleShareInvite}
                                  className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-xs font-bold text-primary-foreground transition hover:opacity-90 active:scale-[0.98]"
                                >
                                  <Share2 className="h-3.5 w-3.5" /> Share link
                                </button>
                                <button
                                  onClick={handleCopyInvite}
                                  title="Copy invite link"
                                  aria-label="Copy invite link"
                                  className="flex h-10 w-11 items-center justify-center rounded-lg border border-border bg-accent/30 text-foreground transition hover:bg-accent/50 active:scale-95"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Opens a full-height panel rather than expanding
                              inline. Inline, the results pushed the member list
                              down and the Android keyboard covered them the
                              moment you started typing. */}
                          {isAdmin && (
                            <button
                              onClick={() => setShowAddPanel(true)}
                              className="mb-4 flex w-full shrink-0 items-center gap-3 rounded-lg border border-border/70 bg-card p-4 text-left transition active:scale-[0.99] hover:bg-accent/30"
                            >
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                                <UserPlus className="h-[18px] w-[18px]" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-foreground">Add a builder</span>
                                <span className="block text-[10px] text-muted-foreground">
                                  Search anyone on Zero Club and add them
                                </span>
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </button>
                          )}

                          <div className="relative mb-4 shrink-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                              type="text"
                              placeholder="Find a builder..."
                              value={squadSearch}
                              onChange={(e) => setSquadSearch(e.target.value)}
                              className="h-10 w-full rounded-lg border border-border/60 bg-card pl-9 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                            />
                          </div>

                          <div className="space-y-3 pb-10 flex-1">
                            {[...members]
                              .filter(m => {
                                if (!squadSearch) return true;
                                const searchLower = squadSearch.toLowerCase();
                                const name = m.profiles?.full_name?.toLowerCase() || m.profiles?.username?.toLowerCase() || "";
                                return name.includes(searchLower);
                              })
                              .sort((a, b) => {
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
                                  className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card p-3 transition hover:border-primary/40 hover:bg-accent/20 sm:p-4"
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => openMemberProfile(m.profiles, m.profile_id)}
                                        className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border/50 bg-muted shadow-sm transition hover:ring-2 hover:ring-foreground/20 active:scale-95"
                                        aria-label={`View ${m.profiles?.full_name || m.profiles?.username || 'member'} profile`}
                                      >
                                          {m.profiles?.avatar_url ? (
                                            <img src={m.profiles.avatar_url} className="h-full w-full object-cover" />
                                          ) : (
                                            <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                              {m.profiles?.username?.[0]?.toUpperCase()}
                                            </div>
                                          )}
                                          {isUserOnline(m.profiles) && (
                                            <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success border-2 border-[#0A0A0E]" />
                                          )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setSquadActionMember(m)}
                                        className="min-w-0 flex-1 text-left active:opacity-70"
                                      >
                                        <div className="min-w-0 text-left">
                                          <div className="truncate text-sm font-bold text-foreground">
                                            {m.profiles?.full_name || m.profiles?.username}
                                          </div>
                                          <div className={`mt-1 inline-block px-2 py-0.5 rounded text-[8px] ${getRoleColor(m.role)}`}>
                                            {m.role}
                                          </div>
                                        </div>
                                      </button>
                                  </div>

                                  <div className="flex shrink-0 items-center gap-2">
                                        {m.profile_id === club?.creator_id ? (
                                          <span className="text-[8px] text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full bg-amber-500/5">
                                            Creator
                                          </span>
                                        ) : (
                                          canEditMember && (
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedMember(m);
                                              }}
                                              className="text-xs font-semibold text-primary hover:underline transition px-2.5 py-1 relative z-10"
                                            >
                                              Edit
                                            </button>
                                          )
                                        )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* PANEL 2: MEMBER SETTINGS VIEW */}
                        <div data-vaul-no-drag className="h-full w-1/3 shrink-0 touch-pan-y overflow-y-auto overscroll-contain px-2 no-scrollbar">
                          <div className="shrink-0 flex flex-col gap-4 mb-6 pr-10">
                            <button 
                              onClick={() => setSelectedMember(null)}
                              className="self-start flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition py-1 px-2.5 rounded-full bg-accent/20 border border-border"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" /> Back to Squad
                            </button>
                            
                            <div className="text-left">
                              <h3 className="text-[19px] font-semibold tracking-tight text-foreground">Member Settings</h3>
                              <p className="text-xs text-muted-foreground">Modify squad privileges and roles</p>
                            </div>
                          </div>

                          {selectedMember && (
                            <div className="mb-6 flex shrink-0 items-center gap-4 rounded-lg border border-border/70 bg-card p-4">
                              <button
                                type="button"
                                onClick={() => openMemberProfile(selectedMember.profiles, selectedMember.profile_id)}
                                className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted transition hover:ring-2 hover:ring-foreground/20 active:scale-95"
                                aria-label="View member profile"
                              >
                                {selectedMember.profiles?.avatar_url ? (
                                  <img src={selectedMember.profiles.avatar_url} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base">
                                    {selectedMember.profiles?.username?.[0]?.toUpperCase()}
                                  </div>
                                )}
                              </button>
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
                                  className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3.5 text-left transition ${
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
                                    <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
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
                                className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 py-3.5 text-xs font-semibold text-destructive transition hover:bg-destructive/20 active:scale-95"
                              >
                                <UserX className="h-4 w-4" /> Remove From Squad
                              </button>
                            </div>
                          )}
                        </div>

                        {/* PANEL 3: ADD A BUILDER
                            A column, not a scrolling block: the header and
                            search stay put while only the results scroll, so
                            the field never slides away under your thumb while
                            you are typing into it. */}
                        <div data-vaul-no-drag className="flex h-full w-1/3 shrink-0 flex-col px-2">
                          <div className="shrink-0 pr-10">
                            <button
                              onClick={() => { setShowAddPanel(false); setAddQuery(""); }}
                              className="mb-4 flex items-center gap-1.5 self-start rounded-full border border-border bg-accent/20 px-2.5 py-1 text-xs font-bold text-muted-foreground transition hover:text-foreground"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" /> Back to Squad
                            </button>
                            <h3 className="text-left text-lg font-bold tracking-tight">Add a builder</h3>
                            <p className="mb-4 text-left text-xs text-muted-foreground">
                              They join {club?.name} straight away and get a notification.
                            </p>

                            <div className="relative mb-3">
                              <UserPlus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <input
                                type="text"
                                inputMode="search"
                                autoComplete="off"
                                placeholder="Search @username or name"
                                value={addQuery}
                                onChange={(e) => setAddQuery(e.target.value)}
                                className="h-12 w-full rounded-lg border border-border/60 bg-card pl-9 pr-9 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                              />
                              {addQuery && (
                                <button
                                  onClick={() => setAddQuery("")}
                                  aria-label="Clear search"
                                  className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-accent"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Only this scrolls, and it keeps room beneath the
                              last row so the keyboard cannot bury it. */}
                          <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain pb-[40vh] no-scrollbar">
                            {addQuery.trim().length < 2 ? (
                              <div className="pt-10 text-center">
                                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent/30 text-muted-foreground">
                                  <UserPlus className="h-5 w-5" />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Type at least 2 letters to search
                                </p>
                              </div>
                            ) : addSearching ? (
                              /* Skeletons rather than a spinner, so the rows do
                                 not jump into place as results land. */
                              <div className="space-y-2">
                                {[0, 1, 2].map((i) => (
                                  <div key={i} className="flex items-center gap-3 rounded-lg bg-card p-3">
                                    <div className="h-10 w-10 shrink-0 rounded-full bg-foreground/[0.06] shimmer" />
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                      <div className="h-3 w-2/3 rounded bg-foreground/[0.06] shimmer" />
                                      <div className="h-2.5 w-1/3 rounded bg-foreground/[0.05] shimmer" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : addError ? (
                              <div className="pt-10 text-center">
                                <p className="text-sm font-semibold text-destructive">Search could not run</p>
                                <p className="mx-auto mt-1 max-w-[36ch] text-xs leading-relaxed text-muted-foreground">
                                  {addError}
                                </p>
                              </div>
                            ) : addResults.length === 0 ? (
                              <div className="pt-10 text-center">
                                <p className="text-sm font-semibold text-foreground">No one new found</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  They may already be in the squad, or try a different spelling.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {addResults.map((person) => (
                                  <div
                                    key={person.id}
                                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3"
                                  >
                                    <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-sm font-bold text-muted-foreground">
                                      {person.avatar_url ? (
                                        <img src={person.avatar_url} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        (person.full_name || person.username || "?").charAt(0).toUpperCase()
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1 text-left">
                                      <p className="truncate text-sm font-bold text-foreground">
                                        {person.full_name || person.username}
                                      </p>
                                      <p className="truncate text-[11px] text-muted-foreground">@{person.username}</p>
                                    </div>
                                    <button
                                      onClick={() => handleAddMember(person)}
                                      disabled={addingId !== null}
                                      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground transition hover:opacity-90 active:scale-95 disabled:opacity-50"
                                    >
                                      {addingId === person.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Plus className="h-3.5 w-3.5" />
                                      )}
                                      Add
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {squadActionMember && (
                        <div
                          className="absolute inset-0 z-50 flex items-end bg-background/55 backdrop-blur-sm"
                          onClick={() => setSquadActionMember(null)}
                        >
                          <div
                            className="w-full border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
                              <button
                                type="button"
                                onClick={() => openMemberProfile(squadActionMember.profiles, squadActionMember.profile_id)}
                                className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted transition hover:ring-2 hover:ring-foreground/20 active:scale-95"
                                aria-label="View member profile"
                              >
                                {squadActionMember.profiles?.avatar_url ? (
                                  <img src={squadActionMember.profiles.avatar_url} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="grid h-full w-full place-items-center bg-primary/10 text-sm font-bold text-primary">
                                    {squadActionMember.profiles?.username?.[0]?.toUpperCase()}
                                  </div>
                                )}
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-foreground">{squadActionMember.profiles?.full_name || squadActionMember.profiles?.username}</p>
                                <p className="truncate text-xs text-muted-foreground">{getFirstName(squadActionMember.profiles)}</p>
                              </div>
                              <button
                                onClick={() => setSquadActionMember(null)}
                                className="grid h-9 w-9 place-items-center rounded-md bg-accent text-muted-foreground"
                                aria-label="Close member actions"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="space-y-2">
                              <button
                                onClick={() => navigate({ to: `/app/profile/${squadActionMember.profiles?.username}` })}
                                className="flex h-12 w-full items-center gap-3 rounded-md bg-card px-4 text-sm font-semibold text-foreground transition active:bg-accent"
                              >
                                <User className="h-4 w-4 fill-current text-primary" />
                                View Profile
                              </button>
                              {squadActionMember.profile_id !== currentUser?.id && (
                                <button
                                  onClick={() => navigate({ to: `/app/chat/${squadActionMember.profile_id}` })}
                                  className="flex h-12 w-full items-center gap-3 rounded-md bg-card px-4 text-sm font-semibold text-foreground transition active:bg-accent"
                                >
                                  <MessageSquare className="h-4 w-4 fill-current text-primary" />
                                  Message Builder
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </DrawerContent>
                </Drawer>

            <Drawer open={showGiveaway} onOpenChange={setShowGiveaway}>
              <DrawerContent desktopVariant="panel" className="mx-auto max-w-[680px] overflow-hidden border border-border bg-background p-0 shadow-2xl">
                <DrawerHeader className="border-b border-border px-5 pb-3 pt-0 text-left sm:px-7 sm:pb-4 sm:pt-2">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground text-background">
                      <Gift className="h-5 w-5 fill-current" />
                    </div>
                    <div className="min-w-0">
                      <DrawerTitle className="text-[18px] font-semibold tracking-tight">Create a giveaway</DrawerTitle>
                      <DrawerDescription className="mt-1 text-xs leading-5">The complete prize pool is reserved when you publish.</DrawerDescription>
                    </div>
                  </div>
                </DrawerHeader>

                <div className="space-y-3 px-5 py-4 sm:px-7 sm:py-5">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-foreground">Giveaway title</span>
                    <input
                      value={giveaway.title}
                      onChange={(event) => setGiveaway((current) => ({ ...current, title: event.target.value }))}
                      maxLength={80}
                      placeholder="Community build challenge"
                      className="h-10 w-full rounded-md border border-border bg-card px-3.5 text-sm outline-none transition focus:border-foreground"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-xs font-semibold text-foreground">Prize per winner</span>
                      <div className="flex h-10 items-center rounded-md border border-border bg-card focus-within:border-foreground">
                        <span className="border-r border-border px-3 text-xs font-semibold text-muted-foreground">{walletCurrency.symbol}</span>
                        <input
                          type="number"
                          min={walletCurrency.rate === 1 ? 1 : 0.01}
                          step={walletCurrency.rate === 1 ? 1 : 0.01}
                          value={giveaway.amountPerWinner ?? ""}
                          onChange={(event) => setGiveaway((current) => ({ ...current, amountPerWinner: event.target.value === "" ? undefined : Number(event.target.value) }))}
                          placeholder="25000"
                          className="min-w-0 flex-1 bg-transparent px-3 text-sm tabular-nums outline-none"
                        />
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-xs font-semibold text-foreground">Winners</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={giveaway.winners}
                        onChange={(event) => setGiveaway((current) => ({ ...current, winners: Number(event.target.value) }))}
                        className="h-10 w-full rounded-md border border-border bg-card px-3.5 text-sm outline-none transition focus:border-foreground"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-foreground">Details</span>
                    <textarea
                      value={giveaway.description}
                      onChange={(event) => setGiveaway((current) => ({ ...current, description: event.target.value }))}
                      maxLength={320}
                      rows={2}
                      placeholder="Explain how members qualify and what the winner receives."
                      className="w-full resize-none rounded-md border border-border bg-card px-3.5 py-2.5 text-sm leading-5 outline-none transition focus:border-foreground"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-foreground">Closes</span>
                    <input
                      type="datetime-local"
                      value={giveaway.endsAt}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={(event) => setGiveaway((current) => ({ ...current, endsAt: event.target.value }))}
                      className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none transition focus:border-foreground"
                    />
                  </label>

                  <div className={`flex items-center justify-between gap-4 rounded-md border px-3.5 py-3 ${giveawayTotalBase > 0 && !canFundGiveaway ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/40"}`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <WalletCards className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium text-muted-foreground">Locked when published</p>
                        <p className="truncate text-sm font-semibold tabular-nums">{formatWalletAmount(giveawayTotalBase)}</p>
                      </div>
                    </div>
                    <p className={`shrink-0 text-right text-[10px] ${giveawayTotalBase > 0 && !canFundGiveaway ? "text-destructive" : "text-muted-foreground"}`}>
                      Wallet<br /><strong className="font-semibold text-foreground">{formatWalletAmount(Number(currentUserProfile?.coins || 0))}</strong>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateGiveaway}
                    disabled={isCreatingGiveaway || !giveaway.title.trim() || !giveaway.endsAt || !canFundGiveaway}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
                  >
                    {isCreatingGiveaway ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4 fill-current" />}
                    {isCreatingGiveaway ? "Publishing..." : "Publish giveaway"}
                  </button>
                </div>
              </DrawerContent>
            </Drawer>

            <Drawer open={showRoomSwitcher} onOpenChange={setShowRoomSwitcher}>
              <DrawerContent className="border-t border-border/40 bg-background/95 backdrop-blur-xl">
                <div className="px-4 pb-8 pt-1 sm:px-5 sm:pb-10 sm:pt-6">
                  <DrawerHeader className="mb-3 px-0 pt-0 text-left sm:mb-6">
                    <DrawerTitle className="text-[17px] font-semibold tracking-tight text-foreground sm:text-[19px]">Channels</DrawerTitle>
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
                        className={`flex w-full items-center justify-between rounded-lg border p-4 transition active:scale-[0.98] ${
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
                    <button
                      onClick={() => {
                        setShowRoomSwitcher(false);
                        navigate({ to: "/app/clubs/quizzes/$clubId", params: { clubId: clubId || club?.id || "" } });
                      }}
                      className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-card p-4 transition hover:bg-accent/40 active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-xl bg-muted text-muted-foreground">
                          <ClipboardCheck className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-bold text-foreground">Quiz</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
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
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
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
        <div className="sticky top-0 z-30 mt-1 flex shrink-0 gap-0.5 overflow-x-auto border-b border-border bg-background/95 px-1 pt-1 shadow-sm backdrop-blur-xl no-scrollbar sm:gap-2 sm:px-2">
          {(club?.rooms?.length > 0 ? club.rooms : defaultRooms).map((room: any) => (
            <button
              key={room.id}
              onClick={() => setActiveRoom(room.id)}
              className={`flex-none whitespace-nowrap border-b-[3px] px-2 py-3 text-center text-[10.5px] font-semibold transition-all min-[390px]:text-xs sm:px-4 sm:text-sm ${
                activeRoom === room.id 
                  ?"border-primary text-foreground font-bold" 
                  : "border-transparent text-muted-foreground hover:text-foreground/80"
              }`}
            >
              {room.name}
            </button>
          ))}
          <button
            onClick={() => navigate({ to: "/app/clubs/quizzes/$clubId", params: { clubId: clubId || club?.id || "" } })}
            className="flex-none whitespace-nowrap border-b-[3px] border-transparent px-2 py-3 text-center text-[10.5px] font-semibold text-muted-foreground transition-all hover:text-foreground/80 min-[390px]:text-xs sm:px-4 sm:text-sm"
          >
            Quiz
          </button>
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
          <div className="relative w-full max-w-sm bg-gradient-to-b from-card to-card/90 rounded-[28px] shadow-lift ring-1 ring-border overflow-hidden flex flex-col max-h-[70vh]">
            <div className="px-5 py-4 border-b hairline flex items-center justify-between">
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
                className="h-7 w-7 rounded-full bg-foreground/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
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
                className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-2xl shadow-glow transition active:scale-95"
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

      {['assignments', 'announcements', 'q-and-a'].includes(activeRoom) ? (
        <main className="w-full shrink-0 px-4 py-5 md:px-6 md:py-7">
          <StructuredClubRoom
            key={activeRoom}
            room={activeRoom}
            messages={messages}
            isAdmin={isAdmin}
            currentUser={currentUser}
            onPost={handleSendMessage}
          />
        </main>
      ) : (
        <main className="mt-auto flex w-full shrink-0 flex-col px-4 py-3">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center opacity-60">
              <Hash className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-bold text-muted-foreground">No messages yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Be the first to post in #{activeRoom}</p>
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
              isAdmin={isAdmin}
            />
          ))}
        </main>
      )}
      </div>

      {/* Input */}
      {!['assignments', 'announcements', 'q-and-a'].includes(activeRoom) && (
      <div className="z-10 w-full shrink-0 border-t border-border bg-background px-3 py-2.5">
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
              <div key={idx} className={`relative shrink-0 overflow-hidden rounded-lg border border-border bg-card ${mediaFiles[idx]?.type.startsWith('audio/') || (!mediaFiles[idx]?.type.startsWith('image/') && !mediaFiles[idx]?.type.startsWith('video/')) ? 'min-w-[190px] p-2 pr-7' : 'h-16 w-16'}`}>
                {mediaFiles[idx]?.type.startsWith('audio/') ? (
                  <audio src={preview} controls className="h-10 w-[180px]" />
                ) : mediaFiles[idx]?.type.startsWith('video/') ? (
                  <video src={preview} className="h-full w-full object-cover" />
                ) : mediaFiles[idx]?.type.startsWith('image/') ? (
                  <img src={preview} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-10 items-center gap-2 px-1"><FileText className="h-5 w-5 shrink-0 text-primary" /><span className="max-w-[130px] truncate text-[11px] font-medium">{mediaFiles[idx]?.name}</span></div>
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

          <ClubMessageComposer
            placeholder={activeRoom === "general" ? "Write a message..." : `Post in ${activeRoom}...`}
            hasMedia={mediaFiles.length > 0}
            members={members}
            onSend={(text) => handleSendMessage(text)}
            controls={
              <>
                <input
                  type="file"
                  ref={mediaInputRef}
                  onChange={handleChatMediaUpload}
                  className="hidden"
                  multiple
                  accept="image/*"
                />
                <input type="file" ref={videoInputRef} onChange={handleChatMediaUpload} className="hidden" multiple accept="video/*" />
                <input type="file" ref={documentInputRef} onChange={handleChatMediaUpload} className="hidden" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv,application/*" />
                <button
                  onClick={toggleVoiceRecording}
                  title={isRecording ? "Stop recording" : "Record voice note"}
                  className={`relative inline-flex h-8 items-center justify-center rounded-full transition active:scale-95 ${isRecording ? "min-w-12 bg-red-500 px-2 text-white" : "w-8 text-muted-foreground hover:text-foreground"}`}
                >
                  {isRecording ? <><Square className="h-3.5 w-3.5 fill-current" /><span className="ml-1 text-[9px] tabular-nums">{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}</span></> : <Mic className="h-4 w-4" />}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button title="Add attachment" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:text-foreground active:scale-95"><Paperclip className="h-4 w-4" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="z-[100] w-44 border-border bg-background/95 shadow-lift backdrop-blur-xl">
                    <DropdownMenuItem onSelect={() => mediaInputRef.current?.click()} className="gap-2.5"><Image className="h-4 w-4" /> Pictures</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => videoInputRef.current?.click()} className="gap-2.5"><Film className="h-4 w-4" /> Video</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => documentInputRef.current?.click()} className="gap-2.5"><File className="h-4 w-4" /> File</DropdownMenuItem>
                    {isAdmin && activeRoom === "general" && <DropdownMenuItem onSelect={() => setShowGiveaway(true)} className="gap-2.5"><Gift className="h-4 w-4 fill-current" /> Give Away</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
        </div>
      </div>
      )}
    </div>
  );
}

const CLUB_CARD_PREFIX = '::ZEROCLUB_CARD::';
const CLUB_REPLY_PREFIX = '::ZEROCLUB_REPLY::';

type ClubCardPayload = {
  type: 'announcement' | 'assignment' | 'question';
  title: string;
  body: string;
  dueDate?: string;
};

const encodeClubCard = (payload: ClubCardPayload) => `${CLUB_CARD_PREFIX}${JSON.stringify(payload)}`;
const encodeClubReply = (type: 'submission' | 'answer', body: string) => `${CLUB_REPLY_PREFIX}${JSON.stringify({ type, body })}`;

const parseClubCard = (message: any, room: string): ClubCardPayload => {
  const raw = String(message?.content || '');
  if (raw.startsWith(CLUB_CARD_PREFIX)) {
    try {
      return JSON.parse(raw.slice(CLUB_CARD_PREFIX.length));
    } catch {
      // Older malformed room posts still remain readable below.
    }
  }

  const [firstLine, ...rest] = raw.split('\n').filter(Boolean);
  return {
    type: room === 'assignments' ? 'assignment' : room === 'q-and-a' ? 'question' : 'announcement',
    title: firstLine || (room === 'assignments' ? 'Assignment' : room === 'q-and-a' ? 'Question' : 'Announcement'),
    body: rest.join('\n') || firstLine || '',
  };

};

const parseClubReply = (message: any) => {
  const raw = String(message?.content || '');
  if (raw.startsWith(CLUB_REPLY_PREFIX)) {
    try {
      return JSON.parse(raw.slice(CLUB_REPLY_PREFIX.length)) as { type: 'submission' | 'answer'; body: string };
    } catch {
      // Fall through to legacy plain-text replies.
    }
  }
  return { type: 'answer' as const, body: raw };
};

function StructuredClubRoom({ room, messages, isAdmin, currentUser, onPost }: any) {
  const [showComposer, setShowComposer] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [threadReply, setThreadReply] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cards = messages.filter((message: any) => !message.reply_to_id);
  const roomMeta = room === 'assignments'
    ? {
        label: 'Classwork',
        description: 'Assignments, briefs, and student submissions stay organised here.',
        emptyTitle: 'No classwork yet',
        emptyCopy: isAdmin ? 'Create the first assignment for this club.' : 'Assignments from your tutor will appear here.',
        action: 'New assignment',
        icon: ClipboardCheck,
      }
    : room === 'q-and-a'
      ? {
          label: 'Questions & answers',
          description: 'Each question has one focused thread, so useful answers are easy to find.',
          emptyTitle: 'No questions yet',
          emptyCopy: 'Start the first focused question for this club.',
          action: 'Ask a question',
          icon: HelpCircle,
        }
      : {
          label: 'Announcements',
          description: 'Official updates from club admins, kept clear of everyday conversation.',
          emptyTitle: 'No announcements yet',
          emptyCopy: isAdmin ? 'Publish the first update for your members.' : 'Official club updates will appear here.',
          action: 'New announcement',
          icon: Megaphone,
        };

  const RoomIcon = roomMeta.icon;
  const canCreate = room === 'q-and-a' || isAdmin;

  const resetComposer = () => {
    setTitle('');
    setBody('');
    setDueDate('');
    setShowComposer(false);
  };

  const submitCard = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error(room === 'q-and-a' ? 'Add a clear question and some context.' : 'Add a title and details first.');
      return;
    }

    setIsSubmitting(true);
    const type = room === 'assignments' ? 'assignment' : room === 'q-and-a' ? 'question' : 'announcement';
    await onPost(encodeClubCard({ type, title: title.trim(), body: body.trim(), dueDate: dueDate || undefined }), null);
    resetComposer();
    setIsSubmitting(false);
  };

  const submitThreadReply = async () => {
    if (!threadReply.trim() || !selectedCard) return;
    setIsSubmitting(true);
    await onPost(encodeClubReply(room === 'assignments' ? 'submission' : 'answer', threadReply.trim()), selectedCard.id);
    setThreadReply('');
    setIsSubmitting(false);
  };

  return (
    <section className="mx-auto w-full min-w-0 max-w-[760px] overflow-hidden">
      <div className="mb-5 flex flex-col gap-4 border-b border-border pb-5 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <RoomIcon className="h-5 w-5 fill-current" />
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">{roomMeta.label}</h3>
            <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">{roomMeta.description}</p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowComposer((open) => !open)}
            className="flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-foreground px-3.5 text-xs font-semibold text-background transition hover:opacity-90 active:scale-[0.98] sm:w-auto"
          >
            {showComposer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span>{showComposer ? 'Close' : roomMeta.action}</span>
          </button>
        )}
      </div>

      {!canCreate && room === 'announcements' && (
        <div className="mb-5 flex items-center gap-2 border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <LockKeyhole className="h-4 w-4 shrink-0 text-primary" />
          Only club admins can publish here. Members can read every update.
        </div>
      )}

      {showComposer && canCreate && (
        <div className="mb-6 max-w-full overflow-hidden border border-border bg-card p-3 sm:p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <RoomIcon className="h-4 w-4 text-primary" />
            {roomMeta.action}
          </div>
          <div className="space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={room === 'q-and-a' ? 'What do you need help with?' : room === 'assignments' ? 'Assignment title' : 'Announcement title'}
              className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3.5 text-sm outline-none transition focus:border-primary"
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={room === 'q-and-a' ? 'Add enough context for the club to give a useful answer...' : room === 'assignments' ? 'Add the brief, instructions, and expected outcome...' : 'Write the update for club members...'}
              className="min-h-28 w-full min-w-0 resize-y rounded-md border border-border bg-background px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-primary"
            />
            {room === 'assignments' && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="h-11 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none transition focus:border-primary sm:max-w-[240px]"
                />
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button
                onClick={submitCard}
                disabled={isSubmitting || !title.trim() || !body.trim()}
                className="h-10 w-full rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-40 sm:w-auto"
              >
                {isSubmitting ? 'Posting...' : room === 'q-and-a' ? 'Post question' : room === 'assignments' ? 'Create assignment' : 'Publish announcement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center border border-dashed border-border bg-card/40 px-6 text-center">
          <RoomIcon className="mb-4 h-9 w-9 text-muted-foreground/45" />
          <p className="text-sm font-semibold text-foreground">{roomMeta.emptyTitle}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{roomMeta.emptyCopy}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((message: any) => {
            const card = parseClubCard(message, room);
            const replyCount = messages.filter((candidate: any) => candidate.reply_to_id === message.id).length;
            const author = message.profiles?.full_name || message.profiles?.username || 'Club admin';
            const interactive = room !== 'announcements';

            return (
              <article
                key={message.id}
                onClick={() => interactive && setSelectedCard(message)}
                onKeyDown={(event) => {
                  if (interactive && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    setSelectedCard(message);
                  }
                }}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                className={`w-full max-w-full overflow-hidden border border-border bg-card p-3 text-left transition sm:p-5 ${interactive ? 'hover:border-primary/40 hover:bg-accent/20 active:scale-[0.995]' : 'cursor-default'}`}
              >
                <div className="flex min-w-0 items-start gap-2.5 sm:gap-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary sm:h-10 sm:w-10">
                    {room === 'assignments' ? <FileText className="h-5 w-5 fill-current" /> : room === 'q-and-a' ? <HelpCircle className="h-5 w-5 fill-current" /> : <Megaphone className="h-5 w-5 fill-current" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="break-words text-[15px] font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">{card.title}</h4>
                      {interactive && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{card.body}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <Link
                        to="/app/profile/$id"
                        params={{ id: message.profiles?.username || message.profile_id }}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="flex items-center gap-1.5 font-medium text-foreground transition hover:opacity-70"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[8px]">
                          {message.profiles?.avatar_url ? <img src={message.profiles.avatar_url} className="h-full w-full object-cover" /> : author.substring(0, 1).toUpperCase()}
                        </span>
                        <span>{author}</span>
                      </Link>
                      <span>{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</span>
                      {card.dueDate && <span className="font-medium text-foreground">Due {new Date(`${card.dueDate}T12:00:00`).toLocaleDateString()}</span>}
                      {interactive && <span className="font-medium text-primary">{replyCount} {room === 'assignments' ? 'submissions' : 'answers'}</span>}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Drawer open={Boolean(selectedCard)} onOpenChange={(open) => !open && setSelectedCard(null)}>
        <DrawerContent desktopVariant="panel" className="mx-auto h-[94dvh] max-w-[760px] overflow-hidden border border-border bg-background p-0 shadow-2xl sm:h-[90dvh]">
          {selectedCard && (() => {
            const card = parseClubCard(selectedCard, room);
            const replies = messages.filter((message: any) => message.reply_to_id === selectedCard.id);
            return (
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <DrawerHeader className="border-b border-border px-4 pb-3 pt-1 text-left sm:px-6 sm:pb-5 sm:pt-7">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-primary">
                    {room === 'assignments' ? <BookOpenCheck className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
                    {room === 'assignments' ? 'Assignment details' : 'Question thread'}
                  </div>
                  <DrawerTitle className="break-words pr-8 text-[17px] font-semibold leading-6 [overflow-wrap:anywhere] sm:text-xl sm:leading-7">{card.title}</DrawerTitle>
                  {card.dueDate && <p className="mt-1 text-xs font-medium text-muted-foreground">Due {new Date(`${card.dueDate}T12:00:00`).toLocaleDateString()}</p>}
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{card.body}</p>
                </DrawerHeader>

                <div className="px-4 py-5 sm:px-6">
                  <h5 className="mb-4 text-sm font-semibold text-foreground">{room === 'assignments' ? `Submissions (${replies.length})` : `Answers (${replies.length})`}</h5>
                  {replies.length === 0 ? (
                    <div className="border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
                      {room === 'assignments' ? 'No submissions yet.' : 'No answers yet. Add the first useful response.'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {replies.map((reply: any) => {
                        const parsedReply = parseClubReply(reply);
                        const author = reply.profiles?.full_name || reply.profiles?.username || (reply.profile_id === currentUser?.id ? 'You' : 'Member');
                        return (
                          <article key={reply.id} className="border-l-2 border-primary bg-card px-4 py-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <Link
                                to="/app/profile/$id"
                                params={{ id: reply.profiles?.username || reply.profile_id }}
                                className="flex min-w-0 items-center gap-2 text-xs font-semibold text-foreground transition hover:opacity-70"
                              >
                                <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[9px]">
                                  {reply.profiles?.avatar_url ? <img src={reply.profiles.avatar_url} className="h-full w-full object-cover" /> : author.substring(0, 1).toUpperCase()}
                                </span>
                                <span className="truncate">{author}</span>
                              </Link>
                              <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}</span>
                            </div>
                            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{parsedReply.body}</p>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
                </div>

                <div className="border-t border-border bg-background p-4 sm:p-5">
                  <label className="mb-2 block text-xs font-semibold text-foreground">{room === 'assignments' ? 'Submit your work' : 'Contribute an answer'}</label>
                  <div className="flex items-end gap-2">
                    <textarea
                      value={threadReply}
                      onChange={(event) => setThreadReply(event.target.value)}
                      placeholder={room === 'assignments' ? 'Add your submission, work link, or notes...' : 'Write a focused, helpful answer...'}
                      rows={2}
                      className="min-h-12 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2.5 text-sm outline-none transition focus:border-primary"
                    />
                    <button
                      onClick={submitThreadReply}
                      disabled={!threadReply.trim() || isSubmitting}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40"
                      aria-label={room === 'assignments' ? 'Submit assignment' : 'Post answer'}
                    >
                      <Send className="h-4 w-4 fill-current" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DrawerContent>
      </Drawer>
    </section>
  );
}

function MessageBubble({ message, isMe, currentUser, members, repliedMessage, onReply, onReact, getRoleColor, room, isAdmin }: any) {
  const navigate = useNavigate();
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [showAwardGiveaway, setShowAwardGiveaway] = useState(false);
  const [selectedWinnerIds, setSelectedWinnerIds] = useState<string[]>([]);
  const [isAwardingGiveaway, setIsAwardingGiveaway] = useState(false);
  const { format: formatWalletAmount } = useWalletCurrency();
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
  const giveaway = parseClubGiveaway(message.content);
  const giveawayEntries = message.reactions?.filter((reaction: any) => reaction.emoji === GIVEAWAY_ENTRY_EMOJI) || [];
  const hasEnteredGiveaway = giveawayEntries.some((reaction: any) => reaction.profile_id === currentUser?.id);
  const giveawayClosed = giveaway ? new Date(giveaway.endsAt).getTime() <= Date.now() : false;
  const visibleReactions = Object.entries(groupedReactions).filter(([emoji]) => emoji !== GIVEAWAY_ENTRY_EMOJI);

  const { data: giveawayRecord, refetch: refetchGiveaway } = useQuery({
    queryKey: ["club-giveaway", giveaway?.giveawayId],
    enabled: !!giveaway?.giveawayId,
    queryFn: async () => {
      const giveawayId = giveaway!.giveawayId!;
      const [giveawayResult, entriesResult, awardsResult] = await Promise.all([
        supabase.from("club_giveaways").select("*").eq("id", giveawayId).single(),
        supabase.from("club_giveaway_entries").select("profile_id, created_at").eq("giveaway_id", giveawayId).order("created_at"),
        supabase.from("club_giveaway_awards").select("profile_id, amount").eq("giveaway_id", giveawayId),
      ]);
      if (giveawayResult.error) throw giveawayResult.error;
      if (entriesResult.error) throw entriesResult.error;
      if (awardsResult.error) throw awardsResult.error;

      const entrantIds = (entriesResult.data || []).map((entry: any) => entry.profile_id);
      const { data: entrantProfiles, error: profilesError } = entrantIds.length
        ? await supabase.from("profiles").select("id, username, full_name, avatar_url").in("id", entrantIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      return {
        ...giveawayResult.data,
        entries: (entriesResult.data || []).map((entry: any) => ({
          ...entry,
          profiles: entrantProfiles?.find((profile: any) => profile.id === entry.profile_id),
        })),
        awards: awardsResult.data || [],
      } as any;
    },
    staleTime: 15_000,
  });

  const securedEntries = (giveawayRecord?.entries || []).map((entry: any) => {
    const joinedProfile = Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles;
    return {
      ...entry,
      profiles: joinedProfile || members.find((member: any) => member.profile_id === entry.profile_id)?.profiles,
    };
  });
  const entryCount = giveaway?.giveawayId
    ? Math.max(securedEntries.length, giveawayEntries.length)
    : giveawayEntries.length;
  const giveawayAwarded = giveawayRecord?.status === "awarded";
  const awardedProfileIds = new Set((giveawayRecord?.awards || []).map((award: any) => award.profile_id));

  const handleAwardGiveaway = async () => {
    if (!giveaway?.giveawayId) return;
    if (selectedWinnerIds.length !== giveaway.winners) {
      toast.error(`Select exactly ${giveaway.winners} winner${giveaway.winners === 1 ? "" : "s"}.`);
      return;
    }

    setIsAwardingGiveaway(true);
    try {
      const { error } = await supabase.rpc("award_club_giveaway", {
        p_giveaway_id: giveaway.giveawayId,
        p_winner_ids: selectedWinnerIds,
      });
      if (error) throw error;
      await refetchGiveaway();
      setShowAwardGiveaway(false);
      toast.success("The prize money has been transferred to the winner wallets.");
    } catch (error: any) {
      toast.error(error.message || "Could not award the giveaway.");
    } finally {
      setIsAwardingGiveaway(false);
    }
  };
  
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
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={() => {
              const id = message.profiles?.username || message.profile_id;
              if (id) navigate({ to: '/app/profile/$id', params: { id } });
            }}
            className="mb-1 flex h-8 w-8 shrink-0 self-end items-center justify-center overflow-hidden rounded-full border border-border bg-accent/30 text-xs font-bold text-muted-foreground transition hover:ring-2 hover:ring-foreground/20 active:scale-95"
            aria-label={`View ${message.profiles?.full_name || message.profiles?.username || 'member'} profile`}
          >
            {message.profiles?.avatar_url ? (
              <img src={message.profiles.avatar_url} className="h-full w-full object-cover" />
            ) : (
              message.profiles?.username?.[0]?.toUpperCase()
            )}
          </button>
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
          <div className={`relative group px-3.5 py-2.5 ${isMe ?'rounded-[22px] rounded-br-sm border border-foreground/10 bg-foreground text-right text-background shadow-sm shadow-black/10' : 'rounded-[22px] rounded-bl-sm border border-border/50 bg-muted text-left'}`}>
            
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

            {giveaway ? (
              <div className="w-[min(300px,72vw)] text-left">
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${isMe ? 'bg-background/15 text-background' : 'bg-foreground text-background'}`}>
                    <Gift className="h-5 w-5 fill-current" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[9px] font-semibold uppercase ${isMe ? 'text-background/60' : 'text-muted-foreground'}`}>Club giveaway</p>
                    <h4 className={`mt-1 break-words text-[15px] font-semibold leading-5 ${isMe ? 'text-background' : 'text-foreground'}`}>{giveaway.title}</h4>
                  </div>
                </div>

                <div className={`my-3 border-y py-3 ${isMe ? 'border-background/15' : 'border-border'}`}>
                  <div className="flex items-center gap-2">
                    <Trophy className={`h-4 w-4 shrink-0 ${isMe ? 'text-background/70' : 'text-primary'}`} />
                    <p className={`text-sm font-semibold ${isMe ? 'text-background' : 'text-foreground'}`}>
                      {giveaway.amountPerWinner
                        ? `${formatWalletAmount(giveaway.amountPerWinner)} per winner`
                        : giveaway.prize}
                    </p>
                  </div>
                  {giveaway.description && <p className={`mt-2 whitespace-pre-wrap text-xs leading-5 ${isMe ? 'text-background/70' : 'text-muted-foreground'}`}>{giveaway.description}</p>}
                </div>

                <div className={`mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] ${isMe ? 'text-background/60' : 'text-muted-foreground'}`}>
                  <span>{giveaway.winners} {giveaway.winners === 1 ? 'winner' : 'winners'}</span>
                  <span>{entryCount} {entryCount === 1 ? 'entry' : 'entries'}</span>
                  <span>{giveawayAwarded ? 'Paid' : giveawayClosed ? 'Closed' : `Closes ${new Date(giveaway.endsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`}</span>
                </div>

                {giveawayAwarded ? (
                  <div className={`flex h-10 w-full items-center justify-center gap-2 rounded-md border text-xs font-semibold ${isMe ? 'border-background/20 bg-background/10 text-background' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600'}`}>
                    <Check className="h-4 w-4" />
                    {awardedProfileIds.has(currentUser?.id) ? 'You won · prize paid' : 'Winners paid'}
                  </div>
                ) : isAdmin && giveaway.giveawayId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedWinnerIds([]);
                      setShowAwardGiveaway(true);
                      void refetchGiveaway();
                    }}
                    disabled={!giveawayClosed || entryCount < giveaway.winners}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-xs font-semibold text-primary-foreground transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trophy className="h-4 w-4 fill-current" />
                    {!giveawayClosed
                      ? 'Award after closing'
                      : entryCount < giveaway.winners
                        ? 'Not enough eligible entries'
                        : `Award ${giveaway.winners === 1 ? 'winner' : 'winners'}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => !giveawayClosed && !hasEnteredGiveaway && onReact(message.id, GIVEAWAY_ENTRY_EMOJI)}
                    disabled={giveawayClosed || hasEnteredGiveaway}
                    className={`flex h-10 w-full items-center justify-center gap-2 rounded-md text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed ${hasEnteredGiveaway ? 'border border-primary/25 bg-primary/10 text-primary' : 'bg-primary text-primary-foreground disabled:opacity-50'}`}
                  >
                    {hasEnteredGiveaway ? <Check className="h-4 w-4" /> : <Gift className="h-4 w-4 fill-current" />}
                    {giveawayClosed ? 'Giveaway closed' : hasEnteredGiveaway ? 'Entry confirmed' : 'Enter giveaway'}
                  </button>
                )}

                {giveaway.amountPerWinner && (
                  <p className={`mt-2 text-center text-[9px] ${isMe ? 'text-background/50' : 'text-muted-foreground'}`}>
                    {formatWalletAmount(giveaway.totalAmount || giveaway.amountPerWinner * giveaway.winners)} secured by Zero Club
                  </p>
                )}
              </div>
            ) : message.content.startsWith("📅 **[SCHEDULED SPACE]**") ? (() => {
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
                      <h4 className="font-semibold text-sm text-foreground tracking-tight truncate mt-0.5">{spaceTopic}</h4>
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
                <p className={`text-[14px] leading-relaxed whitespace-pre-wrap text-left break-words ${isMe ?'text-background' : 'text-foreground'}`}>
                  <LinkifiedText text={message.content.split('$$MEDIA$$')[0].trim()} linkColor={isMe ? "text-background underline font-bold hover:opacity-80" : "text-primary underline font-bold hover:opacity-80"} />
                  {!message.content.includes('$$MEDIA$$') && <span className="inline-block w-12" />} {/* Space for timestamp */}
                </p>
                
                {message.content.includes('$$MEDIA$$') && (
                  <div className={`mt-2 rounded-xl overflow-hidden transition-colors ${
                    message.content.split('$$MEDIA$$')[1].split(',').length >= 2 
                      ? "grid grid-cols-2 gap-0.5 max-h-[240px] ring-1 ring-border bg-muted/40" 
                      : "flex justify-start ring-1 ring-border"
                  }`}>
                    {message.content.split('$$MEDIA$$')[1].split(',').map((token: string, i: number) => {
                      const media = decodeChatMedia(token);
                      return (
                        <div key={i} className={`relative overflow-hidden w-full ${
                          media.type === 'audio' || media.type === 'file' ? 'min-w-[220px] bg-card p-3' : message.content.split('$$MEDIA$$')[1].split(',').length === 1 ? "max-h-[300px]" : "aspect-square"
                        }`}>
                          {media.type === 'video' ? (
                            <video src={media.url} controls className="h-full w-full object-cover" />
                          ) : media.type === 'audio' ? (
                            <div className="flex min-w-0 flex-col gap-2 text-left"><div className="flex items-center gap-2"><Mic className="h-4 w-4 shrink-0" /><span className="truncate text-[11px] font-semibold">Voice message</span></div><audio src={media.url} controls className="h-10 w-full min-w-[190px]" /></div>
                          ) : media.type === 'file' ? (
                            <a href={media.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 text-left"><FileText className="h-6 w-6 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{media.name}</span><Download className="h-4 w-4 shrink-0 text-muted-foreground" /></a>
                          ) : (
                            <img src={media.url} className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-90" onClick={() => window.open(media.url, '_blank')} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            
            {message.content.includes('$$MEDIA$$') && <div className="h-4" />} {/* Space for timestamp when media is present */}
            {giveaway && <div className="h-4" />}
            
            <span className={`text-[10px] absolute bottom-2 right-3 ${isMe ?'text-background/70' : 'text-muted-foreground'}`}>{time}</span>

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
          {visibleReactions.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ?'justify-end' : 'justify-start'}`}>
              {visibleReactions.map(([emoji, data]: [string, any]) => (
                <button
                  key={emoji}
                  onClick={() => onReact(message.id, emoji)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold transition-colors ${
                    data.me ? 'bg-primary/15 border-primary/25 text-primary' : 'bg-foreground/[0.04] border-transparent text-muted-foreground hover:bg-foreground/[0.08]'
                  }`}
                >
                  <span>{emoji}</span>
                  <span>{data.count}</span>
                </button>
              ))}
              <button 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex items-center justify-center h-[22px] w-[22px] rounded-full bg-foreground/[0.04] text-muted-foreground hover:bg-foreground/[0.08] transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )}

          {giveaway?.giveawayId && (
            <Drawer open={showAwardGiveaway} onOpenChange={setShowAwardGiveaway}>
              <DrawerContent desktopVariant="panel" className="mx-auto max-h-[88dvh] max-w-[620px] overflow-hidden border border-border bg-background p-0 shadow-2xl">
                <DrawerHeader className="border-b border-border px-5 pb-4 pt-0 text-left sm:px-7 sm:pt-2">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground text-background">
                      <Trophy className="h-5 w-5 fill-current" />
                    </div>
                    <div className="min-w-0">
                      <DrawerTitle>Award giveaway</DrawerTitle>
                      <DrawerDescription className="mt-1 text-xs">Select exactly {giveaway.winners} eligible {giveaway.winners === 1 ? "winner" : "winners"}.</DrawerDescription>
                    </div>
                  </div>
                </DrawerHeader>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7">
                  <div className="mb-4 flex items-center justify-between rounded-md border border-border bg-muted/40 px-3.5 py-3">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground">Automatic payout</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatWalletAmount(giveaway.amountPerWinner || 0)} each</p>
                    </div>
                    <p className="text-right text-[10px] text-muted-foreground">
                      Selected<br /><strong className="text-sm font-semibold tabular-nums text-foreground">{selectedWinnerIds.length}/{giveaway.winners}</strong>
                    </p>
                  </div>

                  <div className="space-y-2">
                    {securedEntries.map((entry: any) => {
                      const selected = selectedWinnerIds.includes(entry.profile_id);
                      const profile = entry.profiles;
                      return (
                        <button
                          type="button"
                          key={entry.profile_id}
                          onClick={() => setSelectedWinnerIds((current) => selected
                            ? current.filter((id) => id !== entry.profile_id)
                            : [...current, entry.profile_id])}
                          disabled={!selected && selectedWinnerIds.length >= giveaway.winners}
                          className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition disabled:opacity-45 ${selected ? "border-primary/30 bg-primary/8" : "border-border bg-card hover:bg-muted/50"}`}
                        >
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                            {profile?.avatar_url ? (
                              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="grid h-full w-full place-items-center text-sm font-semibold">{(profile?.full_name || profile?.username || "U")[0].toUpperCase()}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{profile?.full_name || profile?.username || "Club member"}</p>
                            <p className="truncate text-[11px] text-muted-foreground">@{profile?.username || "member"}</p>
                          </div>
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                            {selected && <Check className="h-3.5 w-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="shrink-0 border-t border-border bg-background px-5 py-4 sm:px-7">
                  <button
                    type="button"
                    onClick={handleAwardGiveaway}
                    disabled={isAwardingGiveaway || selectedWinnerIds.length !== giveaway.winners}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-foreground text-sm font-semibold text-background transition active:scale-[0.99] disabled:opacity-40"
                  >
                    {isAwardingGiveaway ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                    {isAwardingGiveaway ? "Transferring..." : "Confirm and pay winners"}
                  </button>
                </div>
              </DrawerContent>
            </Drawer>
          )}

        </div>
      </div>
    </div>
  );
}
