/**
 * Turns off R8 shrinking/obfuscation for Android release builds.
 *
 * Expo SDK 58 enables R8 by default. With it on, R8 stripped
 * androidx.work.impl.WorkDatabase_Impl (WorkManager, used by the Google Mobile
 * Ads SDK) and the release app crashed on launch:
 *   "Failed to create an instance of androidx.work.impl.WorkDatabase".
 * The game is almost all JavaScript, so R8 saves little; correctness wins.
 * Kept as a config plugin so `expo prebuild` never brings R8 back.
 */
const { withGradleProperties } = require('expo/config-plugins');

const PROPS = {
  'android.enableMinifyInReleaseBuilds': 'false',
  'android.enableShrinkResourcesInReleaseBuilds': 'false',
};

module.exports = function withDisableAndroidMinify(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      const existing = cfg.modResults.find((p) => p.type === 'property' && p.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
