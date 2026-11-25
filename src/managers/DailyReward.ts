/**
 * Daily login reward: one claim per calendar day (device local time).
 * Coming back on consecutive days climbs a 7-day ladder; missing a day
 * starts it again at day 1. After day 7 the ladder repeats.
 */
import type { SaveData } from './SaveManager';

export const DAILY_COINS = [20, 30, 40, 50, 60, 80, 150];

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface DailyStatus {
  available: boolean;
  /** 1..7 — the day that would be claimed now */
  day: number;
  coins: number;
}

export function dailyStatus(save: SaveData, now = new Date()): DailyStatus {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const continues = save.dailyLastDay === yesterday;
  const day = continues ? (save.dailyStreak % DAILY_COINS.length) + 1 : 1;
  // Not on the very first session: the player should start playing right away.
  const available = save.tutorialDone && save.dailyLastDay !== today;
  return { available, day, coins: DAILY_COINS[day - 1] };
}
