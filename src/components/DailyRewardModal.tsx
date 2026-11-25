/**
 * Daily reward popup on the home screen: a 7-day ladder, claim today's coins,
 * optionally double them with a rewarded ad (player's choice, never forced).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UI } from '../data/cosmetics';
import { AdManager } from '../managers/AdManager';
import { AudioManager } from '../managers/AudioManager';
import { DAILY_COINS, type DailyStatus } from '../managers/DailyReward';
import { Haptics } from '../managers/Haptics';
import { useGameStore } from '../store/GameStore';
import { Backdrop, CoinIcon, GameButton, Panel, styles as ui } from './ui';

export function DailyRewardModal({ status, onClose }: { status: DailyStatus; onClose: () => void }) {
  const { claimDaily } = useGameStore();
  const [busy, setBusy] = useState(false);
  const canDouble = AdManager.isRewardedAvailable();

  const claim = (multiplier: number) => {
    if (claimDaily(multiplier) > 0) {
      AudioManager.play('coin');
      Haptics.success();
    }
    onClose();
  };

  const claimDouble = async () => {
    if (busy) return;
    setBusy(true);
    const earned = await AdManager.showRewarded();
    setBusy(false);
    claim(earned ? 2 : 1);
  };

  return (
    <Backdrop>
      <Panel>
        <Text style={ui.title}>Daily Reward</Text>
        <Text style={[ui.body, { marginTop: 4 }]}>Come back every day — the rewards get bigger!</Text>

        <View style={s.grid}>
          {DAILY_COINS.map((coins, i) => {
            const day = i + 1;
            const done = day < status.day;
            const today = day === status.day;
            const big = day === DAILY_COINS.length;
            return (
              <View key={day} style={[s.tile, big && s.tileBig, done && s.tileDone, today && s.tileToday]}>
                <Text style={[s.dayText, today && { color: '#fff' }]}>Day {day}</Text>
                {done ? (
                  <Ionicons name="checkmark-circle" size={big ? 30 : 24} color={UI.green} style={{ marginVertical: 3 }} />
                ) : big ? (
                  <Ionicons name="gift" size={30} color={today ? '#fff' : UI.gold} style={{ marginVertical: 3 }} />
                ) : (
                  <View style={{ marginVertical: 4 }}>
                    <CoinIcon size={20} />
                  </View>
                )}
                <Text style={[s.coinText, today && { color: '#fff' }]}>{coins}</Text>
              </View>
            );
          })}
        </View>

        <GameButton
          title={`Claim +${status.coins}`}
          icon="checkmark"
          shade="green"
          disabled={busy}
          style={{ alignSelf: 'stretch', marginTop: 16 }}
          onPress={() => claim(1)}
        />
        {canDouble && (
          <GameButton
            title={`Claim +${status.coins * 2}`}
            subtitle="Watch a short ad"
            icon="play-circle"
            shade="purple"
            size="sm"
            disabled={busy}
            style={{ alignSelf: 'stretch', marginTop: 10 }}
            onPress={claimDouble}
          />
        )}
      </Panel>
    </Backdrop>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 },
  tile: { width: 66, alignItems: 'center', paddingVertical: 8, borderRadius: 16, backgroundColor: '#f3f0ff', borderWidth: 2, borderColor: 'transparent' },
  tileBig: { width: 140 },
  tileDone: { backgroundColor: '#e6f8f0' },
  tileToday: { backgroundColor: '#7c5cff', borderColor: '#5638d6' },
  dayText: { fontSize: 12, fontWeight: '900', color: UI.inkSoft },
  coinText: { fontSize: 15, fontWeight: '900', color: UI.ink },
});
