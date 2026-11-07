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
  if (length <= 0.04) return {x:0,y:0};
  const strength = (Math.min(1,length)-0.04)/0.96;
  return {x:x/length*strength,y:y/length*strength};
}

/** Direct analogue movement: bypass drag-target smoothing and stop at the arena edge. */
export function advanceSpaceStick(craft: {x:number;y:number;vx:number;vy:number}, target: {x:number;y:number}, stick: {x:number;y:number}, seconds: number, arena: ReturnType<typeof spaceArena>) {
  const dt = Math.max(0, Math.min(0.05, seconds));
  const beforeX=craft.x, beforeY=craft.y;
  craft.x += stick.x * 360 * dt;
  craft.y += stick.y * 360 * dt;
  clampToSpaceArena(craft,arena);
  craft.vx = dt ? (craft.x-beforeX)/dt : 0;
  craft.vy = dt ? (craft.y-beforeY)/dt : 0;
  target.x=craft.x; target.y=craft.y;
}
