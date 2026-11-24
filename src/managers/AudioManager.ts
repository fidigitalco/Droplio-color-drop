/**
 * Sound effects + music via expo-audio (bundled in Expo Go).
 * All audio files are synthesised by tools/generate_audio.py.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const SOURCES = {
  catch_0: require('../../assets/sounds/catch_0.wav'),
  catch_1: require('../../assets/sounds/catch_1.wav'),
  catch_2: require('../../assets/sounds/catch_2.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  coin: require('../../assets/sounds/coin.wav'),
  button: require('../../assets/sounds/button.wav'),
  drop: require('../../assets/sounds/drop.wav'),
  bounce: require('../../assets/sounds/bounce.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
  bomb: require('../../assets/sounds/bomb.wav'),
  star: require('../../assets/sounds/star.wav'),
} as const;

export type Sfx = keyof typeof SOURCES;

const VOLUME: Partial<Record<Sfx, number>> = { drop: 0.35, bounce: 0.4, button: 0.6 };
const POOL: Partial<Record<Sfx, number>> = { catch_0: 3, catch_1: 3, catch_2: 3, drop: 3, bounce: 3, coin: 2, star: 2 };
const MIN_GAP_MS: Partial<Record<Sfx, number>> = { drop: 90, bounce: 60 };

class AudioManagerImpl {
  private pools = new Map<Sfx, { players: AudioPlayer[]; next: number; last: number }>();
  private music: AudioPlayer | null = null;
  private soundOn = true;
  private musicOn = true;
  private musicWanted = false;
  private ready = false;

  async init() {
    if (this.ready) return;
    this.ready = true;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
    } catch {
      /* non-fatal */
    }
    for (const key of Object.keys(SOURCES) as Sfx[]) {
      const players: AudioPlayer[] = [];
      for (let i = 0; i < (POOL[key] ?? 1); i++) {
        try {
          const p = createAudioPlayer(SOURCES[key]);
          p.volume = VOLUME[key] ?? 1;
          players.push(p);
        } catch {
          /* missing audio must never crash the game */
        }
      }
      this.pools.set(key, { players, next: 0, last: 0 });
    }
    try {
      this.music = createAudioPlayer(require('../../assets/sounds/music.wav'));
      this.music.loop = true;
      this.music.volume = 0.32;
    } catch {
      this.music = null;
    }
    this.applyMusic();
  }

  setSoundEnabled(on: boolean) {
    this.soundOn = on;
  }

  setMusicEnabled(on: boolean) {
    this.musicOn = on;
    this.applyMusic();
  }

  /** Called by screens: music plays on menus and gameplay when enabled. */
  startMusic() {
    this.musicWanted = true;
    this.applyMusic();
  }

  stopMusic() {
    this.musicWanted = false;
    this.applyMusic();
  }

  private applyMusic() {
    const m = this.music;
    if (!m) return;
    try {
      if (this.musicOn && this.musicWanted) {
        if (!m.playing) m.play();
      } else if (m.playing) {
        m.pause();
      }
    } catch {
      /* ignore */
    }
  }

  play(key: Sfx, volume?: number) {
    if (!this.soundOn) return;
    const pool = this.pools.get(key);
    if (!pool || pool.players.length === 0) return;
    const now = Date.now();
    if (now - pool.last < (MIN_GAP_MS[key] ?? 0)) return;
    pool.last = now;
    const p = pool.players[pool.next];
    pool.next = (pool.next + 1) % pool.players.length;
    try {
      if (volume !== undefined) p.volume = volume;
      p.seekTo(0).catch(() => {});
      p.play();
    } catch {
      /* ignore */
    }
  }
}

export const AudioManager = new AudioManagerImpl();
