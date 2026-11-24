/**
 * Coin rewards and progression rules in one place.
 */
import type { LevelConfig } from '../data/levels';

export interface LevelResult {
  stars: number;
  score: number;
  bonusAchieved: boolean;
  /** coins picked up during play (golden balls) */
  pickedCoins: number;
}

export interface RewardBreakdown {
  base: number;
  starsBonus: number;
  objective: number;
  picked: number;
  total: number;
}

export function computeReward(level: LevelConfig, r: LevelResult, firstClear: boolean): RewardBreakdown {
  // Replays still pay, but less, so grinding never beats progressing.
  const base = (10 + level.world * 5) * (firstClear ? 1 : 0.4);
  const starsBonus = r.stars * 5;
  const objective = r.bonusAchieved ? 15 : 0;
  const picked = r.pickedCoins;
  const b = Math.round(base);
  return { base: b, starsBonus, objective, picked, total: b + starsBonus + objective + picked };
}
