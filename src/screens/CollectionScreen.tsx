import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoinIcon, CoinPill, IconButton } from '../components/ui';
import { BALL_SKINS, TRAY_SKINS, UI } from '../data/cosmetics';
import { AudioManager } from '../managers/AudioManager';
import { Haptics } from '../managers/Haptics';
import { useGameStore } from '../store/GameStore';

/** Glossy ball preview drawn with gradients (keeps this screen lightweight). */
function BallSwatch({ color, size = 34 }: { color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, overflow: 'hidden', marginHorizontal: 3 }}>
      <LinearGradient colors={['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']} style={{ position: 'absolute', top: 2, left: size * 0.18, width: size * 0.55, height: size * 0.4, borderRadius: size }} />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']} style={StyleSheet.absoluteFill} />
    </View>
  );
}

export function CollectionScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { save, buySkin, selectSkin } = useGameStore();
  const [tab, setTab] = useState<'ball' | 'tray'>('ball');
  const items = tab === 'ball' ? BALL_SKINS : TRAY_SKINS;
  const owned = tab === 'ball' ? save.ownedBallSkins : save.ownedTraySkins;
  const selected = tab === 'ball' ? save.selectedBallSkin : save.selectedTraySkin;

  return (
    <LinearGradient colors={['#ffc3e0', '#b9a8ff', '#7cc8ff']} style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="arrow-back" onPress={onBack} />
        <Text style={styles.headerTitle}>Skins</Text>
        <CoinPill coins={save.coins} />
      </View>
      <Text style={styles.note}>Cosmetic only — skins never change gameplay.</Text>
      <View style={styles.tabs}>
        {(['ball', 'tray'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              AudioManager.play('button');
              setTab(t);
            }}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t && { color: '#fff' }]}>{t === 'ball' ? 'Balls' : 'Trays'}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}>
        {items.map((it) => {
          const has = owned.includes(it.id);
          const isSel = selected === it.id;
          const levelLocked = save.unlockedLevel < it.unlockLevel;
          const affordable = save.coins >= it.cost;
          return (
            <Pressable
              key={it.id}
              onPress={() => {
                if (has) {
                  AudioManager.play('button');
                  Haptics.selection();
                  selectSkin(tab, it.id);
                } else if (!levelLocked && affordable) {
                  if (buySkin(tab, it.id)) {
                    AudioManager.play('coin');
                    Haptics.success();
                  }
                } else {
                  Haptics.warning();
                }
              }}
              style={({ pressed }) => [styles.card, isSel && styles.cardSel, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
            >
              <View style={styles.swatches}>
                {'palette' in it ? (
                  it.palette.map((c) => <BallSwatch key={c} color={c} />)
                ) : (
                  <View style={[styles.trayPreview, { backgroundColor: it.body }]}>
                    {[UI.red, UI.blue, UI.yellow].map((c) => (
                      <View key={c} style={[styles.trayComp, { backgroundColor: c }]} />
                    ))}
                  </View>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{it.name}</Text>
                {!has && levelLocked ? <Text style={styles.sub}>Reach level {it.unlockLevel}</Text> : null}
              </View>
              {has ? (
                isSel ? (
                  <Ionicons name="checkmark-circle" size={30} color={UI.green} />
                ) : (
                  <Text style={styles.use}>USE</Text>
                )
              ) : levelLocked ? (
                <Ionicons name="lock-closed" size={24} color={UI.inkSoft} />
              ) : (
                <View style={[styles.price, !affordable && { opacity: 0.5 }]}>
                  <CoinIcon size={18} />
                  <Text style={styles.priceText}>{it.cost}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(43,35,80,0.35)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  note: { textAlign: 'center', marginTop: 10, color: UI.ink, fontWeight: '700', opacity: 0.7 },
  tabs: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
  tab: { backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 26, height: 40, borderRadius: 20, marginHorizontal: 6, justifyContent: 'center' },
  tabActive: { backgroundColor: UI.ink },
  tabText: { fontSize: 16, fontWeight: '900', color: UI.ink },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 22, padding: 14, marginBottom: 12, borderWidth: 3, borderColor: 'transparent' },
  cardSel: { borderColor: UI.green },
  swatches: { flexDirection: 'row', alignItems: 'center', minWidth: 120 },
  trayPreview: { flexDirection: 'row', padding: 4, borderRadius: 10, width: 116, height: 38 },
  trayComp: { flex: 1, marginHorizontal: 2, borderRadius: 6 },
  name: { fontSize: 18, fontWeight: '900', color: UI.ink },
  sub: { fontSize: 13, fontWeight: '700', color: UI.inkSoft, marginTop: 2 },
  use: { fontSize: 15, fontWeight: '900', color: UI.blue },
  price: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff4d1', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  priceText: { marginLeft: 6, fontWeight: '900', color: UI.ink, fontSize: 15 },
});
