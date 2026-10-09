import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { tooLargeMessage, UPLOAD_LIMIT_MB } from "@/lib/storage";
import { VoiceNotePlayer } from "@/components/VoiceNotePlayer";
import { ImageLightbox } from "@/components/ImageLightbox";
import { useOnlineSet } from "@/lib/realtime/presence";
import { typingLabel, useTyping } from "@/lib/realtime/typing";
import { contentPreview } from "@/lib/contentPreview";
import { isSendKey, useEnterToSend } from "@/lib/chatPrefs";
import { MentionField, type MentionPerson } from "@/components/MentionField";
import { SponsoredPostCard } from "@/features/boost/SponsoredPostCard";
import { getSponsoredPosts, sponsoredSlots } from "@/features/boost/api";
import { Switch } from "@/components/ui/switch";
import { ClubNoteCard, ClubNotePicker, parseClubNote } from "@/features/clubs/ClubNotes";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useQuery } from "@tanstack/react-query";
import { LinkifiedText } from "@/components/LinkifiedText";
import { ComposerOverlay } from "@/components/ComposerOverlay";
import { compressImage } from "@/lib/imageCompression";
import {
  BookOpen,
  ArrowLeft,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Send,
  Hash,
  Users,
  Pin,
  ShieldAlert,
  GraduationCap,
  Mic,
  Settings,
  Trash2,
  Save,
  Camera,
  X,
  Reply,
  Check,
  UserX,
  Copy,
  Plus,
  Video,
  Radio,
  CalendarDays,
  ArrowRight,
  Search,
  User,
  MessageSquare,
  Megaphone,
  ClipboardCheck,
  HelpCircle,
  LockKeyhole,
  FileText,
  BookOpenCheck,
  Image,
  Film,
  File,
  Download,
  Square,
  Gift,
  Trophy,
  WalletCards,
  Loader2,
  UserPlus,
  Share2,
  Wallet,
  Smile,
  Pencil,
} from "@/components/icons/glyphs";
import { copyToClipboard, shareOrCopy } from "@/lib/share";
import { useState, useRef, useEffect, useMemo, Fragment, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useSharedPresence } from "@/hooks/useSharedPresence";
import {
  decodeChatMedia,
  encodeChatMedia,
  getChatMediaType,
  useVoiceRecorder,
} from "@/hooks/useVoiceRecorder";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import EmojiPicker from "emoji-picker-react";
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { useGoBack } from "@/hooks/useGoBack";
import { notifyMentionedUsers } from "@/lib/mentions";
import { ClubQuizzes } from "@/features/clubs/ClubQuizzes";
import { ZeroMark } from "@/components/ZeroLoader";
import { FloatingPicker } from "@/components/FloatingPicker";
export const Route = createFileRoute("/app/clubs/chat")({
  component: ClubChat,
  validateSearch: (
    search: Record<string, unknown>,
  ): { showRules?: string; clubId?: string; room?: string } => {
    const next: { showRules?: string; clubId?: string; room?: string } = {};
    if (typeof search.room === "string" && search.room) next.room = search.room;
    if (typeof search.showRules === "string" && search.showRules) next.showRules = search.showRules;
    if (typeof search.clubId === "string" && search.clubId) next.clubId = search.clubId;
    return next;
  },
});

/** Quizzes live inside the club like any other section, not on their own page. */
const QUIZ_ROOM = "quizzes";

type SectionUpdate = {
  room_id: string;
  count: number;
  latest_content: string | null;
  latest_at: string | null;
};

function sectionNewLabel(roomId: string, count: number) {
  const many = count !== 1;
  if (roomId === "assignments") return many ? `${count} new assignments` : "New assignment";
  if (roomId === "announcements") return many ? `${count} new announcements` : "New announcement";
  if (roomId === "q-and-a") return many ? `${count} new questions` : "New question";
  if (roomId === "quizzes") return many ? `${count} new quizzes` : "New quiz";
  return many ? `${count} new posts` : "New post";
}

function sectionTimeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function SectionDot({ count }: { count: number }) {
  return (
    <span className="ml-1.5 grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-[#cc208f] px-1 text-[10.5px] font-bold leading-none text-white tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const defaultRooms = [
  { id: "general", name: "Discussion" },
  { id: "assignments", name: "Classwork" },
  { id: "announcements", name: "Announcements" },
  { id: "q-and-a", name: "Q&A" },
];

const getClubRooms = (rooms: any) => {
  const source = Array.isArray(rooms) && rooms.length > 0 ? rooms : defaultRooms;
  return source.map((room: any) => {
    const legacyDefault =
      room?.id === "general" &&
      ["stream", "streaming"].includes(
        String(room?.name || "")
          .trim()
          .toLowerCase(),
      );
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
  avatar,
  onTyping,
  onStopTyping,
}: {
  placeholder: string;
  hasMedia: boolean;
  controls: ReactNode;
  onSend: (text: string) => Promise<boolean>;
  /** Called as the person types, so others see "typing…". */
  onTyping?: () => void;
  onStopTyping?: () => void;
  members?: any[];
  /** Rendered inside the composer, not beside it. */
  avatar?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [enterToSend] = useEnterToSend();

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
  const mentionPeople = useMemo<MentionPerson[]>(
    () =>
      members
        .map((member: any) => {
          const person = member.profiles || member;
          return person?.username
            ? {
                id: person.id,
                username: person.username,
                full_name: person.full_name,
                avatar_url: person.avatar_url,
                badge: member.role && member.role !== "Member" ? member.role : null,
              }
            : null;
        })
        .filter(Boolean) as MentionPerson[],
    [members],
  );

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
          String(person.full_name || "")
            .toLowerCase()
            .includes(term)
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
    setDraft((current) =>
      current.replace(/(^|\s)@([^\s@]*)$/, (_m, before: string) => `${before}@${username} `),
    );
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const submit = async () => {
    if ((!draft.trim() && !hasMedia) || sending) return;
    onStopTyping?.();
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
    <div className="relative flex w-full items-end gap-1.5 rounded-2xl border border-border bg-card px-2.5 py-1.5 transition-colors focus-within:border-primary/50">
      {avatar}
      <MentionField
        ref={textareaRef as any}
        value={draft}
        people={mentionPeople}
        peopleLabel="In this club"
        onChange={(event) => {
          setDraft(event.target.value);
          if (event.target.value.trim()) onTyping?.();
          else onStopTyping?.();
          event.target.style.height = "auto";
          event.target.style.height = `${Math.min(event.target.scrollHeight, 80)}px`;
        }}
        onKeyDown={(event) => {
          // An open tag list handles Enter itself, so Enter here is a real send.
          if (isSendKey(event, enterToSend)) {
            event.preventDefault();
            void submit();
          }
        }}
        enterKeyHint={enterToSend ? "send" : "enter"}
        data-club-composer=""
        placeholder={placeholder}
        className="block w-full flex-1 resize-none bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground no-scrollbar"
        rows={1}
        style={{ minHeight: "36px", maxHeight: "80px", height: "36px" }}
      />
      <div className="mb-0.5 flex shrink-0 items-center gap-0.5">
        {controls}
        <button
          onClick={() => void submit()}
          disabled={sending || (!draft.trim() && !hasMedia)}
          aria-label="Send message"
          className={`grid h-8 w-8 place-items-center rounded-full transition active:scale-95 ${
            draft.trim() || hasMedia
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground"
          }`}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

const CLUB_GIVEAWAY_PREFIX = "::ZEROCLUB_GIVEAWAY::";
const GIVEAWAY_ENTRY_EMOJI = "🎟️";

type ClubGiveaway = {
  giveawayId?: string;
  title: string;
  prize?: string;
  amountPerWinner?: number;
  totalAmount?: number;
  /** funds = wallet money, zp = Zero Points, bootcamp = a bootcamp seat (or refund). */
  prizeType?: "funds" | "zp" | "bootcamp";
  zpPerWinner?: number;
  bootcampId?: string;
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

/** The line that describes a giveaway's prize. */
const giveawayPrizeLine = (g: ClubGiveaway, money: (n: number) => string) =>
  g.prizeType === "zp"
    ? `${(g.zpPerWinner || 0).toLocaleString()} Zero Points per winner`
    : g.prizeType === "bootcamp"
      ? `A seat in ${g.prize || "a bootcamp"} per winner`
      : g.amountPerWinner
        ? `${money(g.amountPerWinner)} per winner`
        : g.prize || "";


function ClubChat() {
  const navigate = useNavigate();
  const goBack = useGoBack("/app/clubs");
  const {
    showRules: showRulesParam,
    clubId,
    room: roomParam,
  } = useSearch({ from: "/app/clubs/chat" });
  const [activeRoom, setActiveRoom] = useState(roomParam || "general");
  const [showQuickNav, setShowQuickNav] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [club, setClub] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const { data: currentUserProfile, refetch: refetchCurrentUser } = useUser();
  // Who else in this room is typing right now (one channel per club room).
  const { typists: roomTypists, notifyTyping, stopTyping } = useTyping(
    club?.id ? `club:${club.id}:${activeRoom}` : null,
    { id: currentUserProfile?.id, name: currentUserProfile?.full_name || currentUserProfile?.username },
  );
  // Real online status, from the app-wide presence channel.
  const onlineSet = useOnlineSet();
  const { details: walletCurrency, format: formatWalletAmount, toBaseAmount } = useWalletCurrency();
  const [showMembers, setShowMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [squadActionMember, setSquadActionMember] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editClub, setEditClub] = useState({
    name: "",
    description: "",
    banner_url: "",
    logo_url: "",
    rules: "",
    category: "All",
    subscription_fee: 0,
    access_free: false,
    is_private: false,
    requires_approval: false,
  });
  const [editRooms, setEditRooms] = useState<{ id: string; name: string }[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const { isRecording, recordingSeconds, startRecording, stopRecording } = useVoiceRecorder(
    (file) => {
      setMediaFiles((files) => [...files, file]);
      setMediaPreviews((previews) => [...previews, URL.createObjectURL(file)]);
    },
  );
  const descRef = useRef<HTMLTextAreaElement>(null);
  const rulesRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showRoomSwitcher, setShowRoomSwitcher] = useState(false);
  const [squadSearch, setSquadSearch] = useState("");
  const [showGiveaway, setShowGiveaway] = useState(false);
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [isCreatingGiveaway, setIsCreatingGiveaway] = useState(false);
  const [giveaway, setGiveaway] = useState<ClubGiveaway>({
    title: "",
    amountPerWinner: undefined,
    description: "",
    endsAt: "",
    winners: 1,
    prizeType: "funds",
  });

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }
    try {
      await startRecording();
    } catch (error: any) {
      toast.error(error.message || "Microphone access is required to record a voice note.");
    }
  };

  const [showLiveMenu, setShowLiveMenu] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [liveAdminsCount, setLiveAdminsCount] = useState(0);

  const { presenceState } = useSharedPresence(club?.id ? `live-presence-${club.id}` : "");

  useEffect(() => {
    // Live while ANYONE is still in the room (people inside track an
    // agora_uid; onlookers like this screen don't). A host dropping out no
    // longer takes the room offline for the members still in it.
    let inRoom = 0;
    Object.values(presenceState).forEach((users: any[]) => {
      users.forEach((u) => {
        if (u?.agora_uid != null) inRoom++;
      });
    });
    setLiveAdminsCount(inRoom);
  }, [presenceState]);
  const [spaceTitle, setSpaceTitle] = useState("");
  const [spaceDate, setSpaceDate] = useState("");
  const [spaceTime, setSpaceTime] = useState("");

  const currentUserRole = currentUser
    ? members.find((mem) => mem.profile_id === currentUser.id)?.role
    : undefined;
  const isAdmin = club?.creator_id === currentUser?.id || currentUserRole === "Administrator";
  const giveawayWinnerCount = Math.max(1, Math.min(20, Number(giveaway.winners) || 1));
  const { data: giveawayBootcamps = [] } = useQuery({
    queryKey: ["giveaway-bootcamps", currentUser?.id],
    enabled: showGiveaway && giveaway.prizeType === "bootcamp",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("giveaway_bootcamp_options");
      if (error) throw error;
      return (data || []) as {
        id: string;
        title: string;
        price: number;
        banner_url: string | null;
      }[];
    },
  });
  const giveawayBootcamp = giveawayBootcamps.find((b) => b.id === giveaway.bootcampId);
  const giveawayPrizeBase =
    giveaway.prizeType === "zp"
      ? Math.floor(Number(giveaway.zpPerWinner || 0) / 10)
      : giveaway.prizeType === "bootcamp"
        ? Math.round(Number(giveawayBootcamp?.price || 0))
        : Math.round(toBaseAmount(Number(giveaway.amountPerWinner || 0)));
  const giveawayTotalBase = giveawayPrizeBase * giveawayWinnerCount;
  const canFundGiveaway =
    giveawayTotalBase > 0 && giveawayTotalBase <= Number(currentUserProfile?.coins || 0);
  const openMemberProfile = (profile: any, profileId?: string) => {
    const id = profile?.username || profile?.id || profileId;
    if (!id) return;
    navigate({ to: "/app/profile/$id", params: { id } });
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      setCurrentUser(session.user);

      let query = supabase
        .from("club_members")
        .select("club_id, clubs(*)")
        .eq("profile_id", session.user.id);

      if (clubId) {
        query = query.eq("club_id", clubId);
      }

      const { data: joined } = await query.limit(1).maybeSingle();

      let targetClub = joined?.clubs as any;

      if (!targetClub && clubId) {
        const { data: fallbackClub } = await supabase
          .from("clubs")
          .select("*")
          .eq("id", clubId)
          .single();
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
          .from("club_members")
          .select("*, profiles(*)")
          .eq("club_id", targetClub.id);
        setMembers(mems || []);
      }
    }
    loadClubData();
  }, [clubId]);

  useEffect(() => {
    if (!club) return;
    if (activeRoom === QUIZ_ROOM) return;
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
        .from("club_messages")
        .select("*, profiles:profile_id(*)")
        .eq("club_id", club.id)
        .eq("room_id", activeRoom)
        .order("created_at", { ascending: true });

      if (!isMounted) return;

      // Fetch reactions
      const msgIds = msgs?.map((m) => m.id) || [];
      const { data: rxns } =
        msgIds.length > 0
          ? await supabase.from("club_message_reactions").select("*").in("message_id", msgIds)
          : { data: [] };

      if (!isMounted) return;

      const msgsWithReactions =
        msgs?.map((m) => ({
          ...m,
          reactions: rxns?.filter((r) => r.message_id === m.id) || [],
        })) || [];

      setMessages((current) => {
        const unchanged =
          current.length === msgsWithReactions.length &&
          current.every((message, index) => {
            const incoming = msgsWithReactions[index];
            if (!incoming || message.id !== incoming.id || message.content !== incoming.content)
              return false;
            const currentReactions = (message.reactions || [])
              .map((reaction: any) => reaction.id)
              .join(":");
            const incomingReactions = (incoming.reactions || [])
              .map((reaction: any) => reaction.id)
              .join(":");
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "club_messages",
          filter: `club_id=eq.${club.id}`,
        },
        (payload) => {
          const changedMessage = payload.eventType === "DELETE" ? payload.old : payload.new;
          if (changedMessage.room_id && changedMessage.room_id !== activeRoom) return;
          void loadMessages();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void loadMessages();
      });

    const rxnChannel = supabase
      .channel(`club_reactions:${club.id}:${activeRoom}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "club_message_reactions",
        },
        (payload) => {
          setMessages((prev) => {
            const next = prev.map((m) => {
              if (payload.eventType === "INSERT" && m.id === payload.new.message_id) {
                if (m.reactions?.some((r: any) => r.id === payload.new.id)) return m;
                return { ...m, reactions: [...(m.reactions || []), payload.new] };
              }
              if (payload.eventType === "DELETE" && m.id === payload.old.message_id) {
                return {
                  ...m,
                  reactions: m.reactions?.filter((r: any) => r.id !== payload.old.id) || [],
                };
              }
              return m;
            });
            messagesCache.current[activeRoom] = next;
            return next;
          });
        },
      )
      .subscribe();

    // Reconcile occasionally so a brief connection change cannot leave the
    // conversation stale after Realtime reconnects.
    const catchUpTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadMessages();
    }, 15_000);

    const catchUpOnFocus = () => {
      void loadMessages();
    };
    window.addEventListener("focus", catchUpOnFocus);

    return () => {
      isMounted = false;
      window.clearInterval(catchUpTimer);
      window.removeEventListener("focus", catchUpOnFocus);
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
    [descRef, rulesRef].forEach((ref) => {
      if (ref.current) {
        ref.current.style.height = "auto";
        ref.current.style.height = ref.current.scrollHeight + "px";
      }
    });
  }, [editClub.description, editClub.rules, showSettings]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    if (clubId && typeof window !== "undefined") {
      localStorage.setItem(`last_club_read_${clubId}`, new Date().toISOString());
    }
  }, [messages, clubId]);

  const handleRoleChange = async (profileId: string, newRole: string) => {
    const currentUserRole = currentUser
      ? members.find((mem) => mem.profile_id === currentUser.id)?.role
      : undefined;
    const isAuthorizedEditor =
      club.creator_id === currentUser.id || currentUserRole === "Administrator";
    if (!isAuthorizedEditor) return;

    const { data, error } = await supabase
      .from("club_members")
      .update({ role: newRole })
      .eq("club_id", club.id)
      .eq("profile_id", profileId)
      .select();

    if (error) {
      toast.error(error.message || "Failed to update role");
    } else if (!data || data.length === 0) {
      toast.error(
        "Permission denied by database. You need to enable RLS UPDATE access for club_members in Supabase.",
      );
    } else {
      toast.success(`Role updated to ${newRole}`);
      setMembers(members.map((m) => (m.profile_id === profileId ? { ...m, role: newRole } : m)));
      if (selectedMember && selectedMember.profile_id === profileId) {
        setSelectedMember({ ...selectedMember, role: newRole });
      }
    }
  };

  const handleRemoveMember = async (profileId: string) => {
    const currentUserRole = currentUser
      ? members.find((mem) => mem.profile_id === currentUser.id)?.role
      : undefined;
    const isAuthorizedEditor =
      club.creator_id === currentUser.id || currentUserRole === "Administrator";
    if (!isAuthorizedEditor) return;

    const { error } = await supabase
      .from("club_members")
      .delete()
      .eq("club_id", club.id)
      .eq("profile_id", profileId);

    if (error) {
      toast.error("Failed to remove member");
    } else {
      toast.success("Member removed from squad!");
      setMembers(members.filter((m) => m.profile_id !== profileId));
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
        if (!cancelled) {
          setAddResults([]);
          setAddSearching(false);
        }
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
      const { error } = await supabase
        .from("clubs")
        .update({
          name: editClub.name,
          description: editClub.description,
          banner_url: editClub.banner_url,
          logo_url: editClub.logo_url,
          rules: editClub.rules,
          category: editClub.category,
          rooms: editRooms,
        })
        .eq("id", clubId);
      if (error) throw error;

      /* The fee goes through its own function rather than the update above.
         It decides who may be charged for entry, so the check that only the
         owner can change it belongs in the database, not in this handler. */
      const fee = Math.max(0, Number(editClub.subscription_fee) || 0);
      const { error: feeError } = await supabase.rpc("set_club_access", {
        p_club_id: clubId,
        p_fee: fee,
        p_free: Boolean(editClub.access_free),
      });
      if (feeError) throw feeError;

      /* Same reasoning as the fee: who is allowed in is the database's rule to
         keep, so it is set through a function that checks the owner. */
      // Private or public, switchable any time by the owner.
      if (Boolean(editClub.is_private) !== Boolean(club?.is_private)) {
        const { error: privacyError } = await supabase.rpc("set_club_privacy", {
          p_club_id: clubId,
          p_private: Boolean(editClub.is_private),
        });
        if (privacyError) throw privacyError;
      }

      const { error: admissionError } = await supabase.rpc("set_club_admission", {
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

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "logo_url" | "banner_url",
  ) => {
    const file = e.target.files?.[0];
    if (!file || !club) return;

    setUploading(true);
    try {
      const image = await compressImage(file);
      const fileExt = image.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${club.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("post-media")
        .upload(filePath, image, {
          cacheControl: "31536000",
          contentType: image.type || undefined,
        });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("post-media").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("clubs")
        .update({ [field]: publicUrl })
        .eq("id", club.id);
      if (updateError) throw updateError;

      setEditClub({ ...editClub, [field]: publicUrl });
      toast.success(`${field === "logo_url" ? "Logo" : "Banner"} updated!`);
    } catch (err: any) {
      toast.error(err.message || `Failed to upload ${field === "logo_url" ? "logo" : "banner"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteClub = async () => {
    if (!club || club.creator_id !== currentUser?.id) return;
    if (!confirm("Are you sure you want to delete this club? This cannot be undone.")) return;

    try {
      const { error } = await supabase.from("clubs").delete().eq("id", club.id);
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
    const newFiles = Array.from(files).filter((file) => {
      // Too big to upload: say so now, not after a long failed upload.
      if (file.size > UPLOAD_LIMIT_MB * 1024 * 1024) {
        toast.error(tooLargeMessage(file));
        return false;
      }
      return true;
    });
    if (newFiles.length === 0) return;
    setMediaFiles((prev) => [...prev, ...newFiles]);
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setMediaPreviews((prev) => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeMedia = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async (
    overrideText?: string | any,
    overrideReplyToId?: string | null,
  ) => {
    const actualOverride = typeof overrideText === "string" ? overrideText : undefined;
    const textToSend = actualOverride ?? "";
    if ((!textToSend.trim() && mediaFiles.length === 0) || !club || !currentUser) return false;

    let text = textToSend;

    if (mediaFiles.length > 0) {
      toast.loading("Uploading media...", { id: "upload" });
      const uploadedUrls: string[] = [];
      for (const original of mediaFiles) {
        // Shrunk before it is sent. Every member of the club downloads this.
        const file = await compressImage(original);
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${currentUser.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("post-media")
          .upload(filePath, file, {
            cacheControl: "31536000",
            contentType: file.type || undefined,
          });
        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("post-media").getPublicUrl(filePath);
          uploadedUrls.push(encodeChatMedia(getChatMediaType(file), publicUrl, original.name));
        }
      }
      toast.dismiss("upload");
      if (uploadedUrls.length > 0) {
        text += `\n\n$$MEDIA$$${uploadedUrls.join(",")}`;
      }
    }

    const parentId = overrideReplyToId !== undefined ? overrideReplyToId : replyingTo?.id;

    if (activeRoom === "announcements" && !isAdmin) {
      toast.error("Only club admins can publish announcements.");
      return false;
    }
    if (activeRoom === "assignments" && !isAdmin && !parentId) {
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
      // Not saved yet: it cannot be edited until the server has it.
      pending: true,
      profiles:
        members.find((m) => m.profile_id === currentUser.id)?.profiles || currentUser.user_metadata,
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    const { data, error } = await supabase
      .from("club_messages")
      .insert([
        {
          club_id: club.id,
          profile_id: currentUser.id,
          content: text,
          room_id: activeRoom,
          reply_to_id: parentId,
        },
      ])
      .select("*, profiles:profile_id(*)")
      .single();

    if (error) {
      toast.error("Failed to send message");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      return false;
    } else {
      // Replace optimistic message with real data from server
      setMessages((prev) => {
        const next = prev
          .filter((m) => m.id !== data.id || m.id === tempId)
          .map((m) => (m.id === tempId ? { ...data, reactions: m.reactions || [] } : m));
        messagesCache.current[activeRoom] = next;
        return next;
      });

      void notifyMentionedUsers({
        content: text,
        actorId: currentUser.id,
        entityId: club.id,
        type: "club_chat",
        entityTitle: club.name,
      });

      // Featured club first-message reward
      if (club.name === "Zero K Bootcamp") {
        const hasSentMessageBefore = messages.some(
          (m) => m.profile_id === currentUser.id && m.id !== tempId,
        );
        if (!hasSentMessageBefore) {
          toast.success(
            "You earned 100 XP for your first message in the featured Zero K Bootcamp!",
          );
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
    const prizeType = giveaway.prizeType || "funds";
    const amountPerWinner = giveawayPrizeBase;
    const totalAmount = amountPerWinner * winnerCount;

    if (
      prizeType === "zp" &&
      (Number(giveaway.zpPerWinner || 0) < 10 || Number(giveaway.zpPerWinner) % 10 !== 0)
    ) {
      toast.error("Zero Points prizes go in steps of 10 ZP (10 ZP = ₦1).");
      return;
    }
    if (prizeType === "bootcamp" && !giveawayBootcamp) {
      toast.error("Choose the bootcamp you're giving away.");
      return;
    }
    if (!giveaway.title.trim() || amountPerWinner <= 0 || !giveaway.endsAt) {
      toast.error("Add a title, a prize, and a closing date.");
      return;
    }
    if (new Date(giveaway.endsAt).getTime() <= Date.now()) {
      toast.error("Choose a future closing date.");
      return;
    }
    if (totalAmount > Number(currentUserProfile?.coins || 0)) {
      toast.error(
        `You need ${formatWalletAmount(totalAmount)} in your wallet to fund this giveaway.`,
      );
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
        p_prize_type: prizeType,
        p_zp_per_winner: prizeType === "zp" ? Number(giveaway.zpPerWinner) : null,
        p_bootcamp_id: prizeType === "bootcamp" ? giveaway.bootcampId : null,
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
          setMessages((current) =>
            current.some((message) => message.id === publishedMessage.id)
              ? current
              : [...current, { ...publishedMessage, reactions: [] }],
          );
        }
      }

      setGiveaway({
        title: "",
        amountPerWinner: undefined,
        description: "",
        endsAt: "",
        winners: 1,
        prizeType: "funds",
      });
      setShowGiveaway(false);
      await refetchCurrentUser();
      toast.success(`${formatWalletAmount(totalAmount)} has been locked for the winners.`);
    } catch (error: any) {
      toast.error(error.message || "Could not publish the giveaway.");
    } finally {
      setIsCreatingGiveaway(false);
    }
  };

  /* Boosted posts in clubs: one compact card after the 15th message in
     Discussion, then every 40 — present, but never in the way. */
  const { data: clubSponsored = [] } = useQuery({
    queryKey: ["sponsored", "clubs", currentUser?.id],
    enabled: Boolean(currentUser?.id),
    staleTime: 1000 * 60 * 10,
    queryFn: () => getSponsoredPosts("clubs", 2),
  });
  const clubSponsoredSlots = sponsoredSlots(messages.length, 15, 40);

  /* What's new in each section. The server remembers when you last opened
     every section, so the floating Zero Club mark can say how many new
     assignments, announcements, questions and quizzes are waiting, and
     where. Discussion is left out: it moves too fast to count. */
  const { data: sectionUpdates = [], refetch: refetchSectionUpdates } = useQuery({
    queryKey: ["club-section-updates", club?.id, currentUser?.id],
    enabled: Boolean(club?.id && currentUser?.id),
    staleTime: 1000 * 20,
    refetchInterval: 1000 * 60,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SectionUpdate[]> => {
      const { data, error } = await supabase.rpc("club_section_updates", { p_club: club.id });
      if (error) throw error;
      return Array.isArray(data) ? (data as SectionUpdate[]) : [];
    },
  });
  const sectionUpdateFor = (roomId: string) =>
    roomId === activeRoom
      ? undefined
      : sectionUpdates.find((u) => u.room_id === roomId && u.count > 0);
  const unseenSectionTotal = sectionUpdates.reduce(
    (sum, u) => (u.room_id === activeRoom || u.room_id === "general" ? sum : sum + (u.count || 0)),
    0,
  );

  const activeRoomRef = useRef(activeRoom);
  activeRoomRef.current = activeRoom;

  // Opening a section marks it read; leaving it marks it read again, so
  // anything that arrived while you were looking at it is not counted later.
  useEffect(() => {
    if (!club?.id || !currentUser?.id || activeRoom === "general") return;
    const clubKey = club.id;
    const room = activeRoom;
    const markRead = () =>
      supabase.rpc("mark_club_room_read", { p_club: clubKey, p_room: room }).then(() => {
        void refetchSectionUpdates();
      });
    void markRead();
    return () => {
      void markRead();
    };
  }, [club?.id, currentUser?.id, activeRoom, refetchSectionUpdates]);

  // Live: a new assignment, announcement, question or quiz in another
  // section updates the badge straight away and says where it landed.
  useEffect(() => {
    if (!club?.id || !currentUser?.id) return;
    const me = currentUser.id;
    const roomName = (id: string) =>
      id === QUIZ_ROOM
        ? "Quizzes"
        : getClubRooms(club?.rooms).find((r: any) => r.id === id)?.name || "a section";
    const announce = (room: string, preview: string) => {
      void refetchSectionUpdates();
      toast(`New in ${roomName(room)}`, {
        id: `club-section-${room}`,
        description: preview,
        action: { label: "Open", onClick: () => setActiveRoom(room) },
      });
    };
    const channel = supabase
      .channel(`club_sections:${club.id}:${me}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "club_messages",
          filter: `club_id=eq.${club.id}`,
        },
        (payload) => {
          const row = payload.new as {
            room_id?: string;
            profile_id?: string;
            content?: string;
            parent_id?: string | null;
            reply_to_id?: string | null;
          };
          const room = row.room_id || "general";
          if (room === "general" || row.profile_id === me || row.parent_id || row.reply_to_id)
            return;
          if ((row.content || "").startsWith("::ZEROCLUB_REPLY::")) return;
          if (room === activeRoomRef.current) {
            void supabase.rpc("mark_club_room_read", { p_club: club.id, p_room: room });
            return;
          }
          announce(room, contentPreview(row.content) || "Open to see it");
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "club_quizzes",
          filter: `club_id=eq.${club.id}`,
        },
        (payload) => {
          const row = payload.new as
            { created_by?: string; is_published?: boolean; title?: string } | undefined;
          if (!row?.is_published || row.created_by === me) return;
          if (activeRoomRef.current === QUIZ_ROOM) {
            void supabase.rpc("mark_club_room_read", { p_club: club.id, p_room: QUIZ_ROOM });
            return;
          }
          announce(QUIZ_ROOM, row.title ? `Quiz: ${row.title}` : "A new quiz is ready");
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id, currentUser?.id, refetchSectionUpdates]);

  /* Edit your own message. The server keeps attachments and refuses cards. */
  const handleEditMessage = async (messageId: string, text: string) => {
    const { data, error } = await supabase.rpc("edit_club_message", {
      p_id: messageId,
      p_text: text,
    });
    if (error) {
      toast.error(error.message || "Could not edit this message");
      return false;
    }
    const result = data as { content: string; edited_at: string | null };
    setMessages((prev) => {
      const next = prev.map((m) =>
        m.id === messageId ? { ...m, content: result.content, edited_at: result.edited_at } : m,
      );
      messagesCache.current[activeRoom] = next;
      return next;
    });
    return true;
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!currentUser) return;

    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    const giveawayMessage = parseClubGiveaway(msg.content);
    if (emoji === GIVEAWAY_ENTRY_EMOJI && giveawayMessage?.giveawayId) {
      const alreadyEntered = msg.reactions?.some(
        (reaction: any) =>
          reaction.profile_id === currentUser.id && reaction.emoji === GIVEAWAY_ENTRY_EMOJI,
      );
      if (alreadyEntered) return;

      const tempId = crypto.randomUUID();
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                reactions: [
                  ...(message.reactions || []),
                  { id: tempId, message_id: messageId, profile_id: currentUser.id, emoji },
                ],
              }
            : message,
        ),
      );

      const { data, error } = await supabase.rpc("enter_club_giveaway", {
        p_giveaway_id: giveawayMessage.giveawayId,
      });
      if (error) {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  reactions:
                    message.reactions?.filter((reaction: any) => reaction.id !== tempId) || [],
                }
              : message,
          ),
        );
        toast.error(error.message || "Could not enter the giveaway.");
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                reactions:
                  message.reactions?.map((reaction: any) =>
                    reaction.id === tempId ? { ...reaction, id: data?.id || tempId } : reaction,
                  ) || [],
              }
            : message,
        ),
      );
      toast.success("Your giveaway entry is confirmed.");
      return;
    }

    const existingReaction = msg.reactions?.find(
      (r: any) => r.profile_id === currentUser.id && r.emoji === emoji,
    );

    if (existingReaction) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          return { ...m, reactions: m.reactions.filter((r: any) => r.id !== existingReaction.id) };
        }),
      );
      await supabase.from("club_message_reactions").delete().eq("id", existingReaction.id);
    } else {
      const tempId = crypto.randomUUID();
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          return {
            ...m,
            reactions: [
              ...(m.reactions || []),
              { id: tempId, message_id: messageId, profile_id: currentUser.id, emoji },
            ],
          };
        }),
      );
      await supabase.from("club_message_reactions").insert([
        {
          message_id: messageId,
          profile_id: currentUser.id,
          emoji,
        },
      ]);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "Administrator":
        return "bg-foreground text-background";
      case "Investor":
        return "text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 ring-1 ring-emerald-500/20";
      case "Product Lead":
        return "text-blue-600 dark:text-blue-400 bg-blue-500/8 ring-1 ring-blue-500/20";
      case "Tech Lead":
        return "text-violet-600 dark:text-violet-400 bg-violet-500/8 ring-1 ring-violet-500/20";
      case "Design Lead":
        return "text-pink-600 dark:text-pink-400 bg-pink-500/8 ring-1 ring-pink-500/20";
      case "Business Developer":
        return "text-orange-600 dark:text-orange-400 bg-orange-500/8 ring-1 ring-orange-500/20";
      case "Growth Hacker":
        return "text-cyan-600 dark:text-cyan-400 bg-cyan-500/8 ring-1 ring-cyan-500/20";
      default:
        return "text-muted-foreground bg-foreground/[0.04] ring-1 ring-border";
    }
  };

  const onlineMembersCount = members.filter((m) => onlineSet.has(m.profiles?.id || m.profile_id)).length;

  // --- Grandfathering & Grace Period Logic ---
  const isCreator = club?.creator_id === currentUser?.id;
  const isBasic = !currentUserProfile?.tier || currentUserProfile.tier.toLowerCase() === "basic";
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
      <div className="zc-keep-width zc-chat-panel fixed inset-x-0 z-[100] mx-auto flex h-dvh max-w-none flex-col items-center justify-center bg-background px-6 text-center md:left-[280px] md:right-0 md:mx-0 md:max-w-none xl:right-[336px]">
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

  const clubRooms = getClubRooms(club?.rooms);
  const liveNow = liveAdminsCount > 0;
  const memberCount = members.length > 0 ? members.length : club?.members_count || 1;

  return (
    <div
      className="zc-keep-width zc-chat-panel fixed inset-x-0 z-40 mx-auto flex max-w-none flex-col overflow-hidden border-x border-border bg-card md:left-[280px] md:right-0 md:mx-0 md:max-w-none xl:right-[336px]"
      style={{ height: viewportHeight, top: viewportTop }}
    >
      <header className="relative z-50 shrink-0 border-b border-border bg-card pt-[env(safe-area-inset-top)]">
        <div className="flex h-[52px] items-center gap-1.5 pl-1 pr-1.5">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[10px] bg-muted">
            {club?.logo_url ? (
              <img
                src={club.logo_url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-[13px] font-semibold text-muted-foreground">
                {(club?.name || "#").charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-foreground">
              {club?.name || "Loading…"}
            </p>
            <p className="truncate text-[12px] font-medium text-muted-foreground">
              <span className="text-[#1a7f4b]">{onlineMembersCount} online</span> · {memberCount}{" "}
              {memberCount === 1 ? "member" : "members"}
            </p>
          </div>
          {/* Live is the one thing here that is time-sensitive: a session is
              happening now or it is not, so it sits in the header where it is
              always visible. An admin opens the live tools (go live now or
              schedule a space); anyone can walk straight into a session that
              is already running. */}
          {liveNow ? (
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/app/live/$classId",
                  params: { classId: club?.id || clubId || "unknown" },
                })
              }
              className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-full bg-[#e0245e] px-3 text-[13px] font-semibold text-white transition active:scale-95"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />{" "}
              {isAdmin ? "Live" : "Join live"}
            </button>
          ) : isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setShowScheduleForm(false);
                setShowLiveMenu(true);
              }}
              className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-full bg-[#cc208f] px-3 text-[13px] font-semibold text-white transition hover:bg-[#b01c7b] active:scale-95"
            >
              <Radio className="h-[15px] w-[15px]" /> Go live
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowMembers(true)}
            aria-label="Members"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <Users className="h-[21px] w-[21px]" />
          </button>
          {club?.creator_id === currentUser?.id && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Club settings"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
            >
              <Settings className="h-[21px] w-[21px]" />
            </button>
          )}
        </div>
        <div className="flex items-center">
          <div className="no-scrollbar flex min-w-0 flex-1 gap-5 overflow-x-auto px-3 text-[14px] font-semibold">
            {clubRooms.map((room: any) => (
              <button
                key={room.id}
                onClick={() => setActiveRoom(room.id)}
                className={`flex h-10 flex-none items-center whitespace-nowrap transition-colors ${
                  activeRoom === room.id
                    ? "text-foreground shadow-[inset_0_-2px_0_currentColor]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {room.id === "general" ? `# ${room.name}` : room.name}
                {sectionUpdateFor(room.id) && (
                  <SectionDot count={sectionUpdateFor(room.id)!.count} />
                )}
              </button>
            ))}
            <button
              onClick={() => setActiveRoom(QUIZ_ROOM)}
              className={`flex h-10 flex-none items-center whitespace-nowrap transition-colors ${
                activeRoom === QUIZ_ROOM
                  ? "text-foreground shadow-[inset_0_-2px_0_currentColor]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Quizzes
              {sectionUpdateFor(QUIZ_ROOM) && (
                <SectionDot count={sectionUpdateFor(QUIZ_ROOM)!.count} />
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowRoomSwitcher(true)}
            aria-label="All rooms"
            className="grid h-10 w-10 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      {/* Main scrolling container */}
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar pb-24"
        ref={scrollRef}
      >
        {/* The club's drawers live here; they render in portals, so where
            they sit in the tree does not affect the layout. */}
        <div className="contents">
          <Drawer open={showLiveMenu} onOpenChange={setShowLiveMenu}>
            <DrawerContent className="mx-auto h-auto max-h-[88dvh] max-w-[680px] overflow-hidden rounded-t-lg border border-border bg-background p-0 shadow-2xl z-[90] [&>div:first-child]:hidden outline-none">
              <div className="overflow-y-auto bg-background outline-none">
                {/* Drag Handle */}
                <div className="flex justify-center pb-2 pt-3">
                  <div className="h-1 w-10 rounded-full bg-border" />
                </div>

                {/* Header */}
                <DrawerHeader className="gap-0 sm:gap-0 px-5 pb-4 pt-1 text-left sm:px-6 sm:pt-2">
                  <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">
                    Interactive spaces
                  </DrawerTitle>
                  <DrawerDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                    Live club tools. Sessions open inside the club and keep members in context.
                  </DrawerDescription>
                </DrawerHeader>

                {!showScheduleForm ? (
                  <div className="space-y-2.5 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-in fade-in duration-200 sm:px-6">
                    {isAdmin ? (
                      <>
                        {/* ── Go Live Card (Admin) ── */}
                        <button
                          onClick={() => {
                            setShowLiveMenu(false);
                            navigate({
                              to: "/app/live/$classId",
                              params: { classId: club?.id || "unknown" },
                            });
                          }}
                          className="flex w-full items-center gap-3.5 rounded-2xl border-[1.5px] border-foreground/12 p-4 text-left transition hover:bg-foreground/[0.03] active:scale-[0.99]"
                        >
                          <div className="relative shrink-0">
                            {/* A video camera, not a lightning bolt. These are
                                      live rooms — the icon should say what the tool
                                      does rather than gesture at energy. */}
                            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#e0245e] text-white">
                              <Radio className="h-[22px] w-[22px]" />
                            </div>
                            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-background bg-[#e0245e]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[15px] font-semibold text-foreground">
                              Go live now
                            </h3>
                            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                              Start an instant video session with your community
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                        </button>

                        {/* ── Schedule Space Card (Admin) ── */}
                        <button
                          onClick={() => setShowScheduleForm(true)}
                          className="flex w-full items-center gap-3.5 rounded-2xl border-[1.5px] border-foreground/12 p-4 text-left transition hover:bg-foreground/[0.03] active:scale-[0.99]"
                        >
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#cc208f]/10 text-[#a3186f]">
                            <CalendarDays className="h-[22px] w-[22px]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[15px] font-semibold text-foreground">
                              Schedule a space
                            </h3>
                            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                              Plan a future live class, event, or discussion
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                        </button>
                      </>
                    ) : (
                      /* ── Join Live Space (Non-Admin) ── */
                      <button
                        onClick={() => {
                          if (liveAdminsCount > 0) {
                            setShowLiveMenu(false);
                            navigate({
                              to: "/app/live/$classId",
                              params: { classId: club?.id || "unknown" },
                            });
                          }
                        }}
                        disabled={liveAdminsCount === 0}
                        className={`flex w-full items-center gap-3.5 rounded-2xl border-[1.5px] p-4 text-left outline-none transition ${
                          liveAdminsCount > 0
                            ? "border-[#e0245e]/30 bg-[#e0245e]/[0.05] hover:bg-[#e0245e]/[0.08] active:scale-[0.99]"
                            : "cursor-not-allowed border-foreground/12 opacity-60"
                        }`}
                      >
                        <div className="relative shrink-0">
                          <div
                            className={`grid h-11 w-11 place-items-center rounded-xl ${
                              liveAdminsCount > 0
                                ? "bg-[#e0245e] text-white"
                                : "bg-foreground/[0.06] text-muted-foreground"
                            }`}
                          >
                            <Video className="h-[22px] w-[22px]" />
                          </div>
                          {liveAdminsCount > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-background bg-[#e0245e]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3
                            className={`text-[15px] font-semibold ${liveAdminsCount > 0 ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {liveAdminsCount > 0 ? "Join live space" : "Space is offline"}
                          </h3>
                          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                            {liveAdminsCount > 0
                              ? "A live session is running right now. Join the interactive space."
                              : "Wait for an admin to start a live session."}
                          </p>
                        </div>
                        {liveAdminsCount > 0 && (
                          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  /* ── Schedule Space Form ── */
                  <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-in fade-in slide-in-from-right-4 duration-300 sm:px-6">
                    {/* Back row */}
                    <button
                      onClick={() => setShowScheduleForm(false)}
                      className="-ml-1 mb-4 flex h-9 items-center gap-1 text-[14px] font-semibold text-muted-foreground transition hover:text-foreground"
                    >
                      <ChevronLeft className="h-[18px] w-[18px]" />
                      Back to options
                    </button>

                    <div className="space-y-4">
                      {/* Title input */}
                      <div>
                        <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                          Space topic
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Mastering React State Management"
                          value={spaceTitle}
                          onChange={(e) => setSpaceTitle(e.target.value)}
                          className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
                        />
                      </div>

                      {/* Date & Time row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                            Date
                          </label>
                          <input
                            type="date"
                            value={spaceDate}
                            onChange={(e) => setSpaceDate(e.target.value)}
                            className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition focus:border-foreground/40"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                            Time
                          </label>
                          <input
                            type="time"
                            value={spaceTime}
                            onChange={(e) => setSpaceTime(e.target.value)}
                            className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition focus:border-foreground/40"
                          />
                        </div>
                      </div>

                      {/* Submit button */}
                      <button
                        onClick={handleScheduleSpaceSubmit}
                        className="!mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background transition hover:opacity-90 active:scale-[0.99]"
                      >
                        <CalendarDays className="h-5 w-5" />
                        Schedule space
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </DrawerContent>
          </Drawer>
          {club?.creator_id === currentUser?.id && (
            <Drawer open={showSettings} onOpenChange={setShowSettings}>
              <DrawerContent
                desktopVariant="panel"
                className="mx-auto h-[92%] max-w-[760px] border-none bg-background px-4 pb-4 pt-1 sm:p-6 sm:pt-8"
              >
                <DrawerHeader className="gap-0 sm:gap-0 shrink-0 p-0 pb-4 pr-10 pt-1 text-left sm:p-0 sm:pb-6 sm:pr-10">
                  <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">
                    Club settings
                  </DrawerTitle>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                    Manage your community workspace
                  </p>
                </DrawerHeader>

                <div className="space-y-8 overflow-y-auto h-full pb-20 no-scrollbar">
                  <div className="flex flex-col">
                    <div className="group relative h-32 w-full overflow-visible rounded-2xl border border-dashed border-foreground/15 bg-foreground/[0.04]">
                      <div className="absolute inset-0 overflow-hidden rounded-2xl">
                        {editClub.banner_url ? (
                          <img
                            src={editClub.banner_url}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                            <Image className="h-[22px] w-[22px]" />
                            <span className="text-[13px] font-medium">Club banner</span>
                          </div>
                        )}
                      </div>

                      {uploading && (
                        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-sm">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      )}

                      <button
                        onClick={() => {
                          fileInputRef.current?.setAttribute("data-target", "banner_url");
                          fileInputRef.current?.click();
                        }}
                        aria-label="Change banner"
                        className="absolute right-2.5 top-2.5 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md transition active:scale-95"
                      >
                        <Camera className="h-[18px] w-[18px]" />
                      </button>

                      {/* Logo overlapping the banner */}
                      <div className="absolute -bottom-7 left-4 z-40">
                        <div className="relative">
                          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-card">
                            {editClub.logo_url || editClub.banner_url ? (
                              <img
                                src={editClub.logo_url || editClub.banner_url}
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <Hash className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef.current?.setAttribute("data-target", "logo_url");
                              fileInputRef.current?.click();
                            }}
                            aria-label="Change logo"
                            className="absolute -bottom-1.5 -right-1.5 z-50 grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-foreground text-background transition active:scale-95"
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
                        const target = fileInputRef.current?.getAttribute("data-target") as
                          "logo_url" | "banner_url";
                        if (target) handleImageUpload(e, target);
                      }}
                      className="hidden"
                      accept="image/*"
                    />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                        Club name
                      </label>
                      <input
                        value={editClub.name}
                        onChange={(e) => setEditClub({ ...editClub, name: e.target.value })}
                        className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                        Description
                      </label>
                      {/* Descriptions can come from a bootcamp's rich text, so this
                                is the same formatted editor — a plain textarea showed the
                                raw <p><strong>… tags. */}
                      <RichTextEditor
                        value={editClub.description}
                        onChange={(html) =>
                          setEditClub((current) => ({ ...current, description: html }))
                        }
                        placeholder="What is this club about?"
                        minHeight={120}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                        Categories
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {["Tech", "AI", "Design", "Startup", "Writing", "Marketing", "Campus"].map(
                          (cat) => {
                            const isSelected = editClub.category?.includes(cat);
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  let currentCats =
                                    editClub.category
                                      ?.split(",")
                                      .map((c) => c.trim())
                                      .filter(Boolean) || [];
                                  currentCats = currentCats.filter((c) => c !== "All");
                                  if (isSelected) {
                                    currentCats = currentCats.filter((c) => c !== cat);
                                  } else {
                                    currentCats.push(cat);
                                  }
                                  setEditClub({
                                    ...editClub,
                                    category:
                                      currentCats.length > 0 ? currentCats.join(", ") : "All",
                                  });
                                }}
                                className={`h-9 rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold transition ${isSelected ? "border-[#cc208f] bg-[#cc208f]/[0.08] text-[#a3186f]" : "border-foreground/12 text-foreground hover:bg-foreground/[0.04]"}`}
                              >
                                {cat}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                        Class rules
                      </label>
                      <textarea
                        ref={rulesRef}
                        value={editClub.rules}
                        onChange={(e) => setEditClub({ ...editClub, rules: e.target.value })}
                        placeholder="Set the standards for your squad..."
                        className="min-h-[128px] w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[15px] leading-relaxed text-foreground outline-none transition no-scrollbar placeholder:text-muted-foreground focus:border-foreground/40"
                      />
                    </div>
                  </div>

                  {/* ── Access ──────────────────────────────────── */}
                  <div className="space-y-3">
                    <h3 className="text-[13px] font-semibold text-muted-foreground">Who gets in</h3>

                    {/* Private ⇄ public, any time. */}
                    <div
                      className="grid grid-cols-2 gap-2 rounded-2xl bg-foreground/[0.04] p-1.5"
                      role="radiogroup"
                      aria-label="Club privacy"
                    >
                      {(
                        [
                          [false, "Public", "Anyone can find it", Users],
                          [true, "Private", "Joining is by request", LockKeyhole],
                        ] as const
                      ).map(([value, label, hint, Icon]) => {
                        const on = Boolean(editClub.is_private) === value;
                        return (
                          <button
                            key={label}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setEditClub({ ...editClub, is_private: value })}
                            className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-card shadow-sm ring-1 ring-[#cc208f]/40" : "hover:bg-card/60"}`}
                          >
                            <span
                              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${on ? "bg-[#cc208f] text-white" : "bg-foreground/[0.06] text-muted-foreground"}`}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[14.5px] font-semibold text-foreground">
                                {label}
                              </span>
                              <span className="block truncate text-[12px] text-muted-foreground">
                                {hint}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Being findable and being open are different
                              things. A private club is by request either way,
                              so the switch is only offered where it changes
                              something. */}
                    {editClub.is_private ? (
                      <p className="rounded-2xl bg-foreground/[0.04] px-4 py-3.5 text-[14px] leading-relaxed text-muted-foreground">
                        This club is private, so every join is a request you approve. Switch it to
                        Public whenever you want people to find it on their own.
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setEditClub({
                            ...editClub,
                            requires_approval: !editClub.requires_approval,
                          })
                        }
                        className="flex w-full items-center justify-between gap-4 rounded-2xl bg-foreground/[0.04] px-4 py-3.5 text-left"
                      >
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-foreground">
                            {editClub.requires_approval
                              ? "Approve each member"
                              : "Open to everyone"}
                          </span>
                          <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
                            {editClub.requires_approval
                              ? "People send a request and wait for you. The club stays public and findable."
                              : "Anyone who finds the club can join straight away."}
                          </span>
                        </span>
                        <span
                          className={`h-6 w-11 shrink-0 rounded-full p-1 transition ${editClub.requires_approval ? "bg-[#cc208f]" : "bg-foreground/15"}`}
                        >
                          <span
                            className={`block h-4 w-4 rounded-full bg-white transition-transform ${editClub.requires_approval ? "translate-x-5" : ""}`}
                          />
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-[13px] font-semibold text-muted-foreground">Membership</h3>

                    {/* One switch, stated as what it turns ON. "Free
                              access" as a toggle read backwards: switching it
                              on sounded like enabling something, when it was
                              really turning charging off. */}
                    <button
                      type="button"
                      onClick={() =>
                        setEditClub({ ...editClub, access_free: !editClub.access_free })
                      }
                      className="flex w-full items-center justify-between gap-4 rounded-2xl bg-foreground/[0.04] px-4 py-3.5 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-foreground">
                          {editClub.access_free ? "Free access" : "Subscription on"}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
                          {editClub.access_free
                            ? "Anyone can join without paying. Your fee is saved for when you switch it back on."
                            : "Members pay to join. Switch off any time to open the doors without losing the fee."}
                        </span>
                      </span>
                      <span
                        className={`h-6 w-11 shrink-0 rounded-full p-1 transition ${editClub.access_free ? "bg-foreground/15" : "bg-[#cc208f]"}`}
                      >
                        <span
                          className={`block h-4 w-4 rounded-full bg-white transition-transform ${editClub.access_free ? "" : "translate-x-5"}`}
                        />
                      </span>
                    </button>

                    {/* The amount only matters while the subscription is
                              on, so it steps back when it is not. */}
                    <div
                      className={`pt-1 transition-opacity ${editClub.access_free ? "opacity-45" : ""}`}
                    >
                      <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
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
                        className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] font-semibold tabular-nums text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
                      />
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                        Charged once from the member's Zero Club wallet and paid straight into
                        yours. Nobody gets in without paying — unless you add them by username.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-[13px] font-semibold text-muted-foreground">
                      Club sections
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
                            className="h-11 min-w-0 flex-1 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
                          />
                          <button
                            onClick={() => setEditRooms(editRooms.filter((_, idx) => idx !== i))}
                            aria-label={`Remove ${r.name}`}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-[#e0245e]/10 text-[#e0245e] transition hover:bg-[#e0245e]/15"
                          >
                            <X className="h-[18px] w-[18px]" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const newId = `room-${Math.random().toString(36).substr(2, 9)}`;
                          setEditRooms([...editRooms, { id: newId, name: "New Section" }]);
                        }}
                        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full border-[1.5px] border-dashed border-foreground/25 text-[14px] font-semibold text-foreground transition hover:bg-foreground/[0.04]"
                      >
                        <Plus className="h-[18px] w-[18px]" /> Add section
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <button
                      onClick={handleUpdateClub}
                      disabled={isUpdating}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
                    >
                      {isUpdating ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Save className="h-5 w-5" />
                      )}{" "}
                      {isUpdating ? "Saving..." : "Save changes"}
                    </button>
                    <button
                      onClick={handleDeleteClub}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#e0245e]/10 text-[16px] font-semibold text-[#e0245e] transition hover:bg-[#e0245e]/15 active:scale-[0.99]"
                    >
                      <Trash2 className="h-5 w-5" /> Delete club
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
          <Drawer
            repositionInputs={false}
            open={showMembers}
            onOpenChange={(open) => {
              setShowMembers(open);
              if (!open) {
                setSelectedMember(null);
                setSquadActionMember(null);
                // Reopening should land on the squad, not on a stale
                // search from last time.
                setShowAddPanel(false);
                setAddQuery("");
              }
            }}
          >
            <DrawerContent
              desktopVariant="panel"
              className="mx-auto flex h-[88dvh] max-w-[760px] flex-col overflow-hidden border-none bg-background p-4 sm:h-[85%] sm:p-6"
            >
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
                      ? "translateX(-33.3333%)"
                      : showAddPanel
                        ? "translateX(-66.6667%)"
                        : "translateX(0%)",
                  }}
                >
                  {/* PANEL 1: CLUB SQUAD MEMBER LIST */}
                  <div
                    data-vaul-no-drag
                    className="h-full w-1/3 shrink-0 touch-pan-y overflow-y-auto overscroll-contain px-1 no-scrollbar"
                  >
                    <DrawerHeader className="gap-0 sm:gap-0 shrink-0 p-0 pb-4 pr-10 pt-1 text-left sm:p-0 sm:pb-5 sm:pr-10">
                      <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">
                        Club squad
                      </DrawerTitle>
                      <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                        The team building {club?.name}
                      </p>
                    </DrawerHeader>

                    {/* Sharing is for everyone in the squad. Any member
                              can bring a friend to a club they belong to —
                              that is how a club grows. Adding someone outright
                              stays with admins, below. */}
                    {club && (
                      <div className="mb-3 shrink-0 rounded-2xl bg-foreground/[0.04] p-4">
                        <p className="text-left text-[15px] font-semibold text-foreground">
                          Invite a friend
                        </p>
                        <p className="mt-0.5 text-left text-[13px] leading-relaxed text-muted-foreground">
                          Share {club.name} with anyone — they can join from the link.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={handleShareInvite}
                            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-[14px] font-semibold text-background transition hover:opacity-90 active:scale-[0.98]"
                          >
                            <Share2 className="h-[18px] w-[18px]" /> Share link
                          </button>
                          <button
                            onClick={handleCopyInvite}
                            title="Copy invite link"
                            aria-label="Copy invite link"
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-foreground/15 bg-background text-foreground transition hover:bg-foreground/[0.04] active:scale-95"
                          >
                            <Copy className="h-[18px] w-[18px]" />
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
                        className="mb-3 flex w-full shrink-0 items-center gap-3 rounded-2xl px-1 py-3 text-left transition hover:bg-foreground/[0.03] active:scale-[0.99]"
                      >
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#cc208f]/10 text-[#a3186f]">
                          <UserPlus className="h-[22px] w-[22px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-foreground">
                            Add a builder
                          </span>
                          <span className="block text-[13px] text-muted-foreground">
                            Search anyone on Zero Club and add them
                          </span>
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                      </button>
                    )}

                    <div className="relative mb-2 shrink-0">
                      <Search className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Find a builder..."
                        value={squadSearch}
                        onChange={(e) => setSquadSearch(e.target.value)}
                        className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card pl-10 pr-3 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
                      />
                    </div>

                    <div className="flex-1 pb-10">
                      {[...members]
                        .filter((m) => {
                          if (!squadSearch) return true;
                          const searchLower = squadSearch.toLowerCase();
                          const name =
                            m.profiles?.full_name?.toLowerCase() ||
                            m.profiles?.username?.toLowerCase() ||
                            "";
                          return name.includes(searchLower);
                        })
                        .sort((a, b) => {
                          // Creator first
                          if (a.profile_id === club?.creator_id) return -1;
                          if (b.profile_id === club?.creator_id) return 1;
                          // Then Administrators
                          if (a.role === "Administrator" && b.role !== "Administrator") return -1;
                          if (b.role === "Administrator" && a.role !== "Administrator") return 1;
                          // Then any other upgraded roles
                          const roleA = a.role || "Member";
                          const roleB = b.role || "Member";
                          if (roleA !== "Member" && roleB === "Member") return -1;
                          if (roleB !== "Member" && roleA === "Member") return 1;
                          return 0;
                        })
                        .map((m) => {
                          const currentUserRole = currentUser
                            ? members.find((mem) => mem.profile_id === currentUser.id)?.role
                            : undefined;
                          const isAuthorizedEditor =
                            club?.creator_id === currentUser?.id ||
                            currentUserRole === "Administrator";
                          const canEditMember =
                            isAuthorizedEditor && m.profile_id !== currentUser?.id;

                          return (
                            <div
                              key={m.profile_id}
                              className="flex items-center justify-between gap-3 py-3"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => openMemberProfile(m.profiles, m.profile_id)}
                                  className="relative h-11 w-11 shrink-0 rounded-full bg-foreground/[0.06] transition active:scale-95"
                                  aria-label={`View ${m.profiles?.full_name || m.profiles?.username || "member"} profile`}
                                >
                                  <span className="block h-full w-full overflow-hidden rounded-full">
                                    {m.profiles?.avatar_url ? (
                                      <img
                                        src={m.profiles.avatar_url}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    ) : (
                                      <span className="grid h-full w-full place-items-center text-[15px] font-semibold text-muted-foreground">
                                        {m.profiles?.username?.[0]?.toUpperCase()}
                                      </span>
                                    )}
                                  </span>
                                  {onlineSet.has(m.profiles?.id || m.profile_id) && (
                                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-[#1a7f4b]" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSquadActionMember(m)}
                                  className="min-w-0 flex-1 text-left active:opacity-70"
                                >
                                  <div className="min-w-0 text-left">
                                    <div className="truncate text-[15px] font-semibold text-foreground">
                                      {m.profiles?.full_name || m.profiles?.username}
                                    </div>
                                    <div
                                      className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${getRoleColor(m.role)}`}
                                    >
                                      {m.role}
                                    </div>
                                  </div>
                                </button>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                {m.profile_id === club?.creator_id ? (
                                  <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                                    Creator
                                  </span>
                                ) : (
                                  canEditMember && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedMember(m);
                                      }}
                                      className="relative z-10 h-8 rounded-full border-[1.5px] border-foreground/15 px-3.5 text-[13px] font-semibold text-foreground transition hover:bg-foreground/[0.04]"
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
                  <div
                    data-vaul-no-drag
                    className="h-full w-1/3 shrink-0 touch-pan-y overflow-y-auto overscroll-contain px-2 no-scrollbar"
                  >
                    <div className="mb-5 flex shrink-0 flex-col gap-3 pr-10">
                      <button
                        onClick={() => setSelectedMember(null)}
                        className="-ml-1 flex h-9 items-center gap-1 self-start text-[14px] font-semibold text-muted-foreground transition hover:text-foreground"
                      >
                        <ChevronLeft className="h-[18px] w-[18px]" /> Back to squad
                      </button>

                      <div className="text-left">
                        <h3 className="font-display text-[20px] font-semibold leading-tight text-foreground">
                          Member settings
                        </h3>
                        <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                          Modify squad privileges and roles
                        </p>
                      </div>
                    </div>

                    {selectedMember && (
                      <div className="mb-6 flex shrink-0 items-center gap-3.5 rounded-2xl bg-foreground/[0.04] p-4">
                        <button
                          type="button"
                          onClick={() =>
                            openMemberProfile(selectedMember.profiles, selectedMember.profile_id)
                          }
                          className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06] transition active:scale-95"
                          aria-label="View member profile"
                        >
                          {selectedMember.profiles?.avatar_url ? (
                            <img
                              src={selectedMember.profiles.avatar_url}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className="grid h-full w-full place-items-center text-[17px] font-semibold text-muted-foreground">
                              {selectedMember.profiles?.username?.[0]?.toUpperCase()}
                            </span>
                          )}
                        </button>
                        <div className="min-w-0 text-left">
                          <h4 className="truncate text-[16px] font-semibold text-foreground">
                            {selectedMember.profiles?.full_name ||
                              selectedMember.profiles?.username}
                          </h4>
                          <p className="truncate text-[13px] text-muted-foreground">
                            {getFirstName(selectedMember.profiles)}
                          </p>
                          <div className="mt-1.5">
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${getRoleColor(selectedMember.role)}`}
                            >
                              {selectedMember.role}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex-1 space-y-2">
                      <label className="mb-2 block text-left text-[13px] font-semibold text-muted-foreground">
                        Squad role
                      </label>
                      {[
                        { name: "Member", desc: "Standard squad member with access to all rooms." },
                        {
                          name: "Administrator",
                          desc: "Full co-management rights, can edit settings.",
                        },
                        { name: "Investor", desc: "Financial partner and strategic advisor." },
                        {
                          name: "Business Developer",
                          desc: "Handles squad outreach and growth partnerships.",
                        },
                        {
                          name: "Product Lead",
                          desc: "Directs development schedules and releases.",
                        },
                        {
                          name: "Design Lead",
                          desc: "Shapes squad visual styling, graphics, and brand.",
                        },
                        {
                          name: "Tech Lead",
                          desc: "Manages architecture, pipelines, and engineering.",
                        },
                        {
                          name: "Growth Hacker",
                          desc: "Maintains viral loops, social expansion, and metrics.",
                        },
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
                            className={`flex w-full items-center justify-between gap-3 rounded-2xl border-[1.5px] p-4 text-left text-foreground transition ${
                              isActive
                                ? "border-[#cc208f] bg-[#cc208f]/[0.06]"
                                : "border-foreground/12 hover:bg-foreground/[0.03]"
                            }`}
                          >
                            <div className="min-w-0 text-left">
                              <p className="text-[15px] font-semibold">{roleOption.name}</p>
                              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                                {roleOption.desc}
                              </p>
                            </div>
                            <span
                              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${isActive ? "bg-[#cc208f] text-white" : "border-[1.5px] border-foreground/20"}`}
                            >
                              {isActive && <Check className="h-3 w-3" strokeWidth={3} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedMember && (
                      <div className="mt-6 shrink-0 pb-10">
                        <button
                          onClick={() => handleRemoveMember(selectedMember.profile_id)}
                          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#e0245e]/10 text-[16px] font-semibold text-[#e0245e] transition hover:bg-[#e0245e]/15 active:scale-[0.99]"
                        >
                          <UserX className="h-5 w-5" /> Remove from squad
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
                        onClick={() => {
                          setShowAddPanel(false);
                          setAddQuery("");
                        }}
                        className="-ml-1 mb-3 flex h-9 items-center gap-1 self-start text-[14px] font-semibold text-muted-foreground transition hover:text-foreground"
                      >
                        <ChevronLeft className="h-[18px] w-[18px]" /> Back to squad
                      </button>
                      <h3 className="text-left font-display text-[20px] font-semibold leading-tight text-foreground">
                        Add a builder
                      </h3>
                      <p className="mb-4 mt-1 text-left text-[14px] leading-relaxed text-muted-foreground">
                        They join {club?.name} straight away and get a notification.
                      </p>

                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          inputMode="search"
                          autoComplete="off"
                          placeholder="Search @username or name"
                          value={addQuery}
                          onChange={(e) => setAddQuery(e.target.value)}
                          className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card pl-10 pr-10 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
                        />
                        {addQuery && (
                          <button
                            onClick={() => setAddQuery("")}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/[0.06]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Only this scrolls, and it keeps room beneath the
                              last row so the keyboard cannot bury it. */}
                    <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain pb-[40vh] no-scrollbar">
                      {addQuery.trim().length < 2 ? (
                        <div className="flex flex-col items-center pt-12 text-center">
                          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground">
                            <UserPlus className="h-[22px] w-[22px]" />
                          </div>
                          <p className="text-[16px] font-semibold text-foreground">
                            Find someone to add
                          </p>
                          <p className="mt-1 text-[14px] text-muted-foreground">
                            Type at least 2 letters to search
                          </p>
                        </div>
                      ) : addSearching ? (
                        /* Skeletons rather than a spinner, so the rows do
                                 not jump into place as results land. */
                        <div>
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="flex items-center gap-3 py-3">
                              <div className="h-11 w-11 shrink-0 rounded-full bg-foreground/[0.06] shimmer" />
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="h-3.5 w-2/3 rounded bg-foreground/[0.06] shimmer" />
                                <div className="h-3 w-1/3 rounded bg-foreground/[0.05] shimmer" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : addError ? (
                        <div className="flex flex-col items-center pt-12 text-center">
                          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#e0245e]/10 text-[#e0245e]">
                            <Search className="h-[22px] w-[22px]" />
                          </div>
                          <p className="text-[16px] font-semibold text-foreground">
                            Search could not run
                          </p>
                          <p className="mx-auto mt-1 max-w-[36ch] text-[14px] leading-relaxed text-muted-foreground">
                            {addError}
                          </p>
                        </div>
                      ) : addResults.length === 0 ? (
                        <div className="flex flex-col items-center pt-12 text-center">
                          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground">
                            <Users className="h-[22px] w-[22px]" />
                          </div>
                          <p className="text-[16px] font-semibold text-foreground">
                            No one new found
                          </p>
                          <p className="mx-auto mt-1 max-w-[36ch] text-[14px] leading-relaxed text-muted-foreground">
                            They may already be in the squad, or try a different spelling.
                          </p>
                        </div>
                      ) : (
                        <div>
                          {addResults.map((person) => (
                            <div key={person.id} className="flex items-center gap-3 py-3">
                              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground">
                                {person.avatar_url ? (
                                  <img
                                    src={person.avatar_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  (person.full_name || person.username || "?")
                                    .charAt(0)
                                    .toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0 flex-1 text-left">
                                <p className="truncate text-[15px] font-semibold text-foreground">
                                  {person.full_name || person.username}
                                </p>
                                <p className="truncate text-[13px] text-muted-foreground">
                                  @{person.username}
                                </p>
                              </div>
                              <button
                                onClick={() => handleAddMember(person)}
                                disabled={addingId !== null}
                                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-[14px] font-semibold text-background transition hover:opacity-90 active:scale-95 disabled:opacity-40"
                              >
                                {addingId === person.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Plus className="h-4 w-4" />
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
                    className="absolute inset-0 z-50 flex items-end bg-background/60 backdrop-blur-sm"
                    onClick={() => setSquadActionMember(null)}
                  >
                    <div
                      className="w-full rounded-t-2xl border-t border-border/60 bg-background pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center gap-3 px-5 pb-3 pt-2">
                        <button
                          type="button"
                          onClick={() =>
                            openMemberProfile(
                              squadActionMember.profiles,
                              squadActionMember.profile_id,
                            )
                          }
                          className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06] transition active:scale-95"
                          aria-label="View member profile"
                        >
                          {squadActionMember.profiles?.avatar_url ? (
                            <img
                              src={squadActionMember.profiles.avatar_url}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className="grid h-full w-full place-items-center text-[15px] font-semibold text-muted-foreground">
                              {squadActionMember.profiles?.username?.[0]?.toUpperCase()}
                            </span>
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-foreground">
                            {squadActionMember.profiles?.full_name ||
                              squadActionMember.profiles?.username}
                          </p>
                          <p className="truncate text-[13px] text-muted-foreground">
                            {getFirstName(squadActionMember.profiles)}
                          </p>
                        </div>
                        <button
                          onClick={() => setSquadActionMember(null)}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-muted-foreground transition hover:text-foreground"
                          aria-label="Close member actions"
                        >
                          <X className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                      <div className="pt-1">
                        <button
                          onClick={() =>
                            navigate({ to: `/app/profile/${squadActionMember.profiles?.username}` })
                          }
                          className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left text-[16px] font-medium text-foreground transition hover:bg-foreground/[0.04]"
                        >
                          <User className="h-[22px] w-[22px] shrink-0" />
                          View profile
                        </button>
                        {squadActionMember.profile_id !== currentUser?.id && (
                          <button
                            onClick={() =>
                              navigate({ to: `/app/chat/${squadActionMember.profile_id}` })
                            }
                            className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left text-[16px] font-medium text-foreground transition hover:bg-foreground/[0.04]"
                          >
                            <MessageSquare className="h-[22px] w-[22px] shrink-0" />
                            Message builder
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </DrawerContent>
          </Drawer>

          {isAdmin && club?.id && (
            <ClubNotePicker
              open={showNotePicker}
              onOpenChange={setShowNotePicker}
              clubId={club.id}
              onAttach={(payload) => handleSendMessage(payload)}
            />
          )}

          <Drawer open={showGiveaway} onOpenChange={setShowGiveaway}>
            <DrawerContent
              desktopVariant="panel"
              className="mx-auto max-w-[680px] overflow-hidden border border-border bg-background p-0 shadow-2xl"
            >
              <DrawerHeader className="gap-0 sm:gap-0 px-5 pb-3 pt-1 text-left sm:px-7 sm:pt-2">
                <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">
                  Create a giveaway
                </DrawerTitle>
                <DrawerDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                  The complete prize pool is reserved when you publish.
                </DrawerDescription>
              </DrawerHeader>

              <div className="space-y-4 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1 sm:px-7 sm:pb-6">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                    Giveaway title
                  </span>
                  <input
                    value={giveaway.title}
                    onChange={(event) =>
                      setGiveaway((current) => ({ ...current, title: event.target.value }))
                    }
                    maxLength={80}
                    placeholder="Community build challenge"
                    className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
                  />
                </label>

                <div className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                    Prize type
                  </span>
                  <FloatingPicker
                    value={giveaway.prizeType || "funds"}
                    onChange={(value) =>
                      setGiveaway((current) => ({
                        ...current,
                        prizeType: value as ClubGiveaway["prizeType"],
                      }))
                    }
                    options={[
                      {
                        value: "funds",
                        label: "Wallet funds",
                        description: "Cash sent straight to each winner's Zero Club wallet.",
                        icon: (
                          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/12 text-emerald-600">
                            <Wallet className="h-4 w-4" />
                          </span>
                        ),
                      },
                      {
                        value: "zp",
                        label: "Zero Points",
                        description:
                          "ZP bought from your wallet (10 ZP = ₦1) and given to each winner.",
                        icon: (
                          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/12 text-amber-600">
                            <Trophy className="h-4 w-4" />
                          </span>
                        ),
                      },
                      {
                        value: "bootcamp",
                        label: "Bootcamp seat",
                        description:
                          "A free seat in one of your bootcamps — refunded to winners who already paid.",
                        icon: (
                          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#cc208f]/12 text-[#cc208f]">
                            <GraduationCap className="h-4 w-4" />
                          </span>
                        ),
                      },
                    ]}
                  />
                </div>

                {giveaway.prizeType === "bootcamp" && (
                  <div className="block">
                    <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                      Bootcamp
                    </span>
                    <FloatingPicker
                      value={giveaway.bootcampId}
                      placeholder="Choose one of your bootcamps"
                      emptyText="You have no paid, active bootcamps to give away."
                      onChange={(value) =>
                        setGiveaway((current) => ({ ...current, bootcampId: value }))
                      }
                      options={giveawayBootcamps.map((b) => ({
                        value: b.id,
                        label: b.title,
                        meta: formatWalletAmount(Number(b.price || 0)),
                        icon: b.banner_url ? (
                          <img
                            src={b.banner_url}
                            alt=""
                            className="h-8 w-8 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="grid h-8 w-8 place-items-center rounded-lg bg-foreground/[0.06]">
                            <GraduationCap className="h-4 w-4" />
                          </span>
                        ),
                      }))}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {giveaway.prizeType === "zp" ? (
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                        ZP per winner
                      </span>
                      <div className="flex h-11 items-center rounded-[10px] border border-foreground/15 bg-card transition focus-within:border-foreground/40">
                        <input
                          type="number"
                          min={10}
                          step={10}
                          value={giveaway.zpPerWinner ?? ""}
                          onChange={(event) =>
                            setGiveaway((current) => ({
                              ...current,
                              zpPerWinner:
                                event.target.value === "" ? undefined : Number(event.target.value),
                            }))
                          }
                          placeholder="500"
                          className="min-w-0 flex-1 bg-transparent px-3 text-[15px] tabular-nums outline-none placeholder:text-muted-foreground"
                        />
                        <span className="pr-3 text-[13px] font-semibold text-muted-foreground">
                          ZP
                        </span>
                      </div>
                    </label>
                  ) : giveaway.prizeType === "bootcamp" ? (
                    <div className="block min-w-0">
                      <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                        Value per winner
                      </span>
                      <div className="flex h-11 items-center rounded-[10px] bg-foreground/[0.04] px-3 text-[15px] font-semibold tabular-nums text-foreground">
                        {giveawayBootcamp
                          ? formatWalletAmount(Number(giveawayBootcamp.price))
                          : "—"}
                      </div>
                    </div>
                  ) : (
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                        Prize per winner
                      </span>
                      <div className="flex h-11 items-center rounded-[10px] border border-foreground/15 bg-card transition focus-within:border-foreground/40">
                        <span className="pl-3 text-[15px] font-semibold text-muted-foreground">
                          {walletCurrency.symbol}
                        </span>
                        <input
                          type="number"
                          min={walletCurrency.rate === 1 ? 1 : 0.01}
                          step={walletCurrency.rate === 1 ? 1 : 0.01}
                          value={giveaway.amountPerWinner ?? ""}
                          onChange={(event) =>
                            setGiveaway((current) => ({
                              ...current,
                              amountPerWinner:
                                event.target.value === "" ? undefined : Number(event.target.value),
                            }))
                          }
                          placeholder="25000"
                          className="min-w-0 flex-1 bg-transparent px-2 text-[15px] tabular-nums outline-none placeholder:text-muted-foreground"
                        />
                      </div>
                    </label>
                  )}
                  <label className="block min-w-0">
                    <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                      Winners
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={giveaway.winners}
                      onChange={(event) =>
                        setGiveaway((current) => ({
                          ...current,
                          winners: Number(event.target.value),
                        }))
                      }
                      className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] tabular-nums outline-none transition focus:border-foreground/40"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                    Details
                  </span>
                  <textarea
                    value={giveaway.description}
                    onChange={(event) =>
                      setGiveaway((current) => ({ ...current, description: event.target.value }))
                    }
                    maxLength={320}
                    rows={2}
                    placeholder="Explain how members qualify and what the winner receives."
                    className="w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[15px] leading-relaxed outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                    Closes
                  </span>
                  <input
                    type="datetime-local"
                    value={giveaway.endsAt}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(event) =>
                      setGiveaway((current) => ({ ...current, endsAt: event.target.value }))
                    }
                    className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none transition focus:border-foreground/40"
                  />
                </label>

                <div
                  className={`flex items-center justify-between gap-4 rounded-2xl px-4 py-3.5 ${giveawayTotalBase > 0 && !canFundGiveaway ? "bg-[#e0245e]/[0.07]" : "bg-foreground/[0.04]"}`}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-muted-foreground">
                      Locked when published
                    </p>
                    <p className="mt-0.5 truncate font-display text-[18px] font-semibold tabular-nums text-foreground">
                      {formatWalletAmount(giveawayTotalBase)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`flex items-center justify-end gap-1.5 text-[13px] font-semibold ${giveawayTotalBase > 0 && !canFundGiveaway ? "text-[#e0245e]" : "text-muted-foreground"}`}
                    >
                      <WalletCards className="h-4 w-4" /> Wallet
                    </p>
                    <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-foreground">
                      {formatWalletAmount(Number(currentUserProfile?.coins || 0))}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateGiveaway}
                  disabled={
                    isCreatingGiveaway ||
                    !giveaway.title.trim() ||
                    !giveaway.endsAt ||
                    !canFundGiveaway
                  }
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] px-5 text-[16px] font-semibold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
                >
                  {isCreatingGiveaway ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Gift className="h-5 w-5 fill-current" />
                  )}
                  {isCreatingGiveaway ? "Publishing..." : "Publish giveaway"}
                </button>
              </div>
            </DrawerContent>
          </Drawer>

          <Drawer open={showRoomSwitcher} onOpenChange={setShowRoomSwitcher}>
            <DrawerContent className="border-t border-border/40 bg-background/95 backdrop-blur-xl">
              <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1 sm:pt-4">
                <DrawerHeader className="gap-0 sm:gap-0 mb-2 px-0 pb-3 pt-0 text-left sm:p-0 sm:pb-4">
                  <DrawerTitle className="font-display text-[20px] font-semibold leading-tight text-foreground">
                    Channels
                  </DrawerTitle>
                  <DrawerDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                    Switch to a different section
                  </DrawerDescription>
                </DrawerHeader>

                <div className="space-y-2">
                  {getClubRooms(club?.rooms).map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setActiveRoom(r.id);
                        setShowRoomSwitcher(false);
                        scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition active:scale-[0.99] ${
                        activeRoom === r.id
                          ? "border-[#cc208f] bg-[#cc208f]/[0.06]"
                          : "border-foreground/12 hover:bg-foreground/[0.03]"
                      }`}
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                          activeRoom === r.id
                            ? "bg-[#cc208f]/10 text-[#a3186f]"
                            : "bg-foreground/[0.05] text-muted-foreground"
                        }`}
                      >
                        <Hash className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
                        {r.name}
                      </span>
                      {sectionUpdateFor(r.id) && (
                        <SectionDot count={sectionUpdateFor(r.id)!.count} />
                      )}
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                          activeRoom === r.id
                            ? "bg-[#cc208f] text-white"
                            : "border-[1.5px] border-foreground/20"
                        }`}
                      >
                        {activeRoom === r.id && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setActiveRoom(QUIZ_ROOM);
                    setShowRoomSwitcher(false);
                  }}
                  className={`mt-2 flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition active:scale-[0.99] ${
                    activeRoom === QUIZ_ROOM
                      ? "border-[#cc208f] bg-[#cc208f]/[0.06]"
                      : "border-foreground/12 hover:bg-foreground/[0.03]"
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${activeRoom === QUIZ_ROOM ? "bg-[#cc208f]/10 text-[#a3186f]" : "bg-foreground/[0.05] text-muted-foreground"}`}
                  >
                    <ClipboardCheck className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
                    Quizzes
                  </span>
                  {sectionUpdateFor(QUIZ_ROOM) && (
                    <SectionDot count={sectionUpdateFor(QUIZ_ROOM)!.count} />
                  )}
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${activeRoom === QUIZ_ROOM ? "bg-[#cc208f] text-white" : "border-[1.5px] border-foreground/20"}`}
                  >
                    {activeRoom === QUIZ_ROOM && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </button>
              </div>
            </DrawerContent>
          </Drawer>
        </div>

        {/* Pinned Rules */}
        <button
          onClick={() => setShowRules(true)}
          className="mx-3 mt-3 flex shrink-0 items-start gap-2.5 rounded-xl bg-[#cc208f]/[0.06] px-3 py-2.5 text-left transition-colors active:bg-[#cc208f]/10"
        >
          <Pin className="mt-px h-4 w-4 shrink-0 text-[#cc208f]" />
          <p className="line-clamp-2 flex-1 text-[13px] leading-snug text-foreground">
            <span className="font-semibold">Pinned · Club rules</span>
            <br />
            <span className="text-muted-foreground">
              {club?.rules || "Be respectful, help others, and share your work!"}
            </span>
          </p>
        </button>

        {/* Rules Modal */}
        {showRules && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border">
              <div className="px-5 py-4 border-b hairline flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#cc208f]/10">
                    <Pin className="h-4 w-4 text-[#cc208f]" />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold text-foreground">Club rules</h3>
                    <p className="text-[12px] text-muted-foreground">{club?.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRules(false)}
                  className="h-7 w-7 rounded-full bg-foreground/[0.06] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 no-scrollbar">
                <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/85">
                  {club?.rules || "Be respectful, help others, and share your work!"}
                </div>
              </div>

              <div className="p-4 pt-0">
                <button
                  onClick={() => setShowRules(false)}
                  className="h-11 w-full rounded-full bg-foreground text-[15px] font-semibold text-background transition active:scale-95"
                >
                  I understand
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
                  <Link
                    to="/app/premium"
                    className="inline-block mt-2 text-[10px] font-bold text-amber-500 bg-amber-500/20 px-3 py-1.5 rounded-full hover:bg-amber-500/30 transition"
                  >
                    Upgrade Now
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {activeRoom === QUIZ_ROOM ? (
          <main className="w-full shrink-0 pb-28">
            <ClubQuizzes clubId={club?.id || clubId || ""} embedded />
          </main>
        ) : ["assignments", "announcements", "q-and-a"].includes(activeRoom) ? (
          <main className="w-full shrink-0 px-4 py-5 md:px-6 md:py-7">
            <StructuredClubRoom
              key={activeRoom}
              room={activeRoom}
              messages={messages}
              isAdmin={isAdmin}
              isOwner={Boolean(club?.creator_id && club.creator_id === currentUser?.id)}
              currentUser={currentUser}
              onPost={handleSendMessage}
            />
          </main>
        ) : (
          <main className="mt-auto flex w-full shrink-0 flex-col gap-1 px-3 py-3">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
                <Hash className="mb-3 h-9 w-9 text-muted-foreground" />
                <p className="text-[15px] font-semibold text-foreground">No messages yet</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Be the first to post in this room.
                </p>
              </div>
            )}
            {messages.map((m, index) => (
              <Fragment key={m.id}>
                {activeRoom === "general" &&
                  clubSponsoredSlots.includes(index) &&
                  clubSponsored[clubSponsoredSlots.indexOf(index)] && (
                    <div className="mx-auto my-3 w-full max-w-[520px] px-1">
                      <SponsoredPostCard
                        compact
                        item={clubSponsored[clubSponsoredSlots.indexOf(index)]}
                      />
                    </div>
                  )}
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMe={m.profile_id === currentUser?.id}
                  currentUser={currentUser}
                  members={members}
                  repliedMessage={
                    m.reply_to_id ? messages.find((prev) => prev.id === m.reply_to_id) : null
                  }
                  onReply={setReplyingTo}
                  onReact={handleReact}
                  onEdit={handleEditMessage}
                  getRoleColor={getRoleColor}
                  room={activeRoom}
                  isAdmin={isAdmin}
                  onReplyText={(text: string) => handleSendMessage(text, m.id)}
                />
              </Fragment>
            ))}
          </main>
        )}
      </div>

      {/* A floating Zero Club mark that opens every section in one drawer, for
          moving around a busy club fast. Admins also get their tools here. */}
      {Boolean(club) && (
        <>
          <button
            type="button"
            onClick={() => setShowQuickNav(true)}
            aria-label={
              unseenSectionTotal > 0
                ? `Club sections and tools, ${unseenSectionTotal} new`
                : "Club sections and tools"
            }
            className={`absolute right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#cc208f] text-white shadow-[0_14px_30px_-10px_rgba(204,32,143,0.85)] ring-4 ring-card transition active:scale-90 ${
              ["assignments", "announcements", "q-and-a", QUIZ_ROOM].includes(activeRoom)
                ? "bottom-[calc(20px+env(safe-area-inset-bottom))]"
                : "bottom-[calc(96px+env(safe-area-inset-bottom))]"
            }`}
          >
            {unseenSectionTotal > 0 && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-[#cc208f]/40 [animation-duration:2.4s]"
              />
            )}
            <ZeroMark size={28} />
            {unseenSectionTotal > 0 && (
              <span className="absolute -right-1 -top-1 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-foreground px-1.5 text-[11.5px] font-bold leading-none text-background ring-[3px] ring-card tabular-nums">
                {unseenSectionTotal > 99 ? "99+" : unseenSectionTotal}
              </span>
            )}
          </button>

          <Drawer open={showQuickNav} onOpenChange={setShowQuickNav}>
            <DrawerContent className="border-t border-border/40 bg-background/95 backdrop-blur-xl">
              <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1 sm:pt-4">
                <DrawerHeader className="mb-2 gap-0 px-0 pb-3 pt-0 text-center sm:gap-0 sm:p-0 sm:pb-4">
                  <DrawerTitle className="font-display text-[20px] font-semibold leading-tight text-foreground">
                    Go to
                  </DrawerTitle>
                  <DrawerDescription className="mt-1 truncate text-[14px] text-muted-foreground">
                    {unseenSectionTotal > 0
                      ? `${unseenSectionTotal} new ${unseenSectionTotal === 1 ? "update" : "updates"} in ${club?.name}`
                      : club?.name}
                  </DrawerDescription>
                </DrawerHeader>

                <div className="space-y-1">
                  {[...getClubRooms(club?.rooms), { id: QUIZ_ROOM, name: "Quizzes" }].map(
                    (r: any) => {
                      const Icon =
                        r.id === "assignments"
                          ? ClipboardCheck
                          : r.id === "announcements"
                            ? Megaphone
                            : r.id === "q-and-a"
                              ? HelpCircle
                              : r.id === QUIZ_ROOM
                                ? BookOpenCheck
                                : Hash;
                      const active = activeRoom === r.id;
                      const update = sectionUpdateFor(r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => {
                            setActiveRoom(r.id);
                            setShowQuickNav(false);
                          }}
                          className={`flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition active:scale-[0.99] ${active ? "bg-[#cc208f]/[0.08]" : "hover:bg-foreground/[0.04]"}`}
                        >
                          <span
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? "bg-[#cc208f] text-white" : "bg-foreground/[0.05] text-foreground"}`}
                          >
                            <Icon className="h-[19px] w-[19px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-[16px] text-foreground ${update ? "font-semibold" : "font-medium"}`}
                            >
                              {r.name}
                            </span>
                            {update && (
                              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                                {sectionNewLabel(r.id, update.count)}
                                {update.latest_content
                                  ? ` · ${r.id === QUIZ_ROOM ? update.latest_content : contentPreview(update.latest_content)}`
                                  : ""}
                              </span>
                            )}
                          </span>
                          {update ? (
                            <span className="flex shrink-0 flex-col items-end gap-1">
                              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#cc208f] px-2 text-[12px] font-bold text-white tabular-nums">
                                {update.count > 99 ? "99+" : update.count}
                              </span>
                              {update.latest_at && (
                                <span className="text-[11px] text-muted-foreground">
                                  {sectionTimeAgo(update.latest_at)}
                                </span>
                              )}
                            </span>
                          ) : active ? (
                            <Check className="h-4 w-4 shrink-0 text-[#cc208f]" strokeWidth={3} />
                          ) : null}
                        </button>
                      );
                    },
                  )}
                </div>

                <div className="my-3 h-px bg-border" />

                <div className="space-y-1">
                  {(isAdmin || liveNow) && (
                    <button
                      onClick={() => {
                        setShowQuickNav(false);
                        if (liveNow)
                          navigate({
                            to: "/app/live/$classId",
                            params: { classId: club?.id || clubId || "unknown" },
                          });
                        else {
                          setShowScheduleForm(false);
                          setShowLiveMenu(true);
                        }
                      }}
                      className="flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-foreground/[0.04] active:scale-[0.99]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.05] text-foreground">
                        <Radio className="h-[19px] w-[19px]" />
                      </span>
                      <span className="flex-1 text-[16px] font-medium text-foreground">
                        {liveNow ? "Join the live class" : "Go live or schedule"}
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowQuickNav(false);
                      setShowMembers(true);
                    }}
                    className="flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-foreground/[0.04] active:scale-[0.99]"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.05] text-foreground">
                      <Users className="h-[19px] w-[19px]" />
                    </span>
                    <span className="flex-1 text-[16px] font-medium text-foreground">Members</span>
                  </button>
                  <EnterToSendRow />
                  {club?.creator_id === currentUser?.id && (
                    <button
                      onClick={() => {
                        setShowQuickNav(false);
                        setShowSettings(true);
                      }}
                      className="flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-foreground/[0.04] active:scale-[0.99]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.05] text-foreground">
                        <Settings className="h-[19px] w-[19px]" />
                      </span>
                      <span className="flex-1 text-[16px] font-medium text-foreground">
                        Club settings
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}

      {/* An overlay, not a footer. Absolute rather than fixed: this page is a
          fixed panel whose height follows visualViewport, so a fixed child
          would ignore both the desktop sidebar offset and the shrinking the
          keyboard causes. */}
      {!["assignments", "announcements", "q-and-a", QUIZ_ROOM].includes(activeRoom) && (
        <ComposerOverlay position="absolute" maxWidthClassName="max-w-[820px]">
          {/* "Ada is typing…", WhatsApp-style, just above the box. */}
          {roomTypists.length > 0 && (
            <div className="mb-1.5 flex" aria-live="polite">
              <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background/95 py-1 pl-1.5 pr-3 text-[12.5px] font-medium text-muted-foreground shadow-[0_6px_18px_-10px_rgba(0,0,0,0.5)] backdrop-blur">
                <span className="flex -space-x-1.5">
                  {roomTypists.slice(0, 3).map((typist) => {
                    const member = members.find((m: any) => m.profile_id === typist.id || m.profiles?.id === typist.id);
                    const avatarUrl = member?.profiles?.avatar_url;
                    return (
                      <span key={typist.id} className="grid h-5 w-5 place-items-center overflow-hidden rounded-full bg-foreground/[0.08] text-[9px] font-bold ring-2 ring-background">
                        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : typist.name.charAt(0).toUpperCase()}
                      </span>
                    );
                  })}
                </span>
                <span className="truncate">{typingLabel(roomTypists)}</span>
                <span className="zc-typing-dots inline-flex items-center gap-[3px] text-[#cc208f]"><span /><span /><span /></span>
              </span>
            </div>
          )}
          {replyingTo && (
            /* Solid on purpose: messages scroll underneath the composer, and a
             see-through bar let them show through the reply preview. */
            <div
              className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-background py-2 pl-3 pr-2 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.45)]"
              style={{ borderLeft: "3px solid #cc208f" }}
            >
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[11px] font-bold text-[#cc208f]">
                  <Reply className="h-3 w-3" /> Replying to{" "}
                  {replyingTo.profiles?.full_name || replyingTo.profiles?.username || "a message"}
                </span>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {contentPreview(replyingTo.content) || "Message"}
                </p>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {mediaPreviews.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar py-2">
              {mediaPreviews.map((preview, idx) => (
                <div
                  key={idx}
                  className={`relative shrink-0 overflow-hidden rounded-lg border border-border bg-card ${mediaFiles[idx]?.type.startsWith("audio/") || (!mediaFiles[idx]?.type.startsWith("image/") && !mediaFiles[idx]?.type.startsWith("video/")) ? "min-w-[190px] p-2 pr-7" : "h-16 w-16"}`}
                >
                  {mediaFiles[idx]?.type.startsWith("audio/") ? (
                    <VoiceNotePlayer src={preview} name={mediaFiles[idx]?.name} />
                  ) : mediaFiles[idx]?.type.startsWith("video/") ? (
                    <video src={preview} className="h-full w-full object-cover" />
                  ) : mediaFiles[idx]?.type.startsWith("image/") ? (
                    <img
                      src={preview}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-10 items-center gap-2 px-1">
                      <FileText className="h-5 w-5 shrink-0 text-primary" />
                      <span className="max-w-[130px] truncate text-[11px] font-medium">
                        {mediaFiles[idx]?.name}
                      </span>
                    </div>
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

          <ClubMessageComposer
            placeholder={
              activeRoom === "general" ? "Write a message..." : `Post in ${activeRoom}...`
            }
            hasMedia={mediaFiles.length > 0}
            members={members}
            onSend={(text) => handleSendMessage(text)}
            onTyping={notifyTyping}
            onStopTyping={stopTyping}
            avatar={
              <div className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/30 text-xs font-bold text-muted-foreground">
                {currentUserProfile?.avatar_url ? (
                  <img
                    src={currentUserProfile.avatar_url}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  (currentUserProfile?.full_name || currentUserProfile?.username || "U")
                    .substring(0, 1)
                    .toUpperCase()
                )}
              </div>
            }
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
                <input
                  type="file"
                  ref={videoInputRef}
                  onChange={handleChatMediaUpload}
                  className="hidden"
                  multiple
                  accept="video/*"
                />
                <input
                  type="file"
                  ref={documentInputRef}
                  onChange={handleChatMediaUpload}
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv,application/*"
                />
                <button
                  onClick={toggleVoiceRecording}
                  title={isRecording ? "Stop recording" : "Record voice note"}
                  className={`relative inline-flex h-8 items-center justify-center rounded-full transition active:scale-95 ${isRecording ? "min-w-12 bg-red-500 px-2 text-white" : "w-8 text-muted-foreground hover:text-foreground"}`}
                >
                  {isRecording ? (
                    <>
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span className="ml-1 text-[9px] tabular-nums">
                        {Math.floor(recordingSeconds / 60)}:
                        {String(recordingSeconds % 60).padStart(2, "0")}
                      </span>
                    </>
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      title="Add attachment"
                      className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:text-foreground active:scale-95"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    side="top"
                    className="z-[100] w-44 border-border bg-background/95 shadow-lift backdrop-blur-xl"
                  >
                    <DropdownMenuItem
                      onSelect={() => mediaInputRef.current?.click()}
                      className="gap-2.5"
                    >
                      <Image className="h-4 w-4" /> Pictures
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => videoInputRef.current?.click()}
                      className="gap-2.5"
                    >
                      <Film className="h-4 w-4" /> Video
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => documentInputRef.current?.click()}
                      className="gap-2.5"
                    >
                      <File className="h-4 w-4" /> File
                    </DropdownMenuItem>
                    {/* Admins only: members see Pictures, Video and File. */}
                    {isAdmin && activeRoom === "general" && (
                      <DropdownMenuItem
                        onSelect={() => setShowNotePicker(true)}
                        className="gap-2.5"
                      >
                        <BookOpen className="h-4 w-4" /> Notes
                      </DropdownMenuItem>
                    )}
                    {isAdmin && activeRoom === "general" && (
                      <DropdownMenuItem onSelect={() => setShowGiveaway(true)} className="gap-2.5">
                        <Gift className="h-4 w-4 fill-current" /> Give Away
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
        </ComposerOverlay>
      )}
    </div>
  );
}

const CLUB_CARD_PREFIX = "::ZEROCLUB_CARD::";
const CLUB_REPLY_PREFIX = "::ZEROCLUB_REPLY::";

type ClubCardPayload = {
  type: "announcement" | "assignment" | "question";
  title: string;
  body: string;
  dueDate?: string;
  /** "HH:MM", local time. Missing on older assignments: they close at the end of the day. */
  dueTime?: string;
  /** Total marks, set by the club owner. Grades can't exceed it. */
  maxMarks?: number;
  /** Pictures and videos attached by the tutor. */
  media?: { type: "image" | "video"; url: string; name?: string }[];
};

/** Pictures and videos attached to an assignment or announcement. */
function CardMedia({
  media,
  compact = false,
}: {
  media?: ClubCardPayload["media"];
  compact?: boolean;
}) {
  if (!media?.length) return null;
  if (compact) {
    return (
      <div className="mt-3 flex gap-1.5">
        {media.slice(0, 4).map((m, i) => (
          <span key={i} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
            {m.type === "video" ? (
              <>
                <video
                  src={m.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 grid place-items-center bg-black/25">
                  <Film className="h-4 w-4 text-white" />
                </span>
              </>
            ) : (
              <img
                src={m.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            )}
            {i === 3 && media.length > 4 && (
              <span className="absolute inset-0 grid place-items-center bg-black/55 text-[13px] font-bold text-white">
                +{media.length - 4}
              </span>
            )}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className={`mt-4 grid gap-2 ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {media.map((m, i) =>
        m.type === "video" ? (
          <video
            key={i}
            src={m.url}
            controls
            playsInline
            preload="metadata"
            className="max-h-80 w-full rounded-xl bg-black object-contain"
          />
        ) : (
          <a
            key={i}
            href={m.url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl bg-muted"
          >
            <img
              src={m.url}
              alt={m.name || ""}
              loading="lazy"
              decoding="async"
              className="max-h-80 w-full object-cover"
            />
          </a>
        ),
      )}
    </div>
  );
}

/** When an assignment closes, as a Date (end of the day if no time was set). */
const assignmentDue = (card: ClubCardPayload) =>
  card.dueDate ? new Date(`${card.dueDate}T${card.dueTime || "23:59"}:00`) : null;

const formatDue = (card: ClubCardPayload) => {
  const due = assignmentDue(card);
  if (!due || Number.isNaN(due.getTime())) return null;
  const day = due.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return card.dueTime
    ? `${day}, ${due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : day;
};

const fmtMark = (n: number) =>
  Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1);

const encodeClubCard = (payload: ClubCardPayload) =>
  `${CLUB_CARD_PREFIX}${JSON.stringify(payload)}`;
const encodeClubReply = (
  type: "submission" | "answer",
  body: string,
  media?: ClubCardPayload["media"],
) => `${CLUB_REPLY_PREFIX}${JSON.stringify({ type, body, media })}`;

const parseClubCard = (message: any, room: string): ClubCardPayload => {
  const raw = String(message?.content || "");
  if (raw.startsWith(CLUB_CARD_PREFIX)) {
    try {
      return JSON.parse(raw.slice(CLUB_CARD_PREFIX.length));
    } catch {
      // Older malformed room posts still remain readable below.
    }
  }

  const [firstLine, ...rest] = raw.split("\n").filter(Boolean);
  return {
    type: room === "assignments" ? "assignment" : room === "q-and-a" ? "question" : "announcement",
    title:
      firstLine ||
      (room === "assignments" ? "Assignment" : room === "q-and-a" ? "Question" : "Announcement"),
    body: rest.join("\n") || firstLine || "",
  };
};

const parseClubReply = (message: any) => {
  const raw = String(message?.content || "");
  if (raw.startsWith(CLUB_REPLY_PREFIX)) {
    try {
      return JSON.parse(raw.slice(CLUB_REPLY_PREFIX.length)) as {
        type: "submission" | "answer";
        body: string;
        media?: ClubCardPayload["media"];
      };
    } catch {
      // Fall through to legacy plain-text replies.
    }
  }
  return { type: "answer" as const, body: raw };
};

function StructuredClubRoom({
  room,
  messages,
  isAdmin,
  isOwner = false,
  currentUser,
  onPost,
}: any) {
  const [showComposer, setShowComposer] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [maxMarks, setMaxMarks] = useState("");
  const [attachments, setAttachments] = useState<NonNullable<ClubCardPayload["media"]>>([]);
  const [attaching, setAttaching] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [grades, setGrades] = useState<Record<string, any>>({});
  const [gradeDrafts, setGradeDrafts] = useState<
    Record<string, { score: string; feedback: string }>
  >({});
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [threadReply, setThreadReply] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<NonNullable<ClubCardPayload["media"]>>(
    [],
  );
  const [replyAttaching, setReplyAttaching] = useState(false);
  const replyAttachInputRef = useRef<HTMLInputElement>(null);
  const uploadBusy = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setThreadReply("");
    setReplyAttachments([]);
    if (replyAttachInputRef.current) replyAttachInputRef.current.value = "";
  }, [selectedCard?.id]);

  const [showClosedAssignments, setShowClosedAssignments] = useState(false);

  const closedAssignmentsCount = useMemo(() => {
    if (room !== "assignments") return 0;
    return messages.filter((message: any) => {
      if (message.reply_to_id) return false;
      const card = parseClubCard(message, room);
      const due = assignmentDue(card);
      return Boolean(due && due.getTime() <= Date.now());
    }).length;
  }, [messages, room]);

  const cards = messages.filter((message: any) => {
    if (message.reply_to_id) return false;
    if (room === "assignments" && !showClosedAssignments) {
      const card = parseClubCard(message, room);
      const due = assignmentDue(card);
      if (due && due.getTime() <= Date.now()) {
        return false; // Remove assignment anytime it has reached its due date
      }
    }
    return true;
  });

  // Marks for submissions. Row-level security returns only what this person
  // may see: their own marks, or every mark for the club owner and admins.
  const cardIdsKey = room === "assignments" ? cards.map((c: any) => c.id).join(",") : "";
  const loadGrades = async () => {
    if (!cardIdsKey) return;
    const { data } = await supabase
      .from("club_assignment_grades")
      .select("submission_id, score, max_marks, feedback, graded_at")
      .in("assignment_id", cardIdsKey.split(","));
    const next: Record<string, any> = {};
    (data || []).forEach((g: any) => {
      next[g.submission_id] = g;
    });
    setGrades(next);
  };
  useEffect(() => {
    void loadGrades();
  }, [cardIdsKey]);

  const saveGrade = async (submissionId: string, max: number) => {
    const draft = gradeDrafts[submissionId] || { score: "", feedback: "" };
    const score = Number(draft.score);
    if (draft.score.trim() === "" || Number.isNaN(score) || score < 0 || score > max) {
      toast.error(`Enter a mark between 0 and ${fmtMark(max)}.`);
      return;
    }
    setGradingId(submissionId);
    const { data, error } = await supabase.rpc("grade_club_submission", {
      p_submission: submissionId,
      p_score: score,
      p_feedback: draft.feedback || null,
    });
    setGradingId(null);
    if (error || !data?.ok) {
      const reason = data?.reason;
      toast.error(
        reason === "owner_only"
          ? "Only the club owner can mark assignments."
          : reason === "out_of_range"
            ? `Marks must be between 0 and ${fmtMark(data.max)}.`
            : reason === "no_marks_set"
              ? "This assignment has no total marks."
              : error?.message || "Could not save the mark.",
      );
      return;
    }
    const xpAwarded = Math.max(0, Math.round(score));
    if (xpAwarded > 0 && selectedCard?.id) {
      const replies = messages.filter((m: any) => m.reply_to_id === selectedCard.id);
      const sub = replies.find((r: any) => r.id === submissionId);
      if (sub?.profile_id) {
        const res = await supabase.rpc("award_assignment_xp", {
          p_user_id: sub.profile_id,
          p_xp: xpAwarded,
        });
        if (res.error) {
          await supabase
            .from("profiles")
            .update({ xp: (sub.profiles?.xp || 0) + xpAwarded })
            .eq("id", sub.profile_id);
        }
      }
    }
    toast.success(
      `Marked ${fmtMark(score)}/${fmtMark(max)}${xpAwarded > 0 ? ` (+${xpAwarded} XP awarded)` : ""}`,
    );
    setGradeDrafts((d) => {
      const n = { ...d };
      delete n[submissionId];
      return n;
    });
    void loadGrades();
  };
  const roomMeta =
    room === "assignments"
      ? {
          label: "Classwork",
          description: "Assignments, briefs, and student submissions stay organised here.",
          emptyTitle: "No classwork yet",
          emptyCopy: isAdmin
            ? "Create the first assignment for this club."
            : "Assignments from your tutor will appear here.",
          action: "New assignment",
          icon: ClipboardCheck,
        }
      : room === "q-and-a"
        ? {
            label: "Questions & answers",
            description:
              "Each question has one focused thread, so useful answers are easy to find.",
            emptyTitle: "No questions yet",
            emptyCopy: "Start the first focused question for this club.",
            action: "Ask a question",
            icon: HelpCircle,
          }
        : {
            label: "Announcements",
            description: "Official updates from club admins, kept clear of everyday conversation.",
            emptyTitle: "No announcements yet",
            emptyCopy: isAdmin
              ? "Publish the first update for your members."
              : "Official club updates will appear here.",
            action: "New announcement",
            icon: Megaphone,
          };

  const RoomIcon = roomMeta.icon;
  const canCreate = room === "q-and-a" || isAdmin;

  const resetComposer = () => {
    setTitle("");
    setBody("");
    setDueDate("");
    setDueTime("");
    setMaxMarks("");
    setAttachments([]);
    setShowComposer(false);
  };

  const submitCard = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error(
        room === "q-and-a"
          ? "Add a clear question and some context."
          : "Add a title and details first.",
      );
      return;
    }

    setIsSubmitting(true);
    const type =
      room === "assignments" ? "assignment" : room === "q-and-a" ? "question" : "announcement";
    const marks = Number(maxMarks);
    if (
      room === "assignments" &&
      isOwner &&
      maxMarks.trim() &&
      (!Number.isFinite(marks) || marks <= 0 || marks > 1000)
    ) {
      toast.error("Total marks must be a number between 1 and 1000.");
      setIsSubmitting(false);
      return;
    }
    await onPost(
      encodeClubCard({
        type,
        title: title.trim(),
        body: body.trim(),
        dueDate: dueDate || undefined,
        dueTime: dueDate && dueTime ? dueTime : undefined,
        maxMarks: room === "assignments" && isOwner && marks > 0 ? marks : undefined,
        media: attachments.length ? attachments : undefined,
      }),
      null,
    );
    resetComposer();
    setIsSubmitting(false);
  };

  const addAttachments = async (files: FileList | null, submission = false) => {
    if (!files?.length || !currentUser?.id || uploadBusy.current || isSubmitting) return;
    const room_ = Math.max(0, 6 - (submission ? replyAttachments : attachments).length);
    const chosen = Array.from(files).slice(0, room_);
    if (!chosen.length) {
      toast.error("You can attach up to 6 pictures or videos.");
      return;
    }
    uploadBusy.current = true;
    const setUploading = submission ? setReplyAttaching : setAttaching;
    const inputRef = submission ? replyAttachInputRef : attachInputRef;
    setUploading(true);
    const added: NonNullable<ClubCardPayload["media"]> = [];
    for (const original of chosen) {
      try {
        const isVideo = original.type.startsWith("video/");
        if (isVideo && original.size > 50 * 1024 * 1024) {
          toast.error(`${original.name} is over 50MB`);
          continue;
        }
        if (!isVideo && !original.type.startsWith("image/")) continue;
        const file = isVideo ? original : await compressImage(original);
        const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase();
        const path = `${currentUser.id}/classwork/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("post-media")
          .upload(path, file, { cacheControl: "31536000", contentType: file.type || undefined });
        if (error) throw error;
        const {
          data: { publicUrl },
        } = supabase.storage.from("post-media").getPublicUrl(path);
        added.push({ type: isVideo ? "video" : "image", url: publicUrl, name: original.name });
      } catch (e: any) {
        toast.error(`Couldn't attach ${original.name}: ${e?.message || "upload failed"}`);
      }
    }
    (submission ? setReplyAttachments : setAttachments)((current) => [...current, ...added]);
    setUploading(false);
    uploadBusy.current = false;
    if (inputRef.current) inputRef.current.value = "";
  };

  const submitThreadReply = async () => {
    if (
      (!threadReply.trim() && !replyAttachments.length) ||
      !selectedCard ||
      replyAttaching ||
      isSubmitting
    )
      return;
    setIsSubmitting(true);
    try {
      const result = await onPost(
        encodeClubReply(
          room === "assignments" ? "submission" : "answer",
          threadReply.trim(),
          replyAttachments.length ? replyAttachments : undefined,
        ),
        selectedCard.id,
      );
      if (result !== false) {
        if (room === "assignments") {
          const xpEarned = 50;
          if (currentUser?.id) {
            const res = await supabase.rpc("award_assignment_xp", {
              p_user_id: currentUser.id,
              p_xp: xpEarned,
            });
            if (res.error) {
              await supabase
                .from("profiles")
                .update({ xp: ((currentUser as any)?.xp || 0) + xpEarned })
                .eq("id", currentUser.id);
            }
          }
          toast.success(`Assignment submitted! You earned +${xpEarned} XP ⚡`);
        }
        setThreadReply("");
        setReplyAttachments([]);
      }
    } catch {
      toast.error("Could not submit your work. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="zc-page-width mx-auto w-full min-w-0 max-w-[760px] overflow-hidden">
      <div className="mb-5 flex flex-col gap-4 border-b border-border pb-5 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <RoomIcon className="h-5 w-5 fill-current" />
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              {roomMeta.label}
            </h3>
            <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">
              {roomMeta.description}
            </p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowComposer((open) => !open)}
            className="flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-foreground px-3.5 text-xs font-semibold text-background transition hover:opacity-90 active:scale-[0.98] sm:w-auto"
          >
            {showComposer ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span>{showComposer ? "Close" : roomMeta.action}</span>
          </button>
        )}
      </div>

      {!canCreate && room === "announcements" && (
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
              placeholder={
                room === "q-and-a"
                  ? "What do you need help with?"
                  : room === "assignments"
                    ? "Assignment title"
                    : "Announcement title"
              }
              className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3.5 text-sm outline-none transition focus:border-primary"
            />
            <MentionField
              wrapperClassName="relative w-full min-w-0"
              menuPlacement="bottom"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={
                room === "q-and-a"
                  ? "Add enough context for the club to give a useful answer..."
                  : room === "assignments"
                    ? "Add the brief, instructions, and expected outcome..."
                    : "Write the update for club members..."
              }
              className="min-h-28 w-full min-w-0 resize-y rounded-md border border-border bg-background px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-primary"
            />
            {room === "assignments" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Due date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="h-11 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none transition focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Due time
                  </label>
                  <input
                    type="time"
                    value={dueTime}
                    disabled={!dueDate}
                    onChange={(event) => setDueTime(event.target.value)}
                    className="h-11 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none transition focus:border-primary disabled:opacity-50"
                  />
                </div>
                {isOwner && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Total marks
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={1000}
                      value={maxMarks}
                      onChange={(event) => setMaxMarks(event.target.value)}
                      placeholder="e.g. 20"
                      className="h-11 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none transition focus:border-primary"
                    />
                  </div>
                )}
                {isOwner && (
                  <p className="text-[12px] leading-relaxed text-muted-foreground sm:col-span-3">
                    Only you, as the club owner, can mark this assignment. Learners can score up to
                    the total marks you set.
                  </p>
                )}
              </div>
            )}
            {room !== "q-and-a" && (
              <div>
                <input
                  ref={attachInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void addAttachments(e.target.files)}
                />
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((m, i) => (
                      <span
                        key={m.url}
                        className="relative h-20 w-20 overflow-hidden rounded-lg bg-muted"
                      >
                        {m.type === "video" ? (
                          <>
                            <video
                              src={m.url}
                              muted
                              playsInline
                              preload="metadata"
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] font-bold text-white">
                              VIDEO
                            </span>
                          </>
                        ) : (
                          <img src={m.url} alt="" className="h-full w-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((current) => current.filter((_, j) => j !== i))
                          }
                          aria-label="Remove attachment"
                          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => attachInputRef.current?.click()}
                  disabled={attaching || attachments.length >= 6}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-dashed border-foreground/25 px-3.5 text-[13px] font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                >
                  {attaching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Image className="h-4 w-4" />
                  )}
                  {attaching ? "Uploading…" : "Attach pictures or videos"}
                </button>
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button
                onClick={submitCard}
                disabled={isSubmitting || !title.trim() || !body.trim()}
                className="h-10 w-full rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-40 sm:w-auto"
              >
                {isSubmitting
                  ? "Posting..."
                  : room === "q-and-a"
                    ? "Post question"
                    : room === "assignments"
                      ? "Create assignment"
                      : "Publish announcement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {room === "assignments" && closedAssignmentsCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">
            {closedAssignmentsCount} assignment{closedAssignmentsCount === 1 ? "" : "s"} removed
            after reaching due date.
          </span>
          <button
            type="button"
            onClick={() => setShowClosedAssignments((v) => !v)}
            className="font-semibold text-primary hover:underline"
          >
            {showClosedAssignments ? "Hide closed" : "View closed"}
          </button>
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
            const replyCount = messages.filter(
              (candidate: any) => candidate.reply_to_id === message.id,
            ).length;
            const author =
              message.profiles?.full_name || message.profiles?.username || "Club admin";
            const interactive = room !== "announcements";

            return (
              <article
                key={message.id}
                onClick={() => interactive && setSelectedCard(message)}
                onKeyDown={(event) => {
                  if (interactive && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    setSelectedCard(message);
                  }
                }}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                className={`w-full max-w-full overflow-hidden border border-border bg-card p-3 text-left transition sm:p-5 ${interactive ? "hover:border-primary/40 hover:bg-accent/20 active:scale-[0.995]" : "cursor-default"}`}
              >
                <div className="flex min-w-0 items-start gap-2.5 sm:gap-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary sm:h-10 sm:w-10">
                    {room === "assignments" ? (
                      <FileText className="h-5 w-5 fill-current" />
                    ) : room === "q-and-a" ? (
                      <HelpCircle className="h-5 w-5 fill-current" />
                    ) : (
                      <Megaphone className="h-5 w-5 fill-current" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="break-words text-[15px] font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">
                        {card.title}
                      </h4>
                      {interactive && (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                      {card.body}
                    </p>
                    <CardMedia media={card.media} compact={interactive} />
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <Link
                        to="/app/profile/$id"
                        params={{ id: message.profiles?.username || message.profile_id }}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="flex items-center gap-1.5 font-medium text-foreground transition hover:opacity-70"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[8px]">
                          {message.profiles?.avatar_url ? (
                            <img
                              src={message.profiles.avatar_url}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            author.substring(0, 1).toUpperCase()
                          )}
                        </span>
                        <span>{author}</span>
                      </Link>
                      <span>
                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                      </span>
                      {card.dueDate &&
                        (() => {
                          const due = assignmentDue(card);
                          const overdue = Boolean(due && due.getTime() < Date.now());
                          return (
                            <span
                              className={`font-medium ${overdue ? "text-rose-600" : "text-foreground"}`}
                            >
                              {overdue ? "Closed" : "Due"} {formatDue(card)}
                            </span>
                          );
                        })()}
                      {card.maxMarks ? (
                        <span className="rounded-full bg-[#cc208f]/10 px-2 py-0.5 font-semibold text-[#a3186f]">
                          {fmtMark(card.maxMarks)} marks
                        </span>
                      ) : null}
                      {interactive && (
                        <span className="font-medium text-primary">
                          {replyCount} {room === "assignments" ? "submissions" : "answers"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Drawer
        open={Boolean(selectedCard)}
        dismissible={!replyAttaching && !isSubmitting}
        onOpenChange={(open) => !open && !replyAttaching && !isSubmitting && setSelectedCard(null)}
      >
        <DrawerContent
          desktopVariant="panel"
          className="mx-auto h-[94dvh] max-w-[760px] overflow-hidden border border-border bg-background p-0 shadow-2xl sm:h-[90dvh]"
        >
          {selectedCard &&
            (() => {
              const card = parseClubCard(selectedCard, room);
              const replies = messages.filter(
                (message: any) => message.reply_to_id === selectedCard.id,
              );
              return (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    <DrawerHeader className="gap-0 sm:gap-0 px-5 pb-5 pt-1 text-left sm:px-6 sm:pb-6 sm:pt-4">
                      <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#cc208f]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#a3186f]">
                        {room === "assignments" ? (
                          <BookOpenCheck className="h-3.5 w-3.5" />
                        ) : (
                          <HelpCircle className="h-3.5 w-3.5" />
                        )}
                        {room === "assignments" ? "Assignment details" : "Question thread"}
                      </span>
                      <DrawerTitle className="break-words pr-8 font-display text-[20px] font-semibold leading-tight [overflow-wrap:anywhere]">
                        {card.title}
                      </DrawerTitle>
                      {(card.dueDate || card.maxMarks) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] font-medium text-muted-foreground">
                          {card.dueDate && (
                            <span
                              className={`inline-flex items-center gap-1.5 ${assignmentDue(card)!.getTime() < Date.now() ? "text-rose-600" : ""}`}
                            >
                              <CalendarDays className="h-4 w-4" />
                              {assignmentDue(card)!.getTime() < Date.now() ? "Closed" : "Due"}{" "}
                              {formatDue(card)}
                            </span>
                          )}
                          {card.maxMarks ? (
                            <span className="rounded-full bg-[#cc208f]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#a3186f]">
                              Total: {fmtMark(card.maxMarks)} marks
                            </span>
                          ) : null}
                        </div>
                      )}
                      <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">
                        {card.body}
                      </p>
                      <CardMedia media={card.media} />
                    </DrawerHeader>

                    <div className="border-t border-border/60 px-5 py-5 sm:px-6">
                      <h5 className="mb-3 text-[13px] font-semibold text-muted-foreground">
                        {room === "assignments"
                          ? `Submissions (${replies.length})`
                          : `Answers (${replies.length})`}
                      </h5>
                      {replies.length === 0 ? (
                        <div className="flex flex-col items-center px-5 py-10 text-center">
                          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground">
                            {room === "assignments" ? (
                              <BookOpenCheck className="h-[22px] w-[22px]" />
                            ) : (
                              <MessageSquare className="h-[22px] w-[22px]" />
                            )}
                          </div>
                          <p className="text-[16px] font-semibold text-foreground">
                            {room === "assignments" ? "No submissions yet" : "No answers yet"}
                          </p>
                          <p className="mt-1 text-[14px] text-muted-foreground">
                            {room === "assignments"
                              ? "Submitted work will show up here."
                              : "Add the first useful response."}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {replies.map((reply: any) => {
                            const parsedReply = parseClubReply(reply);
                            const author =
                              reply.profiles?.full_name ||
                              reply.profiles?.username ||
                              (reply.profile_id === currentUser?.id ? "You" : "Member");
                            return (
                              <article
                                key={reply.id}
                                className="rounded-2xl bg-foreground/[0.04] px-4 py-3.5"
                              >
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <Link
                                    to="/app/profile/$id"
                                    params={{ id: reply.profiles?.username || reply.profile_id }}
                                    className="flex min-w-0 items-center gap-2.5 text-[14px] font-semibold text-foreground transition hover:opacity-70"
                                  >
                                    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.08] text-[12px] text-muted-foreground">
                                      {reply.profiles?.avatar_url ? (
                                        <img
                                          src={reply.profiles.avatar_url}
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      ) : (
                                        author.substring(0, 1).toUpperCase()
                                      )}
                                    </span>
                                    <span className="truncate">{author}</span>
                                  </Link>
                                  <span className="shrink-0 text-[12px] text-muted-foreground">
                                    {formatDistanceToNow(new Date(reply.created_at), {
                                      addSuffix: true,
                                    })}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">
                                  {parsedReply.body}
                                </p>
                                <CardMedia media={parsedReply.media} />
                                {room === "assignments" &&
                                  (() => {
                                    const due = assignmentDue(card);
                                    const late = Boolean(
                                      due && new Date(reply.created_at).getTime() > due.getTime(),
                                    );
                                    const grade = grades[reply.id];
                                    const max = Number(card.maxMarks || 0);
                                    const draft = gradeDrafts[reply.id];
                                    return (
                                      <>
                                        {(late || grade) && (
                                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                            {late && (
                                              <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11.5px] font-semibold text-amber-600">
                                                Submitted late
                                              </span>
                                            )}
                                            {grade && (
                                              <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[12.5px] font-bold text-emerald-600">
                                                {fmtMark(grade.score)}/{fmtMark(grade.max_marks)}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {grade?.feedback && !draft && (
                                          <p className="mt-2 rounded-xl bg-background/70 px-3 py-2 text-[13.5px] leading-relaxed text-foreground/80">
                                            <span className="font-semibold">Tutor's note: </span>
                                            {grade.feedback}
                                          </p>
                                        )}
                                        {isOwner &&
                                          max > 0 &&
                                          (draft ? (
                                            <div className="mt-3 rounded-xl border border-border bg-background p-3">
                                              <div className="flex items-center gap-2">
                                                <input
                                                  type="number"
                                                  inputMode="decimal"
                                                  min={0}
                                                  max={max}
                                                  step="0.5"
                                                  autoFocus
                                                  value={draft.score}
                                                  onChange={(e) =>
                                                    setGradeDrafts((d) => ({
                                                      ...d,
                                                      [reply.id]: {
                                                        ...draft,
                                                        score: e.target.value,
                                                      },
                                                    }))
                                                  }
                                                  className="h-10 w-24 rounded-lg border border-border bg-card px-3 text-[15px] font-semibold outline-none focus:border-[#cc208f]"
                                                />
                                                <span className="text-[14px] font-semibold text-muted-foreground">
                                                  / {fmtMark(max)}
                                                </span>
                                              </div>
                                              <input
                                                value={draft.feedback}
                                                onChange={(e) =>
                                                  setGradeDrafts((d) => ({
                                                    ...d,
                                                    [reply.id]: {
                                                      ...draft,
                                                      feedback: e.target.value,
                                                    },
                                                  }))
                                                }
                                                placeholder="Feedback for the learner (optional)"
                                                className="mt-2 h-10 w-full rounded-lg border border-border bg-card px-3 text-[14px] outline-none focus:border-[#cc208f]"
                                              />
                                              <div className="mt-2 flex gap-2">
                                                <button
                                                  onClick={() => void saveGrade(reply.id, max)}
                                                  disabled={gradingId === reply.id}
                                                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#cc208f] text-[13.5px] font-semibold text-white disabled:opacity-50"
                                                >
                                                  {gradingId === reply.id && (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                  )}{" "}
                                                  Save mark
                                                </button>
                                                <button
                                                  onClick={() =>
                                                    setGradeDrafts((d) => {
                                                      const n = { ...d };
                                                      delete n[reply.id];
                                                      return n;
                                                    })
                                                  }
                                                  className="h-9 rounded-full bg-foreground/[0.06] px-4 text-[13.5px] font-semibold text-muted-foreground"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() =>
                                                setGradeDrafts((d) => ({
                                                  ...d,
                                                  [reply.id]: {
                                                    score: grade ? String(grade.score) : "",
                                                    feedback: grade?.feedback || "",
                                                  },
                                                }))
                                              }
                                              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-[#cc208f]/40 px-3 text-[12.5px] font-semibold text-[#cc208f]"
                                            >
                                              <Check className="h-3.5 w-3.5" />{" "}
                                              {grade ? "Change mark" : "Mark submission"}
                                            </button>
                                          ))}
                                      </>
                                    );
                                  })()}
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-border/60 bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
                    <label className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                      {room === "assignments" ? "Submit your work" : "Contribute an answer"}
                    </label>
                    {room === "assignments" && (
                      <div className="mb-3 space-y-2">
                        {replyAttachments.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {replyAttachments.map((media, index) => (
                              <div
                                key={media.url}
                                className="relative overflow-hidden rounded-lg bg-muted"
                              >
                                {media.type === "video" ? (
                                  <video
                                    src={media.url}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="h-24 w-full object-contain"
                                  />
                                ) : (
                                  <img
                                    src={media.url}
                                    alt={media.name || "Submission image"}
                                    className="h-24 w-full object-cover"
                                  />
                                )}
                                <button
                                  type="button"
                                  disabled={isSubmitting || replyAttaching}
                                  onClick={() =>
                                    setReplyAttachments((current) =>
                                      current.filter((_, i) => i !== index),
                                    )
                                  }
                                  aria-label={`Remove ${media.name || "attachment"}`}
                                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/75 text-white disabled:opacity-40"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <input
                          ref={replyAttachInputRef}
                          type="file"
                          accept="image/*,video/*"
                          multiple
                          className="hidden"
                          onChange={(event) => void addAttachments(event.target.files, true)}
                        />
                        <button
                          type="button"
                          onClick={() => replyAttachInputRef.current?.click()}
                          disabled={replyAttaching || isSubmitting || replyAttachments.length >= 6}
                          className="inline-flex items-center gap-2 rounded-full bg-foreground/[0.06] px-3 py-2 text-sm font-semibold disabled:opacity-40"
                        >
                          {replyAttaching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          {replyAttaching ? "Uploading..." : "Add images or videos"}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          Up to 6 images or videos. Videos up to 50 MB.
                        </p>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <MentionField
                        value={threadReply}
                        onChange={(event) => setThreadReply(event.target.value)}
                        placeholder={
                          room === "assignments"
                            ? "Add your submission, work link, or notes..."
                            : "Write a focused, helpful answer..."
                        }
                        rows={2}
                        className="block min-h-12 w-full resize-none rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 text-[15px] outline-none transition placeholder:text-muted-foreground focus:border-foreground/40"
                      />
                      <button
                        onClick={submitThreadReply}
                        disabled={
                          (!threadReply.trim() && !replyAttachments.length) ||
                          isSubmitting ||
                          replyAttaching
                        }
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-foreground text-background transition active:scale-95 disabled:opacity-40"
                        aria-label={room === "assignments" ? "Submit assignment" : "Post answer"}
                      >
                        <Send className="h-[18px] w-[18px] fill-current" />
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

function MessageBubble({
  message,
  isMe,
  currentUser,
  members,
  repliedMessage,
  onReply,
  onReact,
  onEdit,
  getRoleColor,
  room,
  isAdmin,
  onReplyText,
}: any) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const canEdit = Boolean(
    isMe && onEdit && !message.pending && !String(message.content || "").startsWith("::ZEROCLUB_"),
  );
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const startEdit = () => {
    setEditText(
      String(message.content || "")
        .split("$$MEDIA$$")[0]
        .trim(),
    );
    setEditing(true);
  };
  const saveEdit = async () => {
    if (savingEdit) return;
    const hasMedia = String(message.content || "").includes("$$MEDIA$$");
    if (!editText.trim() && !hasMedia) {
      toast.error("A message cannot be empty");
      return;
    }
    setSavingEdit(true);
    const ok = await onEdit(message.id, editText);
    setSavingEdit(false);
    if (ok) setEditing(false);
  };
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
  const role = member?.role || "Member";
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const groupedReactions =
    message.reactions?.reduce((acc: any, r: any) => {
      acc[r.emoji] = acc[r.emoji] || { count: 0, me: false };
      acc[r.emoji].count++;
      if (r.profile_id === currentUser?.id) acc[r.emoji].me = true;
      return acc;
    }, {}) || {};
  const giveaway = parseClubGiveaway(message.content);
  const clubNote = parseClubNote(message.content);
  const giveawayEntries =
    message.reactions?.filter((reaction: any) => reaction.emoji === GIVEAWAY_ENTRY_EMOJI) || [];
  const hasEnteredGiveaway = giveawayEntries.some(
    (reaction: any) => reaction.profile_id === currentUser?.id,
  );
  const giveawayClosed = giveaway ? new Date(giveaway.endsAt).getTime() <= Date.now() : false;
  const visibleReactions = Object.entries(groupedReactions).filter(
    ([emoji]) => emoji !== GIVEAWAY_ENTRY_EMOJI,
  );

  const { data: giveawayRecord, refetch: refetchGiveaway } = useQuery({
    queryKey: ["club-giveaway", giveaway?.giveawayId],
    enabled: !!giveaway?.giveawayId,
    queryFn: async () => {
      const giveawayId = giveaway!.giveawayId!;
      const [giveawayResult, entriesResult, awardsResult] = await Promise.all([
        supabase.from("club_giveaways").select("*").eq("id", giveawayId).single(),
        supabase
          .from("club_giveaway_entries")
          .select("profile_id, created_at")
          .eq("giveaway_id", giveawayId)
          .order("created_at"),
        supabase
          .from("club_giveaway_awards")
          .select("profile_id, amount")
          .eq("giveaway_id", giveawayId),
      ]);
      if (giveawayResult.error) throw giveawayResult.error;
      if (entriesResult.error) throw entriesResult.error;
      if (awardsResult.error) throw awardsResult.error;

      const entrantIds = (entriesResult.data || []).map((entry: any) => entry.profile_id);
      const { data: entrantProfiles, error: profilesError } = entrantIds.length
        ? await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url")
            .in("id", entrantIds)
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
      profiles:
        joinedProfile ||
        members.find((member: any) => member.profile_id === entry.profile_id)?.profiles,
    };
  });
  const entryCount = giveaway?.giveawayId
    ? Math.max(securedEntries.length, giveawayEntries.length)
    : giveawayEntries.length;
  const giveawayAwarded = giveawayRecord?.status === "awarded";
  const awardedProfileIds = new Set(
    (giveawayRecord?.awards || []).map((award: any) => award.profile_id),
  );

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
    if ("touches" in e) {
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

    if ("touches" in e) {
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
      className={`group/msg relative py-1.5 flex w-full transition-colors duration-500 ${isMe ? "justify-end" : "justify-start"}`}
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
          style={{
            opacity: swipeOffset / 45,
            transform: `scale(${Math.min(swipeOffset / 45, 1)})`,
          }}
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
          style={{
            opacity: -swipeOffset / 45,
            transform: `scale(${Math.min(-swipeOffset / 45, 1)})`,
          }}
        >
          <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
            <Reply className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
      )}

      <div
        className={`flex gap-2.5 relative z-10 max-w-[85%] ${isMe ? "flex-row-reverse" : "flex-row"}`}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: swipeOffset === 0 ? "transform 0.2s ease-out" : "none",
        }}
      >
        {/* Avatar (only for received messages) */}
        {!isMe && (
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClick={() => {
              const id = message.profiles?.username || message.profile_id;
              if (id) navigate({ to: "/app/profile/$id", params: { id } });
            }}
            className="mt-0.5 flex h-8 w-8 shrink-0 self-start items-center justify-center overflow-hidden rounded-full border border-border bg-accent/30 text-xs font-bold text-muted-foreground transition hover:ring-2 hover:ring-foreground/20 active:scale-95"
            aria-label={`View ${message.profiles?.full_name || message.profiles?.username || "member"} profile`}
          >
            {message.profiles?.avatar_url ? (
              <img
                src={message.profiles.avatar_url}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              message.profiles?.username?.[0]?.toUpperCase()
            )}
          </button>
        )}

        {/* Computer: hover a message to reply or react (phones swipe instead). */}
        <div
          className={`order-last hidden shrink-0 items-center gap-1 self-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/msg:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:flex ${isMe ? "mr-1" : "ml-1"}`}
        >
          <button
            type="button"
            title="Reply"
            aria-label="Reply to this message"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => {
              onReply(message);
              requestAnimationFrame(() =>
                (
                  document.querySelector("[data-club-composer]") as HTMLTextAreaElement | null
                )?.focus(),
              );
            }}
            className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:border-[#cc208f]/40 hover:text-[#cc208f]"
          >
            <Reply className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="React"
            aria-label="React to this message"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setShowEmojiPicker((open) => !open)}
            className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:border-[#cc208f]/40 hover:text-[#cc208f]"
          >
            <Smile className="h-4 w-4" />
          </button>
          {canEdit && !editing && (
            <button
              type="button"
              title="Edit"
              aria-label="Edit your message"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={startEdit}
              className="grid h-8 w-8 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:border-[#cc208f]/40 hover:text-[#cc208f]"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Content Container */}
        <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} min-w-0`}>
          {/* Reply preview */}
          {repliedMessage && (
            <div
              onClick={() => {
                const el = document.getElementById(`message-${repliedMessage.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.style.backgroundColor = "rgba(var(--primary), 0.2)";
                  setTimeout(() => {
                    el.style.backgroundColor = "transparent";
                  }, 1500);
                }
              }}
              className={`mb-1 flex items-center gap-1.5 opacity-80 text-[11px] cursor-pointer hover:opacity-100 transition-opacity ${isMe ? "mr-2" : "ml-2"}`}
            >
              <Reply className="h-3 w-3 shrink-0" />
              <span className="font-bold whitespace-nowrap">
                {repliedMessage.profiles?.username || "Someone"}
              </span>
              <span className="truncate max-w-[160px] text-muted-foreground">
                {contentPreview(repliedMessage.content) || "Message"}
              </span>
            </div>
          )}

          {/* Bubble */}
          {/* Sender name and time sit above a received bubble, so the
              bubble itself holds only what was said. */}
          {!isMe && (
            <div className="mb-1 flex items-center gap-1.5 text-[13px]">
              <span className="font-semibold text-foreground">
                {message.profiles?.full_name || message.profiles?.username}
              </span>
              {role !== "Member" && (
                <span className={`rounded px-1.5 text-[11px] font-semibold ${getRoleColor(role)}`}>
                  {role}
                </span>
              )}
              <span className="text-muted-foreground">
                · {time}
                {message.edited_at ? " · Edited" : ""}
              </span>
            </div>
          )}

          <div
            className={`relative group px-3 py-2 ${isMe ? "rounded-[16px_16px_4px_16px] bg-foreground text-right text-background" : "rounded-[4px_16px_16px_16px] bg-foreground/[0.06] text-left"}`}
          >
            {/* Room badges */}
            {room === "assignments" && (
              <div className="mb-1.5 inline-flex items-center gap-1.5 bg-primary/10 text-primary px-2 py-1 rounded-md border border-primary/20">
                <GraduationCap className="h-3 w-3" />
                <span className="text-[9px]">Assignment</span>
              </div>
            )}
            {room === "announcements" && (
              <div className="mb-1.5 inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-500 px-2 py-1 rounded-md border border-amber-500/20">
                <ShieldAlert className="h-3 w-3" />
                <span className="text-[9px]">Announcement</span>
              </div>
            )}
            {clubNote ? (
              <ClubNoteCard note={clubNote} isMe={isMe} />
            ) : giveaway ? (
              <div className="w-[min(300px,72vw)] text-left">
                <div className="flex items-start gap-3">
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${isMe ? "bg-background/15 text-background" : "bg-foreground text-background"}`}
                  >
                    <Gift className="h-5 w-5 fill-current" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[9px] font-semibold uppercase ${isMe ? "text-background/60" : "text-muted-foreground"}`}
                    >
                      Club giveaway
                    </p>
                    <h4
                      className={`mt-1 break-words text-[15px] font-semibold leading-5 ${isMe ? "text-background" : "text-foreground"}`}
                    >
                      {giveaway.title}
                    </h4>
                  </div>
                </div>

                <div
                  className={`my-3 border-y py-3 ${isMe ? "border-background/15" : "border-border"}`}
                >
                  <div className="flex items-center gap-2">
                    <Trophy
                      className={`h-4 w-4 shrink-0 ${isMe ? "text-background/70" : "text-primary"}`}
                    />
                    <p
                      className={`text-sm font-semibold ${isMe ? "text-background" : "text-foreground"}`}
                    >
                      {giveawayPrizeLine(giveaway, formatWalletAmount)}
                    </p>
                  </div>
                  {giveaway.description && (
                    <p
                      className={`mt-2 whitespace-pre-wrap text-xs leading-5 ${isMe ? "text-background/70" : "text-muted-foreground"}`}
                    >
                      {giveaway.description}
                    </p>
                  )}
                </div>

                <div
                  className={`mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] ${isMe ? "text-background/60" : "text-muted-foreground"}`}
                >
                  <span>
                    {giveaway.winners} {giveaway.winners === 1 ? "winner" : "winners"}
                  </span>
                  <span>
                    {entryCount} {entryCount === 1 ? "entry" : "entries"}
                  </span>
                  <span>
                    {giveawayAwarded
                      ? "Paid"
                      : giveawayClosed
                        ? "Closed"
                        : `Closes ${new Date(giveaway.endsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`}
                  </span>
                </div>

                {giveawayAwarded ? (
                  <div
                    className={`flex h-10 w-full items-center justify-center gap-2 rounded-md border text-xs font-semibold ${isMe ? "border-background/20 bg-background/10 text-background" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"}`}
                  >
                    <Check className="h-4 w-4" />
                    {awardedProfileIds.has(currentUser?.id)
                      ? "You won · prize paid"
                      : "Winners paid"}
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
                      ? "Award after closing"
                      : entryCount < giveaway.winners
                        ? "Not enough eligible entries"
                        : `Award ${giveaway.winners === 1 ? "winner" : "winners"}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      !giveawayClosed &&
                      !hasEnteredGiveaway &&
                      onReact(message.id, GIVEAWAY_ENTRY_EMOJI)
                    }
                    disabled={giveawayClosed || hasEnteredGiveaway}
                    className={`flex h-10 w-full items-center justify-center gap-2 rounded-md text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed ${hasEnteredGiveaway ? "border border-primary/25 bg-primary/10 text-primary" : "bg-primary text-primary-foreground disabled:opacity-50"}`}
                  >
                    {hasEnteredGiveaway ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Gift className="h-4 w-4 fill-current" />
                    )}
                    {giveawayClosed
                      ? "Giveaway closed"
                      : hasEnteredGiveaway
                        ? "Entry confirmed"
                        : "Enter giveaway"}
                  </button>
                )}

                {giveaway.amountPerWinner && (
                  <p
                    className={`mt-2 text-center text-[9px] ${isMe ? "text-background/50" : "text-muted-foreground"}`}
                  >
                    {formatWalletAmount(
                      giveaway.totalAmount || giveaway.amountPerWinner * giveaway.winners,
                    )}{" "}
                    secured by Zero Club
                  </p>
                )}
              </div>
            ) : message.content.startsWith("📅 **[SCHEDULED SPACE]**") ? (
              (() => {
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
                        <h4 className="font-semibold text-sm text-foreground tracking-tight truncate mt-0.5">
                          {spaceTopic}
                        </h4>
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
              })()
            ) : (
              <>
                {editing ? (
                  <div
                    className="w-[min(420px,70vw)] text-left"
                    onMouseDown={(event) => event.stopPropagation()}
                    onTouchStart={(event) => event.stopPropagation()}
                  >
                    <textarea
                      autoFocus
                      value={editText}
                      maxLength={4000}
                      onChange={(event) => {
                        setEditText(event.target.value);
                        event.target.style.height = "auto";
                        event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;
                      }}
                      onFocus={(event) => {
                        const el = event.target;
                        el.setSelectionRange(el.value.length, el.value.length);
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setEditing(false);
                        }
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          void saveEdit();
                        }
                      }}
                      rows={2}
                      className="block w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.4] text-inherit outline-none focus:outline-none focus:ring-0 focus:border-0 placeholder:opacity-60 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                      style={{ border: "none", outline: "none", boxShadow: "none" }}
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <span
                        className={`mr-auto text-[11px] ${isMe ? "text-background/60" : "text-muted-foreground"}`}
                      >
                        Enter to save · Esc to cancel
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${isMe ? "text-background/80 hover:bg-background/10" : "text-muted-foreground hover:bg-foreground/5"}`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit()}
                        disabled={savingEdit}
                        className="rounded-full bg-[#cc208f] px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    className={`text-[15px] leading-[1.4] whitespace-pre-wrap text-left break-words ${isMe ? "text-background" : "text-foreground"}`}
                  >
                    <LinkifiedText
                      text={message.content.split("$$MEDIA$$")[0].trim()}
                      linkColor={
                        isMe
                          ? "text-background underline font-bold hover:opacity-80"
                          : "text-[#cc208f] underline font-bold hover:opacity-80"
                      }
                    />
                    {isMe && !message.content.includes("$$MEDIA$$") && (
                      <span className={`inline-block ${message.edited_at ? "w-24" : "w-12"}`} />
                    )}{" "}
                    {/* Space for timestamp */}
                  </p>
                )}

                {message.content.includes("$$MEDIA$$") && (
                  <div
                    className={`mt-2 rounded-xl overflow-hidden transition-colors ${
                      message.content.split("$$MEDIA$$")[1].split(",").length >= 2
                        ? "grid grid-cols-2 gap-0.5 max-h-[240px] ring-1 ring-border bg-muted/40"
                        : "flex justify-start ring-1 ring-border"
                    }`}
                  >
                    {message.content
                      .split("$$MEDIA$$")[1]
                      .split(",")
                      .map((token: string, i: number) => {
                        const media = decodeChatMedia(token);
                        return (
                          <div
                            key={i}
                            className={`relative overflow-hidden w-full ${
                              media.type === "audio" || media.type === "file"
                                ? "min-w-[220px] bg-card p-3"
                                : message.content.split("$$MEDIA$$")[1].split(",").length === 1
                                  ? "max-h-[300px]"
                                  : "aspect-square"
                            }`}
                          >
                            {media.type === "video" ? (
                              <video
                                src={media.url}
                                controls
                                className="h-full w-full object-cover"
                              />
                            ) : media.type === "audio" ? (
                              <VoiceNotePlayer
                                src={media.url}
                                name={media.name}
                                mine={isMe}
                                avatarUrl={isMe ? null : message.profiles?.avatar_url}
                              />
                            ) : media.type === "file" ? (
                              <a
                                href={media.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex min-w-0 items-center gap-3 text-left"
                              >
                                <FileText className="h-6 w-6 shrink-0 text-primary" />
                                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">
                                  {media.name}
                                </span>
                                <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                              </a>
                            ) : (
                              <img
                                loading="lazy"
                                decoding="async"
                                src={media.url}
                                className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-90"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  // The app's photo viewer, never a browser tab.
                                  setViewerUrl(media.url);
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            )}
            {isMe && message.content.includes("$$MEDIA$$") && <div className="h-4" />}{" "}
            {/* Space for timestamp when media is present */}
            {isMe && giveaway && <div className="h-4" />}
            {isMe && !editing && (
              <span className="absolute bottom-1.5 right-3 text-[10px] text-background/70">
                {message.edited_at ? "Edited · " : ""}
                {time}
              </span>
            )}
            {/* Tap outside overlay */}
            {(showEmojiPicker || showFullPicker) && (
              <div
                className="fixed inset-0 z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEmojiPicker(false);
                  setShowFullPicker(false);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setShowEmojiPicker(false);
                  setShowFullPicker(false);
                }}
              />
            )}
            {/* Emoji Picker Popover */}
            {showEmojiPicker && (
              <div
                className={`absolute z-50 flex flex-row gap-1.5 p-2 bg-card/95 backdrop-blur-xl border border-border/80 rounded-full shadow-2xl animate-in zoom-in duration-200 -top-14 ${isMe ? "right-0" : "left-0"}`}
              >
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReact(message.id, emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent/60 transition-colors text-xl active:scale-90"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFullPicker(true);
                    setShowEmojiPicker(false);
                  }}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent/60 transition-colors text-xl active:scale-90 bg-accent/20 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {canEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEmojiPicker(false);
                      startEdit();
                    }}
                    aria-label="Edit your message"
                    className="ml-0.5 flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-[12.5px] font-semibold text-background active:scale-95"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
              </div>
            )}
            {/* Full Emoji Picker Popover */}
            {showFullPicker && (
              <div
                className={`absolute z-50 shadow-2xl animate-in zoom-in duration-200 ${isMe ? "right-0 -top-[320px]" : "left-0 -top-[320px]"}`}
                onClick={(e) => e.stopPropagation()}
              >
                <EmojiPicker
                  onEmojiClick={(emojiData) => {
                    onReact(message.id, emojiData.emoji);
                    setShowFullPicker(false);
                  }}
                  theme={"dark" as any}
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
            <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
              {visibleReactions.map(([emoji, data]: [string, any]) => (
                <button
                  key={emoji}
                  onClick={() => onReact(message.id, emoji)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold transition-colors ${
                    data.me
                      ? "bg-primary/15 border-primary/25 text-primary"
                      : "bg-foreground/[0.04] border-transparent text-muted-foreground hover:bg-foreground/[0.08]"
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
              <DrawerContent
                desktopVariant="panel"
                className="mx-auto max-h-[88dvh] max-w-[620px] overflow-hidden border border-border bg-background p-0 shadow-2xl"
              >
                <DrawerHeader className="gap-0 sm:gap-0 px-5 pb-3 pt-1 text-left sm:px-7 sm:pt-2">
                  <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">
                    Award giveaway
                  </DrawerTitle>
                  <DrawerDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                    Select exactly {giveaway.winners} eligible{" "}
                    {giveaway.winners === 1 ? "winner" : "winners"}.
                  </DrawerDescription>
                </DrawerHeader>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-7">
                  <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl bg-foreground/[0.04] px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-muted-foreground">
                        Automatic payout
                      </p>
                      <p className="mt-0.5 truncate font-display text-[18px] font-semibold tabular-nums text-foreground">
                        {giveaway.prizeType === "zp"
                          ? `${(giveaway.zpPerWinner || 0).toLocaleString()} ZP`
                          : giveaway.prizeType === "bootcamp"
                            ? "Bootcamp seat"
                            : formatWalletAmount(giveaway.amountPerWinner || 0)}{" "}
                        <span className="text-[14px] font-medium text-muted-foreground">each</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold text-muted-foreground">Selected</p>
                      <p className="mt-0.5 font-display text-[18px] font-semibold tabular-nums text-foreground">
                        {selectedWinnerIds.length}/{giveaway.winners}
                      </p>
                    </div>
                  </div>

                  <p className="mb-2 text-[13px] font-semibold text-muted-foreground">
                    Eligible members
                  </p>
                  <div className="space-y-2">
                    {securedEntries.map((entry: any) => {
                      const selected = selectedWinnerIds.includes(entry.profile_id);
                      const profile = entry.profiles;
                      return (
                        <button
                          type="button"
                          key={entry.profile_id}
                          onClick={() =>
                            setSelectedWinnerIds((current) =>
                              selected
                                ? current.filter((id) => id !== entry.profile_id)
                                : [...current, entry.profile_id],
                            )
                          }
                          disabled={!selected && selectedWinnerIds.length >= giveaway.winners}
                          className={`flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-3.5 py-3 text-left transition disabled:opacity-40 ${selected ? "border-[#cc208f] bg-[#cc208f]/[0.06]" : "border-foreground/12 hover:bg-foreground/[0.03]"}`}
                        >
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]">
                            {profile?.avatar_url ? (
                              <img
                                src={profile.avatar_url}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span className="grid h-full w-full place-items-center text-[15px] font-semibold text-muted-foreground">
                                {(profile?.full_name || profile?.username || "U")[0].toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold text-foreground">
                              {profile?.full_name || profile?.username || "Club member"}
                            </p>
                            <p className="truncate text-[13px] text-muted-foreground">
                              @{profile?.username || "member"}
                            </p>
                          </div>
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${selected ? "bg-[#cc208f] text-white" : "border-[1.5px] border-foreground/25"}`}
                          >
                            {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="shrink-0 border-t border-border/60 bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-7">
                  <button
                    type="button"
                    onClick={handleAwardGiveaway}
                    disabled={isAwardingGiveaway || selectedWinnerIds.length !== giveaway.winners}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[16px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-40"
                  >
                    {isAwardingGiveaway ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <WalletCards className="h-5 w-5" />
                    )}
                    {isAwardingGiveaway ? "Transferring..." : "Confirm and pay winners"}
                  </button>
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </div>
      </div>
      {viewerUrl && (
        <ImageLightbox
          mediaUrls={[viewerUrl]}
          initialIndex={0}
          isOpen
          onClose={() => setViewerUrl(null)}
          allowDownload
          sender={{
            name: isMe ? "You" : message.profiles?.full_name || message.profiles?.username || "Member",
            avatarUrl: message.profiles?.avatar_url,
            time: new Date(message.created_at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }),
          }}
          onReply={onReplyText ? (text: string) => onReplyText(text) : undefined}
        />
      )}
    </div>
  );
}

/** "Press Enter to send", switchable from the club menu. Same setting as Chat settings. */
function EnterToSendRow() {
  const [enterToSend, setEnterToSend] = useEnterToSend();
  return (
    <label className="flex w-full cursor-pointer items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-foreground/[0.04]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.05] text-foreground">
        <Send className="h-[19px] w-[19px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium text-foreground">Press Enter to send</span>
        <span className="block text-[12px] text-muted-foreground">
          Shift + Enter adds a new line
        </span>
      </span>
      <Switch
        checked={enterToSend}
        onCheckedChange={setEnterToSend}
        aria-label="Press Enter to send"
      />
    </label>
  );
}
