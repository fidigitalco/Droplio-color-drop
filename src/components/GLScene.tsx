/**
 * GLView wrapper that runs a requestAnimationFrame loop and guarantees the
 * loop stops before the GL context is torn down.
 */
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

export interface SceneHandle {
  frame: (dt: number) => void;
  dispose: () => void;
}

export function GLScene({
  create,
  style,
}: {
  create: (gl: ExpoWebGLRenderingContext) => SceneHandle;
  style?: StyleProp<ViewStyle>;
}) {
  const alive = useRef(true);
  const raf = useRef<number | null>(null);
  const handle = useRef<SceneHandle | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (raf.current != null) cancelAnimationFrame(raf.current);
      try {
        handle.current?.dispose();
      } catch {
        /* context may already be gone */
      }
      handle.current = null;
    };
  }, []);

  return (
    <GLView
      style={style ?? StyleSheet.absoluteFill}
      msaaSamples={4}
      onContextCreate={(gl) => {
        if (!alive.current) return;
        const h = create(gl);
        handle.current = h;
        let last = Date.now();
        let warned = false;
        const loop = () => {
          if (!alive.current) return;
          raf.current = requestAnimationFrame(loop);
          const now = Date.now();
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          try {
            h.frame(dt);
          } catch (e) {
            if (__DEV__ && !warned) {
              warned = true;
              console.warn('GL frame error', e);
            }
          }
        };
        loop();
      }}
    />
  );
}
