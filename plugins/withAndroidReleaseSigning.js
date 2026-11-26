/**
 * Signs Android release builds with the Google Play UPLOAD key.
 *
 * The keystore and its passwords live OUTSIDE the repo, in a properties file:
 *   storeFile=/abs/path/droplio-upload.jks
 *   storePassword=...
 *   keyAlias=...
 *   keyPassword=...
 * Path: $DROPLIO_KEYSTORE_PROPERTIES, or ../Droplio-android-keys/keystore.properties
 * (next to this project). If the file is missing, release falls back to the
 * debug key, so builds still work on other machines (but can't go to Play).
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// droplio-release-signing';

const SIGNING = `
        ${MARKER}
        def uploadPropsFile = new File(System.getenv('DROPLIO_KEYSTORE_PROPERTIES') ?: "\${rootDir}/../../Droplio-android-keys/keystore.properties")
        if (uploadPropsFile.exists()) {
            def uploadProps = new Properties()
            uploadPropsFile.withInputStream { uploadProps.load(it) }
            release {
                storeFile file(uploadProps['storeFile'])
                storePassword uploadProps['storePassword']
                keyAlias uploadProps['keyAlias']
                keyPassword uploadProps['keyPassword']
            }
        }`;

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;
    // add a "release" signing config right after the debug one
    src = src.replace(/(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/, `$1${SIGNING}`);
    // use it for the release BUILD TYPE (search only inside buildTypes { ... })
    const bt = src.indexOf('buildTypes');
    if (bt >= 0) {
      const head = src.slice(0, bt);
      const tail = src
        .slice(bt)
        .replace(
          /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
          "$1signingConfig signingConfigs.findByName('release') ?: signingConfigs.debug",
        );
      src = head + tail;
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
