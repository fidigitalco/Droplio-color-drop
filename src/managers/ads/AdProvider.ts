export interface AdProvider {
  /** Human readable name, shown in Settings for transparency. */
  readonly name: string;
  init(): Promise<void>;
  isRewardedReady(): boolean;
  /** Resolves true ONLY when the network confirmed the reward was earned. */
  showRewarded(): Promise<boolean>;
  isInterstitialReady(): boolean;
  showInterstitial(): Promise<void>;
  /** Whether a "Privacy options" entry point must be offered (UMP). */
  privacyOptionsRequired(): boolean;
  showPrivacyOptions(): Promise<void>;
}
