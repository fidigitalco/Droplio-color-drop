import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GLScene } from '../components/GLScene';
import { DailyRewardModal } from '../components/DailyRewardModal';
import { SettingsModal } from '../components/SettingsModal';
import { CoinPill, GameButton, IconButton, Logo } from '../components/ui';
import { ballSkin, UI } from '../data/cosmetics';
import { LEVEL_COUNT, worldOf } from '../data/levels';
import { HomeScene } from '../game/three/HomeScene';
import { dailyStatus, type DailyStatus } from '../managers/DailyReward';
import { useGameStore } from '../store/GameStore';

export function HomeScreen({
  onPlay,
  onLevels,
  onCollection,
}: {
  onPlay: (level: number) => void;
  onLevels: () => void;
  onCollection: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { save } = useGameStore();
  const [settings, setSettings] = useState(false);
  // daily reward: offered once when the home screen opens on a new day
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  useEffect(() => {
    const st = dailyStatus(save);
    if (st.available) setDaily(st);
    // only on mount: the popup closes itself after claiming
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const skin = ballSkin(save.selectedBallSkin);
  const allDone = Object.keys(save.stars).length >= LEVEL_COUNT;
  const level = save.unlockedLevel;
  const totalStars = Object.values(save.stars).reduce((a, b) => a + b, 0);

  return (
    <View style={{ flex: 1 }}>
      <GLScene
        key={skin.id}
        create={(gl) => {
          const s = new HomeScene(gl, skin);
          return { frame: (dt) => s.frame(dt), dispose: () => s.dispose() };
        }}
      />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="settings-sharp" onPress={() => setSettings(true)} />
        <CoinPill coins={save.coins} />
      </View>

      <View style={styles.center}>
        <Logo width={Math.min(340, width - 40)} />
        <Text style={styles.tag}>{totalStars} ★ · World {worldOf(level).id}: {worldOf(level).name}</Text>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <GameButton
          title="PLAY"
          subtitle={allDone ? 'All levels complete!' : `Level ${level}`}
          icon="play"
          size="lg"
          shade="green"
          onPress={() => onPlay(level)}
          style={{ width: 280 }}
        />
        <View style={styles.row}>
          <GameButton title="Levels" icon="grid" shade="blue" size="sm" onPress={onLevels} style={{ flex: 1, marginRight: 7 }} />
          <GameButton title="Skins" icon="color-palette" shade="pink" size="sm" onPress={onCollection} style={{ flex: 1, marginLeft: 7 }} />
        </View>
      </View>

      {settings && <SettingsModal onClose={() => setSettings(false)} />}
      {daily && !settings && <DailyRewardModal status={daily} onClose={() => setDaily(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  tag: { marginTop: 14, fontSize: 15, fontWeight: '800', color: UI.ink, backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' },
  bottom: { alignItems: 'center', paddingHorizontal: 24 },
  row: { flexDirection: 'row', width: 280, marginTop: 16 },
});
