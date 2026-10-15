import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import AgoraRTC, {
  AgoraRTCProvider,
  LocalUser,
  RemoteUser,
  useCurrentUID,
  useIsConnected,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
  type IAgoraRTCClient,
} from "agora-rtc-react";
import { Loader2, Mic, MicOff, PhoneOff, RefreshCw, Users, Video, VideoOff, Volume2 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useOrientationLock } from "@/hooks/useOrientationLock";
import { endCall, startCall, displayName } from "@/features/groups/api";
import { GroupAvatar } from "@/features/groups/components";

/*
 * Group call for a private group chat. Everyone can talk and turn their
 * camera on — it's a call, not a class. Runs on the same Agora project as
 * club live rooms; the channel name carries the group's secret call key, so
 * only members (who can read it) can find the room.
 */

const APP_ID = "bfd9392ddcbc425e8946e8011ac2820b";

export const Route = createFileRoute("/app/chat/g/$groupId_/call")({
  validateSearch: (search: Record<string, unknown>) => ({ video: search.video === true || search.video === "true" || search.video === 1 }),
  component: GroupCallPage,
});

function GroupCallPage() {
  const { groupId } = Route.useParams();
  const { video } = Route.useSearch();
  const navigate = useNavigate();
  const [setup, setSetup] = useState<{ channel: string; token: string; name: string; client: IAgoraRTCClient } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    (async () => {
      try {
        const call = await startCall(groupId);
        const { data, error: tokenError } = await supabase.functions.invoke("agora-token", { body: { channelName: call.channel, uid: 0 } });
        if (tokenError || !data?.token) throw new Error("We couldn't connect the call. Check your connection and try again.");
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        if (alive) setSetup({ channel: call.channel, token: data.token, name: call.name, client });
      } catch (e) {
        if (alive) setError((e as Error).message || "Couldn't start the call.");
      }
    })();
    return () => { alive = false; };
  }, [groupId, attempt]);

  const back = () => navigate({ to: "/app/chat/g/$groupId", params: { groupId }, replace: true });

  if (error) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-red-500/15 text-red-400"><PhoneOff className="h-6 w-6" /></span>
          <h1 className="text-[19px] font-semibold text-white">Call couldn't connect</h1>
          <p className="max-w-[300px] text-[13.5px] text-white/60">{error}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => setAttempt((a) => a + 1)} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#cc208f] px-5 text-[14px] font-semibold text-white"><RefreshCw className="h-4 w-4" /> Try again</button>
            <button onClick={back} className="h-11 rounded-full bg-white/10 px-5 text-[14px] font-semibold text-white">Back to chat</button>
          </div>
        </div>
      </Shell>
    );
  }
  if (!setup) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-white/70" />
          <p className="text-[14px] text-white/60">Connecting…</p>
        </div>
      </Shell>
    );
  }
  return (
    <AgoraRTCProvider client={setup.client}>
      <CallRoom groupId={groupId} channel={setup.channel} token={setup.token} groupName={setup.name} startWithVideo={video} onLeft={back} />
    </AgoraRTCProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[radial-gradient(120%_80%_at_50%_0%,#3b1257_0%,#0b0a10_60%)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white">
      {children}
    </div>
  );
}

type Peer = { uid: string; profile_id: string; name: string; avatar: string | null };

function CallRoom({ groupId, channel, token, groupName, startWithVideo, onLeft }: {
  groupId: string; channel: string; token: string; groupName: string; startWithVideo: boolean; onLeft: () => void;
}) {
  useOrientationLock("free");
  const { data: me } = useUser();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(startWithVideo);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [leaving, setLeaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [peers, setPeers] = useState<Record<string, Peer>>({});

  useJoin({ appid: APP_ID, channel, token, uid: null }, true);
  const connected = useIsConnected();
  const myUid = useCurrentUID();
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn, { AEC: true, ANS: true, AGC: true });
  const { localCameraTrack } = useLocalCameraTrack(camOn, { facingMode: facing, encoderConfig: "480p_1" });
  usePublish([localMicrophoneTrack, localCameraTrack]);
  const remoteUsers = useRemoteUsers();

  // Who's who: Agora only knows numbers, so members share their name over presence.
  useEffect(() => {
    if (!myUid || !me?.id) return;
    const ch = supabase.channel(`group-call-${groupId}`, { config: { presence: { key: String(myUid) } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, Peer[]>;
      const next: Record<string, Peer> = {};
      Object.values(state).forEach((list) => list.forEach((p) => { next[p.uid] = p; }));
      setPeers(next);
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track({ uid: String(myUid), profile_id: me.id, name: displayName(me), avatar: me.avatar_url || null });
    });
    return () => { void supabase.removeChannel(ch); };
  }, [groupId, myUid, me]);

  useEffect(() => {
    if (!connected) return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [connected]);

  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    // Last one out ends the call for the group.
    if (remoteUsers.length === 0) await endCall(groupId);
    localMicrophoneTrack?.close();
    localCameraTrack?.close();
    onLeft();
  };

  const switchCamera = async () => {
    const next = facing === "user" ? "environment" : "user";
    try {
      const devices = await AgoraRTC.getCameras();
      if (devices.length < 2) { toast.message("Only one camera found"); return; }
      setFacing(next);
      setCamOn(false);
      window.setTimeout(() => setCamOn(true), 150);
    } catch {
      toast.error("Couldn't switch camera");
    }
  };

  const tiles = useMemo(() => remoteUsers.length + 1, [remoteUsers.length]);
  const grid = tiles <= 1 ? "grid-cols-1" : tiles === 2 ? "grid-cols-1 sm:grid-cols-2" : tiles <= 4 ? "grid-cols-2" : tiles <= 9 ? "grid-cols-3" : "grid-cols-4";
  const timer = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const myName = me ? displayName(me) : "You";

  return (
    <Shell>
      <header className="flex items-center gap-3 px-4 py-3">
        <GroupAvatar name={groupName} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{groupName}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-white/60">
            {connected ? <><span className="h-1.5 w-1.5 rounded-full bg-green-400" /> {timer}</> : "Connecting…"}
            <span>·</span><Users className="h-3 w-3" /> {tiles}
          </p>
        </div>
      </header>

      <div className={`grid min-h-0 flex-1 auto-rows-fr gap-2 px-2 ${grid}`}>
        <Tile name={`${myName} (you)`} avatar={me?.avatar_url || null} muted={!micOn} videoOn={camOn}>
          <LocalUser audioTrack={localMicrophoneTrack} videoTrack={localCameraTrack} micOn={micOn} cameraOn={camOn} playAudio={false} playVideo={camOn} className="h-full w-full" />
        </Tile>
        {remoteUsers.map((u) => {
          const peer = peers[String(u.uid)];
          return (
            <Tile key={u.uid} name={peer?.name || "Joining…"} avatar={peer?.avatar || null} muted={!u.hasAudio} videoOn={u.hasVideo}>
              <RemoteUser user={u} playAudio playVideo={u.hasVideo} className="h-full w-full" />
            </Tile>
          );
        })}
      </div>

      {remoteUsers.length === 0 && connected && (
        <p className="px-6 pt-3 text-center text-[13px] text-white/55">Waiting for others to join — everyone in the group got a notification.</p>
      )}

      <div className="flex items-center justify-center gap-3 px-4 pb-6 pt-4">
        <Ctrl on={micOn} onClick={() => setMicOn((v) => !v)} label={micOn ? "Mute" : "Unmute"}>{micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}</Ctrl>
        <Ctrl on={camOn} onClick={() => setCamOn((v) => !v)} label={camOn ? "Camera off" : "Camera on"}>{camOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}</Ctrl>
        {camOn && <Ctrl on onClick={() => void switchCamera()} label="Flip camera"><RefreshCw className="h-6 w-6" /></Ctrl>}
        <button type="button" onClick={() => void leave()} aria-label="Leave call" className="grid h-16 w-16 place-items-center rounded-full bg-red-500 text-white shadow-[0_12px_30px_-10px_rgba(239,68,68,0.8)] transition active:scale-95">
          {leaving ? <Loader2 className="h-6 w-6 animate-spin" /> : <PhoneOff className="h-7 w-7" />}
        </button>
      </div>
    </Shell>
  );
}

function Tile({ name, avatar, muted, videoOn, children }: { name: string; avatar: string | null; muted: boolean; videoOn: boolean; children: React.ReactNode }) {
  return (
    <div className="relative min-h-[120px] overflow-hidden rounded-[22px] bg-white/[0.06] ring-1 ring-white/10">
      <div className={`absolute inset-0 ${videoOn ? "" : "opacity-0"}`}>{children}</div>
      {!videoOn && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-white/10 text-[28px] font-semibold ring-1 ring-white/15">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-medium backdrop-blur">
        {muted ? <MicOff className="h-3 w-3 text-red-300" /> : <Volume2 className="h-3 w-3 text-green-300" />}
        <span className="truncate">{name}</span>
      </span>
    </div>
  );
}

function Ctrl({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-95 ${on ? "bg-white/15 text-white" : "bg-white text-[#0b0a10]"}`}>
      {children}
    </button>
  );
}
