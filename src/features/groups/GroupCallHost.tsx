import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import AgoraRTC, {
  AgoraRTCProvider,
  LocalUser,
  RemoteUser,
  useIsConnected,
  useRTCClient,
  useCurrentUID,
  useConnectionState,
  useClientEvent,
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
import { displayName, startCall, getMembers } from "./api";
import { agoraUidFor, callPeopleByUid, type CallPerson } from "./callIdentity";
import { GroupAvatar } from "./components";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useGroupCall, type GroupCallSession } from "./GroupCallContext";

/*
 * Group voice/video call for private group chats.
 *
 * - Follows the app theme (light or dark), using the same tokens as the rest of Zero Club.
 * - Minimise to a floating bubble and keep using the app; tap it to come back.
 * - Names: each person registers their Agora number with the server
 *   (heartbeat_chat_group_call), so every tile shows the real account name.
 * - Background presence has a longer lease; missing a browser timer does not
 *   immediately end a live call. Explicit leave and end are separate actions.
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
export { agoraUidFor } from "./callIdentity";
const HEARTBEAT_MS = 10_000;

type Person = CallPerson;

export function GroupCallHost() {
  const { session, minimized, end } = useGroupCall();
  const navigate = useNavigate();
  const { data: me } = useUser();
  const [setup, setSetup] = useState<{ key: number; profileId: string; uid: number; startedAt: string; channel: string; token: string; name: string; avatar: string | null; client: IAgoraRTCClient } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!session) {
      setSetup(null);
      setError(null);
      return;
    }
    // A profile refetch after returning to the app is not a request to hang up.
    if (!me?.id) return;
    if (setup?.key === session.key) { if (setup.profileId !== me.id) end(); return; }
    let alive = true;
    setError(null);
    (async () => {
      try {
        const call = await startCall(session.groupId);
        const uid = agoraUidFor(me.id);
        const { data: state, error: stateError } = await supabase.rpc("group_call_state_v2" as any, { p_group: session.groupId } as any);
        if (stateError) throw new Error("Call updates aren't available. Please try again after the call service has been updated.");
        if (!(state as any)?.active || !(state as any)?.started_at) throw new Error("This call has ended. Go back to the group to start a new one.");
        const { data, error: tokenError } = await supabase.functions.invoke("agora-token", { body: { channelName: call.channel, uid } });
        if (tokenError || !data?.token) throw new Error("We couldn't connect the call. Check your connection and try again.");
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        if (alive) setSetup({ key: session.key, profileId: me.id, uid, startedAt: (state as any).started_at, channel: call.channel, token: data.token, name: call.name, avatar: call.avatar_url || null, client });
      } catch (e) {
        if (alive) setError((e as Error).message || "Couldn't start the call.");
      }
    })();
    return () => { alive = false; };
  }, [session?.key, me?.id, attempt]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") { end(); setSetup(null); }
    });
    return () => subscription.unsubscribe();
  }, [end]);

  if (!session) return null;

  const close = () => {
    const id = session.groupId;
    end();
    if (!minimized) navigate({ to: "/app/chat/g/$groupId", params: { groupId: id }, replace: true });
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
      <CallRoom key={setup.key} session={session} uid={setup.uid} startedAt={setup.startedAt} channel={setup.channel} token={setup.token} groupName={setup.name} groupAvatar={setup.avatar} onLeft={close} />
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

export function CallRoom({ session, uid, startedAt, channel, token, groupName, groupAvatar, onLeft }: {
  session: GroupCallSession; uid: number; startedAt: string; channel: string; token: string; groupName: string; groupAvatar: string | null; onLeft: () => void;
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

  const client = useRTCClient();
  const { error: joinError } = useJoin({ appid: APP_ID, channel, token, uid });
  const myUid = useCurrentUID() ?? uid;
  const connectionState = useConnectionState();
  const connected = useIsConnected();
  const { localMicrophoneTrack, error: micError } = useLocalMicrophoneTrack(micOn, { AEC: true, ANS: true, AGC: true });
  const { localCameraTrack, error: cameraError } = useLocalCameraTrack(camOn, { facingMode: facing, encoderConfig: "480p_1" });
  usePublish([localMicrophoneTrack, localCameraTrack]);
  const remoteUsers = useRemoteUsers();

  const [canEnd, setCanEnd] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [members, setMembers] = useState<Awaited<ReturnType<typeof getMembers>>>([]);
  const leavingRef = useRef(false);
  const onLeftRef = useRef(onLeft);
  onLeftRef.current = onLeft;
  const mounted = useRef(true);
  const connectedOnce = useRef(false);
  const reconnectAttempts = useRef(0);
  const recovery = useRef<Promise<void> | null>(null);
  const callConnection = useRef(crypto.randomUUID());
  const registered = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const recover = async () => {
    if (leavingRef.current || recovery.current) return recovery.current;
    const run = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("agora-token", { body: { channelName: channel, uid } });
        if (error || !data?.token) throw new Error("Couldn't refresh the call connection. Check your internet and retry.");
        if (!mounted.current || leavingRef.current) return;
        if (client.connectionState === "DISCONNECTED") await client.join(APP_ID, channel, data.token, uid);
        else if (client.connectionState === "CONNECTED" || client.connectionState === "RECONNECTING") await client.renewToken(data.token);
        if (!mounted.current || leavingRef.current) { await client.leave(); return; }
        if (mounted.current) setConnectionError(null);
      } catch (error) {
        if (mounted.current) setConnectionError((error as Error).message);
      }
    };
    recovery.current = run().finally(() => { recovery.current = null; });
    return recovery.current;
  };
  useClientEvent(client, "token-privilege-will-expire", () => { void recover(); });
  useClientEvent(client, "token-privilege-did-expire", () => { void recover(); });

  // Fetch profiles through the same separate member/profile reads as group chat;
  // an inferred foreign-key join can fail or return arrays instead of a profile.
  useEffect(() => {
    let alive = true;
    const load = async () => { try { const rows = await getMembers(groupId); if (alive) setMembers(rows); } catch { /* Presence remains the primary identity source. */ } };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [groupId, remoteUsers.length]);

  useEffect(() => {
    let alive = true;
    let busy = false;
    let queued = false;
    const applyState = (state: any) => {
      if (!alive || leavingRef.current || !state) return;
      if (state.active === false || (state.started_at && Date.parse(state.started_at) !== Date.parse(startedAt))) {
        leavingRef.current = true;
        toast.message(state.replaced ? "You joined the call on another device" : "The group call has ended");
        localMicrophoneTrack?.close(); localCameraTrack?.close();
        void client.leave().catch(() => {}).finally(() => onLeftRef.current());
        return;
      }
      setPeople(state.people || []);
      setCanEnd(Boolean(state.can_end));
    };
    const sync = async () => {
      if (leavingRef.current || !alive) return;
      if (busy) { queued = true; return; }
      busy = true;
      try {
        const hasConnection = client.connectionState === "CONNECTED" || client.connectionState === "RECONNECTING";
        const { data, error } = hasConnection
          ? await supabase.rpc("group_call_heartbeat_v2" as any, { p_group: groupId, p_uid: Number(myUid), p_started_at: startedAt, p_background: document.visibilityState === "hidden", p_connection: callConnection.current, p_join: !registered.current } as any).abortSignal(AbortSignal.timeout(10_000))
          : await supabase.rpc("group_call_state_v2" as any, { p_group: groupId } as any).abortSignal(AbortSignal.timeout(10_000));
        if (!error) { if (hasConnection) registered.current = true; applyState(data); }
        else if (error.message?.includes("Not a group member")) applyState({ active: false });
      } catch { /* An unavailable presence API is not proof that a call ended. */ }
      finally { busy = false; if (queued && alive) { queued = false; void sync(); } }
    };
    const foreground = () => {
      void sync(); // Hidden also grants a longer lease before mobile timers pause.
      if (document.visibilityState === "visible") void recover();
    };
    void sync();
    const updates = supabase.channel(`group-call-${groupId}-${callConnection.current}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_groups", filter: `id=eq.${groupId}` }, ({ new: row }: any) => {
        if (row.call_active_since === null) applyState({ active: false });
        else if (row.call_active_since && Date.parse(row.call_active_since) !== Date.parse(startedAt)) applyState({ active: false });
        else void sync();
      }).subscribe();
    const timer = window.setInterval(sync, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("online", foreground);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", foreground); window.removeEventListener("online", foreground); void supabase.removeChannel(updates); };
  }, [groupId, myUid, startedAt, client, connected]);

  useEffect(() => {
    if (connected) { connectedOnce.current = true; reconnectAttempts.current = 0; setConnectionError(null); }
  }, [connected]);
  useEffect(() => {
    if (!connectedOnce.current || connectionState !== "DISCONNECTED" || leavingRef.current) return;
    setConnectionError("Connection interrupted. Reconnecting…");
    const delay = Math.min(30_000, 1500 * 2 ** reconnectAttempts.current++);
    const timer = window.setTimeout(() => { void recover(); }, delay);
    return () => window.clearTimeout(timer);
  }, [connectionState]);
  // Elapsed time survives background timer throttling.
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)));
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const byUid = useMemo(() => callPeopleByUid(people, members), [people, members]);
  const leave = async (endForEveryone = false) => {
    if (leavingRef.current) return;
    if (endForEveryone && !window.confirm("End this call for everyone?")) return;
    leavingRef.current = true; setLeaving(true);
    try {
      const { data, error } = await supabase.rpc("group_call_leave_v2" as any, { p_group: groupId, p_started_at: startedAt, p_end_for_everyone: endForEveryone, p_connection: callConnection.current } as any).abortSignal(AbortSignal.timeout(10_000));
      if (error && endForEveryone) throw error;
      if (error) toast.message("You left the call", { description: "The group will update when your connection recovers." });
      else toast.message((data as any)?.ended ? "The group call has ended" : "You left the call", { description: (data as any)?.ended ? undefined : "The others can continue. You can rejoin from the group." });
      localMicrophoneTrack?.close(); localCameraTrack?.close();
      await client.leave();
      onLeftRef.current();
    } catch (error) {
      if (endForEveryone) { leavingRef.current = false; setLeaving(false); toast.error("Couldn't end the call for everyone. Please try again."); }
      else { localMicrophoneTrack?.close(); localCameraTrack?.close(); void client.leave().catch(() => {}); onLeftRef.current(); }
    }
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
              {connected ? <><span className="h-1.5 w-1.5 rounded-full bg-green-500" /> {timer}</> : connectedOnce.current ? "Reconnecting…" : "Connecting…"}
              <span>·</span><Users className="h-3 w-3" /> {tiles}
            </p>
          </div>
          <button type="button" onClick={goMinimize} aria-label="Minimise call" title="Minimise — keep using Zero Club" className="grid h-10 w-10 place-items-center rounded-full bg-foreground/[0.06] transition hover:bg-foreground/[0.1]">
            <Minimize2 className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className={`grid min-h-0 flex-1 auto-rows-fr gap-2 px-2 ${grid}`}>
          <Tile name={`${myName} (you)`} avatar={me?.avatar_url || null} muted={!micOn || !!micError} videoOn={camOn && !!localCameraTrack}>
            <LocalUser audioTrack={localMicrophoneTrack} videoTrack={localCameraTrack} micOn={micOn} cameraOn={camOn} playAudio={false} playVideo={camOn} className="h-full w-full" />
          </Tile>
          {remoteUsers.map((u) => {
            const person = byUid.get(String(u.uid));
            return (
              <Tile key={u.uid} name={person?.name || "Member"} avatar={person?.avatar || null} muted={!u.hasAudio} videoOn={u.hasVideo}>
                <RemoteUser user={u} playAudio playVideo={u.hasVideo} className="h-full w-full" />
              </Tile>
            );
          })}
        </div>

        {(connectionError || joinError) && <div role="status" className="mx-4 mt-3 rounded-xl bg-amber-500/10 p-3 text-center text-sm">{connectionError || "Couldn't connect to the call."} <button type="button" onClick={() => void recover()} className="font-semibold underline">Reconnect</button></div>}
        {(micError || cameraError) && <p role="alert" className="px-4 pt-2 text-center text-xs text-amber-600">{micError ? "Microphone unavailable. Allow microphone access in your browser to speak." : "Camera unavailable. You can continue with audio or check camera permissions."}</p>}
        {remoteUsers.length === 0 && connected && (
          <p className="px-6 pt-3 text-center text-[13px] text-muted-foreground">Waiting for others to join — everyone in the group got a notification.</p>
        )}

        <div className="flex items-center justify-center gap-3 px-4 pb-6 pt-4">
          <Ctrl on={micOn} onClick={() => setMicOn((v) => !v)} label={micOn ? "Mute" : "Unmute"}>{micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}</Ctrl>
          <Ctrl on={camOn} onClick={() => setCamOn((v) => !v)} label={camOn ? "Camera off" : "Camera on"}>{camOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}</Ctrl>
          {camOn && <Ctrl on onClick={() => void switchCamera()} label="Flip camera"><RefreshCw className="h-6 w-6" /></Ctrl>}
          <button type="button" disabled={leaving} onClick={() => void leave()} aria-label="Leave call" title="Leave — others can continue" className="grid h-16 w-16 place-items-center rounded-full bg-red-500 text-white shadow-[0_12px_30px_-10px_rgba(239,68,68,0.8)] transition active:scale-95 disabled:opacity-50">
            {leaving ? <Loader2 className="h-6 w-6 animate-spin" /> : <PhoneOff className="h-7 w-7" />}
          </button>
        </div>
        {canEnd && <button type="button" disabled={leaving} onClick={() => void leave(true)} className="mx-auto mb-4 text-xs font-semibold text-red-500 underline disabled:opacity-50">End call for everyone</button>}
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
              <span className="block text-[11.5px] tabular-nums text-green-600 dark:text-green-400">{connected ? `${timer} · ${tiles} in call` : "Reconnecting…"}</span>
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
          <Avatar className="h-20 w-20 text-[28px] font-semibold ring-1 ring-foreground/10"><AvatarImage src={avatar || undefined} alt={`${name} profile picture`} className="object-cover" /><AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
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
