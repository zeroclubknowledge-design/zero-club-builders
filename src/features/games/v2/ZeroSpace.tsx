import { useEffect, useRef } from "react";
import { ZERO_MARK_PATH } from "@/components/ZeroLoader";

/**
 * Zero Space — a canvas arcade game.
 *
 * You fly the Zero craft. Opportunity orbs refuel you; if the fuel ring
 * empties, the craft is lost. Doubt drones hunt you — chasers steer after
 * you, dashers lock on and lunge. One touch ends the run (unless shielded).
 * A new drone joins every 5 orbs. Chain orbs quickly to build a combo.
 *
 * Controls: relative drag anywhere (your finger never covers the craft),
 * or WASD / arrow keys.
 */

export type ZeroSpaceResult = { score: number; orbs: number; seconds: number; cause: "fuel" | "doubt" };

type Vec = { x: number; y: number };
type Enemy = Vec & { vx: number; vy: number; kind: "chaser" | "dasher"; warm: number; phase: number; state: "hunt" | "aim" | "dash"; t: number; dir: Vec; spin: number };
type Orb = Vec & { golden: boolean; life: number; born: number };
type Power = Vec & { kind: "shield" | "focus" | "magnet"; life: number };
type Particle = Vec & { vx: number; vy: number; life: number; max: number; color: string; size: number };
type Star = { x: number; y: number; z: number; tw: number };
type Floater = Vec & { text: string; life: number; color: string };

const FUEL_MAX = 8;
const ORB_FUEL = 3.6;
const COMBO_WINDOW = 2.4;
const CRAFT_R = 15;
const PINK = "#ff4fc3";
const POWER_COLORS = { shield: "#5cc8ff", focus: "#b38cff", magnet: "#ffb547" } as const;
const POWER_LABEL = { shield: "Shield", focus: "Focus", magnet: "Magnet" } as const;

export function ZeroSpaceGame({ onGameOver, topInset = 0 }: { onGameOver: (r: ZeroSpaceResult) => void; topInset?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onGameOver);
  doneRef.current = onGameOver;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const mark = new Path2D(ZERO_MARK_PATH);
    let W = 0, H = 0, dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    /* ── world state ── */
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
    const craft = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
    const target = { x: W / 2, y: H / 2 };
    let fuel = FUEL_MAX;
    let score = 0;
    let survival = 0;
    let orbsTaken = 0;
    let combo = 1;
    let lastOrbAt = -99;
    let time = 0;          // seconds of play (after countdown)
    let intro = 3;         // 3-2-1 countdown
    let dead: null | { at: number; cause: "fuel" | "doubt" } = null;
    let reported = false;
    let shield = 0, focus = 0, magnet = 0;
    let nextPower = rand(9, 13);
    let nextGolden = rand(14, 20);
    let shake = 0;
    let flash = 0;
    const enemies: Enemy[] = [];
    const orbs: Orb[] = [];
    const powers: Power[] = [];
    const parts: Particle[] = [];
    const floaters: Floater[] = [];
    const trail: Vec[] = [];
    const stars: Star[] = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() * 0.9 + 0.1, tw: Math.random() * 6 }));
    const keys = new Set<string>();

    const freeSpot = (minFromCraft: number): Vec => {
      const pad = 36;
      for (let i = 0; i < 30; i++) {
        const p = { x: rand(pad, W - pad), y: rand(pad + topInset + 40, H - pad) };
        if (dist(p, craft) < minFromCraft) continue;
        if (enemies.some((e) => dist(p, e) < 70)) continue;
        return p;
      }
      return { x: rand(pad, W - pad), y: rand(pad + topInset + 40, H - pad) };
    };

    const spawnOrb = (golden = false) => {
      const p = freeSpot(golden ? 160 : 130);
      orbs.push({ ...p, golden, life: golden ? 4.5 : Infinity, born: time });
    };

    const spawnEnemy = () => {
      const count = enemies.length;
      const kind: Enemy["kind"] = count >= 2 && count % 3 === 2 ? "dasher" : "chaser";
      // Enter from the edge furthest from the craft.
      const edge = Math.floor(Math.random() * 4);
      const p = edge === 0 ? { x: rand(0, W), y: topInset + 30 } : edge === 1 ? { x: W - 10, y: rand(topInset, H) } : edge === 2 ? { x: rand(0, W), y: H - 10 } : { x: 10, y: rand(topInset, H) };
      if (dist(p, craft) < 180) { p.x = W - p.x; p.y = Math.max(topInset + 30, H - p.y); }
      enemies.push({ ...p, vx: 0, vy: 0, kind, warm: 1.2, phase: Math.random() * 6, state: "hunt", t: rand(1.5, 3), dir: { x: 0, y: 0 }, spin: 0 });
    };

    const burst = (x: number, y: number, color: string, n: number, speed = 160, size = 2.4) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * speed;
        const max = rand(0.4, 0.9);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, color, size: rand(size * 0.5, size * 1.4) });
      }
    };

    const float = (x: number, y: number, text: string, color = "#fff") => floaters.push({ x, y, text, life: 1, color });

    const reset = () => {
      craft.x = target.x = W / 2;
      craft.y = target.y = H / 2 + 40;
      spawnOrb();
      spawnEnemy();
    };
    reset();

    /* ── input ── */
    let dragging: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging || dragging.id !== e.pointerId) return;
      const sens = e.pointerType === "mouse" ? 1 : 1.35;
      target.x = Math.min(W - 12, Math.max(12, target.x + (e.clientX - dragging.x) * sens));
      target.y = Math.min(H - 12, Math.max(topInset + 12, target.y + (e.clientY - dragging.y) * sens));
      dragging.x = e.clientX; dragging.y = e.clientY;
    };
    const up = (e: PointerEvent) => { if (dragging?.id === e.pointerId) dragging = null; };
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) { keys.add(k); e.preventDefault(); }
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    let hidden = false;
    const vis = () => { hidden = document.hidden; last = performance.now(); };
    document.addEventListener("visibilitychange", vis);

    /* ── loop ── */
    let raf = 0;
    let last = performance.now();

    const die = (cause: "fuel" | "doubt") => {
      if (dead) return;
      dead = { at: time, cause };
      shake = 18; flash = 1;
      burst(craft.x, craft.y, PINK, 60, 280, 3);
      burst(craft.x, craft.y, "#ffffff", 30, 200, 2);
      try { navigator.vibrate?.(180); } catch { /* not supported */ }
    };

    const step = (dt: number) => {
      // Background drift is always on.
      for (const s of stars) { s.y += dt * 0.012 * s.z; if (s.y > 1) { s.y = 0; s.x = Math.random(); } s.tw += dt * 2; }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
        if (p.life <= 0) parts.splice(i, 1);
      }
      for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.life -= dt; f.y -= dt * 40; if (f.life <= 0) floaters.splice(i, 1); }
      shake = Math.max(0, shake - dt * 40);
      flash = Math.max(0, flash - dt * 2.5);

      if (intro > 0) { intro -= dt; return; }
      if (dead) {
        if (!reported && time - dead.at > 1.3) {
          reported = true;
          doneRef.current({ score: Math.round(score + survival), orbs: orbsTaken, seconds: Math.round(dead.at), cause: dead.cause });
        }
        time += dt;
        return;
      }

      time += dt;
      const level = orbsTaken;

      /* craft */
      let kx = 0, ky = 0;
      if (keys.has("arrowleft") || keys.has("a")) kx -= 1;
      if (keys.has("arrowright") || keys.has("d")) kx += 1;
      if (keys.has("arrowup") || keys.has("w")) ky -= 1;
      if (keys.has("arrowdown") || keys.has("s")) ky += 1;
      if (kx || ky) {
        const n = Math.hypot(kx, ky);
        target.x = Math.min(W - 12, Math.max(12, target.x + (kx / n) * 330 * dt));
        target.y = Math.min(H - 12, Math.max(topInset + 12, target.y + (ky / n) * 330 * dt));
      }
      const ax = (target.x - craft.x) * 14, ay = (target.y - craft.y) * 14;
      craft.vx += (ax - craft.vx) * Math.min(1, dt * 10);
      craft.vy += (ay - craft.vy) * Math.min(1, dt * 10);
      craft.x += craft.vx * dt; craft.y += craft.vy * dt;
      const sp = Math.hypot(craft.vx, craft.vy);
      if (sp > 30) {
        const want = Math.atan2(craft.vy, craft.vx);
        let d = want - craft.angle; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        craft.angle += d * Math.min(1, dt * 8);
      }
      trail.push({ x: craft.x, y: craft.y }); if (trail.length > 18) trail.shift();
      if (sp > 60 && Math.random() < 0.6) {
        parts.push({ x: craft.x - Math.cos(craft.angle) * 14, y: craft.y - Math.sin(craft.angle) * 14, vx: -craft.vx * 0.2 + rand(-20, 20), vy: -craft.vy * 0.2 + rand(-20, 20), life: 0.35, max: 0.35, color: PINK, size: 2 });
      }

      /* fuel */
      const drain = Math.min(1.7, 1 + level * 0.012);
      fuel -= dt * drain;
      if (fuel <= 0) { fuel = 0; die("fuel"); return; }
      survival += dt * 2;

      /* timers */
      shield = Math.max(0, shield - dt);
      focus = Math.max(0, focus - dt);
      magnet = Math.max(0, magnet - dt);
      if (time - lastOrbAt > COMBO_WINDOW && combo > 1) combo = 1;
      nextPower -= dt;
      if (nextPower <= 0 && powers.length < 1) {
        const kinds: Power["kind"][] = ["shield", "focus", "magnet"];
        powers.push({ ...freeSpot(120), kind: kinds[Math.floor(Math.random() * 3)], life: 7 });
        nextPower = rand(11, 16);
      }
      nextGolden -= dt;
      if (nextGolden <= 0) { spawnOrb(true); nextGolden = rand(15, 24); }

      /* orbs */
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        if (o.golden) { o.life -= dt; if (o.life <= 0) { burst(o.x, o.y, "#ffd36b", 10, 60); orbs.splice(i, 1); continue; } }
        if (magnet > 0) {
          const d = dist(o, craft);
          if (d < 190) { o.x += ((craft.x - o.x) / d) * 260 * dt; o.y += ((craft.y - o.y) / d) * 260 * dt; }
        }
        if (dist(o, craft) < CRAFT_R + 11) {
          orbs.splice(i, 1);
          combo = time - lastOrbAt <= COMBO_WINDOW ? Math.min(5, combo + 1) : 1;
          lastOrbAt = time;
          const pts = (o.golden ? 50 : 10) * combo;
          score += pts;
          fuel = Math.min(FUEL_MAX, fuel + (o.golden ? FUEL_MAX : ORB_FUEL));
          burst(o.x, o.y, o.golden ? "#ffd36b" : PINK, o.golden ? 30 : 16, 150);
          float(o.x, o.y - 14, `+${pts}${combo > 1 ? `  ×${combo}` : ""}`, o.golden ? "#ffd36b" : "#fff");
          try { navigator.vibrate?.(12); } catch { /* not supported */ }
          if (!o.golden) {
            orbsTaken += 1;
            spawnOrb();
            if (orbsTaken % 5 === 0 && enemies.length < 9) { spawnEnemy(); float(W / 2, topInset + 90, "A new doubt appears", "#ff6b6b"); }
          }
        }
      }

      /* power-ups */
      for (let i = powers.length - 1; i >= 0; i--) {
        const p = powers[i];
        p.life -= dt;
        if (p.life <= 0) { powers.splice(i, 1); continue; }
        if (dist(p, craft) < CRAFT_R + 13) {
          powers.splice(i, 1);
          if (p.kind === "shield") shield = 10;
          if (p.kind === "focus") focus = 5;
          if (p.kind === "magnet") magnet = 6;
          burst(p.x, p.y, POWER_COLORS[p.kind], 22, 160);
          float(p.x, p.y - 16, POWER_LABEL[p.kind], POWER_COLORS[p.kind]);
        }
      }

      /* enemies */
      const slow = focus > 0 ? 0.4 : 1;
      const chaseSpeed = Math.min(190, 78 + level * 3.2);
      for (const e of enemies) {
        e.phase += dt * 3; e.spin += dt * (e.state === "dash" ? 14 : 2);
        if (e.warm > 0) { e.warm -= dt; continue; }
        const dx = craft.x - e.x, dy = craft.y - e.y, d = Math.hypot(dx, dy) || 1;
        if (e.kind === "chaser") {
          const wantX = (dx / d) * chaseSpeed, wantY = (dy / d) * chaseSpeed;
          e.vx += (wantX - e.vx) * Math.min(1, dt * 1.6);
          e.vy += (wantY - e.vy) * Math.min(1, dt * 1.6);
        } else {
          e.t -= dt;
          if (e.state === "hunt") {
            e.vx += ((dx / d) * chaseSpeed * 0.55 - e.vx) * Math.min(1, dt * 1.2);
            e.vy += ((dy / d) * chaseSpeed * 0.55 - e.vy) * Math.min(1, dt * 1.2);
            if (e.t <= 0 && d < 380) { e.state = "aim"; e.t = 0.75; }
          } else if (e.state === "aim") {
            e.vx *= 0.85; e.vy *= 0.85;
            e.dir = { x: dx / d, y: dy / d };
            if (e.t <= 0) { e.state = "dash"; e.t = 0.55; e.vx = e.dir.x * 520; e.vy = e.dir.y * 520; }
          } else if (e.t <= 0) { e.state = "hunt"; e.t = rand(2, 3.5); }
        }
        e.x += e.vx * dt * slow; e.y += e.vy * dt * slow;
        e.x = Math.min(W - 8, Math.max(8, e.x)); e.y = Math.min(H - 8, Math.max(topInset + 8, e.y));
      }
      // Drones push apart so they don't stack into one blob.
      for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i], b = enemies[j], d = dist(a, b);
        if (d > 0 && d < 30) { const k = (30 - d) / 2 / d; a.x -= (b.x - a.x) * k; a.y -= (b.y - a.y) * k; b.x += (b.x - a.x) * k; b.y += (b.y - a.y) * k; }
      }
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.warm > 0) continue;
        if (dist(e, craft) < CRAFT_R + 11) {
          if (shield > 0) {
            shield = 0; shake = 10;
            burst(e.x, e.y, "#ff6b6b", 26, 200);
            float(e.x, e.y - 14, "Blocked", POWER_COLORS.shield);
            enemies.splice(i, 1);
            window.setTimeout(() => { if (!dead) spawnEnemy(); }, 2500);
          } else { die("doubt"); return; }
        }
      }
    };

    /* ── drawing ── */
    const drawCraft = (x: number, y: number, angle: number, alpha = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = alpha;
      // engine glow
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
      g.addColorStop(0, "rgba(255,79,195,0.55)"); g.addColorStop(1, "rgba(255,79,195,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(angle + Math.PI / 2);
      ctx.scale(0.34, 0.34);
      ctx.translate(-50, -50);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = PINK; ctx.shadowBlur = 18;
      ctx.fill(mark, "evenodd");
      ctx.restore();
    };

    const drawEnemy = (e: Enemy) => {
      ctx.save();
      ctx.translate(e.x, e.y);
      const warm = e.warm > 0;
      if (warm) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(e.warm * 20);
        ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(0, 0, 18 + e.warm * 12, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (e.kind === "dasher" && e.state === "aim") {
        ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = "#ff6b6b"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.dir.x * 240, e.dir.y * 240); ctx.stroke(); ctx.restore();
      }
      ctx.rotate(e.spin);
      const spikes = e.kind === "dasher" ? 4 : 7;
      const R = e.kind === "dasher" ? 14 : 12, r = e.kind === "dasher" ? 6 : 8;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const rr = i % 2 === 0 ? R + Math.sin(e.phase + i) * 1.5 : r;
        const a = (i / (spikes * 2)) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = e.kind === "dasher" ? "#ff8a3d" : "#ff3b5c";
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = focus > 0 ? 4 : 16;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.rotate(-e.spin);
      // eye looks at the craft
      const a = Math.atan2(craft.y - e.y, craft.x - e.x);
      ctx.fillStyle = "#1a0710"; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(Math.cos(a) * 2, Math.sin(a) * 2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // background
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0b0618"); bg.addColorStop(1, "#1c0a2e");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const neb = ctx.createRadialGradient(W * 0.8, H * 0.2, 10, W * 0.8, H * 0.2, Math.max(W, H) * 0.7);
      neb.addColorStop(0, "rgba(204,32,143,0.18)"); neb.addColorStop(1, "rgba(204,32,143,0)");
      ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
      for (const s of stars) {
        ctx.globalAlpha = 0.3 + 0.5 * s.z * (0.7 + 0.3 * Math.sin(s.tw));
        ctx.fillStyle = "#fff";
        ctx.fillRect(s.x * W, s.y * H, s.z * 2, s.z * 2);
      }
      ctx.globalAlpha = 1;

      ctx.save();
      if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);

      // orbs
      for (const o of orbs) {
        const pulse = 1 + Math.sin((time - o.born) * 5) * 0.12;
        const c = o.golden ? "255,211,107" : "255,79,195";
        const g = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, 26 * pulse);
        g.addColorStop(0, `rgba(${c},0.9)`); g.addColorStop(0.35, `rgba(${c},0.35)`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, 26 * pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(o.x, o.y, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${c},0.8)`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(o.x, o.y, 11 * pulse, (time * 2) % (Math.PI * 2), ((time * 2) % (Math.PI * 2)) + Math.PI * 1.3); ctx.stroke();
        if (o.golden) {
          ctx.strokeStyle = "rgba(255,211,107,0.9)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(o.x, o.y, 17, -Math.PI / 2, -Math.PI / 2 + (o.life / 4.5) * Math.PI * 2); ctx.stroke();
        }
      }
      // direction hint to the main orb when it's far away
      const main = orbs.find((o) => !o.golden);
      if (main && !dead && intro <= 0 && dist(main, craft) > 150) {
        const a = Math.atan2(main.y - craft.y, main.x - craft.x);
        ctx.save(); ctx.translate(craft.x + Math.cos(a) * 34, craft.y + Math.sin(a) * 34); ctx.rotate(a);
        ctx.fillStyle = "rgba(255,79,195,0.7)"; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // power-ups
      for (const p of powers) {
        const c = POWER_COLORS[p.kind];
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.globalAlpha = p.life < 2 ? 0.4 + 0.6 * Math.abs(Math.sin(p.life * 8)) : 1;
        ctx.rotate(time * 1.5);
        ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.shadowColor = c; ctx.shadowBlur = 12;
        ctx.strokeRect(-11, -11, 22, 22);
        ctx.rotate(-time * 1.5);
        ctx.shadowBlur = 0; ctx.fillStyle = c; ctx.font = "700 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(p.kind === "shield" ? "S" : p.kind === "focus" ? "F" : "M", 0, 1);
        ctx.restore();
      }

      for (const e of enemies) drawEnemy(e);

      // craft
      if (!dead) {
        for (let i = 0; i < trail.length; i++) {
          const t = trail[i];
          ctx.globalAlpha = (i / trail.length) * 0.25;
          ctx.fillStyle = PINK; ctx.beginPath(); ctx.arc(t.x, t.y, (i / trail.length) * 7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        drawCraft(craft.x, craft.y, craft.angle);
        // fuel ring
        const f = fuel / FUEL_MAX;
        ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(craft.x, craft.y, 24, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = f < 0.3 ? (Math.floor(time * 6) % 2 ? "#ff3b5c" : "#ffb547") : f < 0.55 ? "#ffb547" : "#6cf0c2";
        ctx.beginPath(); ctx.arc(craft.x, craft.y, 24, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
        if (shield > 0) {
          ctx.strokeStyle = `rgba(92,200,255,${0.5 + 0.3 * Math.sin(time * 8)})`; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(craft.x, craft.y, 30, 0, Math.PI * 2); ctx.stroke();
        }
        if (magnet > 0) {
          ctx.strokeStyle = "rgba(255,181,71,0.25)"; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
          ctx.beginPath(); ctx.arc(craft.x, craft.y, 190, time, time + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // particles
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const f of floaters) {
        ctx.globalAlpha = Math.min(1, f.life * 1.5);
        ctx.fillStyle = f.color; ctx.font = "700 14px system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (focus > 0) { ctx.fillStyle = "rgba(179,140,255,0.07)"; ctx.fillRect(0, 0, W, H); }
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.4})`; ctx.fillRect(0, 0, W, H); }

      /* HUD */
      const top = topInset + 12;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "600 10px system-ui, sans-serif";
      ctx.fillText("SCORE", 16, top + 10);
      ctx.fillStyle = "#fff"; ctx.font = "700 24px system-ui, sans-serif";
      ctx.fillText(Math.round(score + survival).toLocaleString(), 16, top + 36);
      ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "600 10px system-ui, sans-serif";
      ctx.fillText("ORBS", W - 16, top + 10);
      ctx.fillStyle = "#fff"; ctx.font = "700 24px system-ui, sans-serif";
      ctx.fillText(String(orbsTaken), W - 16, top + 36);
      // fuel bar
      const bw = Math.min(180, W - 200), bx = W / 2 - bw / 2;
      if (bw > 60) {
        ctx.fillStyle = "rgba(255,255,255,0.12)"; roundRect(bx, top + 22, bw, 6, 3); ctx.fill();
        const f = fuel / FUEL_MAX;
        ctx.fillStyle = f < 0.3 ? "#ff3b5c" : f < 0.55 ? "#ffb547" : "#6cf0c2";
        roundRect(bx, top + 22, Math.max(6, bw * f), 6, 3); ctx.fill();
        ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "600 10px system-ui, sans-serif";
        ctx.fillText("FUEL", W / 2, top + 14);
      }
      if (combo > 1 && !dead) {
        ctx.textAlign = "center"; ctx.fillStyle = PINK; ctx.font = "800 16px system-ui, sans-serif";
        ctx.fillText(`COMBO ×${combo}`, W / 2, top + 50);
      }
      // active power timers
      const active = ([["shield", shield, 10], ["focus", focus, 5], ["magnet", magnet, 6]] as const).filter(([, v]) => v > 0);
      active.forEach(([k, v, max], i) => {
        const y = H - 28 - i * 22;
        ctx.textAlign = "left"; ctx.fillStyle = POWER_COLORS[k]; ctx.font = "700 11px system-ui, sans-serif";
        ctx.fillText(POWER_LABEL[k].toUpperCase(), 16, y);
        ctx.fillStyle = "rgba(255,255,255,0.12)"; roundRect(76, y - 8, 70, 5, 2.5); ctx.fill();
        ctx.fillStyle = POWER_COLORS[k]; roundRect(76, y - 8, 70 * (v / max), 5, 2.5); ctx.fill();
      });

      if (intro > 0) {
        ctx.fillStyle = "rgba(11,6,24,0.45)"; ctx.fillRect(0, 0, W, H);
        const n = Math.ceil(intro);
        const k = intro - Math.floor(intro);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillStyle = "#fff"; ctx.font = `800 ${64 + (1 - k) * 20}px system-ui, sans-serif`;
        ctx.fillText(String(n), W / 2, H / 2 - 40);
        ctx.globalAlpha = 1;
        ctx.font = "600 14px system-ui, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fillText("Drag anywhere to steer", W / 2, H / 2 + 20);
        ctx.textBaseline = "alphabetic";
      }
      if (dead) {
        ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "800 22px system-ui, sans-serif";
        ctx.fillText(dead.cause === "fuel" ? "Out of fuel" : "Caught by doubt", W / 2, H / 2);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [topInset]);

  return <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" style={{ touchAction: "none" }} />;
}
