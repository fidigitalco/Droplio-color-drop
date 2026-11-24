import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { UI } from '../data/cosmetics';
import { AdManager } from '../managers/AdManager';
import { AudioManager } from '../managers/AudioManager';
import { useGameStore } from '../store/GameStore';
import { Backdrop, GameButton, Panel, styles as ui } from './ui';

function Toggle({ label, icon, value, onChange }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      style={s.row}
      onPress={() => {
        onChange(!value);
        AudioManager.play('button');
      }}
    >
      <Ionicons name={icon} size={24} color={UI.ink} />
      <Text style={s.label}>{label}</Text>
      <View style={[s.switch, value && s.switchOn]}>
        <View style={[s.knob, value && s.knobOn]} />
      </View>
    </Pressable>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { save, update, resetProgress } = useGameStore();
  const [privacy] = useState(() => AdManager.privacyOptionsRequired());

  return (
    <Backdrop>
      <Panel>
        <Text style={ui.title}>Settings</Text>
        <View style={{ height: 12 }} />
        <Toggle label="Sound" icon="volume-high" value={save.sound} onChange={(v) => update((p) => ({ ...p, sound: v }))} />
        <Toggle label="Music" icon="musical-notes" value={save.music} onChange={(v) => update((p) => ({ ...p, music: v }))} />
        <Toggle label="Vibration" icon="phone-portrait" value={save.haptics} onChange={(v) => update((p) => ({ ...p, haptics: v }))} />
        {privacy && (
          <Pressable style={s.link} onPress={() => AdManager.showPrivacyOptions()}>
            <Text style={s.linkText}>Privacy options</Text>
          </Pressable>
        )}
        <Pressable
          style={s.link}
          onPress={() =>
            Alert.alert('Reset progress?', 'All levels, stars, coins and skins will be erased.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => resetProgress() },
            ])
          }
        >
          <Text style={[s.linkText, { color: UI.red }]}>Reset progress</Text>
        </Pressable>
        <Text style={s.meta}>Ads: {AdManager.provider.name}</Text>
        <GameButton title="Done" shade="blue" onPress={onClose} style={{ marginTop: 14, alignSelf: 'stretch' }} />
      </Panel>
    </Backdrop>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingVertical: 12 },
  label: { flex: 1, marginLeft: 12, fontSize: 18, fontWeight: '800', color: UI.ink },
  switch: { width: 56, height: 32, borderRadius: 16, backgroundColor: '#dcdcef', padding: 3 },
  switchOn: { backgroundColor: UI.green },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff' },
  knobOn: { transform: [{ translateX: 24 }] },
  link: { paddingVertical: 10 },
  linkText: { fontSize: 15, fontWeight: '800', color: UI.blue },
  meta: { fontSize: 12, color: UI.inkSoft, marginTop: 6 },
});
