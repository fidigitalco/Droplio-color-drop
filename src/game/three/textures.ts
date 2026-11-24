/**
 * Procedural textures. Matcaps give every object a glossy, studio-lit,
 * "premium casual" look with reflections and rim light, at the cost of a
 * single texture lookup per pixel — ideal for 60 FPS on phones.
 */
import * as THREE from 'three';
import type { MatcapStyle } from '../../data/cosmetics';

const cache = new Map<string, THREE.DataTexture>();

function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

function makeTexture(size: number, fill: (u: number, v: number, out: number[]) => void): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const px = [0, 0, 0, 1];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = ((i + 0.5) / size) * 2 - 1;
      const v = ((j + 0.5) / size) * 2 - 1;
      px[0] = px[1] = px[2] = 0;
      px[3] = 1;
      fill(u, v, px);
      const o = (j * size + i) * 4;
      data[o] = clamp01(px[0]) * 255;
      data[o + 1] = clamp01(px[1]) * 255;
      data[o + 2] = clamp01(px[2]) * 255;
      data[o + 3] = clamp01(px[3]) * 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const L = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();
const L2 = new THREE.Vector3(0.6, -0.2, 0.75).normalize();
const H1 = L.clone().add(new THREE.Vector3(0, 0, 1)).normalize();
const H2 = L2.clone().add(new THREE.Vector3(0, 0, 1)).normalize();

/**
 * Generates a matcap: a picture of a lit sphere. `v` grows upward because
 * DataTexture rows start at the bottom, matching matcap UV conventions.
 */
export function matcap(hex: string, style: MatcapStyle = 'glossy', size = 128): THREE.DataTexture {
  const key = `${hex}|${style}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [r, g, b] = hexToRgb(hex);
  const tex = makeTexture(size, (u, v, out) => {
    const d2 = u * u + v * v;
    if (d2 > 1) {
      // outside the sphere: replicate edge colour to avoid dark fringes
      const k = 1 / Math.sqrt(d2);
      u *= k * 0.999;
      v *= k * 0.999;
    }
    const nz = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const ndl = Math.max(0, u * L.x + v * L.y + nz * L.z);
    const ndl2 = Math.max(0, u * L2.x + v * L2.y + nz * L2.z);
    const nh = Math.max(0, u * H1.x + v * H1.y + nz * H1.z);
    const nh2 = Math.max(0, u * H2.x + v * H2.y + nz * H2.z);
    const rim = Math.pow(1 - nz, 2.2);
    const sky = 0.5 + 0.5 * v; // environment: brighter from above

    let cr = 0, cg = 0, cb = 0;
    switch (style) {
      case 'glossy': {
        const shade = 0.42 + 0.62 * ndl + 0.12 * ndl2 + 0.1 * sky;
        const spec = Math.pow(nh, 90) * 1.1 + Math.pow(nh, 18) * 0.22 + Math.pow(nh2, 40) * 0.25;
        cr = r * shade + spec + rim * (0.25 + r * 0.25);
        cg = g * shade + spec + rim * (0.25 + g * 0.25);
        cb = b * shade + spec + rim * (0.3 + b * 0.25);
        break;
      }
      case 'candy': {
        const shade = 0.58 + 0.45 * ndl + 0.12 * sky;
        const spec = smooth(0.93, 0.975, nh) * 0.85 + Math.pow(nh, 12) * 0.15;
        cr = r * shade + spec + rim * 0.18;
        cg = g * shade + spec + rim * 0.18;
        cb = b * shade + spec + rim * 0.22;
        break;
      }
      case 'metal': {
        // studio reflection: bright sky band, dark horizon, warm floor bounce
        const band = smooth(-0.05, 0.25, v) * 0.9 + 0.15 - smooth(-0.15, 0.05, v) * 0.1;
        const floor = smooth(-0.2, -0.9, v) * 0.35;
        const spec = Math.pow(nh, 140) * 1.4 + Math.pow(nh2, 60) * 0.5;
        const k = 0.25 + band + floor;
        cr = r * k + spec + rim * 0.2;
        cg = g * k + spec + rim * 0.2;
        cb = b * k + spec + rim * 0.2;
        break;
      }
      case 'glass': {
        const body = 0.35 + 0.25 * (1 - nz);
        const caustic = smooth(-0.2, -0.85, v) * nz * 0.6;
        const spec = Math.pow(nh, 160) * 1.5 + smooth(0.86, 0.9, rim) * 0.2;
        cr = r * (body + caustic) + spec + rim * 0.9 * (0.6 + r * 0.4);
        cg = g * (body + caustic) + spec + rim * 0.9 * (0.6 + g * 0.4);
        cb = b * (body + caustic) + spec + rim * 0.9 * (0.6 + b * 0.4);
        break;
      }
      case 'pearl': {
        const shade = 0.62 + 0.38 * ndl + 0.1 * sky;
        const [ir, ig, ib] = hsv((0.55 + (1 - nz) * 0.6 + u * 0.1) % 1, 0.25, 1);
        const spec = Math.pow(nh, 40) * 0.55;
        const irid = rim * 0.55;
        cr = r * shade * (1 - irid) + ir * irid + spec;
        cg = g * shade * (1 - irid) + ig * irid + spec;
        cb = b * shade * (1 - irid) + ib * irid + spec;
        break;
      }
    }
    out[0] = cr;
    out[1] = cg;
    out[2] = cb;
  });
  cache.set(key, tex);
  return tex;
}

/** Soft radial dot used for particles, glows, bokeh and blob shadows. */
let softDot: THREE.DataTexture | null = null;
export function softCircle(): THREE.DataTexture {
  if (softDot) return softDot;
  softDot = makeTexture(64, (u, v, out) => {
    const d = Math.sqrt(u * u + v * v);
    const a = Math.pow(clamp01(1 - d), 1.8);
    out[0] = out[1] = out[2] = 1;
    out[3] = a;
  });
  return softDot;
}

/** Sparkle star for particles. */
let star: THREE.DataTexture | null = null;
export function sparkle(): THREE.DataTexture {
  if (star) return star;
  star = makeTexture(64, (u, v, out) => {
    const d = Math.sqrt(u * u + v * v);
    const cross = Math.max(0, 1 - Math.abs(u) * 9) * Math.max(0, 1 - Math.abs(v) * 1.3) +
      Math.max(0, 1 - Math.abs(v) * 9) * Math.max(0, 1 - Math.abs(u) * 1.3);
    const core = Math.pow(clamp01(1 - d * 1.6), 2);
    out[0] = out[1] = out[2] = 1;
    out[3] = clamp01(core + cross * 0.8);
  });
  return star;
}

/** Vertex colours for a rainbow-striped sphere. */
export function paintRainbow(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
  const h = box.max.y - box.min.y;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - box.min.y) / h;
    const ang = Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2);
    const [r, g, b] = hsv((t * 0.85 + ang * 0.15 + 1) % 1, 0.75, 1);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Rounded-rectangle extrusion: soft, toy-like slabs for the tray. */
export function roundedBox(wOuter: number, hOuter: number, depth: number, radius: number): THREE.BufferGeometry {
  // the bevel grows the shape outward, so build the inner shape smaller
  const bevel0 = Math.min(radius * 0.8, depth * 0.2, wOuter * 0.3, hOuter * 0.3);
  const bs = bevel0 * 0.9;
  const w = wOuter - 2 * bs;
  const h = hOuter - 2 * bs;
  const r = Math.max(0.001, Math.min(radius - bs, w / 2 - 0.001, h / 2 - 0.001));
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const bevel = bevel0;
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bs,
    bevelSegments: 3,
    curveSegments: 6,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  geo.computeVertexNormals();
  return geo;
}
