/**
 * Real Google Mobile Ads integration (react-native-google-mobile-ads).
 *
 * Only loaded in native builds — never in Expo Go, which doesn't contain the
 * Google Mobile Ads SDK. The library is required lazily inside the
 * constructor so that merely bundling it is harmless.
 *
 * Flow:
 *   1. UMP consent: AdsConsent.gatherConsent() (requests info, shows the form
 *      only where required, e.g. EEA/UK).
 *   2. If consent allows, MobileAds().initialize().
 *   3. Preload one rewarded + one interstitial; reload after each show,
 *      with exponential backoff on failures. No duplicate requests.
 *
 * App Tracking Transparency: the game does not request the IDFA prompt itself.
 * If you enable the IDFA explainer message in the AdMob console, UMP handles
 * it; also set `userTrackingUsageDescription` in the plugin config.
 */
import { Platform } from 'react-native';
import type * as GMA from 'react-native-google-mobile-ads';
import { PRODUCTION_AD_UNITS, USE_PRODUCTION_ADS } from '../../config/ads';
import type { AdProvider } from './AdProvider';

type Lib = typeof GMA;

export class AdMobProvider implements AdProvider {
  readonly name = 'Google AdMob';
  private lib: Lib;
  private canRequest = false;
  private privacyRequired = false;

  private rewarded: GMA.RewardedAd | null = null;
  private rewardedReady = false;
  private rewardedLoading = false;
  private rewardedSubs: (() => void)[] = [];
  private rewardedRetry = 0;
  private earned = false;
  private rewardedResolve: ((earned: boolean) => void) | null = null;

  private inter: GMA.InterstitialAd | null = null;
  private interReady = false;
  private interLoading = false;
  private interSubs: (() => void)[] = [];
  private interRetry = 0;
  private interResolve: (() => void) | null = null;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.lib = require('react-native-google-mobile-ads') as Lib;
  }

  private unit(kind: 'rewarded' | 'interstitial'): string {
    const p = Platform.OS === 'ios' ? PRODUCTION_AD_UNITS.ios : PRODUCTION_AD_UNITS.android;
    // placeholder IDs (e.g. Android not set up yet) always fall back to test units
    const useTest = __DEV__ || !USE_PRODUCTION_ADS || p[kind].includes('XXXX');
    if (useTest) return kind === 'rewarded' ? this.lib.TestIds.REWARDED : this.lib.TestIds.INTERSTITIAL;
    return p[kind];
  }

  async init() {
    const { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus } = this.lib;
    try {
      const info = await AdsConsent.gatherConsent();
      this.canRequest = info.canRequestAds;
      this.privacyRequired =
        info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
    } catch {
      // Consent info unavailable (offline etc.). Use any consent obtained earlier.
      try {
        const info = await AdsConsent.getConsentInfo();
        this.canRequest = info.canRequestAds;
      } catch {
        this.canRequest = false;
      }
    }
    if (!this.canRequest) return;
    try {
      await this.lib.default().initialize();
    } catch {
      this.canRequest = false;
      return;
    }
    this.loadRewarded();
    this.loadInterstitial();
  }

  // ---------------------------------------------------------------- rewarded
  private loadRewarded() {
    if (!this.canRequest || this.rewardedLoading || this.rewardedReady) return;
    const { RewardedAd, RewardedAdEventType, AdEventType } = this.lib;
    this.rewardedSubs.forEach((u) => u());
    this.rewardedLoading = true;
    const ad = RewardedAd.createForAdRequest(this.unit('rewarded'));
    this.rewarded = ad;
    this.rewardedSubs = [
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        this.rewardedLoading = false;
        this.rewardedReady = true;
        this.rewardedRetry = 0;
      }),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        this.earned = true;
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        this.finishRewarded();
      }),
      ad.addAdEventListener(AdEventType.ERROR, () => {
        this.rewardedLoading = false;
        this.rewardedReady = false;
        if (this.rewardedResolve) this.finishRewarded();
        else this.retry('rewarded');
      }),
    ];
    ad.load();
  }

  private finishRewarded() {
    const r = this.rewardedResolve;
    this.rewardedResolve = null;
    this.rewardedReady = false;
    const earned = this.earned;
    this.earned = false;
    r?.(earned);
    this.loadRewarded();
  }

  isRewardedReady() {
    return this.rewardedReady && !!this.rewarded;
  }

  showRewarded(): Promise<boolean> {
    if (!this.isRewardedReady() || this.rewardedResolve) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.earned = false;
      this.rewardedResolve = resolve;
      this.rewarded!.show().catch(() => this.finishRewarded());
    });
  }

  // ------------------------------------------------------------ interstitial
  private loadInterstitial() {
    if (!this.canRequest || this.interLoading || this.interReady) return;
    const { InterstitialAd, AdEventType } = this.lib;
    this.interSubs.forEach((u) => u());
    this.interLoading = true;
    const ad = InterstitialAd.createForAdRequest(this.unit('interstitial'));
    this.inter = ad;
    this.interSubs = [
      ad.addAdEventListener(AdEventType.LOADED, () => {
        this.interLoading = false;
        this.interReady = true;
        this.interRetry = 0;
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => this.finishInter()),
      ad.addAdEventListener(AdEventType.ERROR, () => {
        this.interLoading = false;
        this.interReady = false;
        if (this.interResolve) this.finishInter();
        else this.retry('interstitial');
      }),
    ];
    ad.load();
  }

  private finishInter() {
    const r = this.interResolve;
    this.interResolve = null;
    this.interReady = false;
    r?.();
    this.loadInterstitial();
  }

  isInterstitialReady() {
    return this.interReady && !!this.inter;
  }

  showInterstitial(): Promise<void> {
    if (!this.isInterstitialReady() || this.interResolve) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.interResolve = resolve;
      this.inter!.show().catch(() => this.finishInter());
    });
  }

  private retry(kind: 'rewarded' | 'interstitial') {
    const attempt = kind === 'rewarded' ? ++this.rewardedRetry : ++this.interRetry;
    const delay = Math.min(120, 10 * 2 ** Math.min(attempt, 4)) * 1000;
    setTimeout(() => (kind === 'rewarded' ? this.loadRewarded() : this.loadInterstitial()), delay);
  }

  // ----------------------------------------------------------------- privacy
  privacyOptionsRequired() {
    return this.privacyRequired;
  }

  async showPrivacyOptions() {
    try {
      await this.lib.AdsConsent.showPrivacyOptionsForm();
    } catch {
      /* ignore */
    }
  }
}
