/**
 * Minimal bridge between expo-gl and three.js (no expo-three dependency).
 */
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

// We work in a plain (non colour-managed) pipeline: colours and textures are
// used exactly as authored. This avoids sRGB texture formats that expo-gl
// does not support on every device.
THREE.ColorManagement.enabled = false;

export function createRenderer(gl: ExpoWebGLRenderingContext): THREE.WebGLRenderer {
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;

  // expo-gl doesn't implement a few WebGL-in-browser-only pixelStorei flags.
  // three sets them to their default (false) values, so skipping is safe and
  // keeps the console clean.
  const g = gl as unknown as WebGLRenderingContext & { pixelStorei: (p: number, v: number | boolean) => void };
  const original = g.pixelStorei.bind(g);
  g.pixelStorei = (pname: number, param: number | boolean) => {
    // 0x9241 UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0x9243 UNPACK_COLORSPACE_CONVERSION_WEBGL
    if (pname === 0x9241 || pname === 0x9243) return;
    original(pname, param as number);
  };

  const canvas = {
    width: w,
    height: h,
    style: {},
    clientWidth: w,
    clientHeight: h,
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: () => gl,
    setAttribute: () => {},
  };

  // Some expo-gl native builds (incl. Expo Go) make the WebGL2 context object
  // inherit from WebGLRenderingContext, which three.js r163+ mistakes for
  // WebGL 1 and rejects. Hide the global during construction only.
  const supportsWebGL2 = (gl as unknown as { supportsWebGL2?: boolean }).supportsWebGL2;
  if (__DEV__) console.log(`[Droplio] expo-gl context: WebGL2=${supportsWebGL2}`);
  const g2 = globalThis as unknown as { WebGLRenderingContext?: unknown };
  const savedCtor = g2.WebGLRenderingContext;
  let renderer: THREE.WebGLRenderer;
  try {
    g2.WebGLRenderingContext = undefined;
    renderer = new THREE.WebGLRenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      context: gl as unknown as WebGL2RenderingContext,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } finally {
    g2.WebGLRenderingContext = savedCtor;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  return renderer;
}
