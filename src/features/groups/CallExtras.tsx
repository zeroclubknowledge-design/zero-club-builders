import { Hand, X } from "@/components/icons/glyphs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CALL_REACTIONS, type FloatingReaction, type RaisedHand } from "./callSignals";

/** Keyframes for the call's live layers. Rendered once inside the call. */
export const CALL_FX_CSS = `
@keyframes zgc-rise {
  0%   { transform: translate(0, 0) scale(.6); opacity: 0; }
  12%  { transform: translate(0, -4vh) scale(1.15); opacity: 1; }
  70%  { opacity: 1; }
  100% { transform: translate(var(--drift), -52vh) scale(1); opacity: 0; }
}
@keyframes zgc-pop { from { transform: translateY(10px) scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes zgc-wave { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-14deg); } 40% { transform: rotate(10deg); } 60% { transform: rotate(-8deg); } 80% { transform: rotate(6deg); } }
@keyframes zgc-speak { 0%,100% { box-shadow: 0 0 0 2px rgba(255,79,195,.9), 0 0 28px -4px rgba(255,79,195,.7); } 50% { box-shadow: 0 0 0 3px rgba(255,79,195,1), 0 0 40px -2px rgba(255,79,195,.9); } }
.zgc-rise { animation: zgc-rise 3s cubic-bezier(.2,.7,.3,1) forwards; }
.zgc-pop { animation: zgc-pop .28s cubic-bezier(.2,.8,.2,1) both; }
.zgc-wave { animation: zgc-wave 1.2s ease-in-out infinite; transform-origin: 70% 90%; display: inline-block; }
.zgc-speaking { animation: zgc-speak 1.2s ease-in-out infinite; }
`;

/** Emojis floating up the call screen, each with who sent it. */
export function ReactionLayer({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="zgc-rise absolute bottom-[132px] flex flex-col items-center"
          style={{ left: `${r.x}%`, ["--drift" as string]: `${r.drift}px` }}
        >
          <span className="text-[42px] leading-none drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]">{r.emoji}</span>
          <span
            className={`mt-1 max-w-[110px] truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold backdrop-blur-md ${
              r.mine ? "bg-[#ff4fc3]/80 text-white" : "bg-black/45 text-white/90"
            }`}
          >
            {r.name.split(" ")[0]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The emoji picker that opens above the call controls. */
export function ReactionTray({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label="Close reactions" onClick={onClose} className="fixed inset-0 z-30 cursor-default" />
      <div
        role="menu"
        aria-label="Send a reaction"
        className="zgc-pop absolute bottom-[calc(100%+12px)] left-1/2 z-40 flex -translate-x-1/2 gap-0.5 rounded-full bg-[#1a1022]/95 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10 backdrop-blur-2xl"
      >
        {CALL_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="menuitem"
            onClick={() => onPick(emoji)}
            aria-label={`React ${emoji}`}
            className="grid h-10 w-10 place-items-center rounded-full text-[24px] leading-none transition hover:scale-110 hover:bg-white/10 active:scale-90 sm:h-11 sm:w-11 sm:text-[26px]"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

/** The queue of raised hands, oldest first. Hosts can lower anyone's. */
export function HandsSheet({
  hands,
  meId,
  canModerate,
  onLower,
  onClose,
}: {
  hands: RaisedHand[];
  meId?: string;
  canModerate: boolean;
  onLower: (profileId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Raised hands"
        onClick={(e) => e.stopPropagation()}
        className="zgc-pop w-full max-w-[420px] rounded-t-[28px] bg-[#150d1c] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] text-white ring-1 ring-white/10 sm:rounded-[28px] sm:pb-5"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-400/15 text-[20px]">✋</span>
          <div className="flex-1">
            <h3 className="text-[17px] font-bold">Raised hands</h3>
            <p className="text-[12.5px] text-white/50">{hands.length ? "In the order they were raised" : "No hands up right now"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.07] hover:bg-white/[0.12]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ol className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
          {hands.map((hand, i) => (
            <li key={hand.profileId} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.06]">
              <span className="w-5 text-center text-[13px] font-bold tabular-nums text-amber-300">{i + 1}</span>
              <Avatar className="h-9 w-9">
                <AvatarImage src={hand.avatar || undefined} alt="" className="object-cover" />
                <AvatarFallback>{hand.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{hand.profileId === meId ? "You" : hand.name}</p>
                <p className="text-[11.5px] text-white/45">{ago(hand.at)}</p>
              </div>
              {(canModerate || hand.profileId === meId) && (
                <button
                  type="button"
                  onClick={() => onLower(hand.profileId)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12.5px] font-semibold hover:bg-white/15"
                >
                  <Hand className="h-3.5 w-3.5" /> Lower
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** A short line at the top of the call, e.g. "Ada raised a hand". */
export function CallNotice({ text }: { text: string }) {
  return (
    <div role="status" className="zgc-pop pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+72px)] z-40 -translate-x-1/2">
      <span className="flex items-center gap-2 rounded-full bg-[#1a1022]/90 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_16px_40px_-18px_rgba(0,0,0,0.9)] ring-1 ring-white/10 backdrop-blur-xl">
        {text}
      </span>
    </div>
  );
}

function ago(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  return `${m} min ago`;
}
