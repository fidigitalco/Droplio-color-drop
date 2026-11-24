import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CoinPill, IconButton, Stars } from '../components/ui';
import { UI } from '../data/cosmetics';
import { WORLDS, worldOf } from '../data/levels';
import { AudioManager } from '../managers/AudioManager';
import { Haptics } from '../managers/Haptics';
import { useGameStore } from '../store/GameStore';

const WORLD_COLORS: [string, string][] = [
  ['#5ef0a8', '#22c27f'],
  ['#6db6ff', '#2f7bff'],
  ['#ff8fb5', '#ff4f86'],
  ['#b79bff', '#7c5cff'],
  ['#ffb36b', '#ff7a2f'],
  ['#6b7280', '#3b3f5c'],
  ['#5ee3e0', '#14a8b8'],
  ['#ff7b7b', '#e5383b'],
  ['#ffd86b', '#e0a400'],
  ['#9d7bff', '#2b2350'],
];

export function LevelSelectScreen({ onBack, onPlay }: { onBack: () => void; onPlay: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  const { save } = useGameStore();
  const [world, setWorld] = useState(() => worldOf(save.unlockedLevel).id);
  const w = WORLDS[world - 1];
  const ids = useMemo(() => Array.from({ length: w.last - w.first + 1 }, (_, i) => w.first + i), [w]);
  const worldStars = ids.reduce((a, id) => a + (save.stars[String(id)] ?? 0), 0);

  return (
    <LinearGradient colors={['#7cc8ff', '#b9a8ff', '#ffc3e0']} style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="arrow-back" onPress={onBack} />
        <Text style={styles.headerTitle}>Levels</Text>
        <CoinPill coins={save.coins} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        {WORLDS.map((wd) => {
          const locked = save.unlockedLevel < wd.first;
          const active = wd.id === world;
          return (
            <Pressable
              key={wd.id}
              disabled={locked}
              onPress={() => {
                AudioManager.play('button');
                Haptics.selection();
                setWorld(wd.id);
              }}
              style={[styles.tab, active && styles.tabActive, locked && { opacity: 0.5 }]}
            >
              {locked ? <Ionicons name="lock-closed" size={14} color={UI.inkSoft} /> : null}
              <Text style={[styles.tabText, active && { color: '#fff' }]}>{wd.id}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.worldInfo}>
        <Text style={styles.worldName}>World {w.id} · {w.name}</Text>
        <Text style={styles.worldStars}>
          {worldStars}/{ids.length * 3} ★
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 30 }]}>
        {ids.map((id) => {
          const stars = save.stars[String(id)] ?? 0;
          const unlocked = id <= save.unlockedLevel;
          const current = id === save.unlockedLevel && !stars;
          const [c1, c2] = WORLD_COLORS[(w.id - 1) % WORLD_COLORS.length];
          return (
            <Pressable
              key={id}
              disabled={!unlocked}
              onPress={() => {
                AudioManager.play('button');
                Haptics.selection();
                onPlay(id);
              }}
              style={({ pressed }) => [styles.cellWrap, { transform: [{ scale: pressed ? 0.93 : current ? 1.06 : 1 }] }]}
            >
              <View style={[styles.cellEdge, { backgroundColor: unlocked ? '#00000022' : '#00000011' }, current && styles.currentRing]}>
                <LinearGradient colors={unlocked ? [c1, c2] : ['#eceaf7', '#d9d6ec']} style={styles.cell}>
                  {unlocked ? (
                    <Text style={styles.cellText}>{id}</Text>
                  ) : (
                    <Ionicons name="lock-closed" size={22} color="#a7a3c4" />
                  )}
                </LinearGradient>
              </View>
              <View style={{ height: 18, marginTop: 3 }}>{unlocked && <Stars count={stars} size={13} gap={0} />}</View>
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
  tabsScroll: { flexGrow: 0, marginTop: 18 },
  tabs: { flexDirection: 'row', paddingHorizontal: 14 },
  tab: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 16, height: 40, borderRadius: 20, marginHorizontal: 4 },
  tabActive: { backgroundColor: UI.ink },
  tabText: { fontSize: 17, fontWeight: '900', color: UI.ink, marginLeft: 2 },
  worldInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 24, marginTop: 16, marginBottom: 6 },
  worldName: { fontSize: 19, fontWeight: '900', color: UI.ink },
  worldStars: { fontSize: 16, fontWeight: '900', color: UI.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 10, paddingTop: 8 },
  cellWrap: { width: '20%', alignItems: 'center', marginVertical: 6 },
  cellEdge: { borderRadius: 20, paddingBottom: 4 },
  currentRing: { borderWidth: 3, borderColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  cell: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 22, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
});
