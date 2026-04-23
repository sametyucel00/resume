const { withAppBuildGradle, createRunOncePlugin } = require("expo/config-plugins");

const FLAVOR_LINE = "        missingDimensionStrategy 'store', 'play'";

function addPlayStoreFlavor(buildGradle) {
  if (buildGradle.includes("missingDimensionStrategy 'store', 'play'")) {
    return buildGradle;
  }

  const defaultConfigPattern = /defaultConfig\s*\{/;
  if (!defaultConfigPattern.test(buildGradle)) {
    throw new Error("Could not find defaultConfig block in android/app/build.gradle");
  }

  return buildGradle.replace(defaultConfigPattern, (match) => `${match}\n${FLAVOR_LINE}`);
}

const withAndroidIapFlavor = (config) =>
  withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("withAndroidIapFlavor only supports Groovy app/build.gradle files.");
    }

    config.modResults.contents = addPlayStoreFlavor(config.modResults.contents);
    return config;
  });

module.exports = createRunOncePlugin(withAndroidIapFlavor, "with-android-iap-flavor", "1.0.0");
