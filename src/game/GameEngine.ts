/**
 * Pure gameplay logic + lightweight 2D rigid-body physics on the play plane.
 * Knows nothing about rendering, React or audio: it emits events that the
 * presentation layer (GameRenderer / GameScreen) reacts to.
 *
 * Coordinates are world units shared with tools/generate_levels.py:
 *   x ∈ [-fieldW/2, fieldW/2], y up, tray at the bottom, balls spawn at spawnY.
 */
import {
  COLOR_OFFSET,
  GEOMETRY as G,
  KIND,
  TRAY_C_MAX,
  TRAY_W,
  type BallKind,
  type LevelConfig,
} from '../data/levels';

export type BallState = 'falling' | 'caught' | 'missed' | 'gone';

export interface Ball {
  id: number;
  kind: BallKind;
  color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  vmax: number;
  age: number;
  baseX: number;
  driftAmp: number;
  driftFreq: number;
  state: BallState;
  /** when caught: compartment index and tray-local x */
  comp: number;
  localX: number;
  /** seconds since caught/missed (for fade-out) */
  t2: number;
  correct: boolean;
  spin: number;
}

export type EngineEvent =
  | { type: 'spawn'; ball: Ball }
  | { type: 'catch'; ball: Ball; comp: number; points: number; combo: number }
  | { type: 'wrong'; ball: Ball; comp: number }
  | { type: 'miss'; ball: Ball }
  | { type: 'bomb'; ball: Ball }
  | { type: 'golden'; ball: Ball; coins: number }
  | { type: 'rainbow'; ball: Ball; comp: number; points: number }
  | { type: 'bounce'; ball: Ball; strength: number }
  | { type: 'telegraph'; x: number; color: number; kind: BallKind; lead: number }
  | { type: 'won' }
  | { type: 'lost' };

export type Phase = 'ready' | 'playing' | 'won' | 'lost';

const R = G.ballR;
const HALF_W = G.fieldW / 2;
const WALL_H = G.trayRimY - G.trayFloorY;
const FLOOR_THICK = 0.4;
const RESTITUTION = 0.42;
const TELEGRAPH_LEAD = 0.45;
const GOLDEN_COINS = 3;

/** Axis-aligned rectangle in tray-local coordinates. */
interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function trayRects(): Rect[] {
  const cw = G.compW;
  const t = G.wallT;
  const rects: Rect[] = [];
  for (const wx of [-1.5 * cw, -0.5 * cw, 0.5 * cw, 1.5 * cw]) {
    rects.push({ x0: wx - t / 2, x1: wx + t / 2, y0: G.trayFloorY, y1: G.trayRimY });
  }
  rects.push({ x0: -TRAY_W / 2 - t / 2, x1: TRAY_W / 2 + t / 2, y0: G.trayFloorY - FLOOR_THICK, y1: G.trayFloorY });
  return rects;
}

export class GameEngine {
  readonly level: LevelConfig;
  phase: Phase = 'ready';
  balls: Ball[] = [];
  events: EngineEvent[] = [];

  trayX = 0;
  trayTarget = 0;
  trayVX = 0;

  progress = 0;
  lives: number;
  mistakes = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  goldenCaught = 0;
  rainbowCaught = 0;
  coinsEarned = 0;
  continuesUsed = 0;
  elapsed = 0;

  private seqT = 0;
  private seqIdx = 0;
  private teleIdx = 0;
  private nextId = 1;
  private rects = trayRects();
  private graceT = 0;

  constructor(level: LevelConfig) {
    this.level = level;
    this.lives = level.lives;
  }

  start() {
    if (this.phase === 'ready') this.phase = 'playing';
  }

  /** Tray input: desired tray centre (already in world units). */
  setTrayTarget(x: number) {
    this.trayTarget = Math.max(-TRAY_C_MAX, Math.min(TRAY_C_MAX, x));
  }

  drainEvents(): EngineEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  bonusLifeUsed = false;

  /** Rewarded bonus (from the pause menu): +1 life, once per attempt. */
  addBonusLife(): boolean {
    if (this.phase !== 'playing' || this.bonusLifeUsed) return false;
    this.bonusLifeUsed = true;
    this.lives++;
    return true;
  }

  /** Rewarded continue: one extra life, clear the air, short grace period. */
  continueWithExtraLife() {
    if (this.phase !== 'lost') return;
    this.lives = 1;
    this.continuesUsed++;
    for (const b of this.balls) if (b.state === 'falling') b.state = 'gone';
    this.graceT = 1.5;
    this.phase = 'playing';
  }

  /** Move only the tray (used while the game is frozen behind an overlay). */
  updateTrayOnly(dtRaw: number) {
    this.updateTray(Math.min(dtRaw, 1 / 30));
  }

  update(dtRaw: number) {
    const dt = Math.min(dtRaw, 1 / 30);
    this.updateTray(dt);
    if (this.phase === 'playing') {
      this.elapsed += dt;
      if (this.graceT > 0) this.graceT -= dt;
      else this.spawnDue(dt);
    }
    this.stepBalls(dt);
  }

  // ------------------------------------------------------------------ tray
  private updateTray(dt: number) {
    const prev = this.trayX;
    // Critically-damped follow: very responsive, but no jitter from touch noise.
    const k = 1 - Math.exp(-dt * 38);
    this.trayX += (this.trayTarget - this.trayX) * k;
    if (Math.abs(this.trayTarget - this.trayX) < 0.0005) this.trayX = this.trayTarget;
    this.trayVX = dt > 0 ? (this.trayX - prev) / dt : 0;
  }

  // --------------------------------------------------------------- spawning
  private spawnDue(dt: number) {
    this.seqT += dt;
    const seq = this.level.balls;
    // Telegraph: a soft glow at the emitter shortly before each spawn.
    while (true) {
      const ti = this.teleIdx % seq.length;
      const off = Math.floor(this.teleIdx / seq.length) * this.level.loopAfter;
      const s = seq[ti];
      if (s[0] + off - TELEGRAPH_LEAD > this.seqT) break;
      this.events.push({ type: 'telegraph', x: s[3], color: s[2], kind: s[1], lead: TELEGRAPH_LEAD });
      this.teleIdx++;
    }
    while (true) {
      // After the scripted sequence ends (only possible after continues) it loops seamlessly.
      const s = seq[this.seqIdx % seq.length];
      const off = Math.floor(this.seqIdx / seq.length) * this.level.loopAfter;
      if (s[0] + off > this.seqT) break;
      this.spawn(s[1], s[2], s[3], s[4], s[5], s[6]);
      this.seqIdx++;
    }
  }

  private spawn(kind: BallKind, color: number, x: number, speedMul: number, amp: number, freq: number) {
    const vmax = this.level.fallSpeed * speedMul;
    const b: Ball = {
      id: this.nextId++,
      kind,
      color,
      x,
      y: G.spawnY,
      vx: 0,
      vy: -vmax * G.startSpeedFactor,
      vmax,
      age: 0,
      baseX: x,
      driftAmp: amp,
      driftFreq: freq,
      state: 'falling',
      comp: -1,
      localX: 0,
      t2: 0,
      correct: false,
      spin: (Math.random() - 0.5) * 4,
    };
    this.balls.push(b);
    this.events.push({ type: 'spawn', ball: b });
  }

  // ---------------------------------------------------------------- physics
  private stepBalls(dt: number) {
    // Sub-step when the tray moves fast so it can never tunnel through a ball.
    const trayMove = Math.abs(this.trayVX * dt);
    const steps = Math.min(8, Math.max(1, Math.ceil(trayMove / (R * 0.5))));
    const h = dt / steps;
    const trayStart = this.trayX - this.trayVX * dt;

    for (let s = 1; s <= steps; s++) {
      const trayX = trayStart + this.trayVX * h * s;
      for (const b of this.balls) {
        if (b.state === 'falling') this.stepFalling(b, h, trayX);
      }
    }
    for (const b of this.balls) {
      if (b.state === 'caught') this.stepCaught(b, dt);
      else if (b.state === 'missed') {
        b.t2 += dt;
        b.vy -= G.gravity * dt;
        b.y += b.vy * dt;
        b.x += b.vx * dt;
        if (b.t2 > 1.2) b.state = 'gone';
      }
    }
    this.balls = this.balls.filter((b) => b.state !== 'gone');
  }

  private stepFalling(b: Ball, h: number, trayX: number) {
    b.age += h;
    // Natural fall: gravity accelerates the ball up to the level's terminal speed.
    const speed = Math.min(b.vmax, -b.vy + G.gravity * h);
    b.vy = -speed;
    if (b.driftAmp > 0) {
      const nx = b.baseX + b.driftAmp * Math.sin(b.driftFreq * b.age);
      b.vx = (nx - b.x) / h;
      b.x = nx;
    } else {
      b.vx *= Math.exp(-0.6 * h);
      b.x += b.vx * h;
      b.baseX = b.x;
    }
    b.y += b.vy * h;

    // Side walls of the play field.
    if (b.x < -HALF_W + R) {
      b.x = -HALF_W + R;
      b.vx = Math.abs(b.vx) * RESTITUTION;
    } else if (b.x > HALF_W - R) {
      b.x = HALF_W - R;
      b.vx = -Math.abs(b.vx) * RESTITUTION;
    }

    // Collisions with tray walls/floor (in tray-local space).
    const lx = b.x - trayX;
    if (Math.abs(lx) < TRAY_W / 2 + R + G.wallT && b.y < G.trayRimY + R && b.y > G.trayFloorY - FLOOR_THICK - R) {
      for (const r of this.rects) {
        if (this.collideRect(b, r, trayX)) {
          if (b.kind === KIND.BOMB) {
            this.explodeBomb(b);
            return;
          }
        }
      }
    }

    // Entered a compartment?
    const lx2 = b.x - trayX;
    if (b.y < G.trayRimY - R * 0.35 && b.y > G.trayFloorY - 0.1 && Math.abs(lx2) < TRAY_W / 2) {
      const comp = Math.max(0, Math.min(2, Math.floor((lx2 + TRAY_W / 2) / G.compW)));
      if (b.kind === KIND.BOMB) {
        this.explodeBomb(b);
        return;
      }
      this.resolveCatch(b, comp, trayX);
      return;
    }

    // Fell past the tray.
    if (b.y < G.trayFloorY - FLOOR_THICK - 0.6) {
      b.state = 'missed';
      b.t2 = 0;
      if (b.kind === KIND.NORMAL || b.kind === KIND.SLOW) {
        this.loseLife();
        this.combo = 0;
      }
      this.events.push({ type: 'miss', ball: b });
    }
  }

  /** Circle vs. moving AABB. Returns true on contact. */
  private collideRect(b: Ball, r: Rect, trayX: number): boolean {
    const x0 = r.x0 + trayX;
    const x1 = r.x1 + trayX;
    const cx = Math.max(x0, Math.min(b.x, x1));
    const cy = Math.max(r.y0, Math.min(b.y, r.y1));
    let dx = b.x - cx;
    let dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return false;
    let d = Math.sqrt(d2);
    if (d < 1e-5) {
      // centre inside the rect: push out upward
      dx = 0;
      dy = 1;
      d = 0;
    } else {
      dx /= d;
      dy /= d;
    }
    const pen = R - d;
    b.x += dx * pen;
    b.y += dy * pen;
    // relative velocity against the (kinematic) tray
    const rvx = b.vx - this.trayVX;
    const rvy = b.vy;
    const vn = rvx * dx + rvy * dy;
    if (vn < 0) {
      const strength = -vn;
      const nvx = rvx - (1 + RESTITUTION) * vn * dx;
      const nvy = rvy - (1 + RESTITUTION) * vn * dy;
      b.vx = nvx * 0.98 + this.trayVX;
      b.vy = nvy;
      // A ball perfectly balanced on a wall top gets a tiny nudge so it never sticks.
      if (dy > 0.95 && Math.abs(b.vx - this.trayVX) < 0.3) {
        const centre = (x0 + x1) / 2;
        b.vx += (b.x >= centre ? 1 : -1) * 1.6;
      }
      if (strength > 1.5) this.events.push({ type: 'bounce', ball: b, strength });
    }
    return true;
  }

  private resolveCatch(b: Ball, comp: number, trayX: number) {
    b.state = 'caught';
    b.comp = comp;
    b.localX = b.x - trayX;
    b.t2 = 0;
    b.vx -= this.trayVX;

    if (b.kind === KIND.GOLDEN) {
      b.correct = true;
      this.goldenCaught++;
      this.coinsEarned += GOLDEN_COINS;
      this.score += 25;
      this.events.push({ type: 'golden', ball: b, coins: GOLDEN_COINS });
      return;
    }
    if (b.kind === KIND.RAINBOW) {
      b.correct = true;
      this.rainbowCaught++;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const points = 30;
      this.score += points;
      this.addProgress();
      this.events.push({ type: 'rainbow', ball: b, comp, points });
      return;
    }
    if (b.color === comp) {
      b.correct = true;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const points = 10 + Math.min(40, Math.floor(this.combo / 5) * 5);
      this.score += points;
      this.events.push({ type: 'catch', ball: b, comp, points, combo: this.combo });
      this.addProgress();
    } else {
      b.correct = false;
      this.combo = 0;
      this.events.push({ type: 'wrong', ball: b, comp });
      this.loseLife();
    }
  }

  private stepCaught(b: Ball, dt: number) {
    b.t2 += dt;
    // Bounce inside the compartment (tray-local), walls keep it in.
    const cw = G.compW;
    const left = -1.5 * cw + b.comp * cw + G.wallT / 2 + R;
    const right = left + cw - G.wallT - 2 * R;
    b.vy -= G.gravity * dt;
    b.localX += b.vx * dt;
    b.y += b.vy * dt;
    if (b.localX < left) {
      b.localX = left;
      b.vx = Math.abs(b.vx) * RESTITUTION;
    } else if (b.localX > right) {
      b.localX = right;
      b.vx = -Math.abs(b.vx) * RESTITUTION;
    }
    const floor = G.trayFloorY + R;
    if (b.y < floor) {
      b.y = floor;
      if (Math.abs(b.vy) > 1.2) {
        b.vy = -b.vy * RESTITUTION;
        b.vx *= 0.8;
      } else {
        b.vy = 0;
        b.vx *= 0.9;
      }
    }
    // keep the tray tidy: absorbed after a short moment
    if (b.t2 > 0.9) b.state = 'gone';
  }

  private explodeBomb(b: Ball) {
    b.state = 'gone';
    this.combo = 0;
    this.events.push({ type: 'bomb', ball: b });
    this.loseLife();
  }

  private addProgress() {
    if (this.phase !== 'playing') return;
    this.progress++;
    if (this.progress >= this.level.target) {
      this.phase = 'won';
      // remaining falling balls politely pop away
      for (const x of this.balls) if (x.state === 'falling') x.state = 'gone';
      this.events.push({ type: 'won' });
    }
  }

  private loseLife() {
    if (this.phase !== 'playing') return;
    this.mistakes++;
    this.lives--;
    if (this.lives <= 0) {
      this.lives = 0;
      this.phase = 'lost';
      for (const x of this.balls) if (x.state === 'falling') x.state = 'gone';
      this.events.push({ type: 'lost' });
    }
  }

  // ------------------------------------------------------------ results
  stars(): number {
    if (this.phase !== 'won') return 0;
    if (this.mistakes === 0 && this.continuesUsed === 0) return 3;
    if (this.mistakes <= 1 && this.continuesUsed === 0) return 2;
    return 1;
  }

  bonusAchieved(): boolean {
    const b = this.level.bonus;
    switch (b.type) {
      case 'perfect':
        return this.mistakes === 0;
      case 'golden':
        return this.goldenCaught >= b.count;
      case 'combo':
        return this.bestCombo >= b.count;
      case 'rainbow':
        return this.rainbowCaught >= b.count;
    }
  }
}

export function compartmentWorldX(trayX: number, comp: number) {
  return trayX + COLOR_OFFSET[comp];
}
