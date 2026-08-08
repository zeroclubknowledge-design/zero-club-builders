# Why `twa-manifest.json` says what it says

Every non-obvious field, and what breaks if it changes. Bubblewrap regenerates the
whole Android project from this file on each build, so this file — not the
generated `android/app/` tree — is the thing to edit.

| Field | Value | Reason |
| --- | --- | --- |
| `packageId` | `xyz.zeroclubs.app` | Permanent. Reverse-DNS of the domain we control, which is the domain that must serve `assetlinks.json`. **Cannot be changed after the first Play upload.** |
| `host` | `www.zeroclubs.xyz` | The verified origin. Must exactly match the host serving `/.well-known/assetlinks.json`. **`www` is the one that works** — the apex returns 404 for that path, so a TWA pointed at `zeroclubs.xyz` can never verify and always shows a browser URL bar. |
| `startUrl` | `/app` | Mirrors `start_url` in the web manifest, so the Android launcher and an installed PWA open the same screen. |
| `fullScopeUrl` | `https://www.zeroclubs.xyz/` | Mirrors web manifest `scope: "/"`. Anything inside this scope stays in the TWA; anything outside opens in a Custom Tab. Narrowing this would kick parts of the app out to the browser. |
| `orientation` | `default` | **Deliberately not `portrait`.** The web manifest requests portrait, but on Android `portrait` compiles to `android:screenOrientation="portrait"`, which hard-locks rotation. The web manifest's own comment says live video rooms and games must still work in landscape, so the TWA leaves rotation to the OS. |
| `enableNotifications` | `true` | `src/sw.ts` registers a `push` listener and calls `showNotification`. This flag makes Bubblewrap add notification delegation plus the `POST_NOTIFICATIONS` runtime permission required on Android 13+. Set to `false` and push silently stops working on Android. |
| `themeColor` / `backgroundColor` | `#F4F2EF` | Taken from the web manifest so the splash screen and status bar match the app shell — no white flash on launch. |
| `navigationColor` | `#F4F2EF` | Bubblewrap defaults this to `#000000`, which puts a black navigation bar under a light app. Overridden to match. |
| `themeColorDark` / `navigationColorDark` | `#000000` | Used when the device is in dark mode. |
| `iconUrl` | `/icons/icon-512.png` | Bubblewrap derives the legacy launcher icon and the splash image from this. |
| `maskableIconUrl` | `/icons/icon-maskable-512.png` | Becomes the Android adaptive icon foreground. Must be opaque with artwork inside the central 80% safe circle — a transparent edge-to-edge logo gets its extremities cropped by round/squircle masks. |
| `monochromeIconUrl` | `/icons/icon-monochrome-512.png` | Alpha silhouette used by Android 13+ themed icons. |
| `fallbackType` | `customtabs` | If the device's browser cannot host a Trusted Web Activity, fall back to a Custom Tab rather than a WebView. WebView fallback loses the shared cookie jar, so users would appear logged out. |
| `additionalTrustedOrigins` | `zeroclubs.xyz` | The apex, kept trusted so existing `zeroclubs.xyz` links still open in the app. Note it does **not** currently serve `assetlinks.json`, so links to it will show a URL bar until the apex either serves that file or redirects to `www`. Harmless either way — it only affects apex links, not the app itself. |
| `minSdkVersion` | `21` | Android 5.0. Below this there is no Custom Tabs / TWA support worth targeting. |
| `signingKey` | `./android.keystore`, alias `zeroclub-upload` | Path is relative to `android/`. The keystore itself is gitignored; see `README.md`. |
| `appVersion` / `appVersionCode` | injected | Do not hand-edit. `scripts/build-android.mjs` overwrites both from `version.json` on every build. |
| `fingerprints` | `[]` | Optional extra SHA-256 fingerprints. Leave empty; the real one lives in `assetlinks.json`. Populate only if you need a second signing identity trusted. |
| `shortcuts` | `[]` | Intentionally empty. Each shortcut needs its own `chosenIconUrl` fetched over HTTP at generate time; adding them with a placeholder icon degrades the long-press menu. Add real per-shortcut icons first. |

## Fields worth revisiting later

- **`features.playBilling`** — only if you sell digital goods in-app. Play requires
  Play Billing for digital content; note it also requires `enableNotifications: true`.
- **`shareTarget`** — lets other Android apps share into Zero Club. Needs a
  matching `share_target` entry in the web manifest first.
- **`serviceAccountJsonFile`** — enables `bubblewrap play publish` for automated
  Play Console uploads. Deliberately omitted so nothing can publish by accident.
