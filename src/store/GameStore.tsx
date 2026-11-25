/**
 * App-wide persistent state (save data) + actions, via React context.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BALL_SKINS, TRAY_SKINS } from '../data/cosmetics';
import { LEVEL_COUNT } from '../data/levels';
import { AudioManager } from '../managers/AudioManager';
import { Haptics } from '../managers/Haptics';
import { dailyStatus, dayKey } from '../managers/DailyReward';
import { defaultSave, loadSave, resetSave, writeSave, type SaveData } from '../managers/SaveManager';

interface Store {
  save: SaveData;
  ready: boolean;
  update: (fn: (s: SaveData) => SaveData) => void;
  /** record a win; returns whether it was the first clear */
  recordWin: (levelId: number, stars: number, score: number, coins: number) => boolean;
  addCoins: (n: number) => void;
  buySkin: (kind: 'ball' | 'tray', id: string) => boolean;
  selectSkin: (kind: 'ball' | 'tray', id: string) => void;
  markIntroSeen: (key: string) => void;
  /** claim today's daily reward; returns coins granted (0 if already claimed) */
  claimDaily: (multiplier?: number) => number;
  resetProgress: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function GameStoreProvider({ children }: { children: React.ReactNode }) {
  const [save, setSave] = useState<SaveData>(defaultSave);
  const [ready, setReady] = useState(false);
  const ref = useRef(save);

  useEffect(() => {
    let alive = true;
    loadSave().then((s) => {
      if (!alive) return;
      ref.current = s;
      setSave(s);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // keep managers in sync with settings
  useEffect(() => {
    AudioManager.setSoundEnabled(save.sound);
    AudioManager.setMusicEnabled(save.music);
    Haptics.setEnabled(save.haptics);
  }, [save.sound, save.music, save.haptics]);

  const update = useCallback((fn: (s: SaveData) => SaveData) => {
    const next = fn(ref.current);
    ref.current = next;
    setSave(next);
    writeSave(next);
  }, []);

  const recordWin = useCallback(
    (levelId: number, stars: number, score: number, coins: number) => {
      const first = !ref.current.stars[String(levelId)];
      update((s) => ({
        ...s,
        stars: { ...s.stars, [levelId]: Math.max(s.stars[String(levelId)] ?? 0, stars) },
        bestScores: { ...s.bestScores, [levelId]: Math.max(s.bestScores[String(levelId)] ?? 0, score) },
        unlockedLevel: Math.min(LEVEL_COUNT, Math.max(s.unlockedLevel, levelId + 1)),
        coins: s.coins + coins,
        tutorialDone: true,
        levelsSinceInterstitial: s.levelsSinceInterstitial + 1,
      }));
      return first;
    },
    [update],
  );

  const addCoins = useCallback((n: number) => update((s) => ({ ...s, coins: s.coins + n })), [update]);

  const buySkin = useCallback(
    (kind: 'ball' | 'tray', id: string) => {
      const list = kind === 'ball' ? BALL_SKINS : TRAY_SKINS;
      const skin = list.find((x) => x.id === id);
      const s = ref.current;
      const owned = kind === 'ball' ? s.ownedBallSkins : s.ownedTraySkins;
      if (!skin || owned.includes(id) || s.coins < skin.cost || s.unlockedLevel < skin.unlockLevel) return false;
      update((p) =>
        kind === 'ball'
          ? { ...p, coins: p.coins - skin.cost, ownedBallSkins: [...p.ownedBallSkins, id], selectedBallSkin: id }
          : { ...p, coins: p.coins - skin.cost, ownedTraySkins: [...p.ownedTraySkins, id], selectedTraySkin: id },
      );
      return true;
    },
    [update],
  );

  const selectSkin = useCallback(
    (kind: 'ball' | 'tray', id: string) =>
      update((p) => (kind === 'ball' ? { ...p, selectedBallSkin: id } : { ...p, selectedTraySkin: id })),
    [update],
  );

  const markIntroSeen = useCallback(
    (key: string) => update((p) => (p.seenIntros.includes(key) ? p : { ...p, seenIntros: [...p.seenIntros, key] })),
    [update],
  );

  const claimDaily = useCallback(
    (multiplier = 1) => {
      const st = dailyStatus(ref.current);
      if (!st.available) return 0;
      const coins = st.coins * multiplier;
      update((p) => ({ ...p, coins: p.coins + coins, dailyLastDay: dayKey(new Date()), dailyStreak: st.day }));
      return coins;
    },
    [update],
  );

  const resetProgress = useCallback(async () => {
    const d = await resetSave();
    ref.current = d;
    setSave(d);
  }, []);

  const value = useMemo(
    () => ({ save, ready, update, recordWin, addCoins, buySkin, selectSkin, markIntroSeen, claimDaily, resetProgress }),
    [save, ready, update, recordWin, addCoins, buySkin, selectSkin, markIntroSeen, claimDaily, resetProgress],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGameStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGameStore outside provider');
  return v;
}
