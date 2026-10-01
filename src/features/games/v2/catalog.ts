/**
 * Zero Games catalogue — one entry per game, used by the hub tiles,
 * the splash screens and the tournament forms.
 */
export type ZeroGameKey = "space" | "sudoku" | "words";

export type ZeroGameInfo = {
  key: ZeroGameKey;
  name: string;
  tagline: string;
  blurb: string;
  /** Two-stop gradient for tiles and splash. */
  from: string;
  to: string;
  accent: string;
  howTo: { title: string; body: string }[];
  scoring: string;
};

export const ZERO_GAMES: Record<ZeroGameKey, ZeroGameInfo> = {
  space: {
    key: "space",
    name: "Zero Space",
    tagline: "Chase opportunities. Outrun doubt.",
    blurb: "Pilot the Zero craft through deep space, grab opportunity orbs before your fuel runs dry, and dodge the Doubt drones hunting you down.",
    from: "#120a24",
    to: "#3b0f4f",
    accent: "#ff4fc3",
    howTo: [
      { title: "Move", body: "Drag anywhere on the screen to steer. On a keyboard use WASD or the arrow keys." },
      { title: "Grab orbs", body: "Every pink opportunity orb refuels you. Let the fuel ring hit zero and the craft is lost." },
      { title: "Dodge doubt", body: "Red Doubt drones chase you. One touch ends the run. More join every 5 orbs." },
      { title: "Power-ups", body: "Shield blocks one hit, Focus slows time, Magnet pulls orbs to you." },
      { title: "Combo", body: "Chain orbs quickly to raise your multiplier up to ×5." },
    ],
    scoring: "10 points per orb × combo, plus a bonus for every second you survive.",
  },
  sudoku: {
    key: "sudoku",
    name: "Zero Sudoku",
    tagline: "Pure logic, against the clock.",
    blurb: "Fill the grid so every row, column and box holds 1 to 9. The faster you finish, the higher you score.",
    from: "#0f1720",
    to: "#1f3a4d",
    accent: "#5cc8ff",
    howTo: [
      { title: "Fill the grid", body: "Each row, column and 3×3 box must contain the digits 1 to 9 once." },
      { title: "Use notes", body: "Switch to pencil mode to jot candidates in a cell." },
      { title: "Submit", body: "Submit once the grid is full. Only a correct grid scores." },
    ],
    scoring: "Up to 10,000 points — you lose 4 for every second you take (minimum 1,000).",
  },
  words: {
    key: "words",
    name: "Zero Words",
    tagline: "Find the words of your craft.",
    blurb: "Trace professional terms hidden in a letter board. Every word counts, finishing fast counts more.",
    from: "#1a0f14",
    to: "#5a1838",
    accent: "#ffb547",
    howTo: [
      { title: "Trace", body: "Drag across letters in a straight line — across, down or diagonal, either direction." },
      { title: "Find them all", body: "The list shows the words hidden on this board." },
      { title: "Finish", body: "Tap Finish when you're done. Clearing the whole board earns a speed bonus." },
    ],
    scoring: "150 points per word, plus up to 3,000 for clearing the board quickly.",
  },
};

export const ZERO_GAME_LIST: ZeroGameInfo[] = [ZERO_GAMES.space, ZERO_GAMES.sudoku, ZERO_GAMES.words];

export function isZeroGameKey(v: unknown): v is ZeroGameKey {
  return v === "space" || v === "sudoku" || v === "words";
}

/** Words scoring — mirrors the server cap (total × 150 + 3000). */
export function wordsScore(found: number, total: number, seconds: number) {
  const base = found * 150;
  const bonus = found >= total ? Math.max(0, 3000 - seconds * 5) : 0;
  return base + bonus;
}
