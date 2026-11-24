/**
 * 3D presentation of the GameEngine state with three.js.
 * Owns all meshes, effects and the camera; contains no game rules.
 */
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { GEOMETRY as G, KIND, TRAY_W } from '../../data/levels';
import type { BallSkin, TraySkin } from '../../data/cosmetics';
import type { Ball, EngineEvent, GameEngine } from '../GameEngine';
import { Particles } from './Particles';
import { createRenderer } from './setup';
import { matcap, paintRainbow, roundedBox, softCircle, sparkle } from './textures';

export interface RendererOptions {
  viewW: number;
  viewH: number;
  safeTop: number;
  safeBottom: number;
  hudH: number;
  ballSkin: BallSkin;
  traySkin: TraySkin;
}

interface BallView {
  group: THREE.Group;
  body: THREE.Mesh;
  shadow: THREE.Mesh;
  extra: THREE.Object3D[];
  glow?: THREE.Mesh;
  lastState: Ball['state'];
  ball: Ball;
}

interface Telegraph {
  mesh: THREE.Mesh;
  t: number;
  lead: number;
  active: boolean;
}

interface Compartment {
  glow: THREE.Mesh;
  glowMat: THREE.MeshBasicMaterial;
  pad: THREE.MeshMatcapMaterial;
  back: THREE.MeshMatcapMaterial;
  flash: number;
  wrong: number;
  color: THREE.Color;
}

const FOV = 36;
const FLOOR_THICK = 0.4;
const DEPTH = 1.5;
const RED_SOFT = new THREE.Color('#ff6b6b');
const WHITE = new THREE.Color('#ffffff');
const GOLD = new THREE.Color('#ffd34d');

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private gl: ExpoWebGLRenderingContext;
  private opts: RendererOptions;

  private ballGeo = new THREE.SphereGeometry(G.ballR, 32, 20);
  private rainbowGeo: THREE.SphereGeometry;
  private ringGeo = new THREE.TorusGeometry(G.ballR * 1.28, 0.055, 8, 36);
  private fuseGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.3, 8);
  private planeGeo = new THREE.PlaneGeometry(1, 1);

  private colorMats: THREE.MeshMatcapMaterial[];
  private goldMat: THREE.MeshMatcapMaterial;
  private bombMat: THREE.MeshMatcapMaterial;
  private rainbowMat: THREE.MeshMatcapMaterial;
  private fuseMat: THREE.MeshMatcapMaterial;
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  private shadowMat: THREE.MeshBasicMaterial;
  private palette: THREE.Color[];

  private tray = new THREE.Group();
  private trayShadow: THREE.Mesh;
  private comps: Compartment[] = [];
  private views = new Map<number, BallView>();
  private telegraphs: Telegraph[] = [];
  private bokeh: { mesh: THREE.Mesh; vx: number; vy: number; phase: number }[] = [];
  private glowP: Particles;
  private sparkP: Particles;
  private confettiP: Particles;

  private time = 0;
  private shake = 0;
  private trayShake = 0;
  private camBase = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  /** screen points per world unit at the tray plane (for 1:1 finger dragging) */
  ptsPerWorld = 1;

  constructor(gl: ExpoWebGLRenderingContext, opts: RendererOptions) {
    this.gl = gl;
    this.opts = opts;
    this.renderer = createRenderer(gl);
    this.renderer.setClearColor(0xb8c8ff, 1);

    this.camera = new THREE.PerspectiveCamera(FOV, opts.viewW / opts.viewH, 1, 200);
    this.fitCamera();

    const skin = opts.ballSkin;
    this.palette = skin.palette.map((c) => new THREE.Color(c));
    this.colorMats = skin.palette.map((c) => new THREE.MeshMatcapMaterial({ matcap: matcap(c, skin.style) }));
    this.goldMat = new THREE.MeshMatcapMaterial({ matcap: matcap('#ffc23a', 'metal') });
    this.bombMat = new THREE.MeshMatcapMaterial({ matcap: matcap('#3b3f5c', 'glossy') });
    this.fuseMat = new THREE.MeshMatcapMaterial({ matcap: matcap('#d9b27c', 'candy') });
    this.rainbowGeo = new THREE.SphereGeometry(G.ballR, 32, 20);
    paintRainbow(this.rainbowGeo);
    this.rainbowMat = new THREE.MeshMatcapMaterial({ matcap: matcap('#ffffff', 'glossy'), vertexColors: true });
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: softCircle(),
      color: 0x3a2a6a,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });

    const pixelScale = gl.drawingBufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    this.glowP = new Particles(260, softCircle(), true, pixelScale);
    this.sparkP = new Particles(160, sparkle(), true, pixelScale);
    this.confettiP = new Particles(220, softCircle(), false, pixelScale);

    this.buildBackground();
    this.buildEmitter();
    this.trayShadow = this.buildTray(opts.traySkin);
    this.scene.add(this.tray, this.glowP.points, this.sparkP.points, this.confettiP.points);
    for (let i = 0; i < 8; i++) this.telegraphs.push(this.makeTelegraph());
  }

  // ----------------------------------------------------------------- camera
  private fitCamera() {
    const { viewW, viewH, safeTop, safeBottom, hudH } = this.opts;
    const aspect = viewW / viewH;
    const fieldTop = G.spawnY + 1.1;
    const fieldBottom = G.trayFloorY - FLOOR_THICK - 0.35;
    const reservedTop = safeTop + hudH;
    const reservedBottom = safeBottom + 6;
    const availFrac = Math.max(0.55, 1 - (reservedTop + reservedBottom) / viewH);
    const visHForField = (fieldTop - fieldBottom) / availFrac;
    const visHForWidth = (G.fieldW + 0.5) / aspect;
    const visH = Math.max(visHForField, visHForWidth);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dist = visH / (2 * tan);
    const worldPerPt = visH / viewH;
    const viewBottom = fieldBottom - reservedBottom * worldPerPt;
    const cy = viewBottom + visH / 2;
    this.camera.position.set(0, cy, dist);
    this.camera.lookAt(0, cy, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.camBase.copy(this.camera.position);
    const a = this.project(0, G.trayFloorY, 0);
    const b = this.project(1, G.trayFloorY, 0);
    this.ptsPerWorld = Math.max(1, b.x - a.x);
  }

  /** World position → screen points (for React Native overlays). */
  project(x: number, y: number, z = 0) {
    this.tmp.set(x, y, z).project(this.camera);
    return { x: ((this.tmp.x + 1) / 2) * this.opts.viewW, y: ((1 - this.tmp.y) / 2) * this.opts.viewH };
  }

  // ------------------------------------------------------------- background
  private buildBackground() {
    const z = -14;
    const d = this.camera.position.z - z;
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 1.1;
    const w = h * this.camera.aspect * 1.1;
    const geo = new THREE.PlaneGeometry(w, h, 1, 8);
    const top = new THREE.Color('#7cc8ff');
    const mid = new THREE.Color('#b9a8ff');
    const bot = new THREE.Color('#ffc3e0');
    const pos = geo.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + h / 2) / h; // 0 bottom .. 1 top
      if (t > 0.5) c.copy(mid).lerp(top, (t - 0.5) * 2);
      else c.copy(bot).lerp(mid, t * 2);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const bg = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false }));
    bg.position.set(0, this.camera.position.y, z);
    bg.renderOrder = -10;
    this.scene.add(bg);

    // soft floating bokeh lights for depth
    const tints = ['#ffffff', '#ffe3f1', '#d9f1ff', '#fff3c4', '#e7dcff'];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(
        this.planeGeo,
        new THREE.MeshBasicMaterial({
          map: softCircle(),
          color: tints[i % tints.length],
          transparent: true,
          opacity: 0.18 + Math.random() * 0.18,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const s = 3 + Math.random() * 6;
      m.scale.set(s, s, 1);
      m.position.set((Math.random() - 0.5) * w * 0.8, this.camera.position.y + (Math.random() - 0.5) * h * 0.8, z + 2);
      m.renderOrder = -9;
      this.scene.add(m);
      this.bokeh.push({ mesh: m, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, phase: Math.random() * 6 });
    }

    // faint glass panel framing the play field
    const panel = new THREE.Mesh(
      roundedBox(G.fieldW + 0.4, G.spawnY + 1.4, 0.1, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    panel.position.set(0, (G.spawnY + 1.4) / 2 - 0.1, -2.6);
    panel.renderOrder = -8;
    this.scene.add(panel);
  }

  private buildEmitter() {
    const bar = new THREE.Mesh(
      roundedBox(G.fieldW + 0.1, 0.5, 0.9, 0.25),
      new THREE.MeshMatcapMaterial({ matcap: matcap('#f3f0ff', 'pearl'), transparent: true, opacity: 0.92 }),
    );
    bar.position.set(0, G.spawnY + 0.78, 0);
    this.scene.add(bar);
  }

  private makeTelegraph(): Telegraph {
    const mesh = new THREE.Mesh(
      this.planeGeo,
      new THREE.MeshBasicMaterial({
        map: softCircle(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    mesh.scale.set(1.8, 1.1, 1);
    mesh.position.z = 0.5;
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    return { mesh, t: 0, lead: 0.4, active: false };
  }

  // ------------------------------------------------------------------- tray
  private buildTray(skin: TraySkin): THREE.Mesh {
    const body = new THREE.MeshMatcapMaterial({ matcap: matcap(skin.body, skin.bodyStyle) });
    const cw = G.compW;
    const wallH = G.trayRimY - G.trayFloorY;

    const base = new THREE.Mesh(roundedBox(TRAY_W + G.wallT + 0.3, FLOOR_THICK, DEPTH + 0.25, 0.2), body);
    base.position.y = G.trayFloorY - FLOOR_THICK / 2;
    this.tray.add(base);

    for (const wx of [-1.5 * cw, -0.5 * cw, 0.5 * cw, 1.5 * cw]) {
      const wall = new THREE.Mesh(roundedBox(G.wallT, wallH + 0.04, DEPTH, 0.075), body);
      wall.position.set(wx, G.trayFloorY + wallH / 2, 0);
      this.tray.add(wall);
    }

    const accent = new THREE.MeshBasicMaterial({ color: skin.accent, transparent: true, opacity: 0.2, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const cx = -cw + i * cw;
      const color = this.palette[i];
      const padMat = new THREE.MeshMatcapMaterial({ matcap: matcap(this.opts.ballSkin.palette[i], 'candy') });
      const pad = new THREE.Mesh(roundedBox(cw - G.wallT - 0.06, 0.12, DEPTH - 0.12, 0.05), padMat);
      pad.position.set(cx, G.trayFloorY + 0.06, 0);
      this.tray.add(pad);

      const backMat = new THREE.MeshMatcapMaterial({ matcap: matcap(this.opts.ballSkin.palette[i], 'glossy') });
      const back = new THREE.Mesh(roundedBox(cw - G.wallT, wallH, 0.1, 0.06), backMat);
      back.position.set(cx, G.trayFloorY + wallH / 2, -DEPTH / 2 + 0.06);
      this.tray.add(back);

      // colored lip along the front rim — clear compartment identity
      const lip = new THREE.Mesh(roundedBox(cw - G.wallT, 0.16, 0.14, 0.06), backMat);
      lip.position.set(cx, G.trayRimY - 0.08, DEPTH / 2 - 0.07);
      this.tray.add(lip);

      const glass = new THREE.Mesh(this.planeGeo, accent);
      glass.scale.set(cw - G.wallT, wallH - 0.16, 1);
      glass.position.set(cx, G.trayFloorY + (wallH - 0.16) / 2, DEPTH / 2 - 0.02);
      glass.renderOrder = 6;
      this.tray.add(glass);

      const glowMat = new THREE.MeshBasicMaterial({
        map: softCircle(),
        color: color.clone(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(this.planeGeo, glowMat);
      glow.scale.set(cw * 2.2, cw * 2.2, 1);
      glow.position.set(cx, G.trayRimY - 0.2, DEPTH / 2 + 0.1);
      glow.renderOrder = 7;
      this.tray.add(glow);

      this.comps.push({ glow, glowMat, pad: padMat, back: backMat, flash: 0, wrong: 0, color });
    }

    const shadow = new THREE.Mesh(this.planeGeo, this.shadowMat.clone());
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.25;
    shadow.scale.set(TRAY_W + 1.6, 1.6, 1);
    shadow.position.set(0.25, G.trayFloorY - 0.55, -2.4);
    shadow.renderOrder = -7;
    this.scene.add(shadow);
    return shadow;
  }

  // ------------------------------------------------------------------ balls
  private createView(b: Ball): BallView {
    const group = new THREE.Group();
    let body: THREE.Mesh;
    const extra: THREE.Object3D[] = [];
    let glow: THREE.Mesh | undefined;

    const glowOf = (color: THREE.ColorRepresentation, s: number, opacity: number) => {
      const m = new THREE.Mesh(
        this.planeGeo,
        new THREE.MeshBasicMaterial({
          map: softCircle(),
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      m.scale.set(s, s, 1);
      m.position.z = -0.45;
      m.renderOrder = 4;
      return m;
    };

    switch (b.kind) {
      case KIND.GOLDEN:
        body = new THREE.Mesh(this.ballGeo, this.goldMat);
        glow = glowOf(GOLD, 2.0, 0.55);
        break;
      case KIND.RAINBOW:
        body = new THREE.Mesh(this.rainbowGeo, this.rainbowMat);
        glow = glowOf(WHITE, 2.0, 0.45);
        break;
      case KIND.BOMB: {
        body = new THREE.Mesh(this.ballGeo, this.bombMat);
        const fuse = new THREE.Mesh(this.fuseGeo, this.fuseMat);
        fuse.position.set(0.1, G.ballR + 0.08, 0);
        fuse.rotation.z = -0.35;
        body.add(fuse);
        const spark = glowOf('#ffb03a', 0.55, 1);
        spark.position.set(0.17, G.ballR + 0.26, 0.2);
        spark.renderOrder = 8;
        body.add(spark);
        extra.push(spark);
        glow = glowOf('#ff3b3b', 2.2, 0.35);
        break;
      }
      default: {
        body = new THREE.Mesh(this.ballGeo, this.colorMats[b.color]);
        if (b.kind === KIND.SLOW) {
          const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
          ring.rotation.x = 1.2;
          group.add(ring);
          extra.push(ring);
        }
      }
    }
    group.add(body);
    if (glow) group.add(glow);

    const shadow = new THREE.Mesh(this.planeGeo, this.shadowMat);
    shadow.scale.set(G.ballR * 3, G.ballR * 3, 1);
    shadow.renderOrder = -6;
    this.scene.add(shadow);

    group.scale.setScalar(0.01);
    this.scene.add(group);
    return { group, body, shadow, extra, glow, lastState: b.state, ball: b };
  }

  private removeView(v: BallView) {
    this.scene.remove(v.group);
    this.scene.remove(v.shadow);
    if (v.glow) (v.glow.material as THREE.Material).dispose();
    for (const e of v.extra) {
      if (e instanceof THREE.Mesh && e.material !== this.ringMat) (e.material as THREE.Material).dispose();
    }
  }

  private ballColor(b: Ball): THREE.Color | THREE.Color[] {
    if (b.kind === KIND.GOLDEN) return GOLD;
    if (b.kind === KIND.RAINBOW) return this.palette;
    if (b.kind === KIND.BOMB) return new THREE.Color('#5b5f7a');
    return this.palette[b.color];
  }

  // ----------------------------------------------------------------- events
  handleEvents(events: EngineEvent[], engine: GameEngine) {
    for (const e of events) {
      switch (e.type) {
        case 'telegraph': {
          const t = this.telegraphs.find((x) => !x.active) ?? this.telegraphs[0];
          t.active = true;
          t.t = 0;
          t.lead = e.lead;
          t.mesh.position.set(e.x, G.spawnY + 0.35, 0.5);
          const col =
            e.kind === KIND.BOMB ? RED_SOFT : e.kind === KIND.GOLDEN ? GOLD : e.kind === KIND.RAINBOW ? WHITE : this.palette[e.color];
          (t.mesh.material as THREE.MeshBasicMaterial).color.copy(col);
          break;
        }
        case 'catch':
        case 'rainbow':
        case 'golden': {
          const comp = e.type === 'golden' ? e.ball.comp : e.comp;
          const cx = engine.trayX + (comp - 1) * G.compW;
          const color = this.ballColor(e.ball);
          this.glowP.emit({ count: 14, x: cx, y: G.trayRimY, color, speed: [2, 5], angle: 0, spread: 1.6, life: [0.35, 0.7], size: [0.5, 0.9], gravity: 4 });
          this.sparkP.emit({ count: e.type === 'catch' ? 6 : 14, x: cx, y: G.trayRimY + 0.2, color: [WHITE, ...(Array.isArray(color) ? color : [color])], speed: [3, 7], angle: 0, spread: 1.9, life: [0.4, 0.8], size: [0.35, 0.6], gravity: 3 });
          const c = this.comps[comp];
          if (c) {
            c.flash = 1;
            c.wrong = 0;
          }
          break;
        }
        case 'wrong': {
          const cx = engine.trayX + (e.comp - 1) * G.compW;
          this.glowP.emit({ count: 10, x: cx, y: G.trayRimY, color: RED_SOFT, speed: [1, 3], angle: 0, spread: 2.4, life: [0.3, 0.55], size: [0.4, 0.7], gravity: 1 });
          const c = this.comps[e.comp];
          if (c) c.wrong = 1;
          this.trayShake = 1;
          break;
        }
        case 'bomb': {
          const { x, y } = e.ball;
          this.glowP.emit({ count: 30, x, y, color: [new THREE.Color('#ffb347'), new THREE.Color('#ff5e3a'), WHITE], speed: [3, 9], life: [0.3, 0.7], size: [0.6, 1.2], gravity: 2 });
          this.confettiP.emit({ count: 24, x, y, color: [new THREE.Color('#4a4a66'), new THREE.Color('#77789a')], speed: [1, 4], life: [0.6, 1.1], size: [0.6, 1.1], gravity: -1.5, drag: 2.5 });
          this.shake = 1;
          for (const c of this.comps) c.wrong = 0.8;
          break;
        }
        case 'miss': {
          if (e.ball.kind === KIND.NORMAL || e.ball.kind === KIND.SLOW) {
            this.glowP.emit({ count: 6, x: e.ball.x, y: G.trayFloorY - 0.4, color: RED_SOFT, speed: [0.5, 2], life: [0.3, 0.5], size: [0.4, 0.6], gravity: 0 });
          }
          break;
        }
        case 'won': {
          const cols = [...this.palette, GOLD, WHITE];
          for (let i = 0; i < 5; i++) {
            this.confettiP.emit({ count: 26, x: -3.6 + i * 1.8, y: G.spawnY - 2, color: cols, speed: [2, 6], angle: Math.PI, spread: 2.2, life: [1.2, 2.2], size: [0.3, 0.55], gravity: 4, drag: 1.2 });
          }
          this.sparkP.emit({ count: 40, x: engine.trayX, y: G.trayRimY + 1, color: cols, speed: [4, 9], angle: 0, spread: 2.5, life: [0.6, 1.2], size: [0.4, 0.8], gravity: 5 });
          break;
        }
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------- frame
  sync(engine: GameEngine, dt: number) {
    this.time += dt;

    // tray
    const shakeX = this.trayShake > 0 ? Math.sin(this.time * 55) * 0.09 * this.trayShake : 0;
    this.trayShake = Math.max(0, this.trayShake - dt * 3.5);
    this.tray.position.x = engine.trayX + shakeX;
    this.trayShadow.position.x = engine.trayX + 0.25;

    for (const c of this.comps) {
      c.flash = Math.max(0, c.flash - dt * 2.6);
      c.wrong = Math.max(0, c.wrong - dt * 2.2);
      const k = 1 + c.flash * 0.55;
      c.pad.color.setRGB(k, k, k);
      c.back.color.setRGB(k, k, k);
      if (c.wrong > 0.01) {
        c.glowMat.color.copy(RED_SOFT);
        c.glowMat.opacity = c.wrong * 0.65;
      } else {
        c.glowMat.color.copy(c.color);
        c.glowMat.opacity = c.flash * 0.9;
      }
    }

    // balls
    const seen = new Set<number>();
    for (const b of engine.balls) {
      seen.add(b.id);
      let v = this.views.get(b.id);
      if (!v) {
        v = this.createView(b);
        this.views.set(b.id, v);
      }
      v.lastState = b.state;
      const x = b.state === 'caught' ? engine.trayX + b.localX : b.x;
      v.group.position.set(x, b.y, 0);

      let s = 1;
      if (b.age < 0.18 && b.state === 'falling') {
        const t = b.age / 0.18;
        s = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2); // ease-out-back
      }
      if (b.state === 'caught' && b.t2 > 0.5) s = Math.max(0, 1 - (b.t2 - 0.5) / 0.4);
      v.group.scale.setScalar(Math.max(0.01, s));

      v.body.rotation.z += b.spin * dt;
      if (b.kind === KIND.SLOW && v.extra[0]) v.extra[0].rotation.z += dt * 2.5;
      if (b.kind === KIND.BOMB) {
        const spark = v.extra[0];
        if (spark) spark.scale.setScalar(0.45 + Math.random() * 0.35);
        if (v.glow) (v.glow.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.2 * Math.sin(this.time * 10);
      }
      if (b.kind === KIND.GOLDEN && v.glow) {
        (v.glow.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.15 * Math.sin(this.time * 6);
        if (Math.random() < dt * 8) {
          this.sparkP.emit({ count: 1, x: x + (Math.random() - 0.5) * 0.8, y: b.y + (Math.random() - 0.5) * 0.8, color: GOLD, speed: [0.2, 0.6], life: [0.3, 0.5], size: [0.25, 0.4], gravity: 0, z: 0.5 });
        }
      }

      // blob shadow cast onto the glass panel behind the field
      v.shadow.position.set(x + 0.25, b.y - 0.3, -2.45);
      v.shadow.scale.setScalar(G.ballR * 3 * s);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        if (v.lastState === 'falling' && v.ball.kind !== KIND.BOMB) {
          // popped (level ended / continue cleared the sky)
          this.glowP.emit({ count: 8, x: v.group.position.x, y: v.group.position.y, color: this.ballColor(v.ball), speed: [1, 3], life: [0.3, 0.5], size: [0.4, 0.7], gravity: 0 });
        }
        this.removeView(v);
        this.views.delete(id);
      }
    }

    // telegraphs
    for (const t of this.telegraphs) {
      if (!t.active) continue;
      t.t += dt;
      const m = t.mesh.material as THREE.MeshBasicMaterial;
      if (t.t < t.lead) m.opacity = (t.t / t.lead) * 0.85;
      else m.opacity = Math.max(0, 0.85 - ((t.t - t.lead) / 0.3) * 0.85);
      if (t.t > t.lead + 0.3) {
        t.active = false;
        m.opacity = 0;
      }
    }

    // ambient
    for (const bk of this.bokeh) {
      bk.mesh.position.x += bk.vx * dt;
      bk.mesh.position.y += bk.vy * dt + Math.sin(this.time * 0.3 + bk.phase) * 0.002;
    }

    this.glowP.update(dt);
    this.sparkP.update(dt);
    this.confettiP.update(dt);

    // gentle camera shake on bombs only
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3);
      const a = this.shake * 0.12;
      this.camera.position.set(this.camBase.x + (Math.random() - 0.5) * a, this.camBase.y + (Math.random() - 0.5) * a, this.camBase.z);
    } else {
      this.camera.position.copy(this.camBase);
    }
  }

  /** Remove every ball view (used on restart / next level with a fresh engine). */
  clearBalls() {
    for (const v of this.views.values()) this.removeView(v);
    this.views.clear();
    for (const t of this.telegraphs) {
      t.active = false;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
  }

  dispose() {
    for (const v of this.views.values()) this.removeView(v);
    this.views.clear();
    this.glowP.dispose();
    this.sparkP.dispose();
    this.confettiP.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    this.renderer.dispose();
  }
}
