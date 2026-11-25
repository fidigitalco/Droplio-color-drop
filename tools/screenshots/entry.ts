/**
 * Browser harness for App Store screenshots: runs the real GameEngine +
 * GameRenderer (three.js) on a WebGL2 canvas, driven by a simple bot.
 * Bundled by tools/screenshots/render.sh — not part of the app.
 */
import * as THREE from 'three';
import { GameEngine } from '../../src/game/GameEngine';
import { GameRenderer } from '../../src/game/three/GameRenderer';
import { matcap, paintRainbow } from '../../src/game/three/textures';
import * as L from '../../src/data/levels';
import { ballSkin, traySkin, BALL_SKINS, TRAY_SKINS } from '../../src/data/cosmetics';

(globalThis as any).__DEV__ = false;
const G = L.GEOMETRY;

function glFor(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true, alpha: true }) as any;
  gl.endFrameEXP = () => {};
  return gl;
}

function landTime(b: any) {
  const d = b.y - G.trayRimY;
  return d <= 0 ? 0 : d / Math.max(-b.vy, 0.1);
}

export interface GameOpts {
  levelId: number;
  /** stop at the first frame at/after this time that matches the filters below */
  seconds: number;
  viewW: number;
  viewH: number;
  safeTop: number;
  safeBottom?: number;
  hudH: number;
  ball?: string;
  tray?: string;
  minFalling?: number;
  /** balls that must be visible mid-air (not just spawned / about to land) */
  minVisible?: number;
  /** ball kinds that must be visible mid-air (2 golden, 3 rainbow, 4 bomb) */
  needKind?: number[];
}

(window as any).renderGame = (canvas: HTMLCanvasElement, o: GameOpts) => {
  const gl = glFor(canvas);
  const lv = L.LEVELS[o.levelId - 1];
  const e = new GameEngine(lv);
  const r = new GameRenderer(gl, {
    viewW: o.viewW, viewH: o.viewH, safeTop: o.safeTop, safeBottom: o.safeBottom ?? 20, hudH: o.hudH,
    ballSkin: ballSkin(o.ball ?? 'classic'), traySkin: traySkin(o.tray ?? 'classic'),
  });
  e.start();
  const dt = 1 / 60;
  let t = 0;
  let target = 0;
  const TRAY_HALF = L.TRAY_W / 2;
  while (e.phase === 'playing') {
    const falling = e.balls.filter((b) => b.state === 'falling');
    const visible = (b: any) => b.y < G.spawnY - 2 && b.y > G.trayRimY + 4;
    if (t >= o.seconds && falling.length >= (o.minFalling ?? 0) && falling.filter(visible).length >= (o.minVisible ?? 0) &&
      (!o.needKind || o.needKind.every((k) => falling.some((b) => b.kind === k && visible(b))))) break;
    if (t > o.seconds + 60) break;
    const mand = falling.filter((b) => b.kind === 0 || b.kind === 1).map((b) => ({ b, T: landTime(b) })).sort((a, b) => a.T - b.T);
    const opt = falling.filter((b) => b.kind === 2 || b.kind === 3).map((b) => ({ b, T: landTime(b) })).sort((a, b) => a.T - b.T);
    const bombs = falling.filter((b) => b.kind === 4).map((b) => ({ b, T: landTime(b) }));
    let want = target;
    if (mand.length) want = mand[0].b.x - L.COLOR_OFFSET[mand[0].b.color];
    if (opt.length && (!mand.length || mand[0].T > opt[0].T + 0.7)) want = opt[0].b.x;
    const clamp = (v: number) => Math.max(-L.TRAY_C_MAX, Math.min(L.TRAY_C_MAX, v));
    const CLR = TRAY_HALF + G.ballR + 0.3;
    const danger = bombs.filter(({ T }) => T < 1.1).map(({ b, T }) => (b.driftAmp > 0 ? b.baseX + b.driftAmp * Math.sin(b.driftFreq * (b.age + T)) : b.x));
    const safe = (c: number) => danger.every((bx) => Math.abs(bx - c) >= CLR - 0.1);
    want = clamp(want);
    if (!safe(want)) {
      const c2: number[] = [];
      for (const bx of danger) c2.push(clamp(bx - CLR), clamp(bx + CLR));
      const ok = c2.filter(safe).sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
      if (ok.length) want = ok[0];
    }
    const step = 9 * dt;
    target += Math.max(-step, Math.min(step, want - target));
    e.setTrayTarget(target);
    e.update(dt);
    const ev = e.drainEvents();
    if (ev.length) r.handleEvents(ev, e);
    r.sync(e, dt);
    t += dt;
  }
  r.render();
  return {
    level: lv.id, world: lv.world, progress: e.progress, target: lv.target, lives: e.lives, maxLives: lv.lives,
    score: e.score, combo: e.combo, coins: e.coinsEarned, phase: e.phase, stars: e.stars(), t,
    trayPt: r.project(e.trayX, G.trayFloorY, 0),
    handlePt: r.handlePoint(e.trayX),
  };
};

/** One glossy ball with the game's real matcap material, as a PNG data URL. */
let ballR: THREE.WebGLRenderer | null = null;
(window as any).ballURL = (hex: string, style: any, px = 256) => {
  if (!ballR) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    ballR = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    ballR.setClearColor(0x000000, 0);
    ballR.outputColorSpace = THREE.LinearSRGBColorSpace;
  }
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0, 4.0);
  const geo = new THREE.SphereGeometry(1, 64, 48);
  let mat: THREE.Material;
  if (hex === 'rainbow') {
    paintRainbow(geo);
    mat = new THREE.MeshMatcapMaterial({ matcap: matcap('#ffffff', 'glossy', 256), vertexColors: true });
  } else mat = new THREE.MeshMatcapMaterial({ matcap: matcap(hex, style, 256) });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.set(0.5, 0.6, 0.2);
  scene.add(m);
  ballR.render(scene, cam);
  return (ballR.domElement as HTMLCanvasElement).toDataURL('image/png');
};
(window as any).BALL_SKINS = BALL_SKINS;
(window as any).TRAY_SKINS = TRAY_SKINS;
