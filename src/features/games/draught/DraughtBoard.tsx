import { useEffect, useMemo, useRef, useState } from "react";
import { Crown } from "@/components/icons/glyphs";
import { GameAvatar } from "../GameAvatar";
import type { DraughtMove, Side } from "./engine";
import type { DraughtPlayer } from "./api";

/**
 * The Zero Draught board.
 *
 * A clean, edge-to-edge board with glossy stacked discs that carry each
 * player's avatar, and quiet guidance while it's your turn: pieces that can
 * move glow softly, a capture you must take is marked, the last move stays
 * tinted so you can see what just happened, and a piece pops as it lands.
 */

const BOARD_CSS = `
@keyframes zd-land { 0% { transform: translateY(-14%) scale(1.12); } 60% { transform: translateY(2%) scale(.97); } 100% { transform: none; } }
@keyframes zd-breathe { 0%,100% { box-shadow: 0 0 0 0 rgba(255,202,117,0); } 50% { box-shadow: 0 0 0 3px rgba(255,202,117,.55); } }
@keyframes zd-must { 0%,100% { box-shadow: 0 0 0 2px rgba(255,107,107,.95), 0 0 18px 2px rgba(255,107,107,.45); } 50% { box-shadow: 0 0 0 3px rgba(255,107,107,1), 0 0 26px 4px rgba(255,107,107,.65); } }
@keyframes zd-dot { 0%,100% { transform: scale(.85); opacity: .75; } 50% { transform: scale(1.05); opacity: 1; } }
.zd-land { animation: zd-land .38s cubic-bezier(.2,.8,.2,1); }
.zd-breathe { animation: zd-breathe 1.8s ease-in-out infinite; }
.zd-must { animation: zd-must 1.1s ease-in-out infinite; }
.zd-dot { animation: zd-dot 1.4s ease-in-out infinite; }
`;

export function DraughtBoard({
  board,
  moves,
  side,
  players,
  disabled,
  onMove,
}: {
  board: number[];
  moves: DraughtMove[];
  side: Side;
  players: { red: DraughtPlayer; black: DraughtPlayer };
  disabled?: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const key = board.join(",");

  /* What changed since the last board: where a piece left and where it landed. */
  const previous = useRef<number[] | null>(null);
  const [lastMove, setLastMove] = useState<{ from: number[]; to: number[] }>({ from: [], to: [] });
  useEffect(() => {
    setSelected(null);
    const before = previous.current;
    previous.current = board;
    if (!before || before.length !== board.length) return;
    const from: number[] = [];
    const to: number[] = [];
    board.forEach((piece, i) => {
      if (piece === before[i]) return;
      if (piece !== 0 && Math.sign(piece) !== Math.sign(before[i])) to.push(i);
      else if (piece !== 0) to.push(i); // crowned in place is not a move, but harmless
      else if (before[i] !== 0) from.push(i);
    });
    // Captured pieces also disappear; keep only the mover's start square.
    if (to.length === 1) {
      const mover = Math.sign(board[to[0]]);
      setLastMove({ from: from.filter((i) => Math.sign(before[i]) === mover), to });
    } else setLastMove({ from: [], to: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const movable = useMemo(() => new Set(moves.map((m) => m.from)), [moves]);
  const mustCapture = moves.some((m) => m.capture !== null);
  const destinations = moves.filter((move) => move.from === selected);
  const squares = Array.from({ length: 64 }, (_, i) => (side === 1 ? 63 - i : i));

  const choose = (square: number) => {
    if (disabled) return;
    const target = destinations.find((move) => move.to === square);
    if (target && selected !== null) onMove(selected, square);
    else setSelected(movable.has(square) ? square : null);
  };

  return (
    <div className="relative mx-auto w-full max-w-[760px]">
      <style>{BOARD_CSS}</style>
      {/* Just the board: no frame or coordinates, so it takes all the room it has. */}
      <div
        className="aspect-square w-full overflow-hidden rounded-[14px] shadow-[0_30px_70px_-28px_rgba(0,0,0,0.9)] ring-1 ring-black/40 sm:rounded-[18px]"
        role="group"
        aria-label="Draught board"
      >
            <div className="grid h-full grid-cols-8 grid-rows-8">
              {squares.map((square) => {
                const dark = (Math.floor(square / 8) + (square % 8)) % 2 === 1;
                const piece = board[square];
                const targetMove = destinations.find((move) => move.to === square);
                const owner = piece > 0 ? players.red : players.black;
                const coordinate = `${"abcdefgh"[square % 8]}${8 - Math.floor(square / 8)}`;
                const isSelected = selected === square;
                const canMove = !disabled && movable.has(square);
                const wasFrom = lastMove.from.includes(square);
                const wasTo = lastMove.to.includes(square);
                const red = piece > 0;
                return (
                  <button
                    type="button"
                    key={square}
                    onClick={() => choose(square)}
                    disabled={disabled || !dark}
                    aria-label={`${coordinate}${piece ? `, ${red ? "red" : "black"} ${Math.abs(piece) === 2 ? "king" : "piece"}` : targetMove ? ", legal destination" : ", empty"}`}
                    aria-pressed={isSelected}
                    className="relative grid min-h-0 min-w-0 place-items-center outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffca75]"
                    style={{
                      background: dark
                        ? "linear-gradient(145deg,#5a2a4f 0%,#43203d 100%)"
                        : "linear-gradient(145deg,#f1e2e4 0%,#e2cbd0 100%)",
                    }}
                  >
                    {/* Last move tint */}
                    {(wasFrom || wasTo) && (
                      <span aria-hidden className="absolute inset-0" style={{ background: wasTo ? "rgba(255,202,117,0.30)" : "rgba(255,202,117,0.16)" }} />
                    )}
                    {/* Selected square glow */}
                    {isSelected && <span aria-hidden className="absolute inset-0 bg-[#fd49b0]/25 shadow-[inset_0_0_0_2px_rgba(253,73,176,0.85)]" />}

                    {piece !== 0 && (
                      <span
                        key={wasTo ? `land-${key}` : "still"}
                        className={`relative z-[1] grid h-[84%] w-[84%] place-items-center rounded-full transition-transform duration-200 ${wasTo ? "zd-land" : ""} ${isSelected ? "-translate-y-[6%] scale-[1.07]" : ""}`}
                      >
                        {/* Shadow under the disc */}
                        <span aria-hidden className="absolute inset-x-[6%] -bottom-[7%] h-[30%] rounded-[50%] bg-black/45 blur-[3px]" />
                        {/* Edge of the stacked disc */}
                        <span
                          aria-hidden
                          className="absolute inset-0 translate-y-[6%] rounded-full"
                          style={{ background: red ? "linear-gradient(180deg,#841555,#5b0c34)" : "linear-gradient(180deg,#2b2236,#120c18)" }}
                        />
                        {/* Face */}
                        <span
                          className={`relative grid h-full w-full place-items-center rounded-full ${canMove && !isSelected ? (mustCapture ? "zd-must" : "zd-breathe") : ""}`}
                          style={{
                            background: red
                              ? "radial-gradient(circle at 32% 26%,#fd89cc 0%,#de2d93 38%,#9e1965 100%)"
                              : "radial-gradient(circle at 32% 26%,#6c5a85 0%,#3a2d4c 42%,#1c1426 100%)",
                            boxShadow: red
                              ? "inset 0 0 0 2px rgba(255,214,236,0.55), inset 0 -3px 6px rgba(0,0,0,0.35)"
                              : "inset 0 0 0 2px rgba(214,204,236,0.38), inset 0 -3px 6px rgba(0,0,0,0.45)",
                          }}
                        >
                          {/* Inner groove ring */}
                          <span aria-hidden className="absolute inset-[9%] rounded-full" style={{ boxShadow: red ? "0 0 0 1.5px rgba(255,210,235,0.35)" : "0 0 0 1.5px rgba(200,190,230,0.25)" }} />
                          <GameAvatar id={owner.id} name={owner.name} photo={owner.photo} className="h-[68%] w-[68%] ring-1 ring-black/30" />
                          {/* Gloss */}
                          <span aria-hidden className="pointer-events-none absolute left-[18%] top-[10%] h-[26%] w-[46%] rounded-full bg-white/25 blur-[2px]" />
                        </span>
                        {Math.abs(piece) === 2 && (
                          <span
                            className="absolute -top-[16%] left-1/2 z-[2] grid h-[42%] w-[42%] -translate-x-1/2 place-items-center rounded-full text-[#3a2006] shadow-[0_3px_8px_rgba(0,0,0,0.5)] ring-2 ring-black/20"
                            style={{ background: "linear-gradient(145deg,#ffe7a3,#ffca75 45%,#d99a2b)" }}
                          >
                            <Crown className="h-[62%] w-[62%]" />
                          </span>
                        )}
                      </span>
                    )}

                    {!piece && targetMove && (
                      targetMove.capture !== null ? (
                        <span aria-hidden className="zd-dot relative z-[1] h-[58%] w-[58%] rounded-full border-[3px] border-[#ff8a8a] bg-[#ff6b6b]/15" />
                      ) : (
                        <span aria-hidden className="zd-dot relative z-[1] h-[30%] w-[30%] rounded-full bg-[#ffca75] shadow-[0_0_14px_rgba(255,202,117,0.8)]" />
                      )
                    )}
                  </button>
                );
              })}
            </div>
      </div>
    </div>
  );
}
