import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import AgoraRTC, {
  AgoraRTCProvider,
  LocalUser,
  RemoteUser,
  useIsConnected,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
  type IAgoraRTCClient,
} from "agora-rtc-react";
import { Loader2, Maximize2, Mic, MicOff, Minimize2, PhoneOff, RefreshCw, Users, Video, VideoOff, Volume2 } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useOrientationLock } from "@/hooks/useOrientationLock";
import { displayName, startCall } from "./api";
import { GroupAvatar } from "./components";
import { useGroupCall, type GroupCallSession } from "./GroupCallContext";

/*
 * Group voice/video call for private group chats.
 *
 * - Follows the app theme (light or dark), using the same tokens as the rest of Zero Club.
 * - Minimise to a floating bubble and keep using the app; tap it to come back.
 * - Names: each person registers their Agora number with the server
 *   (heartbeat_chat_group_call), so every tile shows the real account name.
 * - The server ends the call when nobody is left (no heartbeat for 45s), even
 *   if someone closed the app instead of pressing Leave.
 */

const APP_ID = "bfd9392ddcbc425e8946e8011ac2820b";

/**
 * Everyone joins with a number derived from their account, so every phone can
 * put the right name and photo on every tile straight away — without waiting
 * for the server, and without relying on Agora handing the number back.
 * (Before, a missing number meant heartbeats never reached the server: tiles
 * read "Connecting…", and the server closed the call after a minute for
 * everyone while people were still talking.)
 */
export function agoraUidFor(profileId: string) {
  const n = parseInt(profileId.replace(/-/g, "").slice(0, 8), 16) % 2_000_000_000;
  return n > 0 ? n : 1;
}
const HEARTBEAT_MS = 10_000;

type Person = { profile_id: string; uid: string; name: string; avatar: string | null };
type Member = { profile_id: string; name: string; avatar: string | null };

export function GroupCallHost() {
  const { session, end } = useGroupCall();
  const navigate = useNavigate();
  const [setup, setSetup] = useState<{ key: number; channel: string; token: string; name: string; avatar: string | null; client: IAgoraRTCClient } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session) {
      setSetup(null);
      setError(null);
      return;
    }
    let alive = true;
    setError(null);
    (async () => {
      try {
        const call = await startCall(session.groupId);
        const { data, error: tokenError } = await supabase.functions.invoke("agora-token", { body: { channelName: call.channel, uid: 0 } });
        if (tokenError || !data?.token) throw new Error("We couldn't connect the call. Check your connection and try again.");
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        if (alive) setSetup({ key: session.key, channel: call.channel, token: data.token, name: call.name, avatar: call.avatar_url || null, client });
      } catch (e) {
        if (alive) setError((e as Error).message || "Couldn't start the call.");
      }
    })();
    return () => { alive = false; };
  }, [session?.key, attempt]);

  if (!session) return null;

  const close = () => {
    const id = session.groupId;
    end();
    navigate({ to: "/app/chat/g/$groupId", params: { groupId: id }, replace: true });
  };

  if (error) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-red-500/15 text-red-500"><PhoneOff className="h-6 w-6" /></span>
          <h1 className="text-[19px] font-semibold">Call couldn't connect</h1>
          <p className="max-w-[300px] text-[13.5px] text-muted-foreground">{error}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => setAttempt((a) => a + 1)} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#cc208f] px-5 text-[14px] font-semibold text-white"><RefreshCw className="h-4 w-4" /> Try again</button>
            <button onClick={close} className="h-11 rounded-full bg-foreground/[0.08] px-5 text-[14px] font-semibold">Back to chat</button>
          </div>
        </div>
      </Shell>
    );
  }
  if (!setup || setup.key !== session.key) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          <p className="text-[14px] text-muted-foreground">Connecting…</p>
        </div>
      </Shell>
    );
  }
  return (
    <AgoraRTCProvider client={setup.client}>
      <CallRoom key={setup.key} session={session} channel={setup.channel} token={setup.token} groupName={setup.name} groupAvatar={setup.avatar} onLeft={close} />
    </AgoraRTCProvider>
  );
}

function Shell({ children, hidden = false }: { children: React.ReactNode; hidden?: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col bg-[radial-gradient(120%_70%_at_50%_0%,rgba(204,32,143,0.16)_0%,transparent_60%)] bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-foreground ${hidden ? "invisible pointer-events-none" : ""}`}
      aria-hidden={hidden || undefined}
    >
      {children}
    </div>
  );
}

function CallRoom({ session, channel, token, groupName, groupAvatar, onLeft }: {
  session: GroupCallSession; channel: string; token: string; groupName: string; groupAvatar: string | null; onLeft: () => void;
}) {
  const { minimized, minimize, restore } = useGroupCall();
  const navigate = useNavigate();
  useOrientationLock(minimized ? "portrait" : "free");
  const { data: me } = useUser();
  const groupId = session.groupId;
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(session.video);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [leaving, setLeaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);

  const myUid = me?.id ? agoraUidFor(me.id) : null;
  useJoin({ appid: APP_ID, channel, token, uid: myUid }, myUid != null);
  const connected = useIsConnected();
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn, { AEC: true, ANS: true, AGC: true });
  const { localCameraTrack } = useLocalCameraTrack(camOn, { facingMode: facing, encoderConfig: "480p_1" });
  usePublish([localMicrophoneTrack, localCameraTrack]);
  const remoteUsers = useRemoteUsers();
  const remoteCount = useRef(0);
  remoteCount.current = remoteUsers.length;

  // Tell the server we're here, and keep the call open for everyone. Beats
  // also fire the moment the app comes back to the foreground, because phones
  // slow timers right down while an app is in the background.
  useEffect(() => {
    if (!connected || myUid == null) return;
    const beat = () =>
      void supabase.rpc("heartbeat_chat_group_call" as any, { p_group: groupId, p_uid: myUid } as any).then(({ error }: any) => {
        if (error) console.warn("[group call] heartbeat failed", error.message);
      });
    beat();
    const t = window.setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", beat);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", beat);
    };
  }, [connected, myUid, groupId]);

  // Every member's name and photo, keyed by their call number.
  const [members, setMembers] = useState<Map<string, Member>>(() => new Map());
  useEffect(() => {
    let alive = true;
    void supabase
      .from("chat_group_members")
      .select("profile_id, profiles:profile_id(full_name, username, avatar_url)")
      .eq("group_id", groupId)
      .then(({ data }) => {
        if (!alive || !data) return;
        const map = new Map<string, Member>();
        for (const row of data as any[]) {
          const p = row.profiles || {};
          map.set(String(agoraUidFor(row.profile_id)), {
            profile_id: row.profile_id,
            name: (p.full_name || "").trim() || p.username || "Member",
            avatar: p.avatar_url || null,
          });
        }
        setMembers(map);
      });
    return () => { alive = false; };
  }, [groupId]);

  // Names for everyone in the call; also lets the server end abandoned calls.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc("chat_group_call_state" as any, { p_group: groupId } as any);
      if (alive && data) setPeople(((data as any).people || []) as Person[]);
    };
    void load();
    const t = window.setInterval(load, 4000);
    return () => { alive = false; window.clearInterval(t); };
  }, [groupId]);

  // Note: switching apps or locking the phone is NOT leaving. Only the Leave
  // button leaves; if the app is closed for good the server notices the
  // heartbeats stop (2 minutes) and lets the call carry on for everyone else.

  useEffect(() => {
    if (!connected) return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [connected]);

  const byUid = useMemo(() => new Map(people.map((p) => [String(p.uid), p])), [people]);

  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    localMicrophoneTrack?.close();
    localCameraTrack?.close();
    const { data } = await supabase.rpc("leave_chat_group_call" as any, { p_group: groupId } as any);
    if (data && (data as any).ended === false) toast.message("You left the call", { description: "It's still going for the others — rejoin any time from the group." });
    onLeft();
  };

  const goMinimize = () => {
    minimize();
    navigate({ to: "/app/chat/g/$groupId", params: { groupId }, replace: true });
  };

  const switchCamera = async () => {
    try {
      const cams = await AgoraRTC.getCameras();
      if (cams.length < 2) { toast.message("Only one camera found"); return; }
      setFacing((f) => (f === "user" ? "environment" : "user"));
      setCamOn(false);
      window.setTimeout(() => setCamOn(true), 150);
    } catch {
      toast.error("Couldn't switch camera");
    }
  };

  const tiles = remoteUsers.length + 1;
  const grid = tiles <= 1 ? "grid-cols-1" : tiles === 2 ? "grid-cols-1 sm:grid-cols-2" : tiles <= 4 ? "grid-cols-2" : tiles <= 9 ? "grid-cols-3" : "grid-cols-4";
  const timer = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const myName = me ? displayName(me) : "You";

  return (
    <>
      {/* The call keeps playing while minimised: the screen just hides. */}
      <Shell hidden={minimized}>
        <header className="flex items-center gap-3 px-4 py-3">
          <GroupAvatar name={groupName} url={groupAvatar} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{groupName}</p>
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              {connected ? <><span className="h-1.5 w-1.5 rounded-full bg-green-500" /> {timer}</> : "Connecting…"}
              <span>·</span><Users className="h-3 w-3" /> {tiles}
            </p>
          </div>
          <button type="button" onClick={goMinimize} aria-label="Minimise call" title="Minimise — keep using Zero Club" className="grid h-10 w-10 place-items-center rounded-full bg-foreground/[0.06] transition hover:bg-foreground/[0.1]">
            <Minimize2 className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className={`grid min-h-0 flex-1 auto-rows-fr gap-2 px-2 ${grid}`}>
          <Tile name={`${myName} (you)`} avatar={me?.avatar_url || null} muted={!micOn} videoOn={camOn}>
            <LocalUser audioTrack={localMicrophoneTrack} videoTrack={localCameraTrack} micOn={micOn} cameraOn={camOn} playAudio={false} playVideo={camOn} className="h-full w-full" />
          </Tile>
          {remoteUsers.map((u) => {
            const person = byUid.get(String(u.uid));
            return (
              <Tile key={u.uid} name={person?.name || members.get(String(u.uid))?.name || "Joining…"} avatar={person?.avatar || members.get(String(u.uid))?.avatar || null} muted={!u.hasAudio} videoOn={u.hasVideo}>
                <RemoteUser user={u} playAudio playVideo={u.hasVideo} className="h-full w-full" />
              </Tile>
            );
          })}
        </div>

        {remoteUsers.length === 0 && connected && (
          <p className="px-6 pt-3 text-center text-[13px] text-muted-foreground">Waiting for others to join — everyone in the group got a notification.</p>
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

      {/* Minimised: a floating bubble, draggable-free and always reachable. */}
      {minimized && (
        <div className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-3 z-[9998] flex items-center gap-2 rounded-full bg-card py-1.5 pl-1.5 pr-2 shadow-[0_16px_40px_-14px_rgba(0,0,0,0.55)] ring-1 ring-foreground/10">
          <button type="button" onClick={restore} className="flex items-center gap-2" aria-label="Return to call">
            <span className="relative">
              <GroupAvatar name={groupName} url={groupAvatar} size={40} />
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 ring-2 ring-card" />
            </span>
            <span className="text-left">
              <span className="block max-w-[120px] truncate text-[13px] font-semibold">{groupName}</span>
              <span className="block text-[11.5px] tabular-nums text-green-600 dark:text-green-400">{timer} · {tiles} in call</span>
            </span>
            <Maximize2 className="ml-1 h-4 w-4 text-muted-foreground" />
          </button>
          <button type="button" onClick={() => setMicOn((v) => !v)} aria-label={micOn ? "Mute" : "Unmute"} className={`grid h-9 w-9 place-items-center rounded-full ${micOn ? "bg-foreground/[0.07]" : "bg-foreground text-background"}`}>
            {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => void leave()} aria-label="Leave call" className="grid h-9 w-9 place-items-center rounded-full bg-red-500 text-white">
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

function Tile({ name, avatar, muted, videoOn, children }: { name: string; avatar: string | null; muted: boolean; videoOn: boolean; children: React.ReactNode }) {
  return (
    <div className="relative min-h-[120px] overflow-hidden rounded-[22px] bg-card ring-1 ring-foreground/[0.07]">
      <div className={`absolute inset-0 ${videoOn ? "" : "opacity-0"}`}>{children}</div>
      {!videoOn && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-foreground/[0.07] text-[28px] font-semibold ring-1 ring-foreground/10">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur">
        {muted ? <MicOff className="h-3 w-3 text-red-300" /> : <Volume2 className="h-3 w-3 text-green-300" />}
        <span className="truncate">{name}</span>
      </span>
    </div>
  );
}

function Ctrl({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-95 ${on ? "bg-foreground/[0.08] text-foreground" : "bg-foreground text-background"}`}>
      {children}
    </button>
  );
}
