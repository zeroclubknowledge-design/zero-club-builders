#!/usr/bin/env node
/**
 * Writes public/.well-known/assetlinks.json — the Digital Asset Links file that
 * makes the Trusted Web Activity trusted.
 *
 * Without it, the app still launches but Chrome shows its URL bar over the top,
 * so it looks like a browser rather than an app. This is the single most common
 * reason a TWA "looks wrong" after install.
 *
 * IMPORTANT — Play App Signing:
 *   If you enrol in Play App Signing (the default), Google re-signs your upload
 *   with its own key. The fingerprint that ends up on users' devices is then
 *   Google's, NOT your upload key's. You must add that fingerprint too, from
 *   Play Console -> Test and release -> Setup -> App signing -> "SHA-256
 *   certificate fingerprint" under App signing key certificate.
 *
 *   Listing both is correct and expected: the upload key fingerprint verifies
 *   locally built APKs, the Play fingerprint verifies what users install.
 *
 * Usage:
 *   node scripts/write-assetlinks.mjs
 *       Read the fingerprint from android/android.keystore and write the file.
 *
 *   node scripts/write-assetlinks.mjs --add AA:BB:CC:...
 *       Add another fingerprint (use this for the Play App Signing key).
 *
 *   node scripts/write-assetlinks.mjs --check
 *       Compare the local file against what the live site is serving.
 *
 *   node scripts/write-assetlinks.mjs --print-secret
 *       Print the base64 keystore for the ANDROID_KEYSTORE_BASE64 CI secret.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ANDROID_DIR,
  BuildError,
  KEYSTORE_PATH,
  PUBLIC_DIR,
  TWA_MANIFEST,
  exists,
  keytoolPath,
  log,
  promptHidden,
  readSigningSecrets,
  resolveJdk,
  run,
  warn,
} from "./lib/android-env.mjs";

const ASSETLINKS_DIR = path.join(PUBLIC_DIR, ".well-known");
const ASSETLINKS_FILE = path.join(ASSETLINKS_DIR, "assetlinks.json");
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function normaliseFingerprint(value) {
  const upper = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!FINGERPRINT.test(upper)) {
    throw new BuildError(
      `"${value}" is not a SHA-256 fingerprint.\n` +
        "  Expected 32 colon-separated hex byte pairs, e.g. AA:BB:CC:...:FF",
    );
  }
  return upper;
}

/** Pulls the SHA-256 fingerprint out of `keytool -list -v` output. */
async function fingerprintFromKeystore(alias) {
  if (!(await exists(KEYSTORE_PATH))) {
    throw new BuildError(
      `No keystore at ${KEYSTORE_PATH}.\n` +
        "  Run: node scripts/generate-keystore.mjs\n" +
        "  Or supply a fingerprint directly: node scripts/write-assetlinks.mjs --add <SHA256>",
    );
  }

  const secrets = await readSigningSecrets();
  const storePassword =
    secrets?.keystorePassword ??
    (process.stdin.isTTY
      ? await promptHidden("Keystore password: ")
      : (() => {
          throw new BuildError(
            "Keystore password not available. Set BUBBLEWRAP_KEYSTORE_PASSWORD or create android/keystore.properties.",
          );
        })());

  const jdkPath = await resolveJdk();
  const { stdout } = await run(
    keytoolPath(jdkPath),
    ["-list", "-v", "-keystore", KEYSTORE_PATH, "-alias", alias, "-storepass", storePassword],
    { cwd: ANDROID_DIR, capture: true, redact: [storePassword] },
  );

  const match = stdout.match(/SHA256:\s*([0-9A-Fa-f:]{95})/);
  if (!match) {
    throw new BuildError("Could not find a SHA-256 fingerprint in the keytool output.");
  }
  return normaliseFingerprint(match[1]);
}

function buildStatement(packageId, fingerprints) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageId,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

async function existingFingerprints() {
  if (!(await exists(ASSETLINKS_FILE))) return [];
  try {
    const parsed = JSON.parse(await readFile(ASSETLINKS_FILE, "utf8"));
    return parsed?.[0]?.target?.sha256_cert_fingerprints ?? [];
  } catch {
    warn("Existing assetlinks.json could not be parsed; it will be replaced.");
    return [];
  }
}

async function check(packageId) {
  if (!(await exists(ASSETLINKS_FILE))) {
    throw new BuildError("No local assetlinks.json yet. Run this script without --check first.");
  }
  const local = JSON.parse(await readFile(ASSETLINKS_FILE, "utf8"));
  const url = "https://zeroclubs.xyz/.well-known/assetlinks.json";

  log(`Local file lists ${local[0].target.sha256_cert_fingerprints.length} fingerprint(s).`);
  log(`Fetching ${url} ...`);

  let response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch (error) {
    throw new BuildError(`Could not reach ${url}: ${error.message}`);
  }

  if (!response.ok) {
    throw new BuildError(
      `${url} responded ${response.status}.\n` +
        "  The file must be served over HTTPS, with no redirect, as application/json.",
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    warn(`Content-Type is "${contentType}"; Chrome expects application/json.`);
  }

  const remote = await response.json();
  const remoteFingerprints = remote?.[0]?.target?.sha256_cert_fingerprints ?? [];
  const remotePackage = remote?.[0]?.target?.package_name;

  if (remotePackage !== packageId) {
    throw new BuildError(`Live file declares package "${remotePackage}", expected "${packageId}".`);
  }

  const missing = local[0].target.sha256_cert_fingerprints.filter(
    (f) => !remoteFingerprints.includes(f),
  );
  if (missing.length > 0) {
    throw new BuildError(
      `Live file is missing ${missing.length} fingerprint(s):\n` +
        missing.map((f) => `    ${f}`).join("\n") +
        "\n  Deploy the site so the updated file is served.",
    );
  }

  log("Live assetlinks.json matches. The TWA will launch without a URL bar.");
}

async function main() {
  const args = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(TWA_MANIFEST, "utf8"));
  const packageId = manifest.packageId;
  const alias = manifest.signingKey?.alias ?? "zeroclub-upload";

  if (args.includes("--print-secret")) {
    if (!(await exists(KEYSTORE_PATH))) throw new BuildError(`No keystore at ${KEYSTORE_PATH}.`);
    process.stdout.write((await readFile(KEYSTORE_PATH)).toString("base64") + "\n");
    return;
  }

  if (args.includes("--check")) {
    await check(packageId);
    return;
  }

  const fingerprints = new Set(await existingFingerprints());

  const addIndex = args.indexOf("--add");
  if (addIndex !== -1) {
    const value = args[addIndex + 1];
    if (!value) throw new BuildError("--add needs a SHA-256 fingerprint.");
    fingerprints.add(normaliseFingerprint(value));
  } else {
    fingerprints.add(await fingerprintFromKeystore(alias));
  }

  await mkdir(ASSETLINKS_DIR, { recursive: true });
  await writeFile(
    ASSETLINKS_FILE,
    `${JSON.stringify(buildStatement(packageId, [...fingerprints]), null, 2)}\n`,
    "utf8",
  );

  log(`Wrote ${path.relative(process.cwd(), ASSETLINKS_FILE)}`);
  for (const f of fingerprints) console.log(`    ${f}`);
  console.log("");
  console.log("This file is served from public/, so it ships with the next site deploy to");
  console.log("https://zeroclubs.xyz/.well-known/assetlinks.json. Verify afterwards with:");
  console.log("    node scripts/write-assetlinks.mjs --check");

  if (fingerprints.size === 1) {
    console.log("");
    warn("Only one fingerprint listed. If you use Play App Signing, also add the");
    warn("App signing key fingerprint from the Play Console, or installs from Play");
    warn("will show a URL bar:");
    warn("    node scripts/write-assetlinks.mjs --add <PLAY_SHA256>");
  }
}

main().catch((error) => {
  console.error(`\nx ${error.message}`);
  process.exit(1);
});
