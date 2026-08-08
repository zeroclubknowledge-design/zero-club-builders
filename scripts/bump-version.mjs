#!/usr/bin/env node
/**
 * Single source of truth for Android app versioning.
 *
 * version.json holds:
 *   versionName - the human-facing string shown in Play ("1.4.2")
 *   versionCode - the integer Play uses for ordering. Play REJECTS an upload
 *                 whose versionCode is <= any versionCode already uploaded,
 *                 and a versionCode can never be reused. So this only ever
 *                 goes up, and it is committed to git so every machine and
 *                 every CI run agrees on what has already been published.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch     1.0.0 -> 1.0.1   code +1
 *   node scripts/bump-version.mjs minor     1.0.1 -> 1.1.0   code +1
 *   node scripts/bump-version.mjs major     1.1.0 -> 2.0.0   code +1
 *   node scripts/bump-version.mjs --set 2.3.1                code +1
 *   node scripts/bump-version.mjs --code-only                name unchanged
 *   node scripts/bump-version.mjs --show                     print, change nothing
 *
 * Flags:
 *   --json     machine-readable output (used by the build scripts and CI)
 *   --dry-run  compute the next version without writing version.json
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_FILE = path.join(ROOT, "version.json");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** Play's hard ceiling for versionCode. */
const MAX_VERSION_CODE = 2100000000;

function fail(message) {
  console.error(`bump-version: ${message}`);
  process.exit(1);
}

export async function readVersion() {
  let raw;
  try {
    raw = await readFile(VERSION_FILE, "utf8");
  } catch {
    fail(`could not read ${VERSION_FILE}. Expected {"versionName","versionCode"}.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`${VERSION_FILE} is not valid JSON: ${error.message}`);
  }

  const { versionName, versionCode } = parsed;

  if (typeof versionName !== "string" || !SEMVER.test(versionName)) {
    fail(`versionName must be MAJOR.MINOR.PATCH, got ${JSON.stringify(versionName)}`);
  }
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    fail(`versionCode must be a positive integer, got ${JSON.stringify(versionCode)}`);
  }
  if (versionCode > MAX_VERSION_CODE) {
    fail(`versionCode ${versionCode} exceeds Play's maximum of ${MAX_VERSION_CODE}`);
  }

  return { versionName, versionCode };
}

function bumpName(versionName, release) {
  const [, major, minor, patch] = versionName.match(SEMVER).map(Number);
  if (release === "major") return `${major + 1}.0.0`;
  if (release === "minor") return `${major}.${minor + 1}.0`;
  if (release === "patch") return `${major}.${minor}.${patch + 1}`;
  fail(`unknown release type "${release}" (expected major, minor or patch)`);
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const dryRun = args.includes("--dry-run");
  const current = await readVersion();

  const emit = (v, changed) => {
    if (asJson) {
      console.log(JSON.stringify({ ...v, changed }));
    } else {
      console.log(`versionName ${v.versionName}  versionCode ${v.versionCode}`);
    }
  };

  if (args.length === 0 || args.includes("--show")) {
    emit(current, false);
    return;
  }

  let next;
  const setIndex = args.indexOf("--set");

  if (setIndex !== -1) {
    const value = args[setIndex + 1];
    if (!value || !SEMVER.test(value)) {
      fail(`--set needs a MAJOR.MINOR.PATCH value, got ${JSON.stringify(value)}`);
    }
    next = { versionName: value, versionCode: current.versionCode + 1 };
  } else if (args.includes("--code-only")) {
    next = { versionName: current.versionName, versionCode: current.versionCode + 1 };
  } else {
    const release = args.find((a) => ["major", "minor", "patch"].includes(a));
    if (!release) fail("expected one of: major, minor, patch, --set <x.y.z>, --code-only, --show");
    next = {
      versionName: bumpName(current.versionName, release),
      versionCode: current.versionCode + 1,
    };
  }

  if (next.versionCode > MAX_VERSION_CODE) {
    fail(`next versionCode ${next.versionCode} exceeds Play's maximum of ${MAX_VERSION_CODE}`);
  }

  if (!dryRun) {
    await writeFile(VERSION_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  emit(next, true);
}

// Only run the CLI when invoked directly, so readVersion() can be imported.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error.message));
}
