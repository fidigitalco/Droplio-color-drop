/**
 * Animated 3D backdrop for the home screen: glossy balls floating and
 * bobbing over a soft gradient, slowly drifting through depth.
 */
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import type { BallSkin } from '../../data/cosmetics';
import { createRenderer } from './setup';
import { matcap, paintRainbow, softCircle } from './textures';

interface Floater {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  phase: number;
  speed: number;
  rise: number;
}

export class HomeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private floaters: Floater[] = [];
  private t = 0;
  private gl: ExpoWebGLRenderingContext;
  private halfH: number;

  constructor(gl: ExpoWebGLRenderingContext, skin: BallSkin) {
    this.gl = gl;
    this.renderer = createRenderer(gl);
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 100);
    this.camera.position.set(0, 0, 18);
    this.halfH = Math.tan(THREE.MathUtils.degToRad(20)) * 18;
    const halfW = this.halfH * aspect;

    // gradient backdrop
    const z = -10;
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(20)) * (18 - z) * 1.1;
    const w = h * aspect * 1.1;
    const geo = new THREE.PlaneGeometry(w, h, 1, 8);
    const top = new THREE.Color('#7cc8ff');
    const mid = new THREE.Color('#b9a8ff');
    const bot = new THREE.Color('#ffc3e0');
    const pos = geo.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + h / 2) / h;
      if (t > 0.5) c.copy(mid).lerp(top, (t - 0.5) * 2);
      else c.copy(bot).lerp(mid, t * 2);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const bg = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false }));
    bg.position.z = z;
    bg.renderOrder = -10;
    this.scene.add(bg);

    const sphere = new THREE.SphereGeometry(1, 32, 20);
    const rainbowGeo = new THREE.SphereGeometry(1, 32, 20);
    paintRainbow(rainbowGeo);
    const mats = [
      ...skin.palette.map((p) => new THREE.MeshMatcapMaterial({ matcap: matcap(p, skin.style) })),
      new THREE.MeshMatcapMaterial({ matcap: matcap('#ffc23a', 'metal') }),
    ];
    const rainbowMat = new THREE.MeshMatcapMaterial({ matcap: matcap('#ffffff', 'glossy'), vertexColors: true });

    const count = 16;
    for (let i = 0; i < count; i++) {
      const isRainbow = i === 5 || i === 12;
      const mesh = new THREE.Mesh(isRainbow ? rainbowGeo : sphere, isRainbow ? rainbowMat : mats[i % 3 === 0 && i % 4 === 0 ? 3 : i % 3]);
      const depth = -6 + Math.random() * 9;
      const scale = 0.45 + Math.random() * 0.7;
      mesh.scale.setScalar(scale);
      const spread = 1 + (-depth / 18);
      const base = new THREE.Vector3((Math.random() * 2 - 1) * halfW * spread, (Math.random() * 2 - 1) * this.halfH * spread, depth);
      mesh.position.copy(base);
      this.scene.add(mesh);
      this.floaters.push({ mesh, base, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.6, rise: 0.25 + Math.random() * 0.35 });
    }

    // soft light blooms
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: softCircle(), transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const s = 5 + Math.random() * 6;
      m.scale.set(s, s, 1);
      m.position.set((Math.random() - 0.5) * w * 0.7, (Math.random() - 0.5) * h * 0.7, z + 1);
      this.scene.add(m);
    }
  }

  frame(dt: number) {
    this.t += dt;
    const top = this.halfH * 1.6;
    for (const f of this.floaters) {
      // slow upward drift + bobbing; wrap around when leaving the top
      f.base.y += f.rise * dt;
      if (f.base.y > top) f.base.y = -top;
      f.mesh.position.set(
        f.base.x + Math.sin(this.t * f.speed * 0.6 + f.phase) * 0.35,
        f.base.y + Math.sin(this.t * f.speed + f.phase) * 0.4,
        f.base.z,
      );
    }
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
  }
}
