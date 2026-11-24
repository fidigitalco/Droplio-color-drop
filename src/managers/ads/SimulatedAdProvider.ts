/**
 * Stand-in used ONLY inside Expo Go, where the native Google Mobile Ads SDK
 * cannot exist. It lets you test every ad *flow* (offer → watch → reward,
 * skip → no reward, interstitial pacing) with an on-screen overlay that is
 * clearly labelled "SIMULATED TEST AD". It never contacts any ad network.
 */
import type { AdProvider } from './AdProvider';

export type SimulatedAdRequest = {
  kind: 'rewarded' | 'interstitial';
  /** call with true when the countdown completed, false when skipped */
  done: (completed: boolean) => void;
};

type Listener = (req: SimulatedAdRequest | null) => void;

export class SimulatedAdProvider implements AdProvider {
  readonly name = 'Simulated (Expo Go)';
  private listener: Listener | null = null;
  private busy = false;

  /** The root component registers the overlay renderer here. */
  setListener(l: Listener | null) {
    this.listener = l;
  }

  async init() {}

  isRewardedReady() {
    return !!this.listener && !this.busy;
  }

  isInterstitialReady() {
    return !!this.listener && !this.busy;
  }

  private present(kind: SimulatedAdRequest['kind']): Promise<boolean> {
    if (!this.listener || this.busy) return Promise.resolve(false);
    this.busy = true;
    return new Promise<boolean>((resolve) => {
      this.listener!({
        kind,
        done: (completed) => {
          this.busy = false;
          this.listener?.(null);
          resolve(completed);
        },
      });
    });
  }

  showRewarded() {
    return this.present('rewarded');
  }

  async showInterstitial() {
    await this.present('interstitial');
  }

  privacyOptionsRequired() {
    return false;
  }

  async showPrivacyOptions() {}
}
