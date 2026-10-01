import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, HelpCircle, Play, Trophy, X } from "@/components/icons/glyphs";
import { ZeroMark } from "@/components/ZeroLoader";
import { ZERO_GAMES, type ZeroGameKey } from "./catalog";

/** Animated emblem for each game — used on the splash and the hub tiles. */
export function GameEmblem({ game, size = 140 }: { game: ZeroGameKey; size?: number }) {
  const info = ZERO_GAMES[game];
  if (game === "space") {
    return (
      <div className="zg-emblem relative" style={{ width: size, height: size }}>
        <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 ${size / 3}px ${info.accent}55`, background: `radial-gradient(circle, ${info.accent}22, transparent 70%)` }} />
        <div className="zg-orbit absolute inset-0">
          {[0, 120, 240].map((deg) => (
            <span key={deg} className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full" style={{ background: info.accent, boxShadow: `0 0 12px ${info.accent}`, transform: `rotate(${deg}deg) translate(${size / 2 - 8}px) translate(-50%,-50%)` }} />
          ))}
        </div>
        <div className="zg-float absolute inset-0 grid place-items-center text-white">
          <ZeroMark size={size * 0.42} style={{ filter: `drop-shadow(0 0 14px ${info.accent})` }} />
        </div>
      </div>
    );
  }
  if (game === "sudoku") {
    const digits = [5, 3, 0, 6, 0, 9, 0, 1, 8];
    return (
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl p-2" style={{ width: size, height: size, background: "rgba(255,255,255,0.06)", boxShadow: `0 0 ${size / 4}px ${info.accent}33` }}>
        {digits.map((d, i) => (
          <span key={i} className="zg-pop grid place-items-center rounded-lg font-display font-bold text-white" style={{ fontSize: size / 6, background: d ? "rgba(255,255,255,0.1)" : `${info.accent}33`, animationDelay: `${i * 90}ms` }}>
            {d || ""}
          </span>
        ))}
      </div>
    );
  }
  const letters = ["Z", "E", "R", "O", "A", "P", "I", "U", "X"];
  const lit = new Set([0, 4, 8]);
  return (
    <div className="grid grid-cols-3 gap-1.5" style={{ width: size, height: size }}>
      {letters.map((l, i) => (
        <span key={i} className="zg-pop grid place-items-center rounded-xl font-display font-bold" style={{ fontSize: size / 6, animationDelay: `${i * 80}ms`, background: lit.has(i) ? info.accent : "rgba(255,255,255,0.08)", color: lit.has(i) ? "#1a0f14" : "#fff" }}>
          {l}
        </span>
      ))}
    </div>
  );
}

export const SPLASH_CSS = `
@keyframes zg-orbit { to { transform: rotate(360deg); } }
@keyframes zg-float { 0%,100% { transform: translateY(-4px); } 50% { transform: translateY(4px); } }
@keyframes zg-pop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); } }
@keyframes zg-rise { from { transform: translateY(18px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes zg-twinkle { 0%,100% { opacity: .2; } 50% { opacity: .9; } }
.zg-orbit { animation: zg-orbit 7s linear infinite; }
.zg-float { animation: zg-float 3s ease-in-out infinite; }
.zg-pop { animation: zg-pop .5s cubic-bezier(.2,.9,.3,1.2) both; }
.zg-rise { animation: zg-rise .6s cubic-bezier(.2,.8,.2,1) both; }
.zg-star { animation: zg-twinkle 3s ease-in-out infinite; }
`;

const STARS = Array.from({ length: 40 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 53) % 100, d: (i % 7) * 0.4, s: 1 + (i % 3) }));

type SplashProps = {
  game: ZeroGameKey;
  onBack: () => void;
  /** Title over the game name — e.g. the tournament's title. */
  eyebrow?: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryBusy?: boolean;
  primaryDisabled?: boolean;
  secondary?: { label: string; onClick: () => void };
  footer?: ReactNode;
};

/** Full-screen splash shown when a Zero Game is opened. */
export function GameSplash({ game, onBack, eyebrow, primaryLabel, onPrimary, primaryBusy, primaryDisabled, secondary, footer }: SplashProps) {
  const info = ZERO_GAMES[game];
  const [howTo, setHowTo] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setReady(true), 650); return () => window.clearTimeout(t); }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden text-white" style={{ background: `radial-gradient(120% 80% at 50% 20%, ${info.to}, ${info.from} 70%)` }}>
      <style>{SPLASH_CSS}</style>
      {STARS.map((s, i) => (
        <span key={i} className="zg-star pointer-events-none absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
      ))}

      <div className="relative flex items-center px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
        <button onClick={onBack} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 backdrop-blur">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button onClick={() => setHowTo(true)} className="ml-auto flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-[13px] font-semibold backdrop-blur">
          <HelpCircle className="h-4 w-4" /> How to play
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="zg-rise"><GameEmblem game={game} size={150} /></div>
        {eyebrow && <p className="zg-rise mt-8 max-w-[320px] truncate text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: info.accent, animationDelay: "120ms" }}>{eyebrow}</p>}
        <h1 className={`zg-rise font-display text-[40px] font-bold leading-none tracking-[-0.03em] ${eyebrow ? "mt-2" : "mt-8"}`} style={{ animationDelay: "160ms" }}>{info.name}</h1>
        <p className="zg-rise mt-3 text-[16px] text-white/75" style={{ animationDelay: "220ms" }}>{info.tagline}</p>
        <p className="zg-rise mt-4 max-w-[360px] text-[14px] leading-relaxed text-white/55" style={{ animationDelay: "280ms" }}>{info.blurb}</p>
      </div>

      <div className={`relative mx-auto w-full max-w-[420px] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] transition-all duration-500 ${ready ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}>
        <button
          onClick={onPrimary}
          disabled={primaryBusy || primaryDisabled}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full text-[16px] font-bold text-[#140a1c] transition active:scale-[0.98] disabled:opacity-50"
          style={{ background: info.accent, boxShadow: `0 10px 40px ${info.accent}55` }}
        >
          {primaryBusy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#140a1c]/30 border-t-[#140a1c]" /> : <Play className="h-5 w-5 fill-current" />}
          {primaryLabel}
        </button>
        {secondary && (
          <button onClick={secondary.onClick} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white/10 text-[14.5px] font-semibold backdrop-blur transition active:scale-[0.98]">
            <Trophy className="h-4 w-4" /> {secondary.label}
          </button>
        )}
        {footer && <div className="mt-3 text-center text-[12.5px] text-white/60">{footer}</div>}
      </div>

      {howTo && (
        <div className="absolute inset-0 z-10 flex items-end bg-black/50 backdrop-blur-sm sm:items-center sm:justify-center" onClick={() => setHowTo(false)}>
          <div onClick={(e) => e.stopPropagation()} className="zg-rise max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-[#140c1d] p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] sm:max-w-[440px] sm:rounded-3xl">
            <div className="flex items-center">
              <h2 className="font-display text-[22px] font-bold">How to play</h2>
              <button onClick={() => setHowTo(false)} aria-label="Close" className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            <ol className="mt-5 space-y-4">
              {info.howTo.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold text-[#140a1c]" style={{ background: info.accent }}>{i + 1}</span>
                  <div>
                    <p className="text-[15px] font-semibold">{s.title}</p>
                    <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/65">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-2xl bg-white/[0.06] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: info.accent }}>Scoring</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-white/75">{info.scoring}</p>
              <p className="mt-2 text-[12.5px] text-white/50">In tournaments your best run counts. Highest Game Points when the clock runs out wins.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
