import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SimulatedAdOverlay } from './src/components/SimulatedAdOverlay';
import { AdManager } from './src/managers/AdManager';
import { AudioManager } from './src/managers/AudioManager';
import { CollectionScreen } from './src/screens/CollectionScreen';
import { GameScreen } from './src/screens/GameScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LevelSelectScreen } from './src/screens/LevelSelectScreen';
import { GameStoreProvider, useGameStore } from './src/store/GameStore';

type Route = { name: 'home' } | { name: 'levels' } | { name: 'collection' } | { name: 'game'; level: number; key: number };

function Root() {
  const { ready } = useGameStore();
  const [route, setRoute] = useState<Route>({ name: 'home' });

  useEffect(() => {
    AudioManager.init().then(() => AudioManager.startMusic());
    // Consent + ad SDK init happens in the background; gameplay never waits for it.
    AdManager.init();
  }, []);

  if (!ready) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.loading]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  const play = (level: number) => setRoute({ name: 'game', level, key: Date.now() });

  switch (route.name) {
    case 'home':
      return <HomeScreen onPlay={play} onLevels={() => setRoute({ name: 'levels' })} onCollection={() => setRoute({ name: 'collection' })} />;
    case 'levels':
      return <LevelSelectScreen onBack={() => setRoute({ name: 'home' })} onPlay={play} />;
    case 'collection':
      return <CollectionScreen onBack={() => setRoute({ name: 'home' })} />;
    case 'game':
      return <GameScreen key={route.key} initialLevel={route.level} onExit={(to) => setRoute(to === 'home' ? { name: 'home' } : { name: 'levels' })} />;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GameStoreProvider>
        <StatusBar hidden />
        <View style={styles.root}>
          <Root />
          <SimulatedAdOverlay />
        </View>
      </GameStoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#b9a8ff' },
  loading: { backgroundColor: '#b9a8ff', alignItems: 'center', justifyContent: 'center' },
});
