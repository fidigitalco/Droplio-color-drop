/**
 * Versioned local save. Everything lives on the device (AsyncStorage) — no
 * account, no network. Missing or corrupted data falls back to safe defaults.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEVEL_COUNT } from '../data/levels';

export const SAVE_VERSION = 1;
const KEY = 'droplio.save';
const BACKUP_KEY = 'droplio.save.corrupt';
/** save keys from earlier names of the game — migrated on first load, newest first */
const LEGACY_KEYS = ['dropzy.save', 'colordrop.save'];

export interface SaveData {
  version: number;
  unlockedLevel: number;
  /** level id -> best stars (1..3). Presence means "completed". */
  stars: Record<string, number>;
  bestScores: Record<string, number>;
  coins: number;
  ownedBallSkins: string[];
  ownedTraySkins: string[];
  selectedBallSkin: string;
  selectedTraySkin: string;
  sound: boolean;
  music: boolean;
  haptics: boolean;
  tutorialDone: boolean;
  seenIntros: string[];
  /** ad pacing (kept in the save so app restarts can't be used to dodge the cap) */
  levelsSinceInterstitial: number;
  /** daily reward: last claimed local day (YYYY-MM-DD, '' = never) and streak 1..7 */
  dailyLastDay: string;
  dailyStreak: number;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    stars: {},
    bestScores: {},
    coins: 0,
    ownedBallSkins: ['classic'],
    ownedTraySkins: ['classic'],
    selectedBallSkin: 'classic',
    selectedTraySkin: 'classic',
    sound: true,
    music: true,
    haptics: true,
    tutorialDone: false,
    seenIntros: [],
    levelsSinceInterstitial: 0,
    dailyLastDay: '',
    dailyStreak: 0,
  };
}

const num = (v: unknown, d: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const strArr = (v: unknown, d: string[]) =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : d;
const numMap = (v: unknown, min: number, max: number): Record<string, number> => {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[k] = Math.min(max, Math.max(min, val));
  }
  return out;
};

/** Field-by-field sanitising: one bad field never wipes the whole save. */
export function sanitize(input: unknown): SaveData {
  const d = defaultSave();
  if (!input || typeof input !== 'object') return d;
  const s = migrate(input as Record<string, unknown>);
  const owned = (arr: string[]) => (arr.includes('classic') ? arr : ['classic', ...arr]);
  const out: SaveData = {
    version: SAVE_VERSION,
    unlockedLevel: Math.round(num(s.unlockedLevel, d.unlockedLevel, 1, LEVEL_COUNT)),
    stars: numMap(s.stars, 1, 3),
    bestScores: numMap(s.bestScores, 0, 1e9),
    coins: Math.round(num(s.coins, 0, 0, 1e9)),
    ownedBallSkins: owned(strArr(s.ownedBallSkins, d.ownedBallSkins)),
    ownedTraySkins: owned(strArr(s.ownedTraySkins, d.ownedTraySkins)),
    selectedBallSkin: typeof s.selectedBallSkin === 'string' ? s.selectedBallSkin : d.selectedBallSkin,
    selectedTraySkin: typeof s.selectedTraySkin === 'string' ? s.selectedTraySkin : d.selectedTraySkin,
    sound: bool(s.sound, d.sound),
    music: bool(s.music, d.music),
    haptics: bool(s.haptics, d.haptics),
    tutorialDone: bool(s.tutorialDone, d.tutorialDone),
    seenIntros: strArr(s.seenIntros, []),
    levelsSinceInterstitial: Math.round(num(s.levelsSinceInterstitial, 0, 0, 100)),
    dailyLastDay: typeof s.dailyLastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.dailyLastDay) ? s.dailyLastDay : '',
    dailyStreak: Math.round(num(s.dailyStreak, 0, 0, 7)),
  };
  if (!out.ownedBallSkins.includes(out.selectedBallSkin)) out.selectedBallSkin = 'classic';
  if (!out.ownedTraySkins.includes(out.selectedTraySkin)) out.selectedTraySkin = 'classic';
  return out;
}

/** Upgrade older save formats here when SAVE_VERSION increases. */
function migrate(s: Record<string, unknown>): Record<string, unknown> {
  const v = typeof s.version === 'number' ? s.version : 0;
  if (v < 1) {
    // v0 -> v1: nothing shipped before v1, keep whatever fields are compatible.
  }
  return s;
}

export async function loadSave(): Promise<SaveData> {
  try {
    let json = await AsyncStorage.getItem(KEY);
    for (const legacy of LEGACY_KEYS) {
      if (json) break;
      json = await AsyncStorage.getItem(legacy);
      if (json) await AsyncStorage.setItem(KEY, json).catch(() => {});
    }
    if (!json) return defaultSave();
    try {
      return sanitize(JSON.parse(json));
    } catch {
      // keep a copy of the corrupted blob for debugging, then start fresh
      await AsyncStorage.setItem(BACKUP_KEY, json).catch(() => {});
      return defaultSave();
    }
  } catch {
    return defaultSave();
  }
}

let pending: SaveData | null = null;
let writing = false;

/** Coalesced async write: rapid successive saves collapse into one. */
export async function writeSave(data: SaveData): Promise<void> {
  pending = data;
  if (writing) return;
  writing = true;
  try {
    while (pending) {
      const next = pending;
      pending = null;
      await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    }
  } finally {
    writing = false;
  }
}

export async function resetSave(): Promise<SaveData> {
  const d = defaultSave();
  await AsyncStorage.setItem(KEY, JSON.stringify(d)).catch(() => {});
  return d;
}
