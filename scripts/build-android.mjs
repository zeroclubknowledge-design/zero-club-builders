#!/usr/bin/env node
/**
 * Builds the Zero Club Android app (APK + AAB) from the PWA using Bubblewrap.
 *
 * Nothing about the web app changes: this reads public/ and android/twa-manifest.json,
 * and writes only to android/.twa/ (scratch) and android/out/ (artefacts). Both are
 * gitignored.
 *
 * What this wrapper adds over calling `bubblewrap build` directly:
 *
 *  1. Versions come from version.json, not from Bubblewrap's interactive prompt.
 *     Bubblewrap otherwise bumps appVersionCode itself and rewrites twa-manifest.json,
 *     which makes local and CI builds disagree about what has been published.
 *
 *  2. Icons are served from a throwaway local HTTP server over public/. Bubblewrap
 *     fetches icons over HTTP and rejects non-image content types, so pointing at the
 *     production URLs means you cannot build until the icons are deployed, and a stale
 *     CDN copy silently ships the wrong icon. Pass --remote-icons to use the real URLs.
 *
 *  3. It runs `update` explicitly before `build`. `build` alone would notice the missing
 *     checksum file and stop for an interactive confirmation, which hangs CI.
 *
 *  4. It uses an isolated Bubblewrap config file rather than ~/.bubblewrap/config.json,
 *     so a build here cannot be broken by, or break, another project on the machine.
 *
 *  5. Outputs are renamed with version and given a SHA-256 manifest, so an artefact
 *     can always be traced back to a commit.
 *
 * Usage:
 *   node scripts/build-android.mjs                  # signed APK + AAB
 *   node scripts/build-android.mjs --release patch  # bump version.json first
 *   node scripts/build-android.mjs --skip-signing   # unsigned, no keystore needed
 *   node scripts/build-android.mjs --remote-icons   # fetch icons from zeroclubs.xyz
 *   node scripts/build-android.mjs --dry-run        # prepare + validate, do not compile
 *
 * Requirements: JDK 17 (exactly), Android SDK, Node 18+.
 */

import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";

import {
  BuildError,
  KEYSTORE_PATH,
  OUT_DIR,
  PUBLIC_DIR,
  ROOT,
  TWA_MANIFEST,
  WORK_DIR,
  exists,
  fail,
  isWindows,
  log,
  promptHidden,
  readSigningSecrets,
  readVersion,
  resolveAndroidSdk,
  resolveJdk,
  run,
  warn,
} from "./lib/android-env.mjs";

/** Pinned so a Bubblewrap release cannot change the output of a reproducible build. */
const BUBBLEWRAP_VERSION = process.env.BUBBLEWRAP_VERSION ?? "1.25.0";

const PRODUCTION_ORIGIN = "https://zeroclubs.xyz";
const ICON_FIELDS = ["iconUrl", "maskableIconUrl", "monochromeIconUrl"];

/**
 * Bubblewrap downloads webManifestUrl and embeds it in the APK as
 * res/raw/web_app_manifest.json. Left pointing at production, the Android build
 * would silently bake in whatever is currently deployed rather than what is in
 * this working tree. These are the places `vite build` may leave the generated
 * manifest, most specific first.
 */
const LOCAL_WEB_MANIFEST_CANDIDATES = [
  "dist/client/manifest.webmanifest",
  "dist/manifest.webmanifest",
  ".output/public/manifest.webmanifest",
  "public/manifest.webmanifest",
];

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

/* ------------------------------------------------------------------ icons */

/** Finds the manifest emitted by `vite build`, if the web app has been built. */
async function findLocalWebManifest() {
  for (const candidate of LOCAL_WEB_MANIFEST_CANDIDATES) {
    const full = path.join(ROOT, candidate);
    if (await exists(full)) return { path: full, relative: candidate };
  }
  return null;
}

/**
 * Serves public/ on an ephemeral loopback port so Bubblewrap can fetch icons
 * without the site being deployed. Bound to 127.0.0.1 only.
 *
 * `overrides` maps a request path to a file outside public/ - used to serve the
 * built web manifest out of dist/.
 */
function servePublicDir(overrides = {}) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const requested = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
      const filePath = overrides[requested] ?? path.join(PUBLIC_DIR, requested);

      // Refuse anything that escapes public/ via .. segments.
      if (!overrides[requested] && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      if (!(await exists(filePath))) {
        res.writeHead(404, { "content-type": "text/plain" }).end(`not found: ${requested}`);
        return;
      }

      res.writeHead(200, {
        "content-type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
      });
      createReadStream(filePath).pipe(res);
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/** Fails early with a readable message rather than deep inside Bubblewrap. */
async function assertIconsExist(manifest) {
  const missing = [];
  for (const field of ICON_FIELDS) {
    const value = manifest[field];
    if (!value) continue;
    if (!value.startsWith(PRODUCTION_ORIGIN)) {
      fail(`${field} must be an absolute ${PRODUCTION_ORIGIN} URL, got "${value}"`);
    }
    const relative = value.slice(PRODUCTION_ORIGIN.length);
    if (!(await exists(path.join(PUBLIC_DIR, relative)))) {
      missing.push(`${field} -> public${relative}`);
    }
  }
  if (missing.length > 0) {
    fail(
      `Icons referenced by twa-manifest.json are not in public/:\n    ${missing.join("\n    ")}`,
    );
  }
}

/* ---------------------------------------------------------------- manifest */

/**
 * Produces the manifest Bubblewrap actually consumes: same content, but with
 * versions injected, the keystore path made absolute, and icon URLs pointed at
 * whichever origin we are serving from.
 */
async function writeEffectiveManifest({ version, iconOrigin, localWebManifest, skipSigning }) {
  const manifest = JSON.parse(await readFile(TWA_MANIFEST, "utf8"));

  await assertIconsExist(manifest);

  manifest.appVersion = version.versionName;
  manifest.appVersionCode = version.versionCode;

  if (iconOrigin && localWebManifest) {
    manifest.webManifestUrl = `${iconOrigin}/manifest.webmanifest`;
  }

  // Absolute path: Bubblewrap resolves signingKey.path relative to its own cwd,
  // which is the generated project directory, not the repo root.
  manifest.signingKey = { ...manifest.signingKey, path: KEYSTORE_PATH };

  if (iconOrigin) {
    for (const field of ICON_FIELDS) {
      if (manifest[field]) {
        manifest[field] = manifest[field].replace(PRODUCTION_ORIGIN, iconOrigin);
      }
    }
    for (const shortcut of manifest.shortcuts ?? []) {
      if (shortcut.chosenIconUrl?.startsWith(PRODUCTION_ORIGIN)) {
        shortcut.chosenIconUrl = shortcut.chosenIconUrl.replace(PRODUCTION_ORIGIN, iconOrigin);
      }
    }
  }

  const target = path.join(WORK_DIR, "twa-manifest.json");
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  if (!skipSigning && !(await exists(KEYSTORE_PATH))) {
    fail(
      `No keystore at ${KEYSTORE_PATH}.\n` +
        "  Create one:      node scripts/generate-keystore.mjs\n" +
        "  Or build unsigned: node scripts/build-android.mjs --skip-signing",
    );
  }

  return target;
}

/* ------------------------------------------------------------- environment */

/**
 * Bubblewrap builds shell command strings by concatenation without quoting, so
 * a space anywhere in the JDK or SDK path splits the command. It surfaces late
 * and cryptically - Gradle compiles fine, then signing dies with
 * "'C:\Program' is not recognized". Caught here instead, before the build.
 *
 * Only an issue on Windows: on POSIX these paths rarely contain spaces, and
 * Bubblewrap's own quoting there is adequate.
 */
function assertToolPathsAreShellSafe({ jdkPath, androidSdkPath }) {
  const offenders = [
    ["JDK", jdkPath, "BUBBLEWRAP_JDK_PATH"],
    ["Android SDK", androidSdkPath, "BUBBLEWRAP_ANDROID_SDK_PATH"],
  ].filter(([, value]) => /\s/.test(value));

  if (offenders.length === 0 || !isWindows) return;

  const lines = offenders.map(([label, value, envVar]) => {
    const link = `C:\\${label === "JDK" ? "jdk17" : "android-sdk"}`;
    return (
      `  ${label} path contains a space:\n` +
      `      ${value}\n\n` +
      `  Give it a space-free alias with a junction, then point ${envVar} at it:\n\n` +
      `      cmd /c mklink /J "${link}" "${value}"\n` +
      `      setx ${envVar} "${link}"\n`
    );
  });

  fail(
    "Bubblewrap cannot handle spaces in tool paths.\n\n" +
      lines.join("\n") +
      "\n  Open a new terminal afterwards so the variable is picked up.\n" +
      "  A junction is free - it points at the existing install, nothing is copied.",
  );
}

/* ------------------------------------------------------- generated project */

/**
 * Repairs the project Bubblewrap generates, before Gradle sees it.
 *
 * Bubblewrap 1.25 still emits `jcenter()`. JCenter stopped accepting new
 * publications in 2021 and is now a frozen, frequently unreachable archive.
 * Leaving it in means every dependency resolution races a dead host, and a
 * miss there fails the build outright. mavenCentral() is where
 * androidbrowserhelper actually lives.
 *
 * This runs on every build because the project is deleted and regenerated each
 * time, so editing the file by hand would not survive.
 */
async function patchGeneratedProject() {
  const buildGradle = path.join(WORK_DIR, "build.gradle");
  if (!(await exists(buildGradle))) return;

  const original = await readFile(buildGradle, "utf8");
  if (!original.includes("jcenter()")) return;

  await writeFile(buildGradle, original.split("jcenter()").join("mavenCentral()"), "utf8");
  log("Replaced the retired jcenter() repository with mavenCentral()");
}

/* ------------------------------------------------------------------ output */

async function sha256(file) {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

async function collectArtefacts(version, skipSigning) {
  await mkdir(OUT_DIR, { recursive: true });

  const candidates = skipSigning
    ? [
        ["app-release-unsigned-aligned.apk", `zero-club-${version.versionName}-unsigned.apk`],
        [
          "app/build/outputs/bundle/release/app-release.aab",
          `zero-club-${version.versionName}-unsigned.aab`,
        ],
      ]
    : [
        ["app-release-signed.apk", `zero-club-${version.versionName}.apk`],
        ["app-release-bundle.aab", `zero-club-${version.versionName}.aab`],
      ];

  const produced = [];
  for (const [source, destination] of candidates) {
    const from = path.join(WORK_DIR, source);
    if (!(await exists(from))) {
      warn(`Expected output missing: ${source}`);
      continue;
    }
    const to = path.join(OUT_DIR, destination);
    await copyFile(from, to);
    produced.push({ file: destination, sha256: await sha256(to) });
  }

  if (produced.length === 0) fail("Bubblewrap produced no APK or AAB.");

  let commit = null;
  try {
    const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: ROOT, capture: true });
    commit = stdout.trim();
  } catch {
    // Not a git checkout, or git unavailable. Not fatal.
  }

  const info = {
    app: "Zero Club",
    packageId: JSON.parse(await readFile(TWA_MANIFEST, "utf8")).packageId,
    versionName: version.versionName,
    versionCode: version.versionCode,
    signed: !skipSigning,
    bubblewrap: BUBBLEWRAP_VERSION,
    builtAt: new Date().toISOString(),
    commit,
    artefacts: produced,
  };

  await writeFile(
    path.join(OUT_DIR, "build-info.json"),
    `${JSON.stringify(info, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "SHA256SUMS.txt"),
    `${produced.map((a) => `${a.sha256}  ${a.file}`).join("\n")}\n`,
    "utf8",
  );

  return info;
}

/* ---------------------------------------------------------------- scratch */

/**
 * Clears the scratch project so each build starts from a known state.
 *
 * Gradle leaves a daemon running after every build, and on Windows that daemon
 * keeps handles open on its own outputs - deleting them fails with EBUSY. So we
 * ask the daemon to exit first, then delete with retries for anything still
 * settling (antivirus and Explorer previews both hold brief locks).
 */
async function resetWorkDir() {
  if (!(await exists(WORK_DIR))) return;

  const wrapper = path.join(WORK_DIR, isWindows ? "gradlew.bat" : "gradlew");
  if (await exists(wrapper)) {
    log("Stopping the Gradle daemon so its files can be replaced...");
    // Failure is fine: there may be no daemon running.
    await run(wrapper, ["--stop"], {
      cwd: WORK_DIR,
      capture: true,
      shell: isWindows,
    }).catch(() => {});
  }

  try {
    // maxRetries/retryDelay make Node retry EBUSY, EPERM and ENOTEMPTY, which
    // is exactly the Windows lock-release race.
    await rm(WORK_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    fail(
      `Could not clear the scratch directory:\n    ${WORK_DIR}\n\n` +
        `  ${error.message}\n\n` +
        "  Something still holds a file open. Usually a Gradle daemon or an\n" +
        "  editor with the folder open. Try:\n" +
        `      cd "${WORK_DIR}" ; .\\gradlew.bat --stop\n` +
        "  then rerun. To skip the wipe entirely, pass --keep.",
    );
  }
}

/* -------------------------------------------------------------------- main */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipSigning = args.includes("--skip-signing");
  const useRemoteIcons = args.includes("--remote-icons");
  const keepWorkDir = args.includes("--keep");

  const releaseIndex = args.indexOf("--release");
  if (releaseIndex !== -1) {
    const kind = args[releaseIndex + 1];
    if (!["major", "minor", "patch"].includes(kind)) {
      fail("--release needs one of: major, minor, patch");
    }
    log(`Bumping version (${kind})...`);
    await run(process.execPath, [path.join(ROOT, "scripts", "bump-version.mjs"), kind]);
  }

  const version = await readVersion();
  log(`Building Zero Club ${version.versionName} (versionCode ${version.versionCode})`);

  const jdkPath = await resolveJdk();
  log(`JDK 17: ${jdkPath}`);
  const androidSdkPath = await resolveAndroidSdk();
  log(`Android SDK: ${androidSdkPath}`);

  assertToolPathsAreShellSafe({ jdkPath, androidSdkPath });

  // Fresh scratch directory every time. Bubblewrap's own `update` deletes only
  // the files it knows about, so leftovers from an older manifest can survive.
  if (!keepWorkDir) await resetWorkDir();
  await mkdir(WORK_DIR, { recursive: true });

  let iconServer = null;
  let localWebManifest = null;

  if (useRemoteIcons) {
    warn(
      `Using ${PRODUCTION_ORIGIN} for icons and the web manifest - both must already be deployed.`,
    );
  } else {
    localWebManifest = await findLocalWebManifest();
    iconServer = await servePublicDir(
      localWebManifest ? { "/manifest.webmanifest": localWebManifest.path } : {},
    );
    log(`Serving public/ at ${iconServer.origin} for asset generation`);

    if (localWebManifest) {
      log(`Embedding the web manifest from ${localWebManifest.relative}`);
    } else {
      warn("No built web manifest found, so the one at");
      warn(`  ${PRODUCTION_ORIGIN}/manifest.webmanifest will be embedded instead.`);
      warn("  That is whatever is currently deployed, which may not match this working tree.");
      warn("  Run `npm run build` first to embed the manifest from this checkout.");
    }
  }

  try {
    const manifestPath = await writeEffectiveManifest({
      version,
      iconOrigin: iconServer?.origin,
      localWebManifest,
      skipSigning,
    });

    // Isolated config so we neither read nor write ~/.bubblewrap/config.json.
    const configPath = path.join(WORK_DIR, "bubblewrap-config.json");
    await writeFile(configPath, JSON.stringify({ jdkPath, androidSdkPath }, null, 2), "utf8");

    const signingEnv = {};
    if (!skipSigning) {
      const secrets = await readSigningSecrets();
      if (secrets) {
        log(`Signing with credentials from ${secrets.source}`);
        signingEnv.BUBBLEWRAP_KEYSTORE_PASSWORD = secrets.keystorePassword;
        signingEnv.BUBBLEWRAP_KEY_PASSWORD = secrets.keyPassword;
      } else if (process.stdin.isTTY) {
        const password = await promptHidden("Keystore password: ");
        signingEnv.BUBBLEWRAP_KEYSTORE_PASSWORD = password;
        signingEnv.BUBBLEWRAP_KEY_PASSWORD = password;
      } else {
        fail(
          "No signing credentials. Provide BUBBLEWRAP_KEYSTORE_PASSWORD and\n" +
            "  BUBBLEWRAP_KEY_PASSWORD, create android/keystore.properties, or pass --skip-signing.",
        );
      }
    }

    if (dryRun) {
      log("Dry run: manifest, icons, JDK, SDK and signing inputs all check out.");
      log(`Effective manifest: ${path.relative(ROOT, manifestPath)}`);
      return;
    }

    const cli = `@bubblewrap/cli@${BUBBLEWRAP_VERSION}`;
    const common = [
      `--manifest=${manifestPath}`,
      `--directory=${WORK_DIR}`,
      `--config=${configPath}`,
    ];

    // Explicit update with --skipVersionUpgrade: version.json owns the version,
    // and this writes the checksum file so `build` will not stop to ask.
    log("Generating the Android project...");
    // shell: true because npx is npx.cmd on Windows and Node will not spawn a
    // .cmd directly. run() quotes each argument, so paths containing spaces
    // (like "New Zero Club APK") survive cmd.exe re-splitting the command line.
    await run("npx", ["--yes", cli, "update", "--skipVersionUpgrade", ...common], {
      cwd: WORK_DIR,
      shell: true,
    });

    await patchGeneratedProject();

    log("Compiling APK and AAB (Gradle may take a few minutes on a cold cache)...");
    await run(
      "npx",
      [
        "--yes",
        cli,
        "build",
        "--skipPwaValidation",
        ...(skipSigning ? ["--skipSigning"] : []),
        ...common,
      ],
      {
        cwd: WORK_DIR,
        env: signingEnv,
        shell: true,
        redact: [signingEnv.BUBBLEWRAP_KEYSTORE_PASSWORD, signingEnv.BUBBLEWRAP_KEY_PASSWORD],
      },
    );

    const info = await collectArtefacts(version, skipSigning);

    console.log("");
    log(`Done. Artefacts in ${path.relative(ROOT, OUT_DIR)}/`);
    for (const artefact of info.artefacts) {
      console.log(`    ${artefact.file}`);
      console.log(`      sha256 ${artefact.sha256}`);
    }
    console.log("");
    console.log("  Upload the .aab to Play. The .apk is for sideloading and device testing:");
    console.log(
      `    adb install -r android/out/${info.artefacts.find((a) => a.file.endsWith(".apk"))?.file}`,
    );
    if (!skipSigning) {
      console.log("");
      console.log("  If the installed app shows a browser URL bar, assetlinks.json is not");
      console.log("  matching. Check with: node scripts/write-assetlinks.mjs --check");
    }
  } finally {
    if (iconServer) await iconServer.close();
  }
}

main().catch((error) => {
  console.error(`\nx ${error instanceof BuildError ? error.message : error.stack}`);
  process.exit(1);
});
