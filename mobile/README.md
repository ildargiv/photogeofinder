# PhotoGeoFinder for Android

The Android app is the same web app (`index.html`, `app.js`, `i18n.js`, …) packaged with [Capacitor](https://capacitorjs.com/).
Nothing is duplicated: `prepare-web.mjs` copies the web files into `www/` and adds the app glue:

- `web/mobile.js`: opens photos through the native picker so the original file with its GPS reaches the app, receives photos shared from the gallery ("Share" / "Open with"), swipe between photos, update check for the APK.
- `web/mobile.css`: phone layout. The address, coordinates, time and camera sit in a card right under the photo, the map follows.
- `android/…/PhotoPickerPlugin.java`: the native part. Android strips the location from photos unless the app holds `ACCESS_MEDIA_LOCATION` and asks for the original file; the plugin does both and copies the photo into the app's cache. Photos never leave the phone.

## Build locally

Needs Node 22, JDK 21 and the Android SDK (Android Studio).

```sh
cd mobile
npm ci
npm run sync            # copy web files into the Android project
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Or open `mobile/android` in Android Studio after `npm run sync`.

## Releases

`.github/workflows/android.yml` builds a debug APK for every pull request (download it from the workflow run, "Artifacts")
and a signed `PhotoGeoFinder-vX.Y.Z.apk` for every published release. The version comes from `config.js`.

Signing uses four repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the keystore file, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Create a keystore once and keep it safe: every update must be signed with the same key, or phones refuse to install it over the old version.

```sh
keytool -genkeypair -v -keystore photogeofinder.jks -alias photogeofinder -keyalg RSA -keysize 4096 -validity 36500
base64 -w0 photogeofinder.jks   # value for ANDROID_KEYSTORE_BASE64
```

## iPhone

Not yet. An iOS build needs an Apple Developer account and a Mac (or a macOS runner) to sign it; the same `www/` and Capacitor setup will work there.
