export function spaceArena(width: number, height: number, topInset = 0) {
  const padX = Math.min(32, width / 4);
  const padY = Math.min(32, height / 4);
  return { left: padX, right: width - padX, top: Math.min(topInset + 112, height / 2), bottom: height - padY };
}
export function clampToSpaceArena<T extends {x:number;y:number}>(point: T, arena: ReturnType<typeof spaceArena>): T {
  point.x = Math.min(arena.right, Math.max(arena.left, point.x));
  point.y = Math.min(arena.bottom, Math.max(arena.top, point.y));
  return point;
}
export type SpacePauseReason = "player" | "supply" | "shop" | "leave";
export function createSpacePause() {
  const reasons = new Set<SpacePauseReason>();
  return {
    set(paused: boolean, reason: SpacePauseReason = "player") { if (paused) reasons.add(reason); else reasons.delete(reason); },
    get paused() { return reasons.size > 0; },
  };
}

/** Circular thumbstick input: no diagonal speed boost; a small centre dead zone. */
export function spaceStick(x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return {x:0,y:0};
  const length = Math.hypot(x,y);
  if (length <= 0.12) return {x:0,y:0};
  const strength = (Math.min(1,length)-0.12)/0.88;
  return {x:x/length*strength,y:y/length*strength};
}
