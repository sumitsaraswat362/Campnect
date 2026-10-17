# R8 in Campnect Android

## Why this is configured

Google Play reported 1% DEX obfuscation for the previously uploaded Android bundle (version code 39, version name 1.1.37), below its 25% threshold. The release build had `minifyEnabled false`.

R8 is included in the existing Android Gradle Plugin (AGP 8.9.1); **there is no separate R8 plugin to install**. In `android/app/build.gradle`, the `release` build type now sets `minifyEnabled true` and uses the default `proguard-android-optimize.txt` rules together with the existing project rules. Debug builds and resource shrinking were not changed. This optimizes, shrinks, and obfuscates Java/Android DEX code, not the bundled web app's JavaScript.

## Verification performed

- Ran `cd android && ./gradlew :app:minifyReleaseWithR8 --no-daemon --console=plain`; the task completed successfully.
- R8 generated `android/app/build/outputs/mapping/release/mapping.txt` and an optimized `classes.dex` under `android/app/build/intermediates/dex/release/minifyReleaseWithR8/`.
- Inspected R8's generated configuration and mapping: Capacitor's annotated plugin classes and their `@PluginMethod` entry points are kept for JavaScript-to-native calls.
- This **does not** confirm Play's final obfuscation percentage or that every native feature works on a device. The earlier `android/app/build/outputs/bundle/release/app-release.aab` is an old bundle and must not be presented as an R8-optimized release.

## Next release

When preparing the next Play upload, increment **both** `versionCode` and `versionName` in `android/app/build.gradle`, build and test a **new** signed AAB with the established upload keystore, and keep its `mapping.txt` for crash deobfuscation (upload it to Play if needed). Do not commit or expose signing credentials. Test startup, sign-in, notifications, camera/Glimpse, gallery, navigation, and media on the release variant: optimization can reveal reflection issues that a debug build does not. Once Play analyzes the new bundle, compare its DEX optimization report with the prior 1%; the local build alone cannot establish a Play score.

References: [DEX code optimization](https://developer.android.com/topic/performance/issues/code-optimization) and [Enable app optimization](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization).