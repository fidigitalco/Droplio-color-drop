/**
 * ============================================================================
 *  AdMob configuration — WHERE TO PUT YOUR REAL IDS
 * ============================================================================
 *
 *  1. App IDs (one per platform) go in app.json, under the
 *     "react-native-google-mobile-ads" plugin options:
 *        "iosAppId":     "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"
 *        "androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"
 *     The values committed now are Google's public *sample* app IDs.
 *
 *  2. Ad UNIT IDs go in PRODUCTION_AD_UNITS below.
 *
 *  3. Set USE_PRODUCTION_ADS = true only for the App Store release build.
 *     While it is false (or in __DEV__), Google's official test units from
 *     `TestIds` are used, so you can never click your own live ads by accident.
 *
 *  Ads only run in a native build (EAS / `npx expo run:ios`). Expo Go does not
 *  contain the Google Mobile Ads SDK, so there the game uses a clearly labelled
 *  simulated test ad instead (see SimulatedAdProvider).
 * ============================================================================
 */

export const USE_PRODUCTION_ADS = true;

export const PRODUCTION_AD_UNITS = {
  ios: {
    rewarded: 'ca-app-pub-2895326830651551/2345954434',
    interstitial: 'ca-app-pub-2895326830651551/8775757721',
  },
  android: {
    rewarded: 'ca-app-pub-2895326830651551/3020421054',
    interstitial: 'ca-app-pub-2895326830651551/4540999241',
  },
};

/**
 * Interstitial pacing. Interstitials appear only after a level has ENDED
 * (won or lost) — when the player taps Continue / Retry / Home / Levels on the
 * result screen. Never during gameplay, never from the pause menu.
 * Tune these numbers freely.
 */
export const AD_POLICY = {
  /** no interstitials while the player is on levels 1..3 */
  noInterstitialUpToLevel: 3,
  /** one interstitial per this many finished levels (wins + losses) */
  levelsBetweenInterstitials: 3,
  /** minimum seconds between two interstitials */
  interstitialCooldownSec: 90,
  /** no interstitial within this many seconds of app launch */
  launchGraceSec: 60,
};
