# Campnect Android build

The Android wrapper lives at the repository root and bundles the migrated
`artifacts/campnect` web artifact. Capacitor sync copies the Vite output from
`artifacts/campnect/dist/public` into the Android project.

## Check the native setup

```sh
pnpm run cap:check
```

The native toolchain requires Node.js 22 or newer, Java 21, Android SDK
Platform 36, and Android SDK Build-Tools 35 or newer.

## Build a debug APK

```sh
pnpm run cap:apk:debug
```

The APK is written by Gradle to
`android/app/build/outputs/apk/debug/app-debug.apk`.

Native builds use the public Campnect API by default:
`https://campnect.perinol.com/api`. Override it for a different deployment or
local HTTPS server with:

```sh
VITE_API_BASE_URL=https://your-api.example/api pnpm run cap:apk:debug
```

`CAP_SERVER_URL` is an opt-in live-server mode for device testing. Normal
debug and release builds bundle the web app and do not depend on a dev server.
Do not set `CAP_SERVER_URL` for an APK that will be distributed to users.

On first native launch, Campnect requests camera, microphone, and notification
permissions sequentially. Android always controls the dialogs and the user can
decline any optional permission. Campnect re-checks the actual permission state
on later launches and whenever the app returns from Android Settings.

The app does not request gallery/media-library or broad storage permissions.
Glimpse capture uses the camera and microphone permissions declared in the APK.

## Inspect the APK

After building, verify the package before distributing it:

```sh
apkanalyzer manifest application-id android/app/build/outputs/apk/debug/app-debug.apk
apkanalyzer manifest permissions android/app/build/outputs/apk/debug/app-debug.apk
zipalign -c -v 4 android/app/build/outputs/apk/debug/app-debug.apk
apksigner verify --verbose android/app/build/outputs/apk/debug/app-debug.apk
```

The expected application ID is `com.campnect.app`. A debug APK is signed with
the Android debug certificate; production distribution requires a separate
release signing configuration and is not covered by this build. Use Android's
APK tools above rather than a generic ZIP checker: aligned APK entries may
contain Android-specific padding that older ZIP utilities warn about.