import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Mic, Loader2 } from "@/components/icons/glyphs";
import type { useVapiVoice } from "./useVapiVoice";

export type VoiceState = ReturnType<typeof useVapiVoice>;

export function VoiceWaveform({ voice }: { voice: VoiceState }) {
  const level = voice.assistantSpeaking ? voice.assistantVolume : voice.localVolume;
  return (
    <div
      className="relative mx-auto my-7 grid h-36 w-36 place-items-center rounded-full bg-[#cc208f]/10"
      aria-hidden="true"
    >
      <div
        className="absolute inset-3 rounded-full bg-gradient-to-tr from-[#cc208f]/30 to-violet-500/25 blur-lg transition-transform duration-100 motion-reduce:transform-none"
        style={{ transform: `scale(${1 + level * 0.5})` }}
      />
      <div className="relative flex h-16 items-center gap-1.5">
        {[0.4, 0.75, 1, 0.65, 0.9, 0.5, 0.3].map((weight, index) => (
          <span
            key={index}
            className="w-1.5 rounded-full bg-[#cc208f] transition-[height] duration-100 motion-reduce:transition-none"
            style={{ height: 8 + level * 52 * weight }}
          />
        ))}
      </div>
    </div>
  );
}

export function VoiceControls({ voice, onEnd }: { voice: VoiceState; onEnd: () => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {voice.status === "connected" && (
        <button
          type="button"
          onClick={voice.toggleMute}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold"
        >
          {voice.muted ? "Unmute" : "Mute"}
        </button>
      )}
      <button
        type="button"
        onClick={onEnd}
        className="rounded-full bg-destructive px-5 py-2.5 text-sm font-semibold text-white"
      >
        {voice.status === "connecting" ? "Cancel connection" : "End conversation"}
      </button>
    </div>
  );
}

export function VoiceOverlay({ voice }: { voice: VoiceState }) {
  return (
    <Dialog
      open={voice.status !== "idle"}
      onOpenChange={(open) => {
        if (!open) voice.stop();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-3xl border-border p-6 text-center sm:rounded-3xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="text-xl">Zero AI voice</DialogTitle>
        <DialogDescription>Talk naturally with your GPT assistant.</DialogDescription>
        <VoiceWaveform voice={voice} />
        <p role="status" className="mb-5 text-sm text-muted-foreground">
          {voice.status === "connecting" ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting…
            </span>
          ) : voice.muted ? (
            "Your microphone is muted"
          ) : voice.assistantSpeaking ? (
            "Zero AI is speaking"
          ) : (
            <span className="inline-flex items-center gap-2">
              <Mic className="h-4 w-4" />
              Listening to you
            </span>
          )}
        </p>
        <VoiceControls voice={voice} onEnd={voice.stop} />
        {voice.error && (
          <p role="alert" className="text-sm text-destructive">
            {voice.error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
