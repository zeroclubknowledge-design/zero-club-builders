import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { useLiveSession } from "@/contexts/LiveSessionContext";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, MonitorOff, Users,
  MessageSquare, Send, X, Zap, Share2, Minimize2, Maximize2, Lock,
  Expand, Shrink, GraduationCap, Radio, Loader2, Smile, Reply,
} from "@/components/icons/solar";

/** One tap, no search field — the six that actually get used in a class. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👏", "🔥"];

import { useSharedPresence } from "@/hooks/useSharedPresence";

import AgoraRTC, {
  AgoraRTCProvider,
  LocalVideoTrack,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRTCClient,
  useRemoteUsers,
  useRemoteAudioTracks,
  useRemoteVideoTracks,
  RemoteVideoTrack,
  RemoteAudioTrack,
} from "agora-rtc-react";

const APP_ID = "bfd9392ddcbc425e8946e8011ac2820b";

/**
 * Live-chat text, with tags picked out in the brand pink.
 *
 * The ordinary mention renderer matches @word and turns it into a profile
 * link. Neither half fits here: the picker inserts display names, so "@Benson
 * Nebo" would light up only the first word, and the link would point at a
 * username that does not exist. So the names of the people actually in the
 * room are matched first — longest first, or "@Ben" would win inside "@Ben
 * Nebo" — and anything else beginning with @ is still highlighted, just not
 * linked.
 */
function LiveMessageText({ text, names }: { text: string; names: string[] }) {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ordered = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(@(?:${[...ordered.map(escape), "[A-Za-z0-9_.-]+"].join("|")}))`,
    "g",
  );

  return (
    <>
      {text.split(pattern).map((part, index) =>
        part.startsWith("@") ? (
          <span key={index} className="font-semibold text-[#f06ac3]">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

interface ChatMessage {
  id: string;
  sender_name: string;
  sender_avatar?: string;
  content: string;
  timestamp: string;
  sender_id?: string;
  /* A copy of what is being answered rather than a pointer to it. Live chat is
     broadcast and kept in memory, so somebody who joined thirty seconds ago
     does not have the original message to look up — carrying the quote means
     the reply still makes sense to them. */
  reply_to?: { id: string; sender_name: string; content: string };
}

interface PresenceUser {
  uid: string;
  name: string;
  avatar: string;
  isAdmin: boolean;
}

const MAX_LIVE_CHAT_MESSAGES = 200;

const appendLiveMessage = (messages: ChatMessage[], message: ChatMessage) => {
  if (messages.some((item) => item.id === message.id)) return messages;
  return [...messages, message].slice(-MAX_LIVE_CHAT_MESSAGES);
};

/** Keep the ticking clock isolated so it does not redraw every video tile. */
function SessionElapsed() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const intervalId = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(intervalId);
  }, []);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const label = hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;

  return <span className="text-white/50 tabular-nums font-medium">{label}</span>;
}

/**
 * Global component that maintains the Agora connection across route changes.
 * Broadcast-style live classroom: the tutor owns the stage, learners watch,
 * chat, and can raise their mic/camera. Committed dark surface regardless of
 * app theme — like every world-class video product.
 */
export function GlobalLiveRoom() {
  const { isActive, channelId } = useLiveSession();
  const [client, setClient] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isFetchingToken, setIsFetchingToken] = useState(false);

  useEffect(() => {
    if (isActive && !client) {
      setClient(AgoraRTC.createClient({ mode: "rtc", codec: "vp8" }));
    }
    // A client that has already left cannot be reused. Dropping it here means
    // the next session builds a fresh one, rather than silently failing to
    // reconnect when someone rejoins after leaving.
    if (!isActive && client) {
      setClient(null);
    }
  }, [isActive, client]);

  useEffect(() => {
    async function fetchToken() {
      if (!isActive || !channelId) return;
      setIsFetchingToken(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          toast.error("You must be logged in to join a live class");
          return;
        }
        const { data, error } = await supabase.functions.invoke("agora-token", {
          body: { channelName: channelId, uid: 0 },
        });
        if (error || !data?.token) {
          console.error("Token fetch error:", error, data);
          toast.error("Failed to authenticate with live server.");
          return;
        }
        setToken(data.token);
      } catch (err) {
        console.error(err);
        toast.error("Error connecting to live server");
      } finally {
        setIsFetchingToken(false);
      }
    }

    if (isActive && channelId) {
      fetchToken();
    } else {
      setToken(null);
    }
  }, [isActive, channelId]);

  if (!isActive || !channelId) return null;

  /* ── Loading State ── */
  if (isFetchingToken) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0A0A0C] flex flex-col items-center justify-center">
        <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-[#cc208f]/20 blur-[100px]" />
        <div className="relative grid h-14 w-14 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
          <Zap className="w-6 h-6 text-white/90" strokeWidth={1.75} />
        </div>
        <h2 className="text-[19px] font-semibold text-white tracking-tight mt-6">Preparing your classroom</h2>
        <p className="text-[13px] text-white/50 mt-1.5">Connecting to Zero Club Live</p>
        <div className="mt-6 h-1 w-24 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full w-1/3 rounded-full bg-[#cc208f] animate-progress" />
        </div>
      </div>
    );
  }

  /* ── Error State ── */
  if (!token && !isFetchingToken) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0A0A0C] flex flex-col items-center justify-center p-6">
        <div className="bg-[#141117] p-8 rounded-[28px] ring-1 ring-white/[0.06] max-w-md w-full text-center shadow-lift">
          <div className="w-14 h-14 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-red-500/20">
            <PhoneOff className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <h2 className="text-[21px] font-semibold text-white tracking-tight mb-2">Connection failed</h2>
          <p className="text-white/50 mb-8 text-[13.5px] leading-relaxed">
            We couldn't generate a secure access token for this session.
          </p>
          <button
            onClick={() => window.history.back()}
            className="w-full py-3.5 bg-white text-black text-[14px] font-semibold tracking-tight rounded-full tap hover:opacity-90"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!client) return null;

  return (
    <AgoraRTCProvider client={client}>
      <LiveRoomContent channel={channelId} token={token!} />
    </AgoraRTCProvider>
  );
}

/* ── Small shared bits ── */
const Avatar = ({ url, name, className = "" }: { url?: string | null; name: string; className?: string }) => (
  <div className={`rounded-full bg-white/[0.08] ring-1 ring-white/10 flex items-center justify-center overflow-hidden ${className}`}>
    {url ? (
      <img src={url} alt="" className="w-full h-full object-cover" />
    ) : (
      <span className="font-semibold text-white/80" style={{ fontSize: "0.9em" }}>
        {(name || "U")[0].toUpperCase()}
      </span>
    )}
  </div>
);

const MicDot = ({ on }: { on: boolean }) =>
  on ? (
    <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
  ) : (
    <MicOff className="w-3.5 h-3.5 text-white/35 shrink-0" />
  );

/**
 * The name pill on a video tile, as in the reference UI: one dark capsule
 * bottom-left carrying the name and the mic state together.
 *
 * The mic icon lives inside the pill rather than floating in the opposite
 * corner, because over a moving camera feed a bare dot has no reliable
 * contrast — the pill gives it a background to sit on.
 */
const TilePill = ({ name, muted, tutor }: { name: string; muted: boolean; tutor?: boolean }) => (
  <div className="absolute bottom-1.5 left-1.5 z-10 flex max-w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-full bg-black/65 px-2 py-1 backdrop-blur-sm">
    {muted && <MicOff className="h-3 w-3 shrink-0 text-red-400" />}
    <span className="truncate text-[10.5px] font-semibold text-white">{name}</span>
    {tutor && (
      <span className="shrink-0 rounded-full bg-[#cc208f] px-1.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-white">
        Tutor
      </span>
    )}
  </div>
);

function LiveRoomContent({ channel, token }: { channel: string; token: string }) {
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const liveSession = useLiveSession();
  const { isMinimized } = liveSession;
  const [isAdmin, setIsAdmin] = useState(false);
  const [clubName, setClubName] = useState<string>("");

  useEffect(() => {
    async function checkAdmin() {
      if (!profile?.id) return;
      const { data: club } = await supabase.from("clubs").select("creator_id, name").eq("id", channel).single();
      if (club?.name) setClubName(club.name);
      if (club?.creator_id === profile.id) {
        setIsAdmin(true);
        return;
      }
      const { data: member } = await supabase
        .from("club_members")
        .select("role")
        .eq("club_id", channel)
        .eq("profile_id", profile.id)
        .maybeSingle();
      const role = (member?.role || "").toLowerCase();
      if (role === "administrator" || role === "admin" || role === "moderator") {
        setIsAdmin(true);
      }
    }
    checkAdmin();
  }, [channel, profile?.id]);

  /* ── Video / Audio state ── */
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenTrack, setScreenTrack] = useState<any>(null);
  const [theater, setTheater] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const leaveStartedRef = useRef(false);

  /* ── Sync mic state to global context for mini player ── */
  useEffect(() => {
    liveSession.setMicState(micOn);
  }, [micOn]);

  /* ── Panel / chat state ── */
  const [activeTab, setActiveTab] = useState<"chat" | "learners">("chat");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  /* The word being typed after an @, or null when the picker is closed. */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  /* Swipe-to-reply. The offset is per message and lives in state so the row
     follows the finger; the start point is a ref because it changes on every
     touchmove and re-rendering for it would fight the drag. */
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatChannelRef = useRef<any>(null);
  const chatVisibleRef = useRef(true);
  useEffect(() => {
    chatVisibleRef.current = activeTab === "chat" && !theater;
  }, [activeTab, theater]);

  /* ── Agora hooks ── */
  useJoin({ appid: APP_ID, channel, token }, true);
  const client = useRTCClient();
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(true);
  /*
   * 480p, not 720p.
   *
   * These tiles are a few hundred pixels wide on a phone, so 720p was spending
   * roughly three times the bitrate to fill them. On a mobile network that
   * surplus is what turns into freezing and lag, and "motion" tells the
   * encoder to protect frame rate over sharpness — the right trade for faces
   * talking. Screen sharing keeps its own high-detail config, where text
   * legibility genuinely matters.
   */
  const { localCameraTrack } = useLocalCameraTrack(!isScreenSharing, {
    encoderConfig: "480p_1",
    optimizationMode: "motion",
  });

  /*
   * setMuted, not setEnabled.
   *
   * setEnabled(false) closes the capture device, and setEnabled(true) has to
   * reacquire it from the OS — on a phone that is a multi-second stall, and it
   * is the single biggest reason unmuting felt so slow.
   *
   * setMuted only stops the encoder sending frames. The device stays open, so
   * it is effectively instant. Remote users still get user-unpublished /
   * user-published, so hasAudio and hasVideo update exactly as before.
   */
  useEffect(() => {
    localMicrophoneTrack?.setMuted(!micOn).catch(console.error);
  }, [micOn, localMicrophoneTrack]);

  useEffect(() => {
    localCameraTrack?.setMuted(!cameraOn).catch(console.error);
  }, [cameraOn, localCameraTrack]);

  const videoTrackToPublish = isScreenSharing && screenTrack ? screenTrack : localCameraTrack;

  /*
   * Published once, and left published.
   *
   * This array used to drop a track whenever it was muted, which made
   * usePublish call unpublish() and then publish() again on the way back.
   * Each of those is a full renegotiation with Agora's servers — one to three
   * seconds, every single tap of the mic button, and the delay everyone else
   * in the room saw before your change took effect.
   *
   * Muting is now handled entirely by setMuted above, which needs no
   * renegotiation at all. The publish list only changes when the actual track
   * changes: camera to screen share and back.
   */
  const tracksToPublish = [localMicrophoneTrack, videoTrackToPublish].filter(Boolean);

  usePublish(tracksToPublish as any);

  /*
   * Active speaker. Two seconds is Agora's default reporting interval, which
   * is far too slow to feel live — 200ms is what makes the ring follow the
   * conversation rather than trail it.
   */
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  useEffect(() => {
    if (!client) return;
    client.enableAudioVolumeIndicator();
    const onVolume = (volumes: { uid: any; level: number }[]) => {
      const loudest = volumes.reduce(
        (best, v) => (v.level > (best?.level ?? 0) ? v : best),
        null as { uid: any; level: number } | null,
      );
      // A floor, so room noise does not make the ring flicker between people.
      setActiveSpeaker(loudest && loudest.level > 12 ? String(loudest.uid) : null);
    };
    client.on("volume-indicator", onVolume);
    return () => { client.off("volume-indicator", onVolume); };
  }, [client]);

  const remoteUsers = useRemoteUsers();
  const { audioTracks } = useRemoteAudioTracks(remoteUsers);
  const { videoTracks } = useRemoteVideoTracks(remoteUsers);

  /* ── Remote presenter tracking (broadcast + heartbeat, expires when stale) ── */
  const [remotePresenter, setRemotePresenter] = useState<{ uid: string; at: number } | null>(null);

  /*
   * ── Reactions ──
   *
   * Sent over the same Supabase broadcast channel the chat already uses, so a
   * reaction costs no extra connection and arrives in the same order as
   * everything else. They are deliberately not persisted: a reaction is a
   * moment in the room, not a record, and nobody joining later wants to
   * replay them.
   *
   * Each one gets a random horizontal offset so a burst of the same emoji
   * fans out instead of stacking into a single opaque blob.
   */
  const [reactions, setReactions] = useState<
    { id: string; emoji: string; name?: string; left: number }[]
  >([]);

  const pushReaction = (emoji: string, name?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setReactions((prev) => [...prev.slice(-14), { id, emoji, name, left: 8 + Math.random() * 62 }]);
    // Matches the float animation below; removed so the list cannot grow
    // without bound during a long session.
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 3200);
  };

  const [showReactionTray, setShowReactionTray] = useState(false);

  const sendReaction = (emoji: string) => {
    pushReaction(emoji, "You");
    chatChannelRef.current?.send({
      type: "broadcast",
      event: "reaction",
      payload: { emoji, name: profile?.username || "Someone" },
    });
    setShowReactionTray(false);
  };

  /* ── Chat + presenting broadcast channel ── */
  useEffect(() => {
    const ch = supabase.channel(`live-chat-${channel}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "chat" }, ({ payload }: any) => {
      setChatMessages((prev) => appendLiveMessage(prev, payload as ChatMessage));
      if (!chatVisibleRef.current) setUnreadCount((c) => c + 1);
    });
    ch.on("broadcast", { event: "reaction" }, ({ payload }: any) => {
      if (payload?.emoji) pushReaction(payload.emoji, payload.name);
    });
    ch.on("broadcast", { event: "presenting" }, ({ payload }: any) => {
      if (payload?.presenting && payload?.uid != null) {
        setRemotePresenter({ uid: String(payload.uid), at: Date.now() });
      } else {
        setRemotePresenter((cur) => (cur && cur.uid === String(payload?.uid) ? null : cur));
      }
    });
    ch.subscribe();

    chatChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [channel]);

  /* Presenter heartbeat while sharing; stale-expiry for remote presenter */
  useEffect(() => {
    if (!isScreenSharing || !chatChannelRef.current || client?.uid == null) return;
    const send = () =>
      chatChannelRef.current?.send({
        type: "broadcast",
        event: "presenting",
        payload: { uid: client.uid, presenting: true },
      });
    send();
    const id = setInterval(send, 4000);
    return () => {
      clearInterval(id);
      chatChannelRef.current?.send({
        type: "broadcast",
        event: "presenting",
        payload: { uid: client.uid, presenting: false },
      });
    };
  }, [isScreenSharing, client?.uid]);

  useEffect(() => {
    const id = setInterval(() => {
      setRemotePresenter((cur) => (cur && Date.now() - cur.at > 10000 ? null : cur));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  /* ── Presence: names, avatars, and who the tutors are ── */
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({});
  const [adminUids, setAdminUids] = useState<Set<string>>(new Set());
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);

  const presencePayload = profile?.id && client?.uid ? {
    agora_uid: client.uid,
    name: profile?.username || "Unknown",
    avatar_url: profile?.avatar_url || "",
    isAdmin: isAdmin
  } : undefined;

  const { presenceState } = useSharedPresence(`live-presence-${channel}`, presencePayload);

  const hasSeenAdmin = useRef(false);
  const confirmAdminTimer = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (confirmAdminTimer.current) clearTimeout(confirmAdminTimer.current);
    };
  }, []);

  useEffect(() => {
    const newNames: Record<string, string> = {};
    const newAvatars: Record<string, string> = {};
    const newAdminUids = new Set<string>();
    const people: PresenceUser[] = [];
    let adminCount = 0;

    Object.values(presenceState).forEach((users: any[]) => {
      users.forEach((u) => {
        if (u.agora_uid && u.name) newNames[u.agora_uid] = u.name;
        if (u.agora_uid && u.avatar_url) newAvatars[u.agora_uid] = u.avatar_url;
        if (u.isAdmin) {
          adminCount++;
          if (u.agora_uid != null) newAdminUids.add(String(u.agora_uid));
        }
        if (u.agora_uid != null) {
          people.push({
            uid: String(u.agora_uid),
            name: u.name || "Builder",
            avatar: u.avatar_url || "",
            isAdmin: !!u.isAdmin,
          });
        }
      });
    });

    setUserNames(newNames);
    setUserAvatars(newAvatars);
    setAdminUids(newAdminUids);
    setPresenceUsers(people);

    // Auto-leave logic for members when the tutor leaves
    if (!isAdmin) {
      if (adminCount > 0) {
        if (!hasSeenAdmin.current && !confirmAdminTimer.current) {
          // Wait 10 seconds before locking in that we've seen an admin
          // This prevents cached presence from immediately triggering the leave logic
          confirmAdminTimer.current = setTimeout(() => {
            hasSeenAdmin.current = true;
          }, 10000);
        }
      } else if (adminCount === 0) {
        if (confirmAdminTimer.current) {
          clearTimeout(confirmAdminTimer.current);
          confirmAdminTimer.current = null;
        }
        if (hasSeenAdmin.current) {
          toast.info("The tutor has ended the live session.");
          liveSession.endSession();
          navigate({ to: "/app/clubs/chat", search: { clubId: channel }, replace: true });
        }
      }
    }
  }, [presenceState, isAdmin]);

  /* ── Auto-scroll chat ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /* ── Reset unread when chat visible ── */
  useEffect(() => {
    if (activeTab === "chat" && !theater) setUnreadCount(0);
  }, [activeTab, theater]);

  /* ── Handlers ── */
  const handleMinimize = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    liveSession.minimize();
    if (window.location.pathname.includes(`/app/live/`)) {
      if (window.history.length > 2) {
        window.history.back();
      } else {
        navigate({ to: "/app" });
      }
    }
  };

  const handleLeave = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();

    if (leaveStartedRef.current) return;
    leaveStartedRef.current = true;
    setIsLeaving(true);

    try {
      await Promise.allSettled([
        localMicrophoneTrack?.setEnabled(false),
        localCameraTrack?.setEnabled(false),
      ].filter(Boolean) as Promise<unknown>[]);

      if (screenTrack) {
        screenTrack.stop?.();
        screenTrack.close?.();
      }

      await client.leave();
    } catch (error) {
      console.error("Failed to fully disconnect from live session", error);
    } finally {
      localMicrophoneTrack?.close();
      localCameraTrack?.close();
      liveSession.endSession();
      navigate({ to: "/app/clubs/chat", search: { clubId: channel }, replace: true });
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/app/live/${channel}`);
      toast.success("Live session link copied! Only club members can join.");
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const screenShareSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof (navigator.mediaDevices as any).getDisplayMedia === "function";

  const toggleScreenShare = async () => {
    if (!isAdmin) {
      toast.error("Only the tutor and club admins can present.");
      return;
    }
    if (isScreenSharing) {
      if (screenTrack) screenTrack.close();
      setScreenTrack(null);
      setIsScreenSharing(false);
      return;
    }
    if (!screenShareSupported) {
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      toast.error(
        isIOS
          ? "iOS browsers don't allow web screen capture yet. Use Chrome or Edge on Android, or a desktop browser, to present."
          : "This browser doesn't support screen sharing. Try Chrome or Edge."
      );
      return;
    }
    try {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      let video;

      if (isMobile) {
        // Bypass Agora's built-in block on mobile screen sharing
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor" } });
        const mediaStreamTrack = stream.getVideoTracks()[0];
        video = AgoraRTC.createCustomVideoTrack({ 
          mediaStreamTrack,
          bitrateMin: 400,
          bitrateMax: 1500
        });
        
        mediaStreamTrack.onended = () => {
          setIsScreenSharing(false);
          setScreenTrack(null);
        };
      } else {
        const track = await AgoraRTC.createScreenVideoTrack({
          encoderConfig: "1080p_1",
          optimizationMode: "detail",
        });
        video = Array.isArray(track) ? track[0] : track;
      }

      video.on("track-ended", () => {
        setIsScreenSharing(false);
        setScreenTrack(null);
      });
      
      setScreenTrack(video);
      setIsScreenSharing(true);
    } catch (err: any) {
      // User dismissed the OS picker — not an error
      if (err?.code === "PERMISSION_DENIED" || err?.name === "NotAllowedError") return;
      console.error("Screen share error:", err);
      toast.error("Could not start screen sharing on this device.");
    }
  };

  const sendMessage = () => {
    if (!chatInput.trim() || !chatChannelRef.current) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender_name: profile?.full_name || profile?.username || "You",
      sender_avatar: profile?.avatar_url,
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
      sender_id: profile?.userId || profile?.id,
      reply_to: replyingTo
        ? {
            id: replyingTo.id,
            sender_name: replyingTo.sender_name,
            content: replyingTo.content.slice(0, 140),
          }
        : undefined,
    };
    setChatMessages((prev) => appendLiveMessage(prev, msg));
    chatChannelRef.current.send({ type: "broadcast", event: "chat", payload: msg });
    setChatInput("");
    setReplyingTo(null);
    setMentionQuery(null);
  };

  /* Everybody in the room, deduplicated by name — the picker offers people,
     not connections, and one person on two devices is still one person. */
  const mentionCandidates = (() => {
    if (mentionQuery === null) return [];
    const term = mentionQuery.toLowerCase();
    const seen = new Set<string>();
    return presenceUsers
      .filter((person) => {
        const name = (person.name || "").trim();
        if (!name || seen.has(name.toLowerCase())) return false;
        seen.add(name.toLowerCase());
        return term === "" || name.toLowerCase().includes(term);
      })
      .slice(0, 5);
  })();

  /* Watches only the word the caret is sitting in, so an @ earlier in the
     sentence does not reopen the picker while you type the rest. */
  const handleChatInputChange = (value: string) => {
    setChatInput(value);
    const match = value.match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const applyMention = (name: string) => {
    const next = chatInput.replace(/(^|\s)@([^\s@]*)$/, (_m, before: string) => `${before}@${name} `);
    setChatInput(next);
    setMentionQuery(null);
    chatInputRef.current?.focus();
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  /* ── Draggable Mini-Player State ── */
  const [position, setPosition] = useState({ x: 16, y: 80 }); // from bottom-right
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const wasDragged = useRef(false);

  const onDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    dragging.current = true;
    wasDragged.current = false;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStart.current = { x: clientX, y: clientY, posX: position.x, posY: position.y };
  };

  const onDragMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!dragging.current) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const dx = dragStart.current.x - clientX;
    const dy = dragStart.current.y - clientY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragged.current = true;
    setPosition({
      x: Math.max(8, Math.min(window.innerWidth - 160, dragStart.current.posX + dx)),
      y: Math.max(8, Math.min(window.innerHeight - 160, dragStart.current.posY + dy)),
    });
  };

  const onDragEnd = () => {
    dragging.current = false;
    setTimeout(() => { wasDragged.current = false; }, 100);
  };

  const handleRestore = () => {
    if (wasDragged.current) return;
    liveSession.restore();
    navigate({ to: "/app/live/$classId", params: { classId: channel } });
  };

  const initial = (liveSession.userName || "U")[0].toUpperCase();

  /* ══════════ STAGE COMPOSITION ══════════ */
  const remotePresenterUser = remotePresenter
    ? remoteUsers.find((u) => String(u.uid) === remotePresenter.uid)
    : undefined;
  const remoteTutor = remoteUsers.find((u) => adminUids.has(String(u.uid)));
  const tutorName = isAdmin
    ? (profile?.username || "You")
    : remoteTutor
      ? (userNames[remoteTutor.uid] || "Your tutor")
      : (presenceUsers.find((p) => p.isAdmin)?.name || "your tutor");

  const findVideo = (uid: any) => videoTracks.find((t) => t.getUserId() === uid);

  // Agora reports the local user as uid 0 in the volume indicator.
  const isSelfSpeaking =
    micOn && (activeSpeaker === "0" || (client?.uid != null && activeSpeaker === String(client.uid)));

  // Learners = everyone who isn't on stage
  const stageUid = isAdmin ? null : (remotePresenterUser?.uid ?? remoteTutor?.uid ?? null);
  const audienceRemote = remoteUsers.filter((u) => u.uid !== stageUid);
  const cameraOnUsers = audienceRemote.filter((u) => u.hasVideo);
  const audioOnlyUsers = audienceRemote.filter((u) => !u.hasVideo);
  const selfHasCamera = cameraOn && !isScreenSharing && !!localCameraTrack;

  /*
   * A shared screen is a different shape from a face.
   *
   * The stage is 4:3 because that is a sensible frame for a person. A slide
   * deck or an editor is 16:9, and forcing one into the other either crops the
   * edges off or leaves thick black bars down both sides. So the moment
   * somebody presents, the stage becomes landscape — and goes back the moment
   * they stop.
   *
   * The presenter leaves the stage while this is happening: the stage is the
   * screen now, so they take a tile below with everyone else, and reclaim the
   * stage when the share ends.
   */
  const presenting = Boolean(isScreenSharing || remotePresenterUser);
  const selfPresenting = isAdmin && isScreenSharing;
  /* Their camera track still exists while presenting — Agora publishes the
     screen in its place rather than stopping it — so on their own device the
     tile can be live video. Everyone else only ever received the screen, so
     for them the presenter is an avatar. */
  const selfPresenterVideo = selfPresenting && cameraOn && !!localCameraTrack;

  const cameraCount =
    cameraOnUsers.length + (!isAdmin && selfHasCamera ? 1 : 0) + (selfPresenterVideo ? 1 : 0);
  const audioCount =
    audioOnlyUsers.length +
    (!isAdmin && !selfHasCamera ? 1 : 0) +
    (selfPresenting && !selfPresenterVideo ? 1 : 0) +
    (remotePresenterUser ? 1 : 0);
  const totalCount = remoteUsers.length + 1;

  const waitingFaces = presenceUsers.filter((p) => !p.isAdmin).slice(0, 3);
  const waitingExtra = Math.max(0, presenceUsers.filter((p) => !p.isAdmin).length - 3);

  const renderStage = () => {
    // Tutor sees their own output — exactly what learners see
    if (isAdmin) {
      if (isScreenSharing && screenTrack) {
        return <LocalVideoTrack track={screenTrack} play={true} className="w-full h-full object-contain" />;
      }
      if (cameraOn && localCameraTrack) {
        return <LocalVideoTrack track={localCameraTrack} play={true} className="w-full h-full object-cover" />;
      }
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <Avatar url={profile?.avatar_url} name={profile?.username || "U"} className="w-20 h-20 text-2xl" />
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-white">Your camera is off</p>
            <p className="text-[12.5px] text-white/45 mt-1">Learners see this screen — turn on your camera or present to begin teaching.</p>
          </div>
        </div>
      );
    }

    // Learner: presenter's screen wins the stage
    if (remotePresenterUser) {
      const track = findVideo(remotePresenterUser.uid);
      return track
        ? <RemoteVideoTrack track={track} play={true} className="w-full h-full object-contain" />
        : null;
    }
    // Then the tutor's camera
    if (remoteTutor && remoteTutor.hasVideo) {
      const track = findVideo(remoteTutor.uid);
      return track
        ? <RemoteVideoTrack track={track} play={true} className="w-full h-full object-cover" />
        : null;
    }
    // Tutor is here, audio only
    if (remoteTutor) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="relative">
            <Avatar url={userAvatars[remoteTutor.uid]} name={tutorName} className="w-20 h-20 text-2xl" />
            {remoteTutor.hasAudio && (
              <span className="absolute inset-0 rounded-full ring-2 ring-emerald-400/50 animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-white">{tutorName} is live</p>
            <p className="text-[12.5px] text-white/45 mt-1">Audio only — video will appear here when they share.</p>
          </div>
        </div>
      );
    }
    // Waiting for the tutor
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
        <div className="relative grid place-items-center">
          <span className="absolute h-14 w-14 rounded-full bg-red-500/20 animate-ping" style={{ animationDuration: "2s" }} />
          <span className="absolute h-10 w-10 rounded-full bg-red-500/25" />
          <span className="relative h-5 w-5 rounded-full bg-red-500" />
        </div>
        <div>
          <p className="text-[17px] font-semibold tracking-tight text-white">Waiting for {tutorName} to start</p>
          <p className="text-[12.5px] text-white/45 mt-1.5">{clubName ? `${clubName} — the` : "The"} session hasn't begun sharing yet.</p>
        </div>
        {waitingFaces.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {waitingFaces.map((p) => (
                <Avatar key={p.uid} url={p.avatar} name={p.name} className="w-9 h-9 ring-2 ring-[#0A0A0C]" />
              ))}
            </div>
            {waitingExtra > 0 && <span className="text-[12px] text-white/45">+{waitingExtra} waiting</span>}
          </div>
        )}
      </div>
    );
  };

  const stageIsLive = isAdmin
    ? (isScreenSharing || cameraOn)
    : !!(remotePresenterUser || remoteTutor);

  /* ══════════ MINI PLAYER ══════════ */
  if (isMinimized) {
    return (
      <div
        onMouseDown={onDragStart}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onTouchStart={onDragStart}
        onTouchMove={onDragMove as any}
        onTouchEnd={onDragEnd}
        className="fixed z-[9999] select-none cursor-grab active:cursor-grabbing"
        style={{ right: `${position.x}px`, bottom: `${position.y}px` }}
      >
        <div className="w-[152px] rounded-lg overflow-hidden shadow-lift ring-1 ring-white/15 bg-[#141117] animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
          <div
            className="relative aspect-[4/3] bg-[#0A0A0C] flex items-center justify-center cursor-pointer overflow-hidden"
            onClick={handleRestore}
          >
            {isScreenSharing && screenTrack ? (
              <LocalVideoTrack track={screenTrack} play={true} className="w-full h-full object-contain bg-black pointer-events-none" />
            ) : cameraOn && localCameraTrack ? (
              <LocalVideoTrack track={localCameraTrack} play={true} className="w-full h-full object-cover pointer-events-none" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center overflow-hidden">
                {liveSession.userAvatar ? (
                  <img src={liveSession.userAvatar} alt="" className="w-full h-full object-cover pointer-events-none" />
                ) : (
                  <span className="text-xl font-semibold text-white/80">{initial}</span>
                )}
              </div>
            )}

            <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-600/90 backdrop-blur-md px-2 py-0.5 rounded-full">
              <Radio className="w-2.5 h-2.5 text-white animate-pulse" />
              <span className="text-[8px] font-medium text-white tracking-[0.08em]">LIVE</span>
            </div>

            <div className="absolute top-2 right-2">
              <div className={`h-5 w-5 rounded-full flex items-center justify-center ${micOn ? "bg-black/50 ring-1 ring-white/10" : "bg-red-500/85"}`}>
                {micOn ? <Mic className="w-2.5 h-2.5 text-emerald-400" /> : <MicOff className="w-2.5 h-2.5 text-white" />}
              </div>
            </div>

            <div className="absolute bottom-1.5 inset-x-0 text-center pointer-events-none">
              <span className="text-[8px] font-medium text-white/70 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-full">
                Tap to return
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between px-2 py-1.5 bg-[#141117] border-t border-white/[0.06]">
            <button
              onClick={handleRestore}
              className="h-7 w-7 rounded-full bg-white/[0.08] text-white/80 flex items-center justify-center hover:bg-white/15 transition tap"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleLeave}
              disabled={isLeaving}
              className="flex h-7 items-center justify-center gap-1 rounded-full bg-red-500 px-2.5 text-white transition hover:bg-red-600 disabled:cursor-wait disabled:opacity-70 tap"
            >
              <PhoneOff className="w-3 h-3" />
              <span className="text-[9px] font-semibold">{isLeaving ? "Leaving" : "Leave"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════ FULL SCREEN CLASSROOM ══════════ */
  return (
    <div className="fixed inset-0 h-[100dvh] bg-[#0A0A0C] text-white flex flex-col z-[9999] overflow-hidden">
      {/* Hidden: play every remote audio stream regardless of layout */}
      <div className="hidden">
        {audioTracks.map((t) => (
          <RemoteAudioTrack key={String(t.getUserId())} track={t} play={true} />
        ))}
      </div>

      {/* ═══ HEADER ═══ */}
      <header className="shrink-0 flex items-center justify-between px-3 md:px-5 pb-2.5 pt-[calc(0.5rem+env(safe-area-inset-top))] md:pb-3 md:pt-[calc(0.75rem+env(safe-area-inset-top))] z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={handleMinimize}
            className="h-9 w-9 shrink-0 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center hover:bg-white/[0.12] transition tap"
            title="Minimize live session"
          >
            <Minimize2 className="w-4 h-4 text-white/80" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display font-semibold text-[15px] tracking-tight leading-tight text-white truncate">
              {clubName || "Zero Club Live"}
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1 bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
              <SessionElapsed />
              <span className="flex items-center gap-1 text-white/50 font-medium">
                <Users className="w-3 h-3" />
                <span className="tabular-nums">{totalCount}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 bg-white/[0.06] ring-1 ring-white/10 rounded-full px-2.5 py-1.5">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="font-semibold text-[10.5px] text-white/90">Live now</span>
          </div>
          <button
            onClick={handleShare}
            title="Copy invite link"
            className="h-9 w-9 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center text-white/80 hover:bg-white/[0.12] transition tap"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ═══ STAGE + PANEL ═══ */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 gap-2 px-2.5 md:px-4 pb-2">
        {/* ── STAGE ── */}
        <div className={`relative overflow-hidden rounded-lg bg-black ring-1 ring-white/[0.08] min-h-0 transition-[aspect-ratio] duration-300 ${theater ? "flex-1" : presenting ? "shrink-0 aspect-video md:aspect-auto md:flex-1" : "shrink-0 aspect-[4/3] md:aspect-auto md:flex-1"}`}>
          {renderStage()}

          {/* Reactions float up the stage. pointer-events-none so they can
              never intercept a tap meant for the video underneath. */}
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            {reactions.map((r) => (
              <div
                key={r.id}
                className="absolute bottom-2 flex flex-col items-center"
                style={{ left: `${r.left}%`, animation: "zc-reaction-float 3.2s ease-out forwards" }}
              >
                <span className="text-[30px] leading-none drop-shadow-lg">{r.emoji}</span>
                {r.name && (
                  <span className="mt-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[8.5px] font-semibold text-white/90 backdrop-blur-sm">
                    {r.name}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Stage overlays */}
          {stageIsLive && (
            <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
              <span className="flex items-center gap-1 bg-red-600/90 backdrop-blur-md px-2 py-0.5 rounded-full text-white">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                <span className="text-[8px] font-medium tracking-[0.08em]">LIVE</span>
              </span>
              {(isScreenSharing || remotePresenterUser) && (
                <span className="flex items-center gap-1 bg-emerald-500/90 backdrop-blur-md px-2 py-0.5 rounded-full text-white">
                  <MonitorUp className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-medium tracking-[0.08em]">
                    {isScreenSharing ? "PRESENTING" : "SCREEN"}
                  </span>
                </span>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 bg-[#cc208f]/90 backdrop-blur-md px-2 py-1 rounded-full">
              <GraduationCap className="w-3 h-3 text-white" />
              <span className="text-[9px] font-medium text-white tracking-[0.06em]">
                Teaching {Math.max(0, totalCount - 1)} {totalCount - 1 === 1 ? "learner" : "learners"}
              </span>
            </div>
          )}

          {/* Tutor nameplate (learner view, when live) */}
          {!isAdmin && stageIsLive && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-3.5 pb-3 pt-10 z-10 pointer-events-none">
              <div className="flex items-center gap-2">
                <Avatar
                  url={remotePresenterUser ? userAvatars[remotePresenterUser.uid] : remoteTutor ? userAvatars[remoteTutor.uid] : undefined}
                  name={tutorName}
                  className="w-6 h-6"
                />
                <span className="text-[13px] font-semibold tracking-tight text-white">{tutorName}</span>
                <span className="text-[8.5px] font-medium uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full bg-[#cc208f]/90 text-white">
                  Tutor
                </span>
              </div>
            </div>
          )}

          {/* Theater toggle */}
          <button
            onClick={() => setTheater((t) => !t)}
            title={theater ? "Show panel" : "Expand stage"}
            className="absolute bottom-2.5 left-2.5 z-10 h-9 w-9 rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/15 flex items-center justify-center text-white/85 hover:bg-black/70 transition tap"
          >
            {theater ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
          </button>

          {/* Self preview PiP for the tutor while presenting */}
          {isAdmin && isScreenSharing && cameraOn && localCameraTrack && (
            <div className="absolute bottom-2.5 right-2.5 z-10 w-24 aspect-video rounded-lg overflow-hidden ring-1 ring-white/20 shadow-lift">
              <LocalVideoTrack track={localCameraTrack} play={true} className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* ── PANEL: Chat / Learners ── */}
        {!theater && (
          <div className="flex-1 md:flex-none md:w-[380px] min-h-0 flex flex-col rounded-lg bg-[#101014] ring-1 ring-white/[0.06] overflow-hidden">
            {/* Tabs */}
            <div className="shrink-0 flex border-b border-white/[0.06]">
              <button
                onClick={() => setActiveTab("chat")}
                className={`relative flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold tracking-tight transition-colors ${activeTab === "chat" ? "text-white" : "text-white/45 hover:text-white/70"}`}
              >
                <Send className="w-3.5 h-3.5" />
                Chat
                {unreadCount > 0 && activeTab !== "chat" && (
                  <span className="h-4 min-w-[16px] rounded-full bg-[#cc208f] text-white text-[8px] font-bold flex items-center justify-center px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
                {activeTab === "chat" && <span className="absolute bottom-0 inset-x-6 h-[2px] rounded-t-full bg-[#cc208f]" />}
              </button>
              <button
                onClick={() => setActiveTab("learners")}
                className={`relative flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold tracking-tight transition-colors ${activeTab === "learners" ? "text-white" : "text-white/45 hover:text-white/70"}`}
              >
                <Users className="w-3.5 h-3.5" />
                Learners · <span className="tabular-nums">{totalCount}</span>
                {activeTab === "learners" && <span className="absolute bottom-0 inset-x-6 h-[2px] rounded-t-full bg-[#cc208f]" />}
              </button>
            </div>

            {/* ── Chat tab ── */}
            {activeTab === "chat" && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <div className="w-12 h-12 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center mb-4">
                        <MessageSquare className="w-5 h-5 text-white/40" strokeWidth={1.75} />
                      </div>
                      <p className="font-semibold tracking-tight text-white/70 text-[14px]">No messages yet</p>
                      <p className="text-white/40 text-[12px] mt-1">Questions and answers land here.</p>
                    </div>
                  ) : (
                    chatMessages.map((msg: any) => {
                      const isMe = msg.sender_id === (profile?.userId || profile?.id);
                      return (
                        <div
                          key={msg.id}
                          id={`zc-live-msg-${msg.id}`}
                          onTouchStart={(event) => {
                            const touch = event.touches[0];
                            swipeStart.current = { x: touch.clientX, y: touch.clientY };
                          }}
                          onTouchMove={(event) => {
                            const start = swipeStart.current;
                            if (!start) return;
                            const touch = event.touches[0];
                            const dx = touch.clientX - start.x;
                            const dy = touch.clientY - start.y;
                            // Sideways only: a diagonal drag is someone
                            // scrolling the thread, and hijacking it would make
                            // the list feel stuck.
                            if (Math.abs(dy) > Math.abs(dx)) return;
                            const pulled = Math.max(0, Math.min(72, dx));
                            setSwipedId(msg.id);
                            setSwipeOffset(pulled);
                          }}
                          onTouchEnd={() => {
                            if (swipeOffset > 44) {
                              setReplyingTo(msg);
                              chatInputRef.current?.focus();
                              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
                            }
                            swipeStart.current = null;
                            setSwipedId(null);
                            setSwipeOffset(0);
                          }}
                          style={swipedId === msg.id ? { transform: `translateX(${swipeOffset}px)` } : undefined}
                          className={`group relative flex gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 ${swipedId === msg.id ? "" : "transition-transform"}`}
                        >
                          {swipedId === msg.id && swipeOffset > 8 && (
                            <span
                              className="pointer-events-none absolute -left-9 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-[#cc208f] text-white"
                              style={{ opacity: Math.min(1, swipeOffset / 44) }}
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <div className="shrink-0 w-7 h-7 rounded-full overflow-hidden bg-white/[0.08] flex items-center justify-center mt-0.5 ring-1 ring-white/10">
                            {msg.sender_avatar ? (
                              <img src={msg.sender_avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] font-semibold text-white/80">{msg.sender_name[0]?.toUpperCase()}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[12px] font-semibold tracking-tight truncate ${isMe ? "text-[#f28fd0]" : "text-white/90"}`}>
                                {isMe ? "You" : msg.sender_name}
                              </span>
                              <span className="text-[10px] text-white/35 shrink-0 tabular-nums">{formatTime(msg.timestamp)}</span>
                              <button
                                onClick={() => { setReplyingTo(msg); chatInputRef.current?.focus(); }}
                                aria-label={`Reply to ${msg.sender_name}`}
                                className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white/40 transition hover:bg-white/10 hover:text-white/80"
                              >
                                Reply
                              </button>
                            </div>

                            {msg.reply_to && (
                              /* Tapping the quote jumps to the original when it
                                 is still on screen; when it is not, the quote
                                 itself is the answer. */
                              <button
                                onClick={() => document.getElementById(`zc-live-msg-${msg.reply_to!.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                                className="mt-1.5 flex w-full items-start gap-2 rounded-lg border-l-2 border-[#cc208f] bg-white/[0.04] px-2.5 py-1.5 text-left"
                              >
                                <span className="min-w-0">
                                  <span className="block text-[10.5px] font-semibold text-[#f28fd0]">{msg.reply_to.sender_name}</span>
                                  <span className="line-clamp-2 block text-[11px] leading-snug text-white/50">{msg.reply_to.content}</span>
                                </span>
                              </button>
                            )}
                            <div className={`mt-1 rounded-lg rounded-tl-sm px-3 py-2 inline-block max-w-full ${isMe ? "bg-[#cc208f]/15 ring-1 ring-[#cc208f]/20" : "bg-white/[0.06] ring-1 ring-white/[0.06]"}`}>
                              <div className="break-words text-[13px] leading-relaxed text-white/85">
                                <LiveMessageText
                                  text={msg.content}
                                  names={presenceUsers.map((person) => person.name)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="shrink-0 border-t border-white/[0.06] p-3">
                  {mentionCandidates.length > 0 && (
                    <div className="mb-2 overflow-hidden rounded-xl bg-[#1b1620] ring-1 ring-white/10">
                      {mentionCandidates.map((person) => (
                        <button
                          key={person.uid}
                          onClick={() => applyMention(person.name)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.06]"
                        >
                          <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-[10px] font-semibold text-white/80">
                            {person.avatar ? <img src={person.avatar} alt="" className="h-full w-full object-cover" /> : person.name[0]?.toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/85">{person.name}</span>
                          {person.isAdmin && <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-[#f28fd0]">Host</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {replyingTo && (
                    <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-[#cc208f] bg-white/[0.05] px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10.5px] font-semibold text-[#f28fd0]">
                          Replying to {replyingTo.sender_name}
                        </span>
                        <span className="line-clamp-1 block text-[11px] text-white/50">{replyingTo.content}</span>
                      </span>
                      <button
                        onClick={() => setReplyingTo(null)}
                        aria-label="Cancel reply"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 bg-white/[0.06] ring-1 ring-white/10 rounded-full px-4 py-2.5 focus-within:ring-[#cc208f]/50 transition-all">
                    <input
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={(e) => handleChatInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setMentionQuery(null); setReplyingTo(null); return; }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          // Enter picks the top name when the picker is open,
                          // rather than sending "@hal" as literal text.
                          if (mentionCandidates.length > 0) applyMention(mentionCandidates[0].name);
                          else sendMessage();
                        }
                      }}
                      placeholder={replyingTo ? `Reply to ${replyingTo.sender_name}` : isAdmin ? "Message your learners" : "Ask a question"}
                      className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/35 outline-none min-w-0"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!chatInput.trim()}
                      className="h-8 w-8 rounded-full bg-white text-black flex items-center justify-center hover:opacity-90 transition tap disabled:opacity-25 disabled:cursor-not-allowed shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Learners tab ── */}
            {activeTab === "learners" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar">
                {/* Camera on — Meet-style tiles: name pill bottom-left, mic
                    state on the pill itself, and a ring on whoever is talking
                    so you can see who has the floor without reading names. */}
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/40 mb-2.5">
                    <Video className="w-3 h-3" /> Camera on ({cameraCount})
                  </p>
                  {cameraCount === 0 ? (
                    <p className="text-[12px] text-white/30">No cameras on yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {selfPresenterVideo && (
                        <div className={`relative aspect-[3/4] overflow-hidden rounded-lg bg-[#141117] transition-shadow ${isSelfSpeaking ? "ring-2 ring-[#cc208f]" : "ring-1 ring-white/[0.08]"}`}>
                          <LocalVideoTrack track={localCameraTrack!} play={true} className="w-full h-full object-cover" />
                          <TilePill name="You · presenting" muted={!micOn} tutor />
                        </div>
                      )}
                      {!isAdmin && selfHasCamera && (
                        <div className={`relative aspect-[3/4] overflow-hidden rounded-lg bg-[#141117] transition-shadow ${isSelfSpeaking ? "ring-2 ring-[#cc208f]" : "ring-1 ring-white/[0.08]"}`}>
                          <LocalVideoTrack track={localCameraTrack!} play={true} className="w-full h-full object-cover" />
                          <TilePill name="You" muted={!micOn} />
                        </div>
                      )}
                      {cameraOnUsers.map((user) => (
                        <div
                          key={user.uid}
                          className={`relative aspect-[3/4] overflow-hidden rounded-lg bg-[#141117] transition-shadow ${activeSpeaker === String(user.uid) ? "ring-2 ring-[#cc208f]" : "ring-1 ring-white/[0.08]"}`}
                        >
                          {findVideo(user.uid) && (
                            <RemoteVideoTrack track={findVideo(user.uid)!} play={true} className="w-full h-full object-cover" />
                          )}
                          <TilePill
                            name={userNames[user.uid] || "Builder"}
                            muted={!user.hasAudio}
                            tutor={adminUids.has(String(user.uid))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Audio only */}
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/40 mb-2.5">
                    <Mic className="w-3 h-3" /> Audio only ({audioCount})
                  </p>
                  {audioCount === 0 ? (
                    <p className="text-[12px] text-white/30">Everyone else has their camera on.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selfPresenting && !selfPresenterVideo && (
                        <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/[0.06]">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar url={profile?.avatar_url} name={profile?.username || "U"} className="w-8 h-8" />
                            <span className="truncate text-[13px] font-medium tracking-tight text-white/90">You · presenting</span>
                          </div>
                          <MicDot on={micOn} />
                        </div>
                      )}
                      {remotePresenterUser && (
                        /* Their published video is the screen on the stage, so
                           showing it again here would be the same picture
                           twice. The tile says who is presenting instead. */
                        <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2.5 ring-1 ring-[#cc208f]/30">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar url={userAvatars[remotePresenterUser.uid]} name={userNames[remotePresenterUser.uid] || "Builder"} className="w-8 h-8" />
                            <span className="truncate text-[13px] font-medium tracking-tight text-white/90">
                              {userNames[remotePresenterUser.uid] || "Builder"} · presenting
                            </span>
                          </div>
                          <MicDot on={remotePresenterUser.hasAudio} />
                        </div>
                      )}
                      {!isAdmin && !selfHasCamera && (
                        <div className="flex items-center justify-between rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06] px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar url={profile?.avatar_url} name={profile?.username || "U"} className="w-8 h-8" />
                            <span className="text-[13px] font-medium tracking-tight text-white/90 truncate">You</span>
                          </div>
                          <MicDot on={micOn} />
                        </div>
                      )}
                      {audioOnlyUsers.map((user) => (
                        <div
                          key={user.uid}
                          className={`flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2.5 transition-shadow ${activeSpeaker === String(user.uid) ? "ring-2 ring-[#cc208f]" : "ring-1 ring-white/[0.06]"}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar url={userAvatars[user.uid]} name={userNames[user.uid] || "B"} className="w-8 h-8" />
                            <span className="text-[13px] font-medium tracking-tight text-white/90 truncate">
                              {userNames[user.uid] || "Builder"}
                            </span>
                            {adminUids.has(String(user.uid)) && (
                              <span className="shrink-0 text-[8px] font-medium uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full bg-[#cc208f]/90 text-white">
                                Tutor
                              </span>
                            )}
                          </div>
                          <MicDot on={!!user.hasAudio} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ CONTROL BAR ═══ */}
      {/* Icon only. The shapes are universal, and dropping the labels buys
          enough room for proper 48px targets — the old buttons were 36px tall
          with text competing for the same space. aria-label and title carry
          the meaning for anyone who needs it. */}
      <div className="relative z-20 shrink-0 px-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-1">
        {/* Quick reactions. A short fixed row rather than a full picker: in a
            live class you want one tap, not a search field. */}
        {showReactionTray && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowReactionTray(false)} />
            <div className="absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#1a1a20] px-2 py-1.5 ring-1 ring-white/12 shadow-lift animate-in fade-in slide-in-from-bottom-2 duration-200">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => sendReaction(emoji)}
                  aria-label={`React with ${emoji}`}
                  className="grid h-10 w-10 place-items-center rounded-full text-[22px] leading-none transition hover:bg-white/10 active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mx-auto flex w-full max-w-[430px] items-center justify-center gap-2 rounded-full bg-white/[0.06] px-3 py-2 ring-1 ring-white/10 shadow-lift backdrop-blur-xl">
          <button
            onClick={() => setMicOn((p) => !p)}
            disabled={isLeaving}
            title={micOn ? "Mute microphone" : "Unmute microphone"}
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            aria-pressed={!micOn}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition-all tap active:scale-95 disabled:opacity-50 ${micOn ? "bg-white/[0.1] text-white hover:bg-white/[0.16]" : "bg-red-500 text-white"}`}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          <button
            onClick={() => setCameraOn((p) => !p)}
            disabled={isLeaving}
            title={cameraOn ? "Turn off camera" : "Turn on camera"}
            aria-label={cameraOn ? "Turn off camera" : "Turn on camera"}
            aria-pressed={!cameraOn}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition-all tap active:scale-95 disabled:opacity-50 ${cameraOn ? "bg-white/[0.1] text-white hover:bg-white/[0.16]" : "bg-red-500 text-white"}`}
          >
            {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>

          <button
            onClick={() => setShowReactionTray((p) => !p)}
            disabled={isLeaving}
            title="Send a reaction"
            aria-label="Send a reaction"
            aria-expanded={showReactionTray}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition-all tap active:scale-95 disabled:opacity-50 ${showReactionTray ? "bg-white text-black" : "bg-white/[0.1] text-white hover:bg-white/[0.16]"}`}
          >
            <Smile className="h-5 w-5" />
          </button>

          {isAdmin ? (
            <button
              onClick={toggleScreenShare}
              disabled={isLeaving}
              title={isScreenSharing ? "Stop presenting" : "Present your screen"}
              aria-label={isScreenSharing ? "Stop presenting" : "Present your screen"}
              aria-pressed={isScreenSharing}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition-all tap active:scale-95 disabled:opacity-50 ${isScreenSharing ? "bg-emerald-500 text-white" : "bg-white/[0.1] text-white hover:bg-white/[0.16]"}`}
            >
              {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
            </button>
          ) : (
            <button
              onClick={toggleScreenShare}
              disabled={isLeaving}
              title="Only the tutor can present"
              aria-label="Only the tutor can present"
              className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/[0.05] text-white/40 tap active:scale-95 disabled:opacity-50"
            >
              <MonitorUp className="h-5 w-5" />
              <span className="absolute -top-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#0A0A0C] ring-1 ring-white/15">
                <Lock className="h-2 w-2 text-white/60" />
              </span>
            </button>
          )}

          <div className="h-6 w-px shrink-0 bg-white/10" />

          <button
            onClick={handleLeave}
            disabled={isLeaving}
            title="Leave the live room"
            aria-label="Leave the live room"
            className="grid h-12 w-[68px] shrink-0 place-items-center rounded-full bg-red-500 text-white transition-all tap active:scale-95 hover:bg-red-600 disabled:cursor-wait disabled:opacity-70"
          >
            {isLeaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
