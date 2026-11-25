import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, PanResponder, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GLScene } from '../components/GLScene';
import { Backdrop, CoinIcon, CoinPill, GameButton, IconButton, Panel, styles as ui } from '../components/ui';
import { ballSkin, traySkin, UI } from '../data/cosmetics';
import { BONUS_TEXT, COLOR_OFFSET, GEOMETRY, getLevel, INTRO_TEXT, LEVEL_COUNT, TRAY_C_MAX, worldOf, type IntroKey } from '../data/levels';
import { GameEngine, type EngineEvent } from '../game/GameEngine';
import { GameRenderer, THUMB_ZONE } from '../game/three/GameRenderer';
import { AdManager } from '../managers/AdManager';
import { AudioManager, type Sfx } from '../managers/AudioManager';
import { Haptics } from '../managers/Haptics';
import { computeReward, type RewardBreakdown } from '../managers/RewardManager';
import { useGameStore } from '../store/GameStore';

type Overlay = 'intro' | 'ready' | 'playing' | 'paused' | 'won' | 'lost';

interface Hud {
  progress: number;
  target: number;
  lives: number;
  maxLives: number;
  score: number;
  combo: number;
  coins: number;
}

interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  big?: boolean;
}

interface Result {
  stars: number;
  score: number;
  bonus: boolean;
  reward: RewardBreakdown;
  doubled: boolean;
  /** best score on this level before this win (0 = never cleared) */
  prevBest: number;
}

const HUD_H = 104;
const HANDLE_W = 104;
const COMP_COLORS = [UI.red, UI.blue, UI.yellow];

function hudOf(e: GameEngine): Hud {
  return {
    progress: e.progress,
    target: e.level.target,
    lives: e.lives,
    maxLives: Math.max(e.level.lives, e.lives),
    score: e.score,
    combo: e.combo,
    coins: e.coinsEarned,
  };
}

// --------------------------------------------------------------- small views
function FloatText({ p, onDone }: { p: Popup; onDone: (id: number) => void }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: p.big ? 1100 : 800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => onDone(p.id));
  }, [a, onDone, p.id, p.big]);
  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.popup,
        p.big && styles.popupBig,
        {
          left: p.x - 100,
          top: p.y - 20,
          color: p.color,
          opacity: a.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, p.big ? -40 : -70] }) },
            { scale: a.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.5, 1.15, 1] }) },
          ],
        },
      ]}
    >
      {p.text}
    </Animated.Text>
  );
}

function Hearts({ lives, max }: { lives: number; max: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {Array.from({ length: max }, (_, i) => (
        <Ionicons key={i} name={i < lives ? 'heart' : 'heart-outline'} size={22} color={i < lives ? '#ff3b6b' : 'rgba(255,255,255,0.8)'} style={styles.heart} />
      ))}
    </View>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(w, { toValue: Math.min(1, value / max), useNativeDriver: false, speed: 18, bounciness: 6 }).start();
  }, [value, max, w]);
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      <Text style={styles.barText}>
        {value}/{max}
      </Text>
    </View>
  );
}

function ReadyBanner({ bonus }: { bonus: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 12 }),
      Animated.delay(600),
      Animated.timing(a, { toValue: 2, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [a]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View
        style={{
          alignItems: 'center',
          opacity: a.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
          transform: [{ scale: a.interpolate({ inputRange: [0, 1, 2], outputRange: [0.4, 1, 1.3] }) }],
        }}
      >
        <Text style={styles.ready}>READY?</Text>
        <Text style={styles.readySub}>★ Bonus: {bonus}</Text>
      </Animated.View>
    </View>
  );
}

/** "NEW BEST!" ribbon on the victory panel when the player beats their record. */
function NewBestBadge() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      AudioManager.play('star');
      Haptics.success();
      Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 16 }).start();
    }, 950); // after the score has counted up
    return () => clearTimeout(t);
  }, [a]);
  return (
    <Animated.View style={[styles.newBest, { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }, { rotate: '-4deg' }] }]}>
      <Ionicons name="trophy" size={18} color="#fff" />
      <Text style={styles.newBestText}>NEW BEST!</Text>
    </Animated.View>
  );
}

function CountUp({ to, style }: { to: number; style: object }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / 900);
      setV(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <Text style={style}>{v.toLocaleString()}</Text>;
}

function VictoryStars({ count }: { count: number }) {
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const timers = anims.map((a, i) =>
      setTimeout(() => {
        if (i < count) {
          AudioManager.play('star');
          Haptics.light();
        }
        Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 14 }).start();
      }, 250 + i * 280),
    );
    return () => timers.forEach(clearTimeout);
  }, [anims, count]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginVertical: 8 }}>
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={{
            marginHorizontal: 4,
            marginBottom: i === 1 ? 14 : 0,
            transform: [{ scale: a }, { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', `${(i - 1) * 12}deg`] }) }],
          }}
        >
          <Ionicons name="star" size={i === 1 ? 64 : 50} color={i < count ? UI.gold : '#e4e1f3'} style={{ textShadowColor: i < count ? '#c77d00' : '#c9c5df', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 }} />
        </Animated.View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------- screen
export function GameScreen({ initialLevel, onExit }: { initialLevel: number; onExit: (to: 'home' | 'levels') => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const store = useGameStore();
  const { save } = store;

  const [levelId, setLevelId] = useState(initialLevel);
  const level = getLevel(levelId);
  const engineRef = useRef<GameEngine>(new GameEngine(level));
  const rendRef = useRef<GameRenderer | null>(null);

  const introFor = (id: number, seen: string[]): IntroKey | null => {
    const k = getLevel(id).intro;
    return k && !seen.includes(k) ? k : null;
  };
  const [intro, setIntro] = useState<IntroKey | null>(() => introFor(initialLevel, save.seenIntros));
  const overlayRef = useRef<Overlay>(intro ? 'intro' : 'ready');
  const [overlay, setOverlayState] = useState<Overlay>(overlayRef.current);
  const setOverlay = useCallback((o: Overlay) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);

  const [hud, setHud] = useState<Hud>(() => hudOf(engineRef.current));
  const [popups, setPopups] = useState<Popup[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [adBusy, setAdBusy] = useState(false);
  const vignette = useRef(new Animated.Value(0)).current;
  const popupId = useRef(1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Latest values for callbacks invoked from the GL loop.
  const latest = useRef({ store, levelId });
  latest.current = { store, levelId };

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  // ---------------------------------------------------------- level control
  const startLevel = useCallback(
    (id: number) => {
      const lv = getLevel(id);
      engineRef.current = new GameEngine(lv);
      rendRef.current?.clearBalls();
      setLevelId(id);
      setHud(hudOf(engineRef.current));
      setResult(null);
      setPopups([]);
      const k = introFor(id, latest.current.store.save.seenIntros);
      setIntro(k);
      setOverlay(k ? 'intro' : 'ready');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setOverlay],
  );

  // READY → playing
  useEffect(() => {
    if (overlay !== 'ready') return;
    const t = setTimeout(() => {
      engineRef.current.start();
      setOverlay('playing');
    }, 1150);
    return () => clearTimeout(t);
  }, [overlay, setOverlay, levelId]);

  // auto-pause when the app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const ov = overlayRef.current;
      if (s !== 'active' && (ov === 'playing' || (ov === 'ready' && engineRef.current.phase === 'playing'))) setOverlay('paused');
    });
    return () => sub.remove();
  }, [setOverlay]);

  // -------------------------------------------------------------- feedback
  const addPopup = (x: number, y: number, text: string, color: string, big = false) => {
    const id = popupId.current++;
    setPopups((p) => [...p.slice(-7), { id, x, y, text, color, big }]);
  };
  const removePopup = useCallback((id: number) => setPopups((p) => p.filter((x) => x.id !== id)), []);

  const flashVignette = (strength = 1) => {
    vignette.setValue(0.35 * strength);
    Animated.timing(vignette, { toValue: 0, duration: 450, useNativeDriver: true }).start();
  };

  const onWin = () => {
    const eng = engineRef.current;
    const { store: st, levelId: id } = latest.current;
    const stars = eng.stars();
    const bonus = eng.bonusAchieved();
    const first = !st.save.stars[String(id)];
    const prevBest = st.save.bestScores[String(id)] ?? 0;
    const reward = computeReward(eng.level, { stars, score: eng.score, bonusAchieved: bonus, pickedCoins: eng.coinsEarned }, first);
    st.recordWin(id, stars, eng.score, reward.total);
    setResult({ stars, score: eng.score, bonus, reward, doubled: false, prevBest });
    setOverlay('won');
    AudioManager.play('win');
    Haptics.success();
  };

  const handleEvents = (events: EngineEvent[]) => {
    const r = rendRef.current;
    const eng = engineRef.current;
    let hudDirty = false;
    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          AudioManager.play('drop');
          break;
        case 'catch': {
          AudioManager.play(`catch_${e.comp}` as Sfx);
          Haptics.light();
          if (r) {
            const p = r.project(eng.trayX + COLOR_OFFSET[e.comp], GEOMETRY.trayRimY + 0.8);
            addPopup(p.x, p.y, `+${e.points}`, COMP_COLORS[e.comp]);
            if (e.combo > 0 && e.combo % 10 === 0) addPopup(width / 2, height * 0.42, `COMBO ×${e.combo}!`, '#ffffff', true);
          }
          hudDirty = true;
          break;
        }
        case 'rainbow':
          AudioManager.play('catch_1');
          AudioManager.play('star');
          Haptics.light();
          if (r) {
            const p = r.project(eng.trayX + COLOR_OFFSET[e.comp], GEOMETRY.trayRimY + 0.8);
            addPopup(p.x, p.y, `+${e.points}`, '#a05cff');
          }
          hudDirty = true;
          break;
        case 'golden':
          AudioManager.play('coin');
          Haptics.light();
          if (r) {
            const p = r.project(eng.trayX + COLOR_OFFSET[e.ball.comp], GEOMETRY.trayRimY + 0.8);
            addPopup(p.x, p.y, `+${e.coins} coins`, UI.gold);
          }
          hudDirty = true;
          break;
        case 'wrong':
          AudioManager.play('wrong');
          Haptics.warning();
          flashVignette(1);
          hudDirty = true;
          break;
        case 'miss':
          if (e.ball.kind === 0 || e.ball.kind === 1) {
            AudioManager.play('wrong', 0.6);
            Haptics.warning();
            flashVignette(0.7);
            hudDirty = true;
          }
          break;
        case 'bomb':
          AudioManager.play('bomb');
          Haptics.medium();
          flashVignette(1.2);
          hudDirty = true;
          break;
        case 'bounce':
          if (e.strength > 3) AudioManager.play('bounce');
          break;
        case 'won':
          hudDirty = true;
          later(onWin, 1000);
          break;
        case 'lost':
          hudDirty = true;
          AudioManager.play('lose');
          latest.current.store.update((p) => ({ ...p, levelsSinceInterstitial: p.levelsSinceInterstitial + 1 }));
          later(() => setOverlay('lost'), 750);
          break;
        default:
          break;
      }
    }
    if (hudDirty) setHud(hudOf(eng));
  };
  const handleRef = useRef(handleEvents);
  handleRef.current = handleEvents;

  // ------------------------------------------------------------------ input
  const dragStart = useRef(0);
  // drag handle that follows the tray inside the thumb zone
  const handleX = useRef(new Animated.Value(-500)).current;
  const handleY = useRef(new Animated.Value(-500)).current;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStart.current = engineRef.current.trayTarget;
      },
      onPanResponderMove: (_, g) => {
        const ppw = rendRef.current?.ptsPerWorld ?? 40;
        // horizontal only — vertical finger motion is ignored entirely
        const d = g.dx / ppw;
        const raw = dragStart.current + d;
        // At a wall, re-anchor so finger travel past the wall is not "stored":
        // moving back responds immediately instead of after a dead zone.
        if (raw > TRAY_C_MAX) dragStart.current = TRAY_C_MAX - d;
        else if (raw < -TRAY_C_MAX) dragStart.current = -TRAY_C_MAX - d;
        engineRef.current.setTrayTarget(dragStart.current + d);
      },
    }),
  ).current;

  // --------------------------------------------------------------- actions
  const watchForLife = async () => {
    if (adBusy) return;
    setAdBusy(true);
    const earned = await AdManager.showRewarded();
    setAdBusy(false);
    if (earned) {
      engineRef.current.continueWithExtraLife();
      setHud(hudOf(engineRef.current));
      setOverlay('ready');
    }
  };

  const watchForDouble = async () => {
    if (adBusy || !result || result.doubled) return;
    setAdBusy(true);
    const earned = await AdManager.showRewarded();
    setAdBusy(false);
    if (earned) {
      store.addCoins(result.reward.total);
      AudioManager.play('coin');
      setResult({ ...result, doubled: true });
    }
  };

  /**
   * Interstitials only appear at natural breaks — between levels, after a
   * loss (Retry), or when leaving the game — never during active play.
   */
  const afterBreak = async (then: () => void) => {
    if (adBusy) return;
    // the counter is increased when a level ends (win or loss)
    if (AdManager.interstitialDue(levelId, store.save.levelsSinceInterstitial)) {
      setAdBusy(true);
      const shown = await AdManager.showInterstitial();
      setAdBusy(false);
      if (shown) store.update((s) => ({ ...s, levelsSinceInterstitial: 0 }));
    }
    then();
  };

  const goNext = () => afterBreak(() => (levelId >= LEVEL_COUNT ? onExit('levels') : startLevel(levelId + 1)));
  const retry = () => afterBreak(() => startLevel(levelId));
  // Leaving or restarting from the pause menu is not a finished level: no ad.
  const leave = (to: 'home' | 'levels') => (overlay === 'paused' ? onExit(to) : afterBreak(() => onExit(to)));
  const restartFromPause = () => startLevel(levelId);
  // Resume goes through a short READY banner (balls frozen) so a hitch while
  // the pause panel closes never costs the player a ball.
  const resumes = useRef(0);
  const resume = () => {
    resumes.current++;
    setOverlay('ready');
  };

  const watchForBonusLife = async () => {
    if (adBusy) return;
    setAdBusy(true);
    const earned = await AdManager.showRewarded();
    setAdBusy(false);
    if (earned && engineRef.current.addBonusLife()) {
      setHud(hudOf(engineRef.current));
      AudioManager.play('star');
    }
  };

  const rewardedReady = AdManager.isRewardedAvailable();
  const eng = engineRef.current;

  return (
    <View style={styles.root}>
      <GLScene
        create={(gl) => {
          const r = new GameRenderer(gl, {
            viewW: width,
            viewH: height,
            safeTop: insets.top,
            safeBottom: insets.bottom,
            hudH: HUD_H,
            ballSkin: ballSkin(save.selectedBallSkin),
            traySkin: traySkin(save.selectedTraySkin),
          });
          rendRef.current = r;
          return {
            frame: (dt) => {
              const e = engineRef.current;
              const ov = overlayRef.current;
              // Paused, or the short READY banner after Resume / a rewarded continue:
              // balls stay frozen, only the tray follows the finger.
              const paused = ov === 'paused' || (ov !== 'playing' && e.phase === 'playing');
              if (paused) e.updateTrayOnly(dt);
              else e.update(dt);
              const events = e.drainEvents();
              if (events.length) {
                r.handleEvents(events, e);
                handleRef.current(events);
              }
              r.sync(e, paused ? 0 : dt);
              const hp = r.handlePoint(e.trayX);
              handleX.setValue(hp.x - HANDLE_W / 2);
              handleY.setValue(hp.y + THUMB_ZONE * 0.42);
              r.render();
            },
            dispose: () => {
              rendRef.current = null;
              r.dispose();
            },
          };
        }}
      />

      {/* drag handle under the tray: shows where to rest the finger */}
      <Animated.View pointerEvents="none" style={[styles.handle, { transform: [{ translateX: handleX }, { translateY: handleY }] }]}>
        <Text style={styles.handleArrow}>‹</Text>
        <View style={styles.handleGrip} />
        <Text style={styles.handleArrow}>›</Text>
      </Animated.View>

      {/* touch surface: drag anywhere to move the tray */}
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

      {/* red feedback vignette (gentle) */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.vignette, { opacity: vignette }]} />

      {/* HUD */}
      <View pointerEvents="box-none" style={[styles.hud, { paddingTop: insets.top + 6 }]}>
        <View pointerEvents="box-none" style={styles.hudRow}>
          <IconButton icon="pause" size={44} onPress={() => overlay === 'playing' && setOverlay('paused')} />
          <View pointerEvents="none" style={styles.hudCenter}>
            <Text style={styles.levelLabel}>LEVEL {level.id}</Text>
            <ProgressBar value={hud.progress} max={hud.target} />
          </View>
          <CoinPill coins={save.coins + (overlay === 'won' ? 0 : hud.coins)} />
        </View>
        <View pointerEvents="none" style={[styles.hudRow, { marginTop: 8, paddingHorizontal: 6 }]}>
          <Hearts lives={hud.lives} max={hud.maxLives} />
          <Text style={styles.score}>{hud.score.toLocaleString()}</Text>
          <View style={[styles.combo, { opacity: hud.combo >= 3 ? 1 : 0 }]}>
            <Text style={styles.comboText}>×{hud.combo}</Text>
          </View>
        </View>
      </View>

      {popups.map((p) => (
        <FloatText key={p.id} p={p} onDone={removePopup} />
      ))}

      {overlay === 'ready' && <ReadyBanner key={`${levelId}-${eng.continuesUsed}-${resumes.current}`} bonus={BONUS_TEXT[level.bonus.type](level.bonus.count)} />}

      {overlay === 'intro' && intro && (
        <Backdrop>
          <Panel>
            <View style={styles.introBalls}>
              {COMP_COLORS.map((c) => (
                <View key={c} style={[styles.introBall, { backgroundColor: c }]} />
              ))}
            </View>
            <Text style={ui.title}>{INTRO_TEXT[intro].title}</Text>
            <Text style={[ui.body, { marginTop: 8 }]}>{INTRO_TEXT[intro].body}</Text>
            <GameButton
              title="Got it!"
              shade="green"
              style={{ marginTop: 20, alignSelf: 'stretch' }}
              onPress={() => {
                store.markIntroSeen(intro);
                setOverlay('ready');
              }}
            />
          </Panel>
        </Backdrop>
      )}

      {overlay === 'paused' && (
        <Backdrop>
          <Panel>
            <Text style={ui.title}>Paused</Text>
            <Text style={[ui.body, { marginBottom: 14 }]}>
              Level {level.id} · World {worldOf(level.id).name}
            </Text>
            <GameButton title="Resume" icon="play" shade="green" style={styles.fullBtn} onPress={resume} />
            <GameButton title="Restart" icon="refresh" shade="blue" disabled={adBusy} style={styles.fullBtn} onPress={restartFromPause} />
            {rewardedReady && !eng.bonusLifeUsed && eng.phase === 'playing' && (
              <GameButton title="+1 Life" subtitle="Watch a short ad" icon="heart" shade="purple" size="sm" disabled={adBusy} style={styles.fullBtn} onPress={watchForBonusLife} />
            )}
            <View style={styles.iconRow}>
              <IconButton icon={save.sound ? 'volume-high' : 'volume-mute'} onPress={() => store.update((p) => ({ ...p, sound: !p.sound }))} />
              <IconButton icon={save.music ? 'musical-notes' : 'musical-note'} shade={save.music ? 'white' : 'pink'} onPress={() => store.update((p) => ({ ...p, music: !p.music }))} />
              <IconButton icon="grid" onPress={() => leave('levels')} />
              <IconButton icon="home" onPress={() => leave('home')} />
            </View>
          </Panel>
        </Backdrop>
      )}

      {overlay === 'won' && result && (
        <Backdrop>
          <Panel>
            <Text style={ui.title}>Level Complete!</Text>
            <VictoryStars count={result.stars} />
            <CountUp to={result.score} style={styles.bigScore} />
            {result.prevBest > 0 && result.score > result.prevBest ? (
              <NewBestBadge />
            ) : result.prevBest > 0 ? (
              <Text style={styles.bestText}>Best: {result.prevBest.toLocaleString()}</Text>
            ) : null}
            <View style={styles.bonusRow}>
              <Ionicons name={result.bonus ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={result.bonus ? UI.green : UI.inkSoft} />
              <Text style={styles.bonusText}>
                Bonus: {BONUS_TEXT[level.bonus.type](level.bonus.count)} {result.bonus ? '+15' : ''}
              </Text>
            </View>
            <View style={styles.coinRow}>
              <CoinIcon size={28} />
              <Text style={styles.coinText}>+{result.reward.total * (result.doubled ? 2 : 1)}</Text>
            </View>
            <GameButton
              title={levelId >= LEVEL_COUNT ? 'Finish' : 'Continue'}
              icon="arrow-forward"
              shade="green"
              size="md"
              disabled={adBusy}
              style={styles.fullBtn}
              onPress={goNext}
            />
            {!result.doubled && rewardedReady && (
              <GameButton title="Double coins" subtitle="Watch a short ad" icon="play-circle" shade="purple" size="sm" disabled={adBusy} style={styles.fullBtn} onPress={watchForDouble} />
            )}
            <View style={styles.iconRow}>
              <IconButton icon="refresh" onPress={retry} />
              <IconButton icon="grid" onPress={() => leave('levels')} />
              <IconButton icon="home" onPress={() => leave('home')} />
            </View>
          </Panel>
        </Backdrop>
      )}

      {overlay === 'lost' && (
        <Backdrop>
          <Panel>
            <Ionicons name="heart-dislike" size={54} color="#ff6b8b" />
            <Text style={ui.title}>Out of lives</Text>
            <Text style={[ui.body, { marginTop: 4 }]}>
              You caught {hud.progress} of {hud.target}. So close!
            </Text>
            <View style={{ alignSelf: 'stretch', marginVertical: 14 }}>
              <ProgressBar value={hud.progress} max={hud.target} />
            </View>
            {eng.continuesUsed === 0 && rewardedReady && (
              <GameButton title="+1 Life" subtitle="Watch a short ad to continue" icon="play-circle" shade="purple" disabled={adBusy} style={styles.fullBtn} onPress={watchForLife} />
            )}
            <GameButton title="Retry" icon="refresh" shade="green" disabled={adBusy} style={styles.fullBtn} onPress={retry} />
            <View style={styles.iconRow}>
              <IconButton icon="grid" onPress={() => leave('levels')} />
              <IconButton icon="home" onPress={() => leave('home')} />
            </View>
          </Panel>
        </Backdrop>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#b9a8ff' },
  vignette: { backgroundColor: '#ff4d6d' },
  handle: { position: 'absolute', left: 0, top: 0, width: HANDLE_W, height: 30, marginTop: -15, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.45)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  handleGrip: { width: 34, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.95)' },
  handleArrow: { color: '#fff', fontSize: 22, fontWeight: '900', lineHeight: 24, textShadowColor: 'rgba(43,35,80,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  hud: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 14 },
  hudRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hudCenter: { flex: 1, marginHorizontal: 12, alignItems: 'center' },
  levelLabel: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 1, marginBottom: 4, textShadowColor: 'rgba(43,35,80,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  barTrack: { alignSelf: 'stretch', height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.55)', overflow: 'hidden', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: UI.green, borderRadius: 9 },
  barText: { textAlign: 'center', fontWeight: '900', color: UI.ink, fontSize: 13 },
  heart: { marginRight: 2, textShadowColor: 'rgba(43,35,80,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  score: { color: '#fff', fontWeight: '900', fontSize: 20, textShadowColor: 'rgba(43,35,80,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  combo: { backgroundColor: '#ff7a2f', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, minWidth: 48, alignItems: 'center' },
  comboText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  popup: { position: 'absolute', width: 200, textAlign: 'center', fontSize: 24, fontWeight: '900', textShadowColor: 'rgba(43,35,80,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  popupBig: { fontSize: 34 },
  ready: { fontSize: 54, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(43,35,80,0.45)', textShadowOffset: { width: 0, height: 5 }, textShadowRadius: 0 },
  readySub: { marginTop: 6, fontSize: 16, fontWeight: '900', color: UI.ink, backgroundColor: 'rgba(255,255,255,0.85)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14, overflow: 'hidden' },
  fullBtn: { alignSelf: 'stretch', marginTop: 10 },
  iconRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 16 },
  newBest: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ff7a2f', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16, marginTop: 2, gap: 6, shadowColor: '#c2410c', shadowOpacity: 0.35, shadowRadius: 0, shadowOffset: { width: 0, height: 3 } },
  newBestText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
  bestText: { fontWeight: '800', color: UI.inkSoft, fontSize: 14, marginTop: 2 },
  bigScore: { fontSize: 40, fontWeight: '900', color: UI.ink },
  bonusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  bonusText: { marginLeft: 6, fontWeight: '800', color: UI.inkSoft, fontSize: 15 },
  coinRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff4d1', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, marginVertical: 10 },
  coinText: { marginLeft: 8, fontSize: 26, fontWeight: '900', color: UI.ink },
  introBalls: { flexDirection: 'row', marginBottom: 12 },
  introBall: { width: 30, height: 30, borderRadius: 15, marginHorizontal: 5, borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)' },
});

