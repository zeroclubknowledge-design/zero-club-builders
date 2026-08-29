import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { useLiveSession } from "@/contexts/LiveSessionContext";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, MonitorOff, Users,
  MessageSquare, Send, X, Zap, Share2, Minimize2, Maximize2,
  Expand, Shrink, GraduationCap, Radio, Loader2, Smile, Reply, Settings,
} from "@/components/icons/solar";

/** One tap, no search field — the six that actually get used in a class. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👏", "🔥"];

/** A raised hand kept local to the live room so the control has no icon-bundle cost. */
function QuestionHandIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 13V6.25a1.5 1.5 0 0 1 3 0V11" />
      <path d="M11 10.5V4.75a1.5 1.5 0 0 1 3 0V11" />
      <path d="M14 10.5V6.25a1.5 1.5 0 0 1 3 0V12" />
      <path d="M17 11V8.75a1.5 1.5 0 0 1 3 0V14c0 4.4-2.65 7-7 7h-1.25c-2.2 0-3.85-.85-5-2.55l-3.1-4.55a1.7 1.7 0 0 1 2.7-2.05L8 14" />
    </svg>
  );
}

import { useSharedPresence } from "@/hooks/useSharedPresence";

import { displayName } from "@/lib/utils";

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
const QUESTION_REMINDER_MS = 5 * 60 * 1000;

type CameraQuality = "480p" | "540p" | "720p" | "1080p" | "1440p" | "2160p";

const CAMERA_QUALITY_OPTIONS: Array<{
  value: CameraQuality;
  label: string;
  note: string;
  width: number;
  height: number;
  frameRate: number;
  bitrateMin: number;
  bitrateMax: number;
}> = [
  { value: "480p", label: "Standard (480p)", note: "Uses least data", width: 640, height: 480, frameRate: 24, bitrateMin: 250, bitrateMax: 600 },
  { value: "540p", label: "Smooth (540p)", note: "Recommended", width: 960, height: 540, frameRate: 24, bitrateMin: 350, bitrateMax: 900 },
  { value: "720p", label: "HD (720p)", note: "Needs a strong connection", width: 1280, height: 720, frameRate: 30, bitrateMin: 800, bitrateMax: 1800 },
  { value: "1080p", label: "Full HD (1080p)", note: "Sharper video", width: 1920, height: 1080, frameRate: 30, bitrateMin: 1500, bitrateMax: 3200 },
  { value: "1440p", label: "2K (1440p)", note: "Fast connection", width: 2560, height: 1440, frameRate: 30, bitrateMin: 2500, bitrateMax: 5200 },
  { value: "2160p", label: "4K (2160p)", note: "Studio connection", width: 3840, height: 2160, frameRate: 30, bitrateMin: 4000, bitrateMax: 8500 },
];

const CAMERA_QUALITY_STORAGE_KEY = "zc-live-camera-quality";
/*
 * HD by default.
 *
 * This was dropped to 540p to stop mid-range phones stuttering, and that fixed
 * the stutter at a cost that turned out to be too high: Zero Club is a
 * teaching platform, and a tutor sharing work needs to be seen properly. The
 * stutter is better addressed where it actually comes from — the receive side,
 * which was pulling every non-presenter at 160x120 — than by degrading what
 * everybody sends.
 *
 * Anyone on a weak connection can still pick Standard or Smooth in Camera
 * settings, and Agora drops the sender's bitrate on its own when the uplink
 * cannot sustain it.
 */
const DEFAULT_CAMERA_QUALITY: CameraQuality = "720p";

const cameraProfile = (quality: CameraQuality) =>
  CAMERA_QUALITY_OPTIONS.find((option) => option.value === quality) ||
  // By name rather than by index: inserting a rung used to silently change
  // which profile an unknown value fell back to.
  CAMERA_QUALITY_OPTIONS.find((option) => option.value === DEFAULT_CAMERA_QUALITY)!;

async function applyCameraProfile(track: any, quality: CameraQuality) {
  const profile = cameraProfile(quality);
  const mediaTrack = track?.getMediaStreamTrack?.();
  await mediaTrack?.applyConstraints?.({
    width: { ideal: profile.width },
    height: { ideal: profile.height },
    frameRate: { ideal: profile.frameRate, max: profile.frameRate },
  });
  await track?.setEncoderConfiguration?.({
    width: profile.width,
    height: profile.height,
    frameRate: profile.frameRate,
    bitrateMin: profile.bitrateMin,
    bitrateMax: profile.bitrateMax,
  });
}

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
  const [tokenSession, setTokenSession] = useState<{ channelId: string; value: string } | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenRequestVersion, setTokenRequestVersion] = useState(0);
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const token = tokenSession?.channelId === channelId ? tokenSession.value : null;

  useEffect(() => {
    let cancelled = false;

    if (isActive && !client) {
      const rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

      // Every publisher makes a tiny companion stream available. Receivers
      // can then keep only the stage in full quality instead of downloading
      // every moving camera at full bitrate.
      /*
       * The low stream is what most people are watched at, so it cannot be a
       * thumbnail.
       *
       * This was 160x120 at 70kbps — genuinely a contact-photo, and every
       * participant who was not the presenter was being received at it. On a
       * 150px tile you might get away with it; on anything larger it looks
       * broken, and it was also what everyone dropped to whenever the room
       * was minimised.
       *
       * 480x270 at 500kbps still costs a fraction of the high stream and
       * survives being shown at a reasonable size.
       */
      rtcClient.setLowStreamParameter({
        width: 480,
        height: 270,
        framerate: 20,
        bitrate: 500,
      });

      Promise.all([
        rtcClient.setRemoteDefaultVideoStreamType(1),
        rtcClient.enableDualStream(),
      ])
        .catch((error) => {
          // A browser without simulcast support can still join normally.
          console.warn("Adaptive live video is unavailable on this device", error);
        })
        .finally(() => {
          if (!cancelled) setClient(rtcClient);
        });
    }
    // A client that has already left cannot be reused. Dropping it here means
    // the next session builds a fresh one, rather than silently failing to
    // reconnect when someone rejoins after leaving.
    if (!isActive && client) {
      setClient(null);
    }

    return () => {
      cancelled = true;
    };
  }, [isActive, client]);

  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      if (!isActive || !channelId) return;
      setIsFetchingToken(true);
      setTokenError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (!cancelled) setTokenError("Sign in again, then reopen this live class.");
          return;
        }
        const { data, error } = await supabase.functions.invoke("agora-token", {
          body: { channelName: channelId, uid: 0 },
        });
        if (error || !data?.token) {
          console.error("Token fetch error:", error, data);
          if (!cancelled) setTokenError("We couldn't connect to the live classroom. Check your connection and try again.");
          return;
        }
        if (!cancelled) setTokenSession({ channelId, value: data.token });
      } catch (err) {
        console.error(err);
        if (!cancelled) setTokenError("We couldn't connect to the live classroom. Check your connection and try again.");
      } finally {
        if (!cancelled) setIsFetchingToken(false);
      }
    }

    if (isActive && channelId) {
      void fetchToken();
    } else {
      setTokenSession(null);
      setTokenError(null);
      setIsFetchingToken(false);
    }

    return () => {
      cancelled = true;
    };
  }, [isActive, channelId, tokenRequestVersion]);

  if (!isActive || !channelId) return null;

  /* ── Loading State ── */
  if (isFetchingToken || (!token && !tokenError)) {
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
  if (!token && tokenError) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0A0A0C] flex flex-col items-center justify-center p-6">
        <div className="bg-[#141117] p-8 rounded-[28px] ring-1 ring-white/[0.06] max-w-md w-full text-center shadow-lift">
          <div className="w-14 h-14 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-red-500/20">
            <PhoneOff className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <h2 className="text-[21px] font-semibold text-white tracking-tight mb-2">Connection failed</h2>
          <p className="text-white/50 mb-8 text-[13.5px] leading-relaxed">{tokenError}</p>
          <div className="grid gap-2.5">
            <button
              onClick={() => {
                setTokenError(null);
                setTokenRequestVersion((version) => version + 1);
              }}
              className="w-full py-3.5 bg-[#cc208f] text-white text-[14px] font-semibold tracking-tight rounded-full tap hover:opacity-90"
            >
              Try again
            </button>
            <button
              onClick={() => window.history.back()}
              className="w-full py-3.5 bg-white/[0.06] text-white text-[14px] font-semibold tracking-tight rounded-full tap ring-1 ring-white/10 hover:bg-white/[0.1]"
            >
              Go back
            </button>
          </div>
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
      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
  const isAdminRef = useRef(false);
  const [clubName, setClubName] = useState<string>("");

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

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

  /* ── Settings ──
     Real device switching, not a list that only looks like one. The browser
     hides device labels until a permission has been granted, which is why the
     list is read after joining rather than on mount: before that every camera
     is called "camera" and choosing between them is guesswork. */
  const [showSettings, setShowSettings] = useState(false);
  const [devices, setDevices] = useState<{ cameras: any[]; mics: any[]; speakers: any[] }>({
    cameras: [], mics: [], speakers: [],
  });
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>("");
  const [selfVolume, setSelfVolume] = useState(0);
  const [mirrorSelf, setMirrorSelf] = useState(true);
  const [cameraQuality, setCameraQuality] = useState<CameraQuality>(DEFAULT_CAMERA_QUALITY);
  const [cameraResolution, setCameraResolution] = useState("");
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
  /* Start smooth. Higher modes are available in Camera settings and are applied
     to both capture and encoding so they improve the source rather than merely
     upscaling a low-resolution camera frame. */
  const { localCameraTrack } = useLocalCameraTrack(!isScreenSharing, {
    encoderConfig: {
      width: 960,
      height: 540,
      frameRate: 24,
      bitrateMin: 350,
      bitrateMax: 900,
    },
    optimizationMode: "motion",
  });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CAMERA_QUALITY_STORAGE_KEY) as CameraQuality | null;
      if (saved && CAMERA_QUALITY_OPTIONS.some((option) => option.value === saved)) setCameraQuality(saved);
    } catch {
      /* Storage can be unavailable in private browsing; HD remains the default. */
    }
  }, []);

  useEffect(() => {
    if (!localCameraTrack) return;

    // A learner who has minimized the room is no longer presenting a large
    // local preview. Reducing only that learner's outgoing camera frees CPU
    // for club chat while their small participant tile remains clear enough.
    // Tutors keep the premium stage profile even while they navigate.
    const backgroundLearner = isMinimized && !isAdmin;
    const update = async () => {
      if (backgroundLearner) {
        const mediaTrack = (localCameraTrack as any).getMediaStreamTrack?.();
        await mediaTrack?.applyConstraints?.({
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 15 },
        });
        await localCameraTrack.setEncoderConfiguration({
          width: 320,
          height: 240,
          frameRate: 15,
          bitrateMin: 120,
          bitrateMax: 250,
        });
        return;
      }

      await applyCameraProfile(localCameraTrack, cameraQuality);
      const settings = (localCameraTrack as any).getMediaStreamTrack?.()?.getSettings?.();
      if (settings?.width && settings?.height) setCameraResolution(`${settings.width} × ${settings.height}`);
    };

    void update().catch((error) => {
      console.warn("Could not apply camera quality", error);
      if (cameraQuality !== DEFAULT_CAMERA_QUALITY) {
        setCameraQuality(DEFAULT_CAMERA_QUALITY);
        toast.error("That quality is not available on this camera. Switched back to HD.");
      }
    });
  }, [cameraQuality, isAdmin, isMinimized, localCameraTrack]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CAMERA_QUALITY_STORAGE_KEY, cameraQuality);
    } catch {
      /* The setting still works for this call when storage is unavailable. */
    }
  }, [cameraQuality]);

  const cameraMediaTrack = (localCameraTrack as any)?.getMediaStreamTrack?.();
  const cameraCapabilities = cameraMediaTrack?.getCapabilities?.();
  const supportsCameraQuality = (quality: CameraQuality) => {
    const profile = cameraProfile(quality);
    const maxWidth = Number(cameraCapabilities?.width?.max || Number.POSITIVE_INFINITY);
    const maxHeight = Number(cameraCapabilities?.height?.max || Number.POSITIVE_INFINITY);
    return profile.width <= maxWidth && profile.height <= maxHeight;
  };

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
    // The mini player does not display speaker rings. Leaving this listener
    // active made the entire live component redraw repeatedly behind club chat.
    if (!client || isMinimized) {
      setActiveSpeaker(null);
      return;
    }
    client.enableAudioVolumeIndicator();
    const onVolume = (volumes: { uid: any; level: number }[]) => {
      const loudest = volumes.reduce(
        (best, v) => (v.level > (best?.level ?? 0) ? v : best),
        null as { uid: any; level: number } | null,
      );
      // A floor, so room noise does not make the ring flicker between people.
      setActiveSpeaker(loudest && loudest.level > 12 ? String(loudest.uid) : null);

      // Agora reports the local user as uid 0. Levels arrive 0–100; the meter
      // wants 0–1.
      const mine = volumes.find((entry) => String(entry.uid) === "0");
      setSelfVolume(mine ? mine.level / 100 : 0);
    };
    client.on("volume-indicator", onVolume);
    return () => { client.off("volume-indicator", onVolume); };
  }, [client, isMinimized]);

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
  const [questionRaised, setQuestionRaised] = useState(false);
  const [incomingQuestion, setIncomingQuestion] = useState<{ id: string; name: string } | null>(null);
  const lastQuestionBySenderRef = useRef<Map<string, number>>(new Map());
  const questionReminderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionAlertSendingRef = useRef(false);
  const incomingQuestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speakQuestionAlert = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const alert = new SpeechSynthesisUtterance("Question");
    alert.rate = 0.92;
    alert.pitch = 1.05;
    alert.volume = 1;
    window.speechSynthesis.speak(alert);
  };

  const notifyTutorOfQuestion = (payload: any) => {
    if (!isAdminRef.current) return;

    const name = String(payload?.name || "A learner");
    const senderKey = String(payload?.senderId || name);
    const now = Date.now();
    const previousAlert = lastQuestionBySenderRef.current.get(senderKey) || 0;
    if (now - previousAlert < 5000) return;

    lastQuestionBySenderRef.current.set(senderKey, now);
    const id = String(payload?.id || `${senderKey}-${now}`);
    setIncomingQuestion({ id, name });
    speakQuestionAlert();
    toast.info(`${name} has a question`, { duration: 6000 });

    if (incomingQuestionTimerRef.current) clearTimeout(incomingQuestionTimerRef.current);
    incomingQuestionTimerRef.current = setTimeout(() => setIncomingQuestion(null), 6000);
  };

  const broadcastQuestionAlert = async () => {
    const now = Date.now();
    if (!chatChannelRef.current) return false;

    const status = await chatChannelRef.current.send({
      type: "broadcast",
      event: "question",
      payload: {
        id: `${profile?.id || client?.uid || "learner"}-${now}`,
        senderId: profile?.id || client?.uid,
        name: profile?.full_name || profile?.username || "A learner",
        at: now,
      },
    });

    return status === "ok";
  };

  const sendQuestionAlert = async () => {
    if (questionRaised) {
      setQuestionRaised(false);
      if (questionReminderIntervalRef.current) {
        clearInterval(questionReminderIntervalRef.current);
        questionReminderIntervalRef.current = null;
      }
      toast.info("Your question hand is lowered.");
      return;
    }

    if (questionAlertSendingRef.current) return;
    if (!chatChannelRef.current) {
      toast.error("The live room is still connecting. Please try again.");
      return;
    }

    questionAlertSendingRef.current = true;
    const sent = await broadcastQuestionAlert().catch((error) => {
      console.warn("Question alert did not send", error);
      return false;
    });
    questionAlertSendingRef.current = false;

    if (!sent) {
      toast.error("The question alert did not send. Please try again.");
      return;
    }

    setQuestionRaised(true);
    if (questionReminderIntervalRef.current) clearInterval(questionReminderIntervalRef.current);
    questionReminderIntervalRef.current = setInterval(() => {
      void broadcastQuestionAlert()
        .then((reminderSent) => {
          if (!reminderSent) console.warn("Question reminder did not send");
        })
        .catch((error) => console.warn("Question reminder did not send", error));
    }, QUESTION_REMINDER_MS);
    toast.success("Question sent. Your hand will stay raised until you lower it.");
  };

  useEffect(() => {
    return () => {
      if (questionReminderIntervalRef.current) clearInterval(questionReminderIntervalRef.current);
      if (incomingQuestionTimerRef.current) clearTimeout(incomingQuestionTimerRef.current);
    };
  }, []);

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
    ch.on("broadcast", { event: "question" }, ({ payload }: any) => {
      notifyTutorOfQuestion(payload);
    });
    /*
     * A host asking someone to stop.
     *
     * The instruction is carried out by the person's own device rather than
     * enforced remotely, because that is the only place a microphone can
     * actually be switched off — nothing a host clicks can reach into someone
     * else's hardware. It is addressed by profile id, so it lands on the right
     * person whichever device they joined from, and it says who did it: being
     * muted with no explanation is worse than the noise.
     */
    ch.on("broadcast", { event: "moderate" }, ({ payload }: any) => {
      const me = profile?.userId || profile?.id;
      if (!me || String(payload?.target) !== String(me)) return;

      if (payload?.action === "mute") {
        setMicOn(false);
        toast(`${payload?.by || "The host"} muted you`, { description: "You can unmute yourself again." });
      }
      if (payload?.action === "camera-off") {
        setCameraOn(false);
        toast(`${payload?.by || "The host"} turned your camera off`, { description: "You can turn it back on." });
      }
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
  }, [channel, profile?.userId, profile?.id]);

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
  const [userProfileIds, setUserProfileIds] = useState<Record<string, string>>({});

  const presencePayload = profile?.id && client?.uid ? {
    agora_uid: client.uid,
    // The Agora uid is a connection; this is the person. A host muting someone
    // needs to address the person, or the instruction misses when they rejoin.
    profile_id: profile.userId || profile.id,
    name: displayName(profile, ""),
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
    const newProfileIds: Record<string, string> = {};
    const people: PresenceUser[] = [];
    let adminCount = 0;

    Object.values(presenceState).forEach((users: any[]) => {
      users.forEach((u) => {
        if (u.agora_uid && u.name) newNames[u.agora_uid] = u.name;
        if (u.agora_uid && u.avatar_url) newAvatars[u.agora_uid] = u.avatar_url;
        if (u.agora_uid != null && u.profile_id) newProfileIds[String(u.agora_uid)] = String(u.profile_id);
        if (u.isAdmin) {
          adminCount++;
          if (u.agora_uid != null) newAdminUids.add(String(u.agora_uid));
        }
        if (u.agora_uid != null) {
          people.push({
            uid: String(u.agora_uid),
            name: (u.name || "").trim() || "Joining\u2026",
            avatar: u.avatar_url || "",
            isAdmin: !!u.isAdmin,
          });
        }
      });
    });

    setUserNames(newNames);
    setUserAvatars(newAvatars);
    setUserProfileIds(newProfileIds);
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
    if (isScreenSharing) {
      if (screenTrack) screenTrack.close();
      setScreenTrack(null);
      setIsScreenSharing(false);
      return;
    }
    if (remotePresenter) {
      const presenterName = userNames[remotePresenter.uid] || "Someone else";
      toast.info(`${presenterName} is presenting. You can share when they finish.`);
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
          encoderConfig: {
            width: 1280,
            height: 720,
            frameRate: 15,
            bitrateMin: 400,
            bitrateMax: 1200,
          },
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

  useEffect(() => {
    if (!showSettings) return;
    let cancelled = false;

    const read = async () => {
      try {
        const [cameras, mics, speakers] = await Promise.all([
          AgoraRTC.getCameras().catch(() => []),
          AgoraRTC.getMicrophones().catch(() => []),
          AgoraRTC.getPlaybackDevices?.().catch(() => []) ?? Promise.resolve([]),
        ]);
        if (cancelled) return;
        setDevices({ cameras, mics, speakers });
        // Show what is actually in use, rather than defaulting the pickers to
        // the first entry and implying a device that is not running.
        setSelectedCamera((current) => current || (localCameraTrack as any)?.getMediaStreamTrack?.()?.getSettings?.()?.deviceId || cameras[0]?.deviceId || "");
        setSelectedMic((current) => current || (localMicrophoneTrack as any)?.getMediaStreamTrack?.()?.getSettings?.()?.deviceId || mics[0]?.deviceId || "");
        setSelectedSpeaker((current) => current || speakers[0]?.deviceId || "");
      } catch {
        /* Enumeration is best effort; the panel still shows the toggles. */
      }
    };

    read();
    // A headset plugged in while the panel is open should appear in the list.
    AgoraRTC.onCameraChanged = read;
    AgoraRTC.onMicrophoneChanged = read;
    AgoraRTC.onPlaybackDeviceChanged = read;

    return () => {
      cancelled = true;
      AgoraRTC.onCameraChanged = undefined as any;
      AgoraRTC.onMicrophoneChanged = undefined as any;
      AgoraRTC.onPlaybackDeviceChanged = undefined as any;
    };
  }, [showSettings, localCameraTrack, localMicrophoneTrack]);

  const switchCamera = async (deviceId: string) => {
    setSelectedCamera(deviceId);
    try {
      await (localCameraTrack as any)?.setDevice?.(deviceId);
      await applyCameraProfile(localCameraTrack, cameraQuality);
      const settings = (localCameraTrack as any)?.getMediaStreamTrack?.()?.getSettings?.();
      if (settings?.width && settings?.height) setCameraResolution(`${settings.width} × ${settings.height}`);
    } catch (error) {
      console.error("Camera switch failed:", error);
      toast.error("Could not switch to that camera");
    }
  };

  const switchMic = async (deviceId: string) => {
    setSelectedMic(deviceId);
    try {
      await (localMicrophoneTrack as any)?.setDevice?.(deviceId);
    } catch (error) {
      console.error("Microphone switch failed:", error);
      toast.error("Could not switch to that microphone");
    }
  };

  /* Output routing is a property of the audio elements, so it is applied to
     the remote tracks rather than to anything of ours. Unsupported on Firefox
     and on iOS, where the system decides — hence the guard. */
  const switchSpeaker = async (deviceId: string) => {
    setSelectedSpeaker(deviceId);
    try {
      await Promise.all(audioTracks.map((track: any) => track.setPlaybackDevice?.(deviceId)));
    } catch (error) {
      console.error("Speaker switch failed:", error);
      toast.error("This browser will not let a page choose the speaker");
    }
  };

  /*
   * Staying audible with the app in the background.
   *
   * Android is free to freeze a backgrounded page, and a frozen page stops
   * feeding the microphone — you are still "unmuted" as far as the UI is
   * concerned while everyone else hears silence. Two things push back:
   *
   *   • a wake lock, which asks the system to keep this page running while a
   *     call is up;
   *   • re-asserting the mute state on the way back, because a track that was
   *     suspended can return muted regardless of what the button says.
   */
  useEffect(() => {
    if (isLeaving) return;
    let lock: any = null;
    let released = false;

    const acquire = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request?.("screen");
      } catch {
        /* Denied or unsupported. The call still works; the screen may sleep. */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // Back in the foreground: reacquire the lock and make the microphone
      // agree with the button again.
      void acquire();
      localMicrophoneTrack?.setMuted(!micOn).catch(console.error);
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try { lock?.release?.(); } catch { /* already gone */ }
      void released;
    };
  }, [isLeaving, localMicrophoneTrack, micOn]);

  /*
   * Chat that survives a refresh.
   *
   * Messages are broadcast over a realtime channel and held in memory, so a
   * reload emptied the thread — the questions asked five minutes ago were
   * simply gone, for the one person who reloaded. Keeping a copy per channel
   * means the thread comes back.
   *
   * sessionStorage, not localStorage: it belongs to this tab and this session,
   * which is the right lifetime for a class that has ended.
   */
  const chatCacheKey = liveSession.channelId ? `zc-live-chat:${liveSession.channelId}` : null;

  useEffect(() => {
    if (!chatCacheKey) return;
    try {
      const saved = sessionStorage.getItem(chatCacheKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChatMessages((current) => (current.length > 0 ? current : parsed));
        }
      }
    } catch {
      /* Malformed or unavailable — start with an empty thread. */
    }
  }, [chatCacheKey]);

  useEffect(() => {
    if (!chatCacheKey) return;
    try {
      // A cap, because a long class should not fill the tab's storage quota.
      sessionStorage.setItem(chatCacheKey, JSON.stringify(chatMessages.slice(-200)));
    } catch {
      /* Quota or private mode. Not worth interrupting a call over. */
    }
  }, [chatCacheKey, chatMessages]);

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

  /* Sent to everyone; only the addressed device acts on it. Agora's uid is not
     the profile id, so the participant map is used to translate. */
  const moderateParticipant = (uid: string, action: "mute" | "camera-off") => {
    if (!isAdmin || !chatChannelRef.current) return;
    const target = userProfileIds[uid];
    if (!target) {
      toast.error("Cannot identify that participant yet");
      return;
    }
    chatChannelRef.current.send({
      type: "broadcast",
      event: "moderate",
      payload: { target, action, by: profile?.full_name || profile?.username || "The host" },
    });
    toast.success(action === "mute" ? "Asked them to mute" : "Asked them to turn the camera off");
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
  const remoteStageUser = remotePresenterUser || (!isAdmin ? remoteTutor : undefined);
  const remoteStageName = remotePresenterUser
    ? (userNames[remotePresenterUser.uid] || "Presenter")
    : tutorName;
  const remoteStageIsTutor = !!remoteStageUser && adminUids.has(String(remoteStageUser.uid));

  const findVideo = (uid: any) => videoTracks.find((t) => t.getUserId() === uid);

  // Agora reports the local user as uid 0 in the volume indicator.
  const isSelfSpeaking =
    micOn && (activeSpeaker === "0" || (client?.uid != null && activeSpeaker === String(client.uid)));

  // Everyone who is not currently on the stage remains in the learner panel.
  // A learner presenting their screen is the stage user just like a tutor is.
  const stageUid = remotePresenterUser?.uid ?? (!isAdmin ? remoteTutor?.uid ?? null : null);
  const audienceRemote = remoteUsers.filter((u) => u.uid !== stageUid);
  const cameraOnUsers = audienceRemote.filter((u) => u.hasVideo);
  const audioOnlyUsers = audienceRemote.filter((u) => !u.hasVideo);
  const selfHasCamera = cameraOn && !isScreenSharing && !!localCameraTrack;

  /*
   * Adaptive receiving:
   * - the tutor/presenter on the full stage stays high quality;
   * - audience tiles use the low stream;
   * - everything uses the low stream while minimized;
   * - on a genuinely poor connection, preserve audio instead of buffering.
   */
  const appliedStreamPolicy = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!client) return;

    const connectedIds = new Set(remoteUsers.map((user) => String(user.uid)));
    for (const cachedId of appliedStreamPolicy.current.keys()) {
      if (!connectedIds.has(cachedId)) appliedStreamPolicy.current.delete(cachedId);
    }

    remoteUsers.forEach((user) => {
      const userId = String(user.uid);
      /*
       * Who gets the high stream.
       *
       * This used to be "the stage user, and nobody else". For a tutor that
       * meant nobody at all: stageUid is null for an admin unless somebody is
       * actively screen-sharing, so a tutor watching their class received
       * every single learner at the low stream. The person who most needs to
       * see faces clearly was the one guaranteed not to.
       *
       * The tutor is also high quality now, as is whoever is speaking, since
       * that is the tile people are actually looking at. Everyone else stays
       * low, which is the point of dual stream.
       */
      const isStageVideo = stageUid != null && userId === String(stageUid);
      const isTutor = adminUids.has(userId);
      const isSpeaking = activeSpeaker != null && userId === String(activeSpeaker);
      const wantsHigh = isStageVideo || isTutor || isSpeaking;
      const streamType = !isMinimized && wantsHigh ? 0 : 1;
      if (appliedStreamPolicy.current.get(userId) === streamType) return;

      appliedStreamPolicy.current.set(userId, streamType);
      void Promise.allSettled([
        client.setRemoteVideoStreamType(user.uid, streamType),
        /*
         * 1, not 2. Option 2 is audio-only: at the first sign of congestion it
         * threw the picture away entirely, which on a teaching call means the
         * work being demonstrated disappears. Option 1 drops to the low stream
         * instead and only abandons video if that also cannot be sustained —
         * degrading rather than surrendering.
         */
        client.setStreamFallbackOption(user.uid, 1),
      ]);
    });
  }, [client, isMinimized, remoteUsers, stageUid, adminUids, activeSpeaker]);

  /*
   * A shared screen is a different shape from a face.
   *
   * The stage is 4:3 because that is a sensible frame for a person. A slide
   * deck or an editor is 16:9, and forcing one into the other either crops the
   * edges off or leaves thick black bars down both sides. So the moment
   * somebody presents, the stage becomes landscape — and goes back the moment
   * they stop.
   *
   * The presenter stays on the stage while this is happening, in a circle over
   * the corner of their own screen — you want to watch the person and the
   * thing they are pointing at without choosing between them. The circle only
   * exists while a screen is being shared; the rest of the time the stage is
   * already their face at full size and a second copy of it would be absurd.
   */
  const presenting = Boolean(isScreenSharing || remotePresenterUser);
  const selfPresenting = isScreenSharing;
  /* Their camera track still exists while presenting — Agora publishes the
     screen in its place rather than stopping it — so on their own device the
     circle is live video. Everyone else only ever received the screen, so for
     them it carries the presenter's face and name instead. */
  const selfPresenterVideo = selfPresenting && cameraOn && !!localCameraTrack;

  /* The tutor is never one of the learners. Counting them here is what made a
     room with nobody in it report a person: the presenter was being added to
     the very list that exists to show who is watching them. */
  const totalCount = remoteUsers.length + 1;
  /* Everyone in the room minus the person teaching. The tab was showing
     totalCount, so a tutor with one learner read "Learners · 2" while the pill
     beside it said "Teaching 1 learner" — the same room, two numbers. */
  const learnerCount = Math.max(0, totalCount - (isAdmin ? 1 : 0) - (adminUids.size > 0 && !isAdmin ? 1 : 0));

  const waitingFaces = presenceUsers.filter((p) => !p.isAdmin).slice(0, 3);
  const waitingExtra = Math.max(0, presenceUsers.filter((p) => !p.isAdmin).length - 3);

  const renderStage = () => {
    // A local share wins on the presenter's own device, regardless of role.
    if (isScreenSharing && screenTrack) {
      return <LocalVideoTrack track={screenTrack} play={true} className="w-full h-full object-contain" />;
    }

    // A remote share wins for tutors and learners alike.
    if (remotePresenterUser) {
      const track = findVideo(remotePresenterUser.uid);
      return track
        ? <RemoteVideoTrack track={track} play={true} className="w-full h-full object-contain" />
        : null;
    }

    // Without a shared screen, the tutor sees their own teaching output.
    if (isAdmin) {
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

  const stageIsLive = isScreenSharing || !!remotePresenterUser || (isAdmin ? cameraOn : !!remoteTutor);

  /* ══════════ MINI PLAYER ══════════ */
  /*
   * Everyone else's audio, mounted once.
   *
   * Minimising swaps the whole classroom for the mini player, and each layout
   * used to render its own copy of these elements. React sees two different
   * subtrees, so the audio elements were destroyed and recreated on every
   * switch — and a freshly created <audio> that calls play() outside a user
   * gesture is silently blocked on mobile. That is why minimising went quiet.
   *
   * Given the same key and the same position in both returns, the elements
   * survive the switch and keep playing.
   */
  const audioSink = (
    <div className="hidden" key="zc-live-audio-sink">
      {audioTracks.map((track) => (
        <RemoteAudioTrack key={String(track.getUserId())} track={track} play={true} />
      ))}
    </div>
  );

  if (isMinimized) {
    const miniRemoteUser = remotePresenterUser || (!isAdmin ? remoteTutor : undefined);
    const miniRemoteTrack = miniRemoteUser ? findVideo(miniRemoteUser.uid) : undefined;

    return (
      <>
      {audioSink}
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
            ) : miniRemoteTrack ? (
              <RemoteVideoTrack
                track={miniRemoteTrack}
                play={true}
                className={`w-full h-full pointer-events-none ${remotePresenterUser ? "object-contain bg-black" : "object-cover"}`}
              />
            ) : cameraOn && localCameraTrack ? (
              <LocalVideoTrack track={localCameraTrack} play={true} className="w-full h-full object-cover pointer-events-none" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center overflow-hidden">
                {liveSession.userAvatar ? (
                  <img src={liveSession.userAvatar} alt="" className="w-full h-full object-cover pointer-events-none" loading="lazy" decoding="async" />
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
      </>
    );
  }

  /* ══════════ FULL SCREEN CLASSROOM ══════════ */
  return (
    <>
    {audioSink}
    <div className="fixed inset-0 h-[100dvh] bg-[#0A0A0C] text-white flex flex-col z-[9999] overflow-hidden">

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
            onClick={() => setShowSettings(true)}
            title="Settings"
            aria-label="Settings"
            className="h-9 w-9 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center text-white/80 hover:bg-white/[0.12] transition tap"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={handleShare}
            title="Copy invite link"
            className="h-9 w-9 rounded-full bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center text-white/80 hover:bg-white/[0.12] transition tap"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {isAdmin && incomingQuestion && (
        <div
          key={incomingQuestion.id}
          role="status"
          aria-live="assertive"
          className="pointer-events-none absolute left-1/2 top-[calc(4.25rem+env(safe-area-inset-top))] z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-full bg-[#cc208f] px-4 py-2.5 text-white shadow-[0_12px_40px_rgba(204,32,143,0.38)] ring-1 ring-white/25 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <QuestionHandIcon className="h-5 w-5 shrink-0" />
          <span className="truncate text-[13px] font-semibold">{incomingQuestion.name} has a question</span>
        </div>
      )}


      {/* ═══ SETTINGS ═══ */}
      {showSettings && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowSettings(false)} />

          <div className="relative flex max-h-[86dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#141117] ring-1 ring-white/10 sm:max-w-[460px] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-[16px] font-semibold tracking-tight text-white">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
                className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 no-scrollbar">
              {/* A preview, because the only way to know you picked the right
                  camera is to see what it sees. */}
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/[0.08]">
                {cameraOn && localCameraTrack ? (
                  <LocalVideoTrack
                    track={localCameraTrack}
                    play={true}
                    className={`h-full w-full object-cover ${mirrorSelf ? "-scale-x-100" : ""}`}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/40">
                    <VideoOff className="h-6 w-6" />
                    <span className="text-[12px]">Camera is off</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Camera</label>
                <select
                  value={selectedCamera}
                  onChange={(event) => switchCamera(event.target.value)}
                  disabled={devices.cameras.length === 0}
                  className="w-full rounded-lg bg-white/[0.06] px-3.5 py-3 text-[13.5px] text-white outline-none ring-1 ring-white/10 disabled:opacity-50"
                >
                  {devices.cameras.length === 0 && <option>No camera found</option>}
                  {devices.cameras.map((device: any) => (
                    <option key={device.deviceId} value={device.deviceId} className="bg-[#141117]">
                      {device.label || "Camera"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Video quality</label>
                  {cameraResolution && <span className="text-[10.5px] font-medium tabular-nums text-white/45">Active {cameraResolution}</span>}
                </div>
                <select
                  value={cameraQuality}
                  onChange={(event) => setCameraQuality(event.target.value as CameraQuality)}
                  className="w-full rounded-lg bg-white/[0.06] px-3.5 py-3 text-[13.5px] text-white outline-none ring-1 ring-white/10"
                >
                  {CAMERA_QUALITY_OPTIONS.map((option) => {
                    const supported = supportsCameraQuality(option.value);
                    return (
                      <option key={option.value} value={option.value} disabled={!supported} className="bg-[#141117]">
                        {option.label} · {supported ? option.note : "Camera not supported"}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10.5px] leading-relaxed text-white/40">
                  2K and 4K require a compatible camera and a very stable connection. HD is recommended for most live classes.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Microphone</label>
                <select
                  value={selectedMic}
                  onChange={(event) => switchMic(event.target.value)}
                  disabled={devices.mics.length === 0}
                  className="w-full rounded-lg bg-white/[0.06] px-3.5 py-3 text-[13.5px] text-white outline-none ring-1 ring-white/10 disabled:opacity-50"
                >
                  {devices.mics.length === 0 && <option>No microphone found</option>}
                  {devices.mics.map((device: any) => (
                    <option key={device.deviceId} value={device.deviceId} className="bg-[#141117]">
                      {device.label || "Microphone"}
                    </option>
                  ))}
                </select>
                {/* A live level meter, so a dead microphone is obvious here
                    rather than three minutes into the lesson. */}
                <div className="mt-2 flex items-center gap-2">
                  <Mic className="h-3.5 w-3.5 shrink-0 text-white/40" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-[width] duration-100"
                      style={{ width: `${Math.min(100, Math.round(selfVolume * 100))}%` }}
                    />
                  </div>
                </div>
              </div>

              {devices.speakers.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Speaker</label>
                  <select
                    value={selectedSpeaker}
                    onChange={(event) => switchSpeaker(event.target.value)}
                    className="w-full rounded-lg bg-white/[0.06] px-3.5 py-3 text-[13.5px] text-white outline-none ring-1 ring-white/10"
                  >
                    {devices.speakers.map((device: any) => (
                      <option key={device.deviceId} value={device.deviceId} className="bg-[#141117]">
                        {device.label || "Speaker"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => setMirrorSelf((value) => !value)}
                className="flex w-full items-center justify-between rounded-lg bg-white/[0.04] px-4 py-3.5 text-left ring-1 ring-white/[0.06]"
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-white">Mirror my video</span>
                  <span className="mt-0.5 block text-[11px] text-white/45">
                    Only changes your preview. Learners always see you the right way round.
                  </span>
                </span>
                <span className={`h-6 w-11 shrink-0 rounded-full p-1 transition ${mirrorSelf ? "bg-[#cc208f]" : "bg-white/15"}`}>
                  <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${mirrorSelf ? "translate-x-5" : ""}`} />
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
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
              {/* Moved out of the top-right corner, which now belongs to the
                  one control that lives there. All three are small status
                  pills and read as a set on one line. */}
              {isAdmin && (
                <span className="flex items-center gap-1 rounded-full bg-[#cc208f]/90 px-2 py-0.5 text-white backdrop-blur-md">
                  <GraduationCap className="h-2.5 w-2.5" />
                  <span className="text-[8px] font-medium tracking-[0.08em]">
                    {Math.max(0, totalCount - 1)} {totalCount - 1 === 1 ? "LEARNER" : "LEARNERS"}
                  </span>
                </span>
              )}
            </div>
          )}



          {/* Identify whichever remote participant owns the stage.
              Hidden while anyone is presenting, because the circle below is
              already that person with their name on it. Both were rendering
              into the same bottom-left corner — the circle over the strip —
              so the presenter was labelled twice, on top of themselves. */}
          {remoteStageUser && !selfPresenting && !presenting && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-3.5 pb-3 pt-10 z-10 pointer-events-none">
              <div className="flex items-center gap-2">
                <Avatar
                  url={userAvatars[remoteStageUser.uid]}
                  name={remoteStageName}
                  className="w-6 h-6"
                />
                <span className="text-[13px] font-semibold tracking-tight text-white">{remoteStageName}</span>
                <span className="text-[8.5px] font-medium uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full bg-[#cc208f]/90 text-white">
                  {remoteStageIsTutor ? "Tutor" : "Presenting"}
                </span>
              </div>
            </div>
          )}

          {/* The presenter, in a circle on their own screen.
              Only while a screen is being shared — otherwise the stage is
              already their face at full size. It sits above the scrim but
              clear of the control bar, and ignores taps so it can never
              swallow a press meant for the video. */}
          {presenting && (
            /* Bottom-right, and smaller.
               A shared screen has its content on the left — a browser sidebar,
               the start of every line of a slide — and an 96px circle sat
               directly on it. The right edge is nearly always the emptier
               side. md:bottom-[84px] clears the desktop control bar, the same
               offset the theater toggle uses. */
            <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex flex-col items-center sm:bottom-4 sm:right-4 md:bottom-[84px]">
              <div className="relative h-16 w-16 overflow-hidden rounded-full bg-[#141117] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.9)] ring-2 ring-white/25 sm:h-20 sm:w-20">
                {selfPresenterVideo ? (
                  <LocalVideoTrack track={localCameraTrack!} play={true} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Avatar
                      url={selfPresenting ? profile?.avatar_url : userAvatars[remotePresenterUser!.uid]}
                      name={selfPresenting ? profile?.username || "You" : userNames[remotePresenterUser!.uid] || "Presenter"}
                      className="h-full w-full text-xl"
                    />
                  </div>
                )}
              </div>
              {/* A pill rather than text with a drop-shadow: over a bright
                  slide, a shadow is not enough to keep white legible. */}
              <span className="mt-1.5 max-w-[92px] truncate rounded-full bg-black/70 px-2 py-0.5 text-center text-[10px] font-semibold text-white backdrop-blur-sm">
                {selfPresenting ? "You" : userNames[remotePresenterUser!.uid] || tutorName}
              </span>
            </div>
          )}

          {/* Theater toggle */}
          <button
            onClick={() => setTheater((t) => !t)}
            title={theater ? "Show panel" : "Expand stage"}
            /* Moves to the top-right when a presenter circle is occupying the
               bottom-right, rather than the two sharing a corner. */
            className={`absolute right-2.5 z-30 h-9 w-9 rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/15 flex items-center justify-center text-white/85 hover:bg-black/70 transition tap ${presenting ? "top-2.5" : "bottom-2.5 md:bottom-[84px]"}`}
          >
            {theater ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
          </button>

          {/* ═══ CONTROL BAR ═══ */}
          {/* Icon only. The shapes are universal, and dropping the labels buys
              enough room for proper 48px targets — the old buttons were 36px tall
              with text competing for the same space. aria-label and title carry
              the meaning for anyone who needs it. */}
          {/* On the video, not under it. The bar used to sit on its own strip
              below the stage, which cost a row of height on a phone and left
              the tutor's controls further from the picture they apply to. The
              scrim keeps white icons legible over a bright frame. */}
          <div className="absolute inset-x-0 bottom-0 z-30 hidden bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-10 md:block">
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
                onClick={sendQuestionAlert}
                disabled={isLeaving}
                title={questionRaised ? "Lower your hand" : "Ask a question"}
                aria-label={questionRaised ? "Lower your hand" : "Ask a question"}
                aria-pressed={questionRaised}
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition-all tap active:scale-95 disabled:opacity-50 ${questionRaised ? "bg-[#cc208f] text-white shadow-[0_0_22px_rgba(204,32,143,0.45)]" : "bg-white/[0.1] text-white hover:bg-white/[0.16]"}`}
              >
                <QuestionHandIcon className="h-5 w-5" />
              </button>

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
                Learners · <span className="tabular-nums">{learnerCount}</span>
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
                              <img src={msg.sender_avatar} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
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
                            {person.avatar ? <img src={person.avatar} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : person.name[0]?.toUpperCase()}
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
              <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                {((!isAdmin && selfHasCamera) || cameraOnUsers.length > 0) && (
                  <div className="grid grid-cols-2 gap-2">
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
                          name={userNames[user.uid] || "Joining\u2026"}
                          muted={!user.hasAudio}
                          tutor={adminUids.has(String(user.uid))}
                        />
                        {/* A host can ask; the learner's own device is what
                            actually stops the mic or the camera. */}
                        {isAdmin && !adminUids.has(String(user.uid)) && (
                          <div className="absolute right-1.5 top-1.5 flex gap-1">
                            <button
                              onClick={() => moderateParticipant(String(user.uid), "mute")}
                              title="Mute them"
                              aria-label={`Mute ${userNames[user.uid] || "this learner"}`}
                              className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm transition hover:bg-red-500 hover:text-white"
                            >
                              <MicOff className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => moderateParticipant(String(user.uid), "camera-off")}
                              title="Turn their camera off"
                              aria-label="Turn their camera off"
                              className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm transition hover:bg-red-500 hover:text-white"
                            >
                              <VideoOff className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {((!isAdmin && !selfHasCamera) || audioOnlyUsers.length > 0) && (
                  <div className={`space-y-1.5 ${((!isAdmin && selfHasCamera) || cameraOnUsers.length > 0) ? "mt-3" : ""}`}>
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
                            {userNames[user.uid] || "Joining\u2026"}
                          </span>
                          {adminUids.has(String(user.uid)) && (
                            <span className="shrink-0 text-[8px] font-medium uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full bg-[#cc208f]/90 text-white">
                              Tutor
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {isAdmin && !adminUids.has(String(user.uid)) && user.hasAudio && (
                            <button
                              onClick={() => moderateParticipant(String(user.uid), "mute")}
                              title="Mute them"
                              aria-label={`Mute ${userNames[user.uid] || "this learner"}`}
                              className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-red-500 hover:text-white"
                            >
                              <MicOff className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <MicDot on={!!user.hasAudio} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile keeps the familiar dedicated taskbar below the classroom.
          Desktop uses the floating controls on the host video above. */}
      <div className="relative z-20 shrink-0 px-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-1 md:hidden">
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

        <div className="mx-auto flex w-full max-w-[430px] items-center justify-center gap-1 rounded-full bg-white/[0.06] px-1.5 py-2 ring-1 ring-white/10 shadow-lift backdrop-blur-xl min-[360px]:gap-1.5 min-[360px]:px-2">
          <button
            onClick={sendQuestionAlert}
            disabled={isLeaving}
            title={questionRaised ? "Lower your hand" : "Ask a question"}
            aria-label={questionRaised ? "Lower your hand" : "Ask a question"}
            aria-pressed={questionRaised}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all tap active:scale-95 disabled:opacity-50 min-[360px]:h-11 min-[360px]:w-11 ${questionRaised ? "bg-[#cc208f] text-white shadow-[0_0_20px_rgba(204,32,143,0.45)]" : "bg-white/[0.1] text-white"}`}
          >
            <QuestionHandIcon className="h-[18px] w-[18px] min-[360px]:h-5 min-[360px]:w-5" />
          </button>

          <button
            onClick={() => setMicOn((previous) => !previous)}
            disabled={isLeaving}
            title={micOn ? "Mute microphone" : "Unmute microphone"}
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            aria-pressed={!micOn}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all tap active:scale-95 disabled:opacity-50 min-[360px]:h-11 min-[360px]:w-11 ${micOn ? "bg-white/[0.1] text-white" : "bg-red-500 text-white"}`}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          <button
            onClick={() => setCameraOn((previous) => !previous)}
            disabled={isLeaving}
            title={cameraOn ? "Turn off camera" : "Turn on camera"}
            aria-label={cameraOn ? "Turn off camera" : "Turn on camera"}
            aria-pressed={!cameraOn}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all tap active:scale-95 disabled:opacity-50 min-[360px]:h-11 min-[360px]:w-11 ${cameraOn ? "bg-white/[0.1] text-white" : "bg-red-500 text-white"}`}
          >
            {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>

          <button
            onClick={() => setShowReactionTray((previous) => !previous)}
            disabled={isLeaving}
            title="Send a reaction"
            aria-label="Send a reaction"
            aria-expanded={showReactionTray}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all tap active:scale-95 disabled:opacity-50 min-[360px]:h-11 min-[360px]:w-11 ${showReactionTray ? "bg-white text-black" : "bg-white/[0.1] text-white"}`}
          >
            <Smile className="h-5 w-5" />
          </button>

          <button
            onClick={toggleScreenShare}
            disabled={isLeaving}
            title={isScreenSharing ? "Stop presenting" : "Present your screen"}
            aria-label={isScreenSharing ? "Stop presenting" : "Present your screen"}
            aria-pressed={isScreenSharing}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all tap active:scale-95 disabled:opacity-50 min-[360px]:h-11 min-[360px]:w-11 ${isScreenSharing ? "bg-emerald-500 text-white" : "bg-white/[0.1] text-white"}`}
          >
            {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
          </button>

          <div className="h-6 w-px shrink-0 bg-white/10" />

          <button
            onClick={handleLeave}
            disabled={isLeaving}
            title="Leave the live room"
            aria-label="Leave the live room"
            className="grid h-10 w-[54px] shrink-0 place-items-center rounded-full bg-red-500 text-white transition-all tap active:scale-95 disabled:cursor-wait disabled:opacity-70 min-[360px]:h-11 min-[360px]:w-[60px]"
          >
            {isLeaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-5 w-5" />}
          </button>
        </div>
      </div>

    </div>
    </>
  );
}
