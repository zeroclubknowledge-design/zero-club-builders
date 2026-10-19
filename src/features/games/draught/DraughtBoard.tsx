import { useEffect, useState } from "react";
import { Crown } from "@/components/icons/glyphs";
import { GameAvatar } from "../GameAvatar";
import type { DraughtMove, Side } from "./engine";
import type { DraughtPlayer } from "./api";

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
  useEffect(() => {
    setSelected(null);
  }, [board.join(",")]);
  const destinations = moves.filter((move) => move.from === selected);
  const squares = Array.from({ length: 64 }, (_, i) => (side === 1 ? 63 - i : i));
  const choose = (square: number) => {
    if (disabled) return;
    const target = destinations.find((move) => move.to === square);
    if (target && selected !== null) onMove(selected, square);
    else setSelected(moves.some((move) => move.from === square) ? square : null);
  };
  return (
    <div
      className="mx-auto aspect-square w-full max-w-[600px] overflow-hidden rounded-2xl border-4 border-[#513044] bg-[#241725] shadow-2xl sm:border-8"
      role="group"
      aria-label="Draught board"
    >
      <div className="grid h-full grid-cols-8 grid-rows-8">
        {squares.map((square) => {
          const dark = (Math.floor(square / 8) + (square % 8)) % 2 === 1;
          const piece = board[square],
            target = destinations.some((move) => move.to === square);
          const owner = piece > 0 ? players.red : players.black;
          const coordinate = `${"abcdefgh"[square % 8]}${8 - Math.floor(square / 8)}`;
          return (
            <button
              type="button"
              key={square}
              onClick={() => choose(square)}
              disabled={disabled || !dark}
              aria-label={`${coordinate}${piece ? `, ${piece > 0 ? "red" : "black"} ${Math.abs(piece) === 2 ? "king" : "piece"}` : target ? ", legal destination" : ", empty"}`}
              aria-pressed={selected === square}
              className={`relative grid min-h-0 min-w-0 place-items-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffca75] ${dark ? "bg-[#563347]" : "bg-[#c5a4ad]"} ${selected === square ? "!bg-[#a56d93]" : target ? "!bg-[#727455]" : ""}`}
            >
              {piece !== 0 && (
                <span
                  className={`relative grid h-[82%] w-[82%] place-items-center rounded-full border-[3px] shadow-[0_3px_0_#0005] ${piece > 0 ? "border-[#ff80bc] bg-[#a71f63]" : "border-[#aaa2c1] bg-[#23172d]"}`}
                >
                  <GameAvatar
                    id={owner.id}
                    name={owner.name}
                    photo={owner.photo}
                    className="h-[83%] w-[83%]"
                  />
                  {Math.abs(piece) === 2 && (
                    <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-[#ffca75] p-0.5 text-[#331d12]">
                      <Crown className="h-3 w-3 sm:h-4 sm:w-4" />
                    </span>
                  )}
                </span>
              )}
              {!piece && target && (
                <span className="h-3 w-3 rounded-full bg-[#d7f7b0] sm:h-4 sm:w-4" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
