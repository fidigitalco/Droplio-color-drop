/**
 * Centralised AdManager. Gameplay code only talks to this file.
 *
 *  - Rewarded ads are always optional and only granted on confirmed completion.
 *  - Interstitials follow AD_POLICY and are only shown between levels
 *    (from the victory screen's Continue button), never during play.
 *  - Exactly one full-screen ad can be on screen at a time.
 *  - If ads are unavailable, every call resolves immediately and the game goes on.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { AD_POLICY } from '../config/ads';
import type { AdProvider } from './ads/AdProvider';
import { SimulatedAdProvider } from './ads/SimulatedAdProvider';

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function createProvider(): AdProvider {
  if (isExpoGo) return new SimulatedAdProvider();
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AdMobProvider } = require('./ads/AdMobProvider') as typeof import('./ads/AdMobProvider');
    return new AdMobProvider();
  } catch {
    return new SimulatedAdProvider();
  }
}

class AdManagerImpl {
  readonly provider: AdProvider = createProvider();
  private launchedAt = Date.now();
  private lastInterstitialAt = 0;
  private fullscreenOpen = false;
  private initStarted = false;

  get simulated(): SimulatedAdProvider | null {
    return this.provider instanceof SimulatedAdProvider ? this.provider : null;
  }

  init() {
    if (this.initStarted) return;
    this.initStarted = true;
    this.provider.init().catch(() => {});
  }

  isRewardedAvailable() {
    return !this.fullscreenOpen && this.provider.isRewardedReady();
  }

  /** true only when the reward was earned. Never throws. */
  async showRewarded(): Promise<boolean> {
    if (this.fullscreenOpen || !this.provider.isRewardedReady()) return false;
    this.fullscreenOpen = true;
    try {
      return await this.provider.showRewarded();
    } catch {
      return false;
    } finally {
      this.fullscreenOpen = false;
    }
  }

  /**
   * Decide whether an interstitial is due after completing `levelId`.
   * `levelsSince` is the persisted count of completions since the last one.
   */
  interstitialDue(levelId: number, levelsSince: number): boolean {
    const now = Date.now();
    if (levelId <= AD_POLICY.noInterstitialUpToLevel) return false;
    if (levelsSince < AD_POLICY.levelsBetweenInterstitials) return false;
    if (now - this.launchedAt < AD_POLICY.launchGraceSec * 1000) return false;
    if (now - this.lastInterstitialAt < AD_POLICY.interstitialCooldownSec * 1000) return false;
    return !this.fullscreenOpen && this.provider.isInterstitialReady();
  }

  /** Shows the interstitial; resolves when closed (or immediately if unavailable). */
  async showInterstitial(): Promise<boolean> {
    if (this.fullscreenOpen || !this.provider.isInterstitialReady()) return false;
    this.fullscreenOpen = true;
    try {
      await this.provider.showInterstitial();
      this.lastInterstitialAt = Date.now();
      return true;
    } catch {
      return false;
    } finally {
      this.fullscreenOpen = false;
    }
  }

  privacyOptionsRequired() {
    return this.provider.privacyOptionsRequired();
  }

  showPrivacyOptions() {
    return this.provider.showPrivacyOptions();
  }
}

export const AdManager = new AdManagerImpl();
