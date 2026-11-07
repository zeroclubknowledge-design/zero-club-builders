import { useSyncExternalStore } from "react";
export type VoicePlaybackState = {
  src: string;
  name: string;
  origin: string;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  speed: number;
  error: string;
};
const empty: VoicePlaybackState = {
  src: "",
  name: "Voice note",
  origin: "",
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  speed: 1,
  error: "",
};
/** One audio owner for the app; inline players subscribe but never dispose it. */
export function createVoicePlayback(createAudio: () => HTMLAudioElement) {
  let audio: HTMLAudioElement | undefined,
    state = { ...empty },
    revision = 0;
  let pendingSeek: number | null = null;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<VoicePlaybackState>) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  };
  const applySeek = () => {
    if (!audio || pendingSeek === null) return;
    try {
      audio.currentTime = Math.max(
        0,
        Math.min(Number.isFinite(audio.duration) ? audio.duration : Infinity, pendingSeek),
      );
      pendingSeek = null;
      update({ position: audio.currentTime });
    } catch {
      /* Retry once metadata is available. */
    }
  };
  const ensure = () => {
    if (audio) return audio;
    audio = createAudio();
    audio.preload = "metadata";
    audio.addEventListener("timeupdate", () => {
      if (pendingSeek === null) update({ position: audio!.currentTime });
    });
    const duration = () => {
      if (Number.isFinite(audio!.duration) && audio!.duration > 0)
        update({ duration: audio!.duration });
    };
    audio.addEventListener("loadedmetadata", duration);
    audio.addEventListener("durationchange", duration);
    audio.addEventListener("play", () => update({ playing: true, error: "" }));
    audio.addEventListener("pause", () => update({ playing: false }));
    audio.addEventListener("waiting", () => update({ loading: true }));
    audio.addEventListener("playing", () => update({ playing: true, loading: false }));
    audio.addEventListener("ended", () => {
      audio!.currentTime = 0;
      update({ playing: false, loading: false, position: 0 });
    });
    audio.addEventListener("error", () =>
      update({
        playing: false,
        loading: false,
        error: "Could not play this voice note. Try again.",
      }),
    );
    return audio;
  };
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    snapshot: () => state,
    async play(
      src: string,
      meta?: { name?: string | null; duration?: number; origin?: string; position?: number },
    ) {
      const player = ensure(),
        version = ++revision;
      if (state.src !== src) {
        player.pause();
        player.src = src;
        pendingSeek = Number.isFinite(meta?.position) ? Math.max(0, meta!.position!) : 0;
        update({
          ...empty,
          src,
          name: meta?.name || "Voice note",
          duration: meta?.duration || 0,
          origin: meta?.origin || "",
          speed: state.speed,
        });
      } else if (meta?.origin) update({ origin: meta.origin });
      applySeek();
      player.playbackRate = state.speed;
      update({ loading: true, error: "" });
      try {
        await player.play();
      } catch (error) {
        if (version !== revision) return;
        if (version === revision)
          update({ playing: false, error: "Could not play this voice note. Try again." });
        throw error;
      } finally {
        if (version === revision) update({ loading: false });
      }
    },
    pause() {
      ++revision;
      audio?.pause();
      update({ playing: false, loading: false });
    },
    seek(seconds: number) {
      if (audio && state.src && Number.isFinite(seconds)) {
        pendingSeek = Math.max(0, Math.min(state.duration || Infinity, seconds));
        applySeek();
      }
    },
    speed() {
      const next = state.speed === 1 ? 1.5 : state.speed === 1.5 ? 2 : 1;
      if (audio) audio.playbackRate = next;
      update({ speed: next });
    },
    close() {
      pendingSeek = null;
      ++revision;
      audio?.pause();
      if (audio) {
        audio.removeAttribute("src");
        audio.load();
      }
      update({ ...empty });
    },
  };
}
export const voicePlayback = createVoicePlayback(() => new Audio());
export const useVoicePlayback = () =>
  useSyncExternalStore(voicePlayback.subscribe, voicePlayback.snapshot, () => empty);
