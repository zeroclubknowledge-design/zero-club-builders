export type Side = 1 | -1;
export type DraughtMove = { from: number; to: number; capture: number | null };
export type DraughtState = {
  board: number[];
  turn: Side;
  forced: number | null;
  quiet: number;
  ply: number;
  positions: Record<string, number>;
  winner: Side | null;
  draw: boolean;
};
export const positionKey = (board: number[], turn: Side) => `${board.join(",")}:${turn}`;
export function initialDraught(): DraughtState {
  const board = Array.from({ length: 64 }, (_, i) =>
    (Math.floor(i / 8) + (i % 8)) % 2 === 0 ? 0 : i < 24 ? 1 : i >= 40 ? -1 : 0,
  );
  return {
    board,
    turn: 1,
    forced: null,
    quiet: 0,
    ply: 0,
    positions: { [positionKey(board, 1)]: 1 },
    winner: null,
    draw: false,
  };
}
export function draughtMoves(
  board: number[],
  turn: Side,
  forced: number | null = null,
): DraughtMove[] {
  const steps: DraughtMove[] = [],
    captures: DraughtMove[] = [];
  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (Math.sign(piece) !== turn || (forced !== null && from !== forced)) continue;
    const row = Math.floor(from / 8),
      col = from % 8;
    for (const dr of Math.abs(piece) === 2 ? [-1, 1] : [turn])
      for (const dc of [-1, 1]) {
        const r = row + dr,
          c = col + dc;
        if (r < 0 || r > 7 || c < 0 || c > 7) continue;
        const near = r * 8 + c;
        if (!board[near] && forced === null) steps.push({ from, to: near, capture: null });
        const r2 = row + dr * 2,
          c2 = col + dc * 2;
        if (
          Math.sign(board[near]) === -turn &&
          r2 >= 0 &&
          r2 < 8 &&
          c2 >= 0 &&
          c2 < 8 &&
          !board[r2 * 8 + c2]
        )
          captures.push({ from, to: r2 * 8 + c2, capture: near });
      }
  }
  return captures.length || forced !== null ? captures : steps;
}
export function moveDraught(state: DraughtState, from: number, to: number): DraughtState {
  if (state.winner || state.draw) throw new Error("This game has ended");
  const move = draughtMoves(state.board, state.turn, state.forced).find(
    (m) => m.from === from && m.to === to,
  );
  if (!move) throw new Error("Choose a legal move. Captures are mandatory.");
  const next = { ...state, board: [...state.board], positions: { ...state.positions } };
  const piece = next.board[from];
  const promoted = Math.abs(piece) === 1 && Math.floor(to / 8) === (state.turn === 1 ? 7 : 0);
  next.board[from] = 0;
  next.board[to] = promoted ? state.turn * 2 : piece;
  if (move.capture !== null) next.board[move.capture] = 0;
  if (move.capture !== null || Math.abs(piece) === 1) next.quiet = 0;
  if (move.capture !== null && !promoted && draughtMoves(next.board, state.turn, to).length) {
    next.forced = to;
    return next;
  }
  next.turn = -state.turn as Side;
  next.forced = null;
  next.ply++;
  if (move.capture === null && Math.abs(piece) === 2) next.quiet++;
  const key = positionKey(next.board, next.turn);
  next.positions[key] = (next.positions[key] || 0) + 1;
  if (!draughtMoves(next.board, next.turn).length) next.winner = state.turn;
  else if (next.quiet >= 80 || next.positions[key] >= 3) next.draw = true;
  return next;
}

export function chooseComputerMove(state: DraughtState, depth = 3): DraughtMove | undefined {
  const side = state.turn;
  const evaluate = (s: DraughtState) =>
    s.winner
      ? s.winner === side
        ? 10000
        : -10000
      : s.draw
        ? 0
        : s.board.reduce(
            (score, piece, square) =>
              score +
              Math.sign(piece) *
                side *
                (Math.abs(piece) === 2
                  ? 175
                  : piece
                    ? 100 + (piece > 0 ? Math.floor(square / 8) : 7 - Math.floor(square / 8)) * 3
                    : 0),
            0,
          );
  const search = (s: DraughtState, remaining: number, alpha: number, beta: number): number => {
    if (remaining === 0 || s.winner || s.draw) return evaluate(s);
    const maximizing = s.turn === side;
    let best = maximizing ? -Infinity : Infinity;
    for (const move of draughtMoves(s.board, s.turn, s.forced)) {
      const score = search(moveDraught(s, move.from, move.to), remaining - 1, alpha, beta);
      best = maximizing ? Math.max(best, score) : Math.min(best, score);
      if (maximizing) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return Number.isFinite(best) ? best : evaluate(s);
  };
  let best = -Infinity,
    selected: DraughtMove | undefined;
  for (const move of draughtMoves(state.board, state.turn, state.forced)) {
    const score = search(
      moveDraught(state, move.from, move.to),
      Math.max(0, depth - 1),
      -Infinity,
      Infinity,
    );
    if (score > best) {
      best = score;
      selected = move;
    }
  }
  return selected;
}
