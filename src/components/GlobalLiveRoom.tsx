import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { useLiveSession } from "@/contexts/LiveSessionContext";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, MonitorOff, Users,
  MessageSquare, Loader2, Send, X, Radio, Zap, Share2, Minimize2, Maximize2, Lock,
} from "lucide-react";

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

interface ChatMessage {
  id: string;
  sender_name: string;
  sender_avatar?: string;
  content: string;
  timestamp: string;
  sender_id?: string;
}

/**
 * Global component that maintains the Agora connection across route changes.
 * Displays as fullscreen when maximized, and as a draggable PiP when minimized.
 * The live stage is a committed dark surface regardless of app theme — like every
 * world-class video product.
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
        <h2 className="text-[19px] font-semibold text-white tracking-tight mt-6">Preparing your stage</h2>
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
const NamePlate = ({ name, role, presenting }: { name: string; role?: string; presenting?: boolean }) => (
  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-3 pb-2.5 pt-8 z-10 pointer-events-none">
    <div className="flex items-center gap-1.5">
      <span className="text-[12.5px] font-semibold tracking-tight text-white truncate">{name}</span>
      {role && (
        <span className={`shrink-0 text-[8.5px] font-medium uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full ${role === "Admin" ? "bg-[#cc208f]/90 text-white" : "bg-white/15 text-white/80"}`}>
          {role}
        </span>
      )}
      {presenting && (
        <span className="shrink-0 text-[8.5px] font-medium uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full bg-emerald-500/90 text-white">
          Presenting
        </span>
      )}
    </div>
  </div>
);

const MicBadge = ({ on }: { on: boolean }) => (
  <div className={`absolute top-2 right-2 z-10 grid h-6 w-6 place-items-center rounded-full backdrop-blur-md ${on ? "bg-black/40 ring-1 ring-white/10" : "bg-red-500/85"}`}>
    {on ? <Mic className="w-3 h-3 text-emerald-400" /> : <MicOff className="w-3 h-3 text-white" />}
  </div>
);

const AvatarFallback = ({ url, name, size = "lg" }: { url?: string | null; name: string; size?: "lg" | "sm" }) => (
  <div className="absolute inset-0 flex items-center justify-center bg-[#141117]">
    <div className={`${size === "lg" ? "w-16 h-16 md:w-20 md:h-20" : "w-10 h-10"} rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center overflow-hidden`}>
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className={`${size === "lg" ? "text-xl" : "text-sm"} font-semibold text-white/80`}>
          {(name || "U")[0].toUpperCase()}
        </span>
      )}
    </div>
  </div>
);

function LiveRoomContent({ channel, token }: { channel: string; token: string }) {
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const liveSession = useLiveSession();
  const { isMinimized } = liveSession;
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      if (!profile?.id) return;
      const { data: club } = await supabase.from("clubs").select("creator_id").eq("id", channel).single();
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

  /* ── Session timer ── */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const formatElapsed = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${m}:${String(sec).padStart(2, "0")}`;
  };

  /* ── Sync mic state to global context for mini player ── */
  useEffect(() => {
    liveSession.setMicState(micOn);
  }, [micOn]);

  /* ── Chat state ── */
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatChannelRef = useRef<any>(null);
  const chatOpenRef = useRef(chatOpen);
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);

  /* ── Agora hooks ── */
  useJoin({ appid: APP_ID, channel, token }, true);
  const client = useRTCClient();
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn && !isScreenSharing, { encoderConfig: "720p_1" });

  const videoTrackToPublish = isScreenSharing && screenTrack ? screenTrack : localCameraTrack;

  // Agora usePublish accepts null values and uses array positioning
  const tracksToPublish = [localMicrophoneTrack || null, videoTrackToPublish || null];
  usePublish(tracksToPublish);

  const remoteUsers = useRemoteUsers();
  const { audioTracks } = useRemoteAudioTracks(remoteUsers);
  const { videoTracks } = useRemoteVideoTracks(remoteUsers);

  /* ── Remote presenter tracking (broadcast + heartbeat, expires when stale) ── */
  const [remotePresenter, setRemotePresenter] = useState<{ uid: string; at: number } | null>(null);

  /* ── Chat + presenting broadcast channel ── */
  useEffect(() => {
    const ch = supabase.channel(`live-chat-${channel}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "chat" }, ({ payload }: any) => {
      setChatMessages((prev) => [...prev, payload as ChatMessage]);
      if (!chatOpenRef.current) setUnreadCount((c) => c + 1);
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

  /* ── User Names Presence Mapping ── */
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({});

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
    let adminCount = 0;

    Object.values(presenceState).forEach((users: any[]) => {
      users.forEach((u) => {
        if (u.agora_uid && u.name) newNames[u.agora_uid] = u.name;
        if (u.agora_uid && u.avatar_url) newAvatars[u.agora_uid] = u.avatar_url;
        if (u.isAdmin) adminCount++;
      });
    });

    setUserNames(newNames);
    setUserAvatars(newAvatars);

    // Auto-leave logic for members when admin leaves
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
          toast.info("The admin has ended the live session.");
          liveSession.endSession();
          if (window.location.pathname.includes(`/app/live/`)) {
            navigate({ to: "/app/clubs/chat", search: { clubId: channel } });
          }
        }
      }
    }
  }, [presenceState, isAdmin]);

  /* ── Auto-scroll chat ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /* ── Reset unread when chat opened ── */
  useEffect(() => {
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  /* ── Handlers ── */
  const handleMinimize = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    liveSession.minimize();
    if (window.location.pathname.includes(`/app/live/`)) {
      if (window.history.length > 2) {
        window.history.back();
      } else {
        navigate({ to: "/app/clubs/chat", search: { clubId: channel } });
      }
    }
  };

  const handleLeave = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    liveSession.endSession();
    if (window.location.pathname.includes(`/app/live/`)) {
      if (window.history.length > 2) {
        window.history.back();
      } else {
        navigate({ to: "/app/clubs/chat", search: { clubId: channel } });
      }
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
      toast.error("Only admins and the club creator can present.");
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
      const track = await AgoraRTC.createScreenVideoTrack({
        // Lighter encode on mobile keeps the share smooth on cellular
        encoderConfig: isMobile ? "720p_2" : "1080p_1",
        optimizationMode: "detail",
      });
      const video = Array.isArray(track) ? track[0] : track;
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
    };
    setChatMessages((prev) => [...prev, msg]);
    chatChannelRef.current.send({ type: "broadcast", event: "chat", payload: msg });
    setChatInput("");
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

  /* ── Stage composition ── */
  const remotePresenterUser = remotePresenter
    ? remoteUsers.find((u) => String(u.uid) === remotePresenter.uid)
    : undefined;
  const hasHero = isScreenSharing || !!remotePresenterUser;
  const gridUsers = remotePresenterUser
    ? remoteUsers.filter((u) => u.uid !== remotePresenterUser.uid)
    : remoteUsers;

  const totalTiles = gridUsers.length + 1;
  const gridClass =
    totalTiles <= 1
      ? "grid-cols-1"
      : totalTiles === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : totalTiles <= 4
          ? "grid-cols-2"
          : "grid-cols-2 md:grid-cols-3";

  const renderRemoteVideo = (user: any, contain = false) => {
    const track = videoTracks.find((t) => t.getUserId() === user.uid);
    return (
      <>
        {track ? (
          <RemoteVideoTrack track={track} play={true} className={`w-full h-full ${contain ? "object-contain bg-black" : "object-cover"}`} />
        ) : null}
        {!user.hasVideo && (
          <AvatarFallback url={userAvatars[user.uid]} name={userNames[user.uid] || "U"} />
        )}
        {audioTracks.find((t) => t.getUserId() === user.uid) && (
          <RemoteAudioTrack track={audioTracks.find((t) => t.getUserId() === user.uid)!} play={true} />
        )}
      </>
    );
  };

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
        <div className="w-[152px] rounded-2xl overflow-hidden shadow-lift ring-1 ring-white/15 bg-[#141117] animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
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
              className="h-7 px-2.5 rounded-full bg-red-500 text-white flex items-center justify-center gap-1 hover:bg-red-600 transition tap"
            >
              <PhoneOff className="w-3 h-3" />
              <span className="text-[9px] font-semibold">Leave</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════ FULL SCREEN STAGE ══════════ */
  return (
    <div className="fixed inset-0 h-[100dvh] bg-[#0A0A0C] text-white flex flex-col z-[9999] overflow-hidden">
      {/* Ambient stage glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-[#cc208f]/10 blur-[120px]" />

      {/* ═══ HEADER ═══ */}
      <header className="shrink-0 flex items-center justify-between px-3 md:px-5 pb-2.5 pt-[calc(0.5rem+env(safe-area-inset-top))] md:pb-3 md:pt-[calc(0.75rem+env(safe-area-inset-top))] z-20">
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleMinimize}
            className="h-9 w-9 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center hover:bg-white/[0.12] transition tap"
            title="Minimize live session"
          >
            <Minimize2 className="w-4 h-4 text-white/80" />
          </button>
          <div>
            <h1 className="font-display font-semibold text-[15px] tracking-tight leading-tight text-white">Zero Club Live</h1>
            <div className="mt-0.5 flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1 bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
              <span className="text-white/50 tabular-nums font-medium">{formatElapsed(elapsed)}</span>
              <span className="flex items-center gap-1 text-white/50 font-medium">
                <Users className="w-3 h-3" />
                <span className="tabular-nums">{remoteUsers.length + 1}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white/[0.06] ring-1 ring-white/10 rounded-full px-2.5 py-1.5">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="font-semibold text-[10.5px] text-white/90 tabular-nums">25 XP</span>
          </div>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative px-2.5 md:px-4 pb-2">
        {/* Chat Drawer Overlay */}
        {chatOpen && (
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-[#101014]/95 backdrop-blur-xl border-l border-white/[0.06] z-30 flex flex-col shadow-lift animate-in slide-in-from-right-full duration-300">
            <div className="shrink-0 flex items-center justify-between px-5 h-14 border-b border-white/[0.06]">
              <h2 className="font-semibold tracking-tight text-[15px] text-white">Live chat</h2>
              <button onClick={() => setChatOpen(false)} className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.12] transition tap">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-12 h-12 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center mb-4">
                    <MessageSquare className="w-5 h-5 text-white/40" strokeWidth={1.75} />
                  </div>
                  <p className="font-semibold tracking-tight text-white/70 text-[14px]">No messages yet</p>
                  <p className="text-white/40 text-[12px] mt-1">Say hello to the room.</p>
                </div>
              ) : (
                chatMessages.map((msg: any) => {
                  const isMe = msg.sender_id === (profile?.userId || profile?.id);
                  return (
                    <div key={msg.id} className="flex gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
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
                        </div>
                        <div className={`mt-1 rounded-xl rounded-tl-sm px-3 py-2 inline-block max-w-full ${isMe ? "bg-[#cc208f]/15 ring-1 ring-[#cc208f]/20" : "bg-white/[0.06] ring-1 ring-white/[0.06]"}`}>
                          <p className="text-[13px] text-white/85 leading-relaxed break-words">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="shrink-0 p-3 border-t border-white/[0.06] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-2 items-center">
                <div className="flex-1 flex items-center gap-2 bg-white/[0.06] ring-1 ring-white/10 rounded-full px-4 py-2.5 focus-within:ring-[#cc208f]/50 transition-all">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Message the room"
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
            </div>
          </div>
        )}

        {/* ── PRESENTING BANNER ── */}
        {isScreenSharing && (
          <div className="shrink-0 mb-2 flex items-center justify-between rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/25 px-4 py-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <span className="flex items-center gap-2 text-[12px] font-medium text-emerald-400">
              <MonitorUp className="w-3.5 h-3.5" />
              You're presenting to the room
            </span>
            <button
              onClick={toggleScreenShare}
              className="rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 px-3 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition tap"
            >
              Stop
            </button>
          </div>
        )}

        {/* ── STAGE ── */}
        {hasHero ? (
          <div className="flex-1 flex flex-col min-h-0 gap-2">
            {/* Hero: the shared screen */}
            <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-black ring-1 ring-white/[0.08]">
              {isScreenSharing && screenTrack ? (
                <LocalVideoTrack track={screenTrack} play={true} className="w-full h-full object-contain" />
              ) : remotePresenterUser ? (
                renderRemoteVideo(remotePresenterUser, true)
              ) : null}
              <NamePlate
                name={isScreenSharing ? (profile?.username || "You") : (userNames[remotePresenterUser!.uid] || "Presenter")}
                presenting
              />
            </div>

            {/* Filmstrip: everyone else */}
            <div className="shrink-0 flex gap-2 overflow-x-auto no-scrollbar">
              {!isScreenSharing && (
                <div className="relative shrink-0 w-32 aspect-video rounded-xl overflow-hidden bg-[#141117] ring-1 ring-white/[0.08]">
                  {cameraOn && localCameraTrack ? (
                    <LocalVideoTrack track={localCameraTrack} play={true} className="w-full h-full object-cover" />
                  ) : (
                    <AvatarFallback url={profile?.avatar_url} name={profile?.username || "U"} size="sm" />
                  )}
                  <MicBadge on={micOn} />
                  <div className="absolute bottom-1 left-1.5 z-10 text-[10px] font-semibold text-white drop-shadow">You</div>
                </div>
              )}
              {gridUsers.map((user) => (
                <div key={user.uid} className="relative shrink-0 w-32 aspect-video rounded-xl overflow-hidden bg-[#141117] ring-1 ring-white/[0.08]">
                  {renderRemoteVideo(user)}
                  <MicBadge on={!!user.hasAudio} />
                  <div className="absolute bottom-1 left-1.5 z-10 text-[10px] font-semibold text-white drop-shadow truncate max-w-[85%]">
                    {userNames[user.uid] || "Builder"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── GRID (no presenter) ── */
          <div className={`flex-1 min-h-0 grid ${gridClass} auto-rows-fr gap-2`}>
            {/* Local tile */}
            <div className="relative rounded-2xl overflow-hidden bg-[#141117] ring-1 ring-white/[0.08]">
              {cameraOn && localCameraTrack ? (
                <LocalVideoTrack track={localCameraTrack} play={true} className="w-full h-full object-cover" />
              ) : (
                <AvatarFallback url={profile?.avatar_url} name={profile?.username || "U"} />
              )}
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
                <span className="flex items-center gap-1 bg-red-600/90 backdrop-blur-md px-2 py-0.5 rounded-full text-white">
                  <Radio className="w-2.5 h-2.5 animate-pulse" />
                  <span className="text-[8px] font-medium tracking-[0.08em]">LIVE</span>
                </span>
              </div>
              <MicBadge on={micOn} />
              <NamePlate name={profile?.username || "You"} role={isAdmin ? "Admin" : "Member"} />
            </div>

            {/* Remote tiles (cap at 7 + overflow badge) */}
            {gridUsers.slice(0, 7).map((user) => (
              <div key={user.uid} className="relative rounded-2xl overflow-hidden bg-[#141117] ring-1 ring-white/[0.08]">
                {renderRemoteVideo(user)}
                <MicBadge on={!!user.hasAudio} />
                <NamePlate name={userNames[user.uid] || `Builder`} role="Builder" />
              </div>
            ))}
            {gridUsers.length > 7 && (
              <div className="relative rounded-2xl overflow-hidden bg-[#141117] ring-1 ring-white/[0.08] flex items-center justify-center">
                <span className="text-[20px] font-semibold text-white/70 tabular-nums">+{gridUsers.length - 7}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ FLOATING CONTROL BAR ═══ */}
      <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 z-20">
        <div className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-white/[0.06] ring-1 ring-white/10 backdrop-blur-xl p-1.5 shadow-lift">
          <button
            onClick={() => setMicOn((p) => !p)}
            title={micOn ? "Mute" : "Unmute"}
            className={`h-11 w-11 rounded-full flex items-center justify-center transition-all tap ${micOn ? "bg-white/[0.08] text-white hover:bg-white/[0.14]" : "bg-red-500 text-white"}`}
          >
            {micOn ? <Mic className="w-[18px] h-[18px]" /> : <MicOff className="w-[18px] h-[18px]" />}
          </button>
          <button
            onClick={() => setCameraOn((p) => !p)}
            title={cameraOn ? "Turn camera off" : "Turn camera on"}
            className={`h-11 w-11 rounded-full flex items-center justify-center transition-all tap ${cameraOn ? "bg-white/[0.08] text-white hover:bg-white/[0.14]" : "bg-red-500 text-white"}`}
          >
            {cameraOn ? <Video className="w-[18px] h-[18px]" /> : <VideoOff className="w-[18px] h-[18px]" />}
          </button>
          <button
            onClick={toggleScreenShare}
            title={isAdmin ? (isScreenSharing ? "Stop presenting" : "Present your screen") : "Admins only"}
            className={`relative h-11 w-11 rounded-full flex items-center justify-center transition-all tap ${
              isScreenSharing
                ? "bg-emerald-500 text-white"
                : "bg-white/[0.08] text-white hover:bg-white/[0.14]"
            } ${!isAdmin ? "opacity-50" : ""}`}
          >
            {isScreenSharing ? <MonitorOff className="w-[18px] h-[18px]" /> : <MonitorUp className="w-[18px] h-[18px]" />}
            {!isAdmin && (
              <span className="absolute -top-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#0A0A0C] ring-1 ring-white/15">
                <Lock className="w-2 h-2 text-white/60" />
              </span>
            )}
          </button>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            title="Live chat"
            className={`relative h-11 w-11 rounded-full flex items-center justify-center transition-all tap ${chatOpen ? "bg-white text-black" : "bg-white/[0.08] text-white hover:bg-white/[0.14]"}`}
          >
            <MessageSquare className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-[#cc208f] text-white text-[8px] font-bold flex items-center justify-center px-1 ring-2 ring-[#0A0A0C]">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={handleShare}
            title="Copy invite link"
            className="h-11 w-11 rounded-full bg-white/[0.08] flex items-center justify-center text-white hover:bg-white/[0.14] transition-all tap"
          >
            <Share2 className="w-[18px] h-[18px]" />
          </button>

          <div className="mx-0.5 h-6 w-px bg-white/10" />

          <button
            onClick={handleLeave}
            title="Leave session"
            className="h-11 rounded-full bg-red-500 px-5 text-white flex items-center gap-1.5 justify-center transition-all tap hover:bg-red-600"
          >
            <PhoneOff className="w-[18px] h-[18px]" />
            <span className="text-[12px] font-semibold tracking-tight hidden sm:inline">Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
}
