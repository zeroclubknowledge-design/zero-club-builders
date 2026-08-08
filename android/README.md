# Zero Club for Android

The Android app is a **Trusted Web Activity** (TWA): a thin native shell around
the existing PWA at `https://www.zeroclubs.xyz`, generated with
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). There is no second
codebase. Ship the web app and the Android app updates with it — an Android
release is only needed when the icon, name, permissions or version change.

Nothing under `src/` is involved in this build. The Android tooling reads
`public/`, `version.json` and `android/twa-manifest.json`, and writes only to
`android/.twa/` and `android/out/`, both gitignored.

---

## First-time setup

You need **JDK 17 exactly** (Bubblewrap 1.25 rejects 11 and 21), the **Android
SDK**, and **Node 18+**.

```bash
# 1. Create the upload key. Do this once, ever.
node scripts/generate-keystore.mjs

# 2. Bake its fingerprint into the site.
node scripts/write-assetlinks.mjs

# 3. Deploy the site, then confirm the file is live.
node scripts/write-assetlinks.mjs --check

# 4. Build.
npm run android:build
```

Step 3 is not optional. Without a matching `/.well-known/assetlinks.json`, the
app still opens but Chrome draws its URL bar across the top, and it looks like a
browser rather than an app.

### If you use Play App Signing

Google re-signs your upload with its own key, so the fingerprint that reaches
users' devices is Google's, not yours. Get it from **Play Console → Test and
release → Setup → App signing → App signing key certificate → SHA-256**, then:

```bash
node scripts/write-assetlinks.mjs --add AA:BB:CC:...:FF
```

Both fingerprints should end up listed. Yours verifies locally built APKs,
Google's verifies what users install. Deploy again afterwards.

---

## Building

```bash
npm run android:build                  # signed APK + AAB into android/out/
npm run android:build -- --release patch   # bump version.json first
npm run android:build -- --skip-signing    # unsigned, no keystore needed
npm run android:build -- --dry-run         # validate inputs, do not compile
```

Build the web app first (`npm run build`) if you want the APK to embed the web
manifest from your working tree. Otherwise the script fetches it from the
deployed site and says so.

Outputs land in `android/out/`:

| File | Use |
| --- | --- |
| `zero-club-<version>.aab` | Upload this to the Play Console |
| `zero-club-<version>.apk` | Sideload for device testing: `adb install -r <file>` |
| `SHA256SUMS.txt` | Checksums of both |
| `build-info.json` | Version, commit, Bubblewrap version, timestamp |

### In CI

`.github/workflows/android-build.yml` does the same on `ubuntu-latest`. Run it
from the Actions tab, or push a `v*` tag. Add these repository secrets first:

| Secret | How to get it |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `node scripts/write-assetlinks.mjs --print-secret` |
| `ANDROID_KEYSTORE_PASSWORD` | What you chose in step 1 |
| `ANDROID_KEY_PASSWORD` | Same, unless you changed it |

Without them the workflow builds unsigned instead of failing.

---

## Versioning

`version.json` at the repo root is the only place versions live.

```json
{ "versionName": "1.0.0", "versionCode": 1 }
```

- `versionName` is what users see.
- `versionCode` is what Play orders by. It must strictly increase on every
  upload and **can never be reused**, even after deleting a release.

```bash
node scripts/bump-version.mjs patch     # 1.0.0 -> 1.0.1, code +1
node scripts/bump-version.mjs minor     # 1.0.1 -> 1.1.0, code +1
node scripts/bump-version.mjs major     # 1.1.0 -> 2.0.0, code +1
node scripts/bump-version.mjs --set 2.3.1
node scripts/bump-version.mjs --code-only   # re-upload, same user-facing version
node scripts/bump-version.mjs --show
```

Left to itself, `bubblewrap build` bumps the version and rewrites
`twa-manifest.json`, which makes CI and local builds disagree about what has
been published. `build-android.mjs` runs `bubblewrap update --skipVersionUpgrade`
against a scratch copy instead, so `android/twa-manifest.json` is never mutated
by a build.

---

## Changing how the app behaves

Edit `android/twa-manifest.json` — not the generated project, which is deleted
and recreated on every build. `MANIFEST-NOTES.md` explains every field and what
breaks if you change it.

| Want to change | Edit |
| --- | --- |
| App name on the launcher | `name` / `launcherName` |
| Splash and status bar colour | `backgroundColor` / `themeColor` |
| Which screen opens on launch | `startUrl` |
| Which URLs stay in the app | `fullScopeUrl`, `additionalTrustedOrigins` |
| Icons | Replace `public/icons/*`, keeping the sizes |
| Push notifications on/off | `enableNotifications` |

After changing icons, also update the `icons` array in `vite.config.ts` if sizes
or filenames changed, so the web manifest and the Android app stay in agreement.

---

## Troubleshooting

**The app shows a browser URL bar.** Digital Asset Links are not verifying.
Run `node scripts/write-assetlinks.mjs --check`. The usual cause is Play App
Signing — see above. Verify independently with Google's checker:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.zeroclubs.xyz&relation=delegate_permission/common.handle_all_urls
```

**"JDK version not supported. JDK version 17 is required."** You are on 11 or
21. Install Temurin 17 and point `JAVA_HOME` at it, or set `BUBBLEWRAP_JDK_PATH`
for this build only.

**"'C:\Program' is not recognized"** during signing. Bubblewrap concatenates
shell commands without quoting, so a space in `JAVA_HOME` breaks it. Gradle
compiles fine and it only fails at the very end. Give the JDK a space-free
alias:

```powershell
cmd /c mklink /J "C:\jdk17" "C:\Program Files\Eclipse Adoptium\jdk-17.0.x-hotspot"
setx BUBBLEWRAP_JDK_PATH "C:\jdk17"
```

Open a new terminal afterwards. `build-android.mjs` checks for this upfront, so
you should get a clear message rather than a failed build.

**"The provided androidSdk isn't correct."** Your SDK is fine; Bubblewrap's
check is out of date. It looks for `<sdk>/bin` or `<sdk>/tools`, the layout used
before command-line tools moved to `<sdk>/cmdline-tools/latest/bin`. Link the
path it expects to the real one — a junction, so it costs nothing:

```powershell
cmd /c mklink /J "%ANDROID_HOME%\bin" "%ANDROID_HOME%\cmdline-tools\latest\bin"
```

```bash
ln -s "$ANDROID_HOME/cmdline-tools/latest/bin" "$ANDROID_HOME/bin"
```

`build-android.mjs` detects this case and prints the exact command, so you
should never see Bubblewrap's bare message.

**"Version code N has already been used."** Play has seen that `versionCode`.
`node scripts/bump-version.mjs --code-only`, then rebuild.

**Icons look wrong or clipped on the launcher.** The adaptive icon foreground
comes from `public/icons/icon-maskable-512.png`. It must be fully opaque with
all artwork inside the central 80% circle; Android crops the rest.

**Gradle fails on a fresh machine.** The first build downloads the Android
Gradle Plugin and Gradle itself from `dl.google.com` and `services.gradle.org`.
Both need to be reachable.

**Rotation is locked / unlocked unexpectedly.** `orientation` in
`twa-manifest.json` is `default` on purpose, so live video rooms and games can
rotate. Setting it to `portrait` hard-locks the whole app.
