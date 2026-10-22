/**
 * Zero Games catalogue — one entry per game, used by the hub tiles,
 * the splash screens and the tournament forms.
 */
export type ZeroGameKey = "space";

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
};

export const ZERO_GAME_LIST: ZeroGameInfo[] = [ZERO_GAMES.space];

export function isZeroGameKey(v: unknown): v is ZeroGameKey {
  return v === "space";
}

/** Shown for tournaments of games that have left Zero Club (Zero Sudoku, Zero Words). */
export const RETIRED_GAME: Omit<ZeroGameInfo, "key"> = {
  name: "Retired game",
  tagline: "This game is no longer on Zero Club.",
  blurb: "This game is no longer on Zero Club.",
  from: "#1a1420",
  to: "#3a3044",
  accent: "#b9a9c9",
  howTo: [],
  scoring: "",
};

/** Catalogue entry for any stored game_type, including retired games. */
export function gameInfo(gameType: string | null | undefined): Omit<ZeroGameInfo, "key"> {
  return isZeroGameKey(gameType) ? ZERO_GAMES[gameType] : RETIRED_GAME;
}
