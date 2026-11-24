/**
 * Pooled GPU point particles with per-particle colour, size and alpha.
 * One draw call per system.
 */
import * as THREE from 'three';

const VERT = `
attribute vec3 pcolor;
attribute float palpha;
attribute float psize;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = pcolor;
  vAlpha = palpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
}`;

export interface EmitOptions {
  count: number;
  x: number;
  y: number;
  z?: number;
  color: THREE.Color | THREE.Color[];
  speed?: [number, number];
  /** direction cone: angle in radians (0 = up), spread in radians */
  angle?: number;
  spread?: number;
  life?: [number, number];
  size?: [number, number];
  gravity?: number;
  drag?: number;
  jitter?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private cursor = 0;
  private geo: THREE.BufferGeometry;

  constructor(n: number, map: THREE.Texture, additive: boolean, pixelScale: number) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.baseSize = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -1000;

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8, 0), 1000);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: map }, uScale: { value: pixelScale } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  emit(o: EmitOptions) {
    const colors = Array.isArray(o.color) ? o.color : [o.color];
    const [s0, s1] = o.speed ?? [2, 5];
    const [l0, l1] = o.life ?? [0.4, 0.8];
    const [z0, z1] = o.size ?? [0.25, 0.5];
    const angle = o.angle ?? 0;
    const spread = o.spread ?? Math.PI * 2;
    for (let k = 0; k < o.count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = s0 + Math.random() * (s1 - s0);
      const j = o.jitter ?? 0;
      this.pos[i * 3] = o.x + (Math.random() - 0.5) * j;
      this.pos[i * 3 + 1] = o.y + (Math.random() - 0.5) * j;
      this.pos[i * 3 + 2] = (o.z ?? 0.3) + (Math.random() - 0.5) * 0.4;
      this.vel[i * 3] = Math.sin(a) * sp;
      this.vel[i * 3 + 1] = Math.cos(a) * sp;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * sp * 0.4;
      const c = colors[(Math.random() * colors.length) | 0];
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
      this.maxLife[i] = this.life[i] = l0 + Math.random() * (l1 - l0);
      this.baseSize[i] = z0 + Math.random() * (z1 - z0);
      this.grav[i] = o.gravity ?? 6;
      this.drag[i] = o.drag ?? 1.5;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, t * 1.6);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('pcolor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('palpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('psize') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
