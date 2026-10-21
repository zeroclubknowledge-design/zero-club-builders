import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useGroupCall } from "@/features/groups/GroupCallContext";
import { GroupAvatar } from "@/features/groups/components";
import { Phone, PhoneOff, Radio } from "@/components/icons/glyphs";

/*
 * Incoming ring for a group call or a club going live.
 *
 * The server writes one call_rings row per person to ring. While the app is
 * open this shows a full-screen incoming-call card with a ringtone and phone
 * vibration; when it is closed, the push notification rings instead. Ringing
 * stops when you join or decline (on every device), when the call ends, or
 * after 45 seconds.
 */

type Ring = {
  id: string;
  kind: "group_call" | "club_live";
  target_id: string;
  title: string;
  subtitle: string | null;
  avatar_url: string | null;
  url: string;
  created_at: string;
  expires_at: string;
  ended_at: string | null;
};

const RING_FIELDS = "id, kind, target_id, title, subtitle, avatar_url, url, created_at, expires_at, ended_at";

/** A soft repeating chime made with Web Audio, so no sound file is needed. */
function createRingtone() {
  let ctx: AudioContext | null = null;
  let timer: number | null = null;
  let vibrateTimer: number | null = null;
  const notes = [659.25, 783.99, 987.77, 783.99]; // E5 G5 B5 G5

  const chime = () => {
    if (!ctx) return;
    const start = ctx.currentTime + 0.02;
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = start + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  };

  return {
    start() {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        void ctx.resume().catch(() => undefined);
        chime();
        timer = window.setInterval(chime, 2200);
      } catch {
        /* No audio available: the card and vibration still show. */
      }
      const buzz = () => { try { navigator.vibrate?.([700, 400, 700]); } catch { /* unsupported */ } };
      buzz();
      vibrateTimer = window.setInterval(buzz, 2200);
    },
    stop() {
      if (timer) window.clearInterval(timer);
      if (vibrateTimer) window.clearInterval(vibrateTimer);
      timer = vibrateTimer = null;
      try { navigator.vibrate?.(0); } catch { /* unsupported */ }
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}

/** After answering on pointer-down the card is gone before the finger lifts;
    eat the click that follows so it can't land on the call screen beneath
    (its hang-up button sits right there). */
function swallowNextClick() {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    window.removeEventListener("click", stop, true);
  };
  window.addEventListener("click", stop, true);
  window.setTimeout(() => window.removeEventListener("click", stop, true), 700);
}

function clearRingNotification(url?: string) {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "STOP_RING", url: url ? new URL(url, location.origin).href : "" });
    // The worker stores the relative url; send that form too.
    if (url) navigator.serviceWorker?.controller?.postMessage({ type: "STOP_RING", url });
  } catch {
    /* No worker: nothing to clear. */
  }
}

export function IncomingCallHost() {
  const { data: me } = useUser();
  const myId = (me as { id?: string } | null | undefined)?.id;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session: groupSession, start: startGroupCall } = useGroupCall();
  // One answer per ring: a double tap (or click after pointerdown) must not run it twice.
  const answered = useRef<string | null>(null);
  const [rings, setRings] = useState<Ring[]>([]);
  const toneRef = useRef<ReturnType<typeof createRingtone> | null>(null);
  const [, tick] = useState(0);

  const upsert = useCallback((row: Ring) => {
    setRings((list) => {
      const rest = list.filter((r) => r.id !== row.id);
      return row.ended_at ? rest : [...rest, row];
    });
  }, []);

  // Rings already waiting when the app opens, then live updates.
  useEffect(() => {
    if (!myId) return;
    let alive = true;
    void supabase
      .from("call_rings" as never)
      .select(RING_FIELDS)
      .eq("recipient_id", myId)
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => { if (alive && data) setRings(data as unknown as Ring[]); });
    const channel = supabase
      .channel(`call-rings-${myId}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "call_rings", filter: `recipient_id=eq.${myId}` }, (payload: { new?: Ring }) => {
        if (payload.new?.id) upsert(payload.new);
      })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [myId, upsert]);

  // Re-check expiry every second.
  useEffect(() => {
    if (!rings.length) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [rings.length]);

  const now = Date.now();
  const active = rings
    .filter((r) => new Date(r.expires_at).getTime() > now)
    // Already there: in this group call, or on this club's live page.
    .filter((r) => !(r.kind === "group_call" && groupSession?.groupId === r.target_id))
    .filter((r) => !(r.kind === "club_live" && pathname.startsWith(`/app/live/${r.target_id}`)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  // A group call that ends while ringing stops the ring.
  useEffect(() => {
    if (!active || active.kind !== "group_call") return;
    const id = active.id;
    const check = async () => {
      const { data } = await supabase.rpc("group_call_state_v2" as never, { p_group: active.target_id } as never);
      if ((data as { active?: boolean } | null)?.active === false) {
        setRings((list) => list.filter((r) => r.id !== id));
        clearRingNotification(active.url);
      }
    };
    const t = window.setInterval(check, 5000);
    return () => window.clearInterval(t);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sound + vibration while a ring is showing and the app is in front.
  const ringingId = active?.id;
  useEffect(() => {
    if (!ringingId) return;
    const play = () => {
      if (document.visibilityState !== "visible" || toneRef.current) return;
      toneRef.current = createRingtone();
      toneRef.current.start();
    };
    const pause = () => { toneRef.current?.stop(); toneRef.current = null; };
    const onVisibility = () => (document.visibilityState === "visible" ? play() : pause());
    play();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); pause(); };
  }, [ringingId]);

  // A ring that expired or was answered elsewhere also clears its notification.
  useEffect(() => {
    if (!active) return;
    const url = active.url;
    return () => clearRingNotification(url);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;

  const finish = (reason: "joined" | "declined") => {
    if (answered.current === active.id) return false;
    answered.current = active.id;
    setRings((list) => list.filter((r) => !(r.kind === active.kind && r.target_id === active.target_id)));
    clearRingNotification(active.url);
    void supabase.rpc("answer_call_ring" as never, { p_kind: active.kind, p_target: active.target_id, p_reason: reason } as never);
    return true;
  };

  /*
   * Join straight from the tap. A group call starts right here, inside the
   * gesture (so audio and the microphone are allowed to start), and the call
   * screen opens over the app; then we move to its page. Before, joining only
   * navigated and relied on the call page to start the call afterwards, which
   * looked like a dead button whenever that hop didn't happen.
   */
  const join = () => {
    const ring = active;
    if (!finish("joined")) return;
    if (ring.kind === "group_call") startGroupCall(ring.target_id, false);
    try {
      void navigate({ href: ring.url });
    } catch {
      window.location.assign(ring.url);
    }
  };
  const decline = () => {
    finish("declined");
  };

  const live = active.kind === "club_live";
  /* Rendered on <body>, above every other layer, and taking taps itself: an
     open (or just-closed) menu, sheet or drawer sets pointer-events:none on
     the body, which silently swallowed taps on this card. */
  return createPortal(
    <div style={{ pointerEvents: "auto" }} className="fixed inset-0 z-[10500] flex flex-col items-center justify-between bg-[radial-gradient(120%_80%_at_50%_0%,#3a0f2c_0%,#120910_55%,#060406_100%)] px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] text-white" role="alertdialog" aria-label={`${active.title} — incoming`}>
      <div className="flex flex-col items-center text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/80">
          {live ? <Radio className="h-3.5 w-3.5 text-[#ff4fb8]" /> : <Phone className="h-3.5 w-3.5" />}
          {live ? "Live now" : "Incoming group call"}
        </p>
        <div className="relative mt-10">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#cc208f]/30" />
          <span className="absolute -inset-4 rounded-full ring-2 ring-[#cc208f]/25" />
          <GroupAvatar name={active.title} url={active.avatar_url} size={112} className="relative ring-4 ring-white/15" />
        </div>
        <h2 className="mt-8 max-w-[18rem] text-[26px] font-bold leading-tight">{active.title}</h2>
        {active.subtitle && <p className="mt-2 max-w-[18rem] text-[15px] text-white/70">{active.subtitle}</p>}
      </div>

      <div className="flex w-full max-w-xs items-start justify-between">
        <button
          type="button"
          onPointerDown={(event) => { if (event.pointerType !== "mouse") { event.preventDefault(); swallowNextClick(); decline(); } }}
          onClick={decline}
          className="flex touch-manipulation flex-col items-center gap-2"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[#e5484d] shadow-[0_10px_30px_-8px_rgba(229,72,77,0.7)] transition active:scale-95">
            <PhoneOff className="h-7 w-7" />
          </span>
          <span className="text-[13px] text-white/75">Decline</span>
        </button>
        <button
          type="button"
          onPointerDown={(event) => { if (event.pointerType !== "mouse") { event.preventDefault(); swallowNextClick(); join(); } }}
          onClick={join}
          className="flex touch-manipulation flex-col items-center gap-2"
        >
          <span className="grid h-16 w-16 animate-bounce place-items-center rounded-full bg-[#22c55e] shadow-[0_10px_30px_-8px_rgba(34,197,94,0.7)] transition active:scale-95 [animation-duration:1.4s]">
            {live ? <Radio className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
          </span>
          <span className="text-[13px] text-white/75">{live ? "Join live" : "Join"}</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
