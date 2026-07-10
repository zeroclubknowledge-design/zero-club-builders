import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { useLiveSession } from "@/contexts/LiveSessionContext";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, Users,
  MessageSquare, ChevronLeft, Loader2, Send, X, Radio, Zap, Search, Share2, PictureInPicture, Minimize2, Maximize2
} from "lucide-react";

import { useSharedPresence } from "@/hooks/useSharedPresence";

import AgoraRTC, {
  AgoraRTCProvider,
  LocalVideoTrack,
  RemoteUser,
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
    
    // Only fetch if we are active and don't have a token for this channel
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
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap className="w-7 h-7 text-primary-foreground fill-current" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-primary absolute -bottom-1 -right-1" />
        </div>
        <h2 className="text-xl font-black text-foreground tracking-tight mt-6">Preparing Live Room</h2>
        <p className="text-sm text-muted-foreground mt-2">Setting up your Zero Club session…</p>
      </div>
    );
  }

  /* ── Error State ── */
  if (!token && !isFetchingToken) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-6">
        <div className="bg-card p-8 rounded-3xl border border-border max-w-md w-full text-center shadow-xl">
          <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-2xl flex items-center justify-center mx-auto mb-6 border border-destructive/20">
            <PhoneOff className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-foreground tracking-tight mb-2">Connection Failed</h2>
          <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
            We couldn't generate a secure access token.
          </p>
          <button
            onClick={() => window.history.back()}
            className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-2xl hover:brightness-110 transition-colors"
          >
            Go Back
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
      const { data: member } = await supabase.from("club_members").select("role").eq("club_id", channel).eq("user_id", profile.id).single();
      if (member?.role === "admin" || member?.role === "moderator") {
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

  /* ── Chat broadcast channel ── */
  useEffect(() => {
    const ch = supabase.channel(`live-chat-${channel}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "chat" }, ({ payload }: any) => {
      setChatMessages((prev) => [...prev, payload as ChatMessage]);
      if (!chatOpenRef.current) setUnreadCount((c) => c + 1);
    }).subscribe();

    chatChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [channel]);

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
    // Do NOT navigate away here, the router might be on /app/live but they can navigate themselves later
    // Actually, navigate to clubs chat if they were on /app/live
    if (window.location.pathname.includes(`/app/live/`)) {
      navigate({ to: "/app/clubs/chat", search: { clubId: channel } });
    }
  };

  const handleLeave = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    liveSession.endSession();
    if (window.location.pathname.includes(`/app/live/`)) {
      navigate({ to: "/app/clubs/chat", search: { clubId: channel } });
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

  const toggleScreenShare = async () => {
    if (!isAdmin) {
      toast.error("Only Admins or the Club Creator can share their screen");
      return;
    }
    if (isScreenSharing) {
      if (screenTrack) {
        screenTrack.close();
      }
      setScreenTrack(null);
      setIsScreenSharing(false);
    } else {
      try {
        const track = await AgoraRTC.createScreenVideoTrack({
          encoderConfig: "1080p_1",
          optimizationMode: "detail",
        });
        if (Array.isArray(track)) {
          track[0].on("track-ended", () => { setIsScreenSharing(false); setScreenTrack(null); });
          setScreenTrack(track[0]);
        } else {
          track.on("track-ended", () => { setIsScreenSharing(false); setScreenTrack(null); });
          setScreenTrack(track);
        }
        setIsScreenSharing(true);
      } catch (err) {
        console.error("Screen share error:", err);
        toast.error("Could not start screen sharing");
      }
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

  // Touch/mouse drag handlers
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

  // If minimized, render the Mini-Player UI
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
        <div className="w-[150px] rounded-md overflow-hidden shadow-2xl shadow-black/50 border-2 border-primary/40 bg-card animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
          <div
            className="relative aspect-[4/3] bg-gradient-to-br from-card via-accent/30 to-card flex items-center justify-center cursor-pointer overflow-hidden"
            onClick={handleRestore}
          >
            {/* If camera is on and not sharing screen, show mini local video, else show avatar */}
            {cameraOn && localCameraTrack ? (
              <LocalVideoTrack track={localCameraTrack} play={true} className="w-full h-full object-cover pointer-events-none" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center border-2 border-primary/30 overflow-hidden shadow-lg">
                {liveSession.userAvatar ? (
                  <img src={liveSession.userAvatar} alt="" className="w-full h-full object-cover pointer-events-none" />
                ) : (
                  <span className="text-xl font-black text-primary">{initial}</span>
                )}
              </div>
            )}

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[72px] h-[72px] rounded-full border-2 border-primary/20 animate-ping" style={{ animationDuration: "2s" }} />
            </div>

            <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-600/90 backdrop-blur-md px-2 py-0.5 rounded-full">
              <Radio className="w-2.5 h-2.5 text-white animate-pulse" />
              <span className="text-[7px] text-white">Live</span>
            </div>

            <div className="absolute top-2 right-2">
              {!micOn ? (
                <div className="h-5 w-5 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                  <MicOff className="w-2.5 h-2.5 text-red-400" />
                </div>
              ) : (
                <div className="h-5 w-5 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                  <Mic className="w-2.5 h-2.5 text-green-400" />
                </div>
              )}
            </div>

            <div className="absolute bottom-1.5 inset-x-0 text-center pointer-events-none">
              <span className="text-[8px] font-bold text-muted-foreground/60 bg-background/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
                Tap to return
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between px-2 py-1.5 bg-card border-t border-border/30">
            <button
              onClick={handleRestore}
              className="h-7 w-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center hover:bg-primary/25 transition active:scale-95"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleLeave}
              className="h-7 px-2.5 rounded-lg bg-red-500 text-white flex items-center justify-center gap-1 hover:bg-red-600 transition active:scale-95"
            >
              <PhoneOff className="w-3 h-3" />
              <span className="text-[9px] font-bold">Leave</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Full Screen Render
  return (
    <div className="fixed inset-0 h-[100dvh] bg-background text-foreground flex flex-col z-[9999] overflow-hidden">
      {/* ═══ HEADER ═══ */}
      <header className="shrink-0 flex items-center justify-between px-3 md:px-5 pb-2.5 pt-[calc(0.5rem+env(safe-area-inset-top))] md:pb-3 md:pt-[calc(0.75rem+env(safe-area-inset-top))] bg-background/95 backdrop-blur-xl z-20 border-b border-border/20">
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleMinimize}
            className="h-8 w-8 rounded-full bg-accent/60 flex items-center justify-center hover:bg-accent transition active:scale-95"
            title="Minimize live session"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-black text-sm tracking-tight leading-tight">Zero Club Live</h1>
              <ChevronLeft className="w-3 h-3 text-muted-foreground rotate-[270deg]" />
            </div>
            <p className="text-[9px] font-bold flex items-center gap-1.5">
              <span className="flex items-center gap-1 bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE NOW
              </span>
              <span className="text-muted-foreground">
                <Users className="w-3 h-3 inline mr-0.5" />
                {remoteUsers.length + 1} Builders
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">
            <Zap className="w-3 h-3 text-amber-500 fill-current" />
            <span className="font-black text-[10px] text-amber-500">25 XP</span>
          </div>
        </div>
      </header>

      {/* ═══ SCROLLABLE MAIN CONTENT ═══ */}
      <div className="flex-1 flex flex-col overflow-y-auto min-h-0 no-scrollbar relative">
        {/* Chat Drawer Overlay */}
        {chatOpen && (
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-background/95 backdrop-blur-xl border-l border-border/20 z-30 flex flex-col shadow-2xl animate-in slide-in-from-right-full">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 h-14 border-b border-border/50">
              <h2 className="font-black text-base tracking-tight text-foreground">Chat Room</h2>
              <button onClick={() => setChatOpen(false)} className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center hover:bg-accent/80 transition">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-4 border border-border/30">
                    <MessageSquare className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                  <p className="font-bold text-muted-foreground/60 text-sm">No messages yet</p>
                  <p className="text-muted-foreground/40 text-xs mt-1">Start the conversation!</p>
                </div>
              ) : (
                chatMessages.map((msg: any) => {
                  const isMe = msg.sender_id === (profile?.userId || profile?.id);
                  return (
                    <div key={msg.id} className="flex gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="shrink-0 w-7 h-7 rounded-full overflow-hidden bg-accent flex items-center justify-center mt-0.5 border border-border/40">
                        {msg.sender_avatar ? (
                          <img src={msg.sender_avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-primary">{msg.sender_name[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold truncate ${isMe ?"text-primary" : "text-foreground"}`}>
                            {isMe ? "You" : msg.sender_name}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50 shrink-0">{formatTime(msg.timestamp)}</span>
                        </div>
                        <div className={`mt-1 rounded-xl px-3 py-2 inline-block max-w-full ${isMe ?"bg-primary/10 rounded-tl-sm border border-primary/15" : "bg-accent rounded-tl-sm border border-border/20"}`}>
                          <p className="text-sm text-foreground/80 leading-relaxed break-words">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>
            {/* Input */}
            <div className="shrink-0 p-3 border-t border-border/50 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-2 items-center">
                <div className="flex-1 flex items-center gap-2 bg-accent/60 border border-border/30 rounded-2xl px-4 py-2.5">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Type your message..."
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!chatInput.trim()}
                    className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground hover:brightness-110 transition active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── VIDEO GRID ── */}
        <div className="shrink-0 px-2.5 md:px-4 pt-2.5 md:pt-3">
          <div className="grid grid-cols-2 gap-2 md:gap-2.5">
            <div className={`relative rounded-md overflow-hidden bg-card border-2 border-primary/30 shadow-lg ${isScreenSharing ?"col-span-2 aspect-video" : "aspect-[4/3]"}`}>
              {isScreenSharing && screenTrack ? (
                <LocalVideoTrack track={screenTrack} play={true} className="w-full h-full object-contain bg-black/80" />
              ) : cameraOn && localCameraTrack ? (
                <LocalVideoTrack track={localCameraTrack} play={true} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-card">
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-accent flex items-center justify-center border-2 border-border/40">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-lg md:text-xl font-black text-primary">
                        {(profile?.username || "U")[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
                <span className="flex items-center gap-1 bg-red-600/90 backdrop-blur-md px-2 py-0.5 rounded-full text-white">
                  <Radio className="w-2.5 h-2.5 animate-pulse" />
                  <span className="text-[8px]">Live</span>
                </span>
                <span className="flex items-center gap-1 bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded-full text-white">
                  <Users className="w-2.5 h-2.5" />
                  <span className="text-[8px] font-bold">{remoteUsers.length + 1}</span>
                </span>
              </div>
              {!micOn ? (
                <div className="absolute top-2 right-2 z-10 h-5 w-5 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center">
                  <MicOff className="w-2.5 h-2.5 text-red-400" />
                </div>
              ) : (
                <div className="absolute top-2 right-2 z-10">
                  <div className="h-5 w-5 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center">
                    <Mic className="w-2.5 h-2.5 text-green-400 animate-pulse" />
                  </div>
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 z-10">
                <div className="flex items-center gap-1.5">
                  {profile?.avatar_url && (
                    <img src={profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover border border-white/30" />
                  )}
                  <span className="text-xs font-bold text-white drop-shadow-sm">{profile?.username || "You"}</span>
                </div>
                <span className="inline-block mt-0.5 text-[7px] bg-primary/80 text-primary-foreground px-1.5 py-0.5 rounded-sm">
                  {isAdmin ? "Admin" : "Member"}
                </span>
              </div>
            </div>

            {remoteUsers.slice(0, 3).map((user) => (
              <div key={user.uid} className="relative aspect-[4/3] rounded-md overflow-hidden bg-card border border-border/30 shadow-lg">
                {/* We use explicit videoTracks mapping to render videos securely */}
                {videoTracks.find(t => t.getUserId() === user.uid) ? (
                  <RemoteVideoTrack track={videoTracks.find(t => t.getUserId() === user.uid)!} play={true} className="w-full h-full object-cover" />
                ) : null}
                
                {!user.hasVideo && (
                  <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-card">
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-accent flex items-center justify-center border-2 border-border/40 overflow-hidden">
                      {userAvatars[user.uid] ? (
                        <img src={userAvatars[user.uid]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg md:text-xl font-black text-primary">
                          {(userNames[user.uid] || "U")[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {!user.hasAudio ? (
                  <div className="absolute top-2 right-2 z-10 h-5 w-5 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center">
                    <MicOff className="w-2.5 h-2.5 text-red-400" />
                  </div>
                ) : (
                  <div className="absolute top-2 right-2 z-10">
                    <div className="h-5 w-5 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center">
                      <Mic className="w-2.5 h-2.5 text-green-400 animate-pulse" />
                    </div>
                  </div>
                )}
                
                {/* Render Audio Track safely via component to bypass browser autoplay issues */}
                {audioTracks.find(t => t.getUserId() === user.uid) && (
                  <RemoteAudioTrack track={audioTracks.find(t => t.getUserId() === user.uid)!} play={true} />
                )}

                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 z-10">
                  <span className="text-xs font-bold text-white drop-shadow-sm">
                    {userNames[user.uid] || `User ${String(user.uid).slice(-4)}`}
                  </span>
                  <br />
                  <span className="inline-block mt-0.5 text-[7px] bg-accent/80 text-foreground px-1.5 py-0.5 rounded-sm">
                    Builder
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── PARTICIPANT STRIP ── */}
        <div className="shrink-0 px-2.5 md:px-4 py-2 border-t border-border/10 mt-auto">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
            <div className="shrink-0 w-8 h-8 rounded-full bg-accent/50 flex items-center justify-center">
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground rotate-[270deg]" />
            </div>
            <div className="shrink-0 flex flex-col items-center gap-1">
              <div className="relative">
                <div className="w-11 h-11 rounded-full border-2 border-primary p-0.5">
                  <div className="w-full h-full rounded-full overflow-hidden bg-accent flex items-center justify-center">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-black text-primary">{(profile?.username || "U")[0].toUpperCase()}</span>
                    )}
                  </div>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
              </div>
              <span className="text-[9px] font-bold text-foreground/70">You</span>
            </div>
            {remoteUsers.map((user) => (
              <div key={user.uid} className="shrink-0 flex flex-col items-center gap-1">
                <div className="relative">
                  <div className="w-11 h-11 rounded-full border-2 border-border/30 p-0.5">
                    <div className="w-full h-full rounded-full overflow-hidden bg-accent flex items-center justify-center">
                      {userAvatars[user.uid] ? (
                        <img src={userAvatars[user.uid]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-black text-muted-foreground">{(userNames[user.uid] || "U")[0].toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                  {user.hasAudio && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                  )}
                </div>
                <span className="text-[9px] font-bold text-foreground/70 max-w-[48px] truncate">
                  {userNames[user.uid] || `User`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ BOTTOM CONTROL BAR ═══ */}
      <div className="shrink-0 bg-card/80 backdrop-blur-xl border-t border-border/20 px-3 md:px-6 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] z-20">
        <div className="flex items-center justify-center gap-3 md:gap-5 max-w-md mx-auto">
          <button onClick={() => setMicOn((p) => !p)} className="flex flex-col items-center gap-1 group">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center transition-all active:scale-95 ${micOn ?"bg-accent text-foreground" : "bg-red-500/20 text-red-400 border border-red-500/25"}`}>
              {micOn ? <Mic className="w-[18px] h-[18px]" /> : <MicOff className="w-[18px] h-[18px]" />}
            </div>
            <span className="text-[9px] font-bold text-muted-foreground">Mic</span>
          </button>
          <button onClick={() => setCameraOn((p) => !p)} className="flex flex-col items-center gap-1 group">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center transition-all active:scale-95 ${cameraOn ?"bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-red-500/20 text-red-400 border border-red-500/25"}`}>
              {cameraOn ? <Video className="w-[18px] h-[18px]" /> : <VideoOff className="w-[18px] h-[18px]" />}
            </div>
            <span className="text-[9px] font-bold text-muted-foreground">Camera</span>
          </button>
          <button onClick={toggleScreenShare} className="flex flex-col items-center gap-1 group">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center transition-all active:scale-95 ${isScreenSharing ?"bg-primary/20 text-primary border border-primary/25" : "bg-accent text-foreground"}`}>
              <MonitorUp className="w-[18px] h-[18px]" />
            </div>
            <span className="text-[9px] font-bold text-muted-foreground">Share</span>
          </button>
          <button onClick={() => setChatOpen(!chatOpen)} className="flex flex-col items-center gap-1 group relative">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center transition-all active:scale-95 ${chatOpen ?"bg-primary/20 text-primary border border-primary/25" : "bg-accent text-foreground"}`}>
              <MessageSquare className="w-[18px] h-[18px]" />
              {unreadCount > 0 && <span className="absolute top-0 right-1 h-4 min-w-[16px] rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center px-1">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </div>
            <span className="text-[9px] font-bold text-muted-foreground">Chat</span>
          </button>
          <button onClick={handleShare} className="flex flex-col items-center gap-1 group">
            <div className="h-11 w-11 rounded-full bg-accent flex items-center justify-center text-foreground transition-all active:scale-95">
              <Share2 className="w-[18px] h-[18px]" />
            </div>
            <span className="text-[9px] font-bold text-muted-foreground">Invite</span>
          </button>
          <button onClick={handleLeave} className="flex flex-col items-center gap-1 group">
            <div className="h-11 w-11 rounded-full bg-red-500 text-white shadow-md shadow-red-500/20 flex items-center justify-center transition-all active:scale-95 hover:bg-red-600">
              <PhoneOff className="w-[18px] h-[18px]" />
            </div>
            <span className="text-[9px] font-bold text-red-500">Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
}
