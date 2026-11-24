/**
 * Renders SimulatedAdProvider requests (Expo Go only). Clearly labelled as a
 * simulated test ad; never contacts an ad network.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AdManager } from '../managers/AdManager';
import type { SimulatedAdRequest } from '../managers/ads/SimulatedAdProvider';

const DURATION = { rewarded: 5, interstitial: 3 };

export function SimulatedAdOverlay() {
  const [req, setReq] = useState<SimulatedAdRequest | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const sim = AdManager.simulated;
    if (!sim) return;
    sim.setListener((r) => {
      setReq(r);
      if (r) setLeft(DURATION[r.kind]);
    });
    return () => sim.setListener(null);
  }, []);

  useEffect(() => {
    if (!req || left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [req, left]);

  if (!req) return null;
  const finished = left <= 0;
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['#1d1b3a', '#3b2f7a']} style={[StyleSheet.absoluteFill, s.center]}>
        <Text style={s.badge}>SIMULATED TEST AD</Text>
        <Text style={s.title}>{req.kind === 'rewarded' ? 'Rewarded ad' : 'Interstitial ad'}</Text>
        <Text style={s.body}>
          Expo Go cannot load real Google AdMob ads.{'\n'}In a native build this is a real AdMob test ad.
        </Text>
        <Text style={s.count}>{finished ? '✓' : left}</Text>
        {finished ? (
          <Pressable style={s.btn} onPress={() => req.done(true)}>
            <Text style={s.btnText}>{req.kind === 'rewarded' ? 'Close & get reward' : 'Close'}</Text>
          </Pressable>
        ) : req.kind === 'rewarded' ? (
          <Pressable style={[s.btn, s.ghost]} onPress={() => req.done(false)}>
            <Text style={s.btnText}>Skip (no reward)</Text>
          </Pressable>
        ) : null}
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 30 },
  badge: { color: '#ffd34d', fontWeight: '900', letterSpacing: 2, marginBottom: 12 },
  title: { color: '#fff', fontSize: 30, fontWeight: '900' },
  body: { color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 10, fontSize: 15, lineHeight: 21 },
  count: { color: '#fff', fontSize: 72, fontWeight: '900', marginVertical: 30 },
  btn: { backgroundColor: '#25c48a', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 22 },
  ghost: { backgroundColor: 'rgba(255,255,255,0.15)' },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 17 },
});
