/**
 * Shared helpers for the Android build scripts.
 *
 * Deliberately dependency-free: these run before `npm install` on a fresh
 * machine and inside CI, so they use only Node built-ins.
 */

import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ANDROID_DIR = path.join(ROOT, "android");
/**
 * Scratch directory for the generated Android project.
 *
 * The final path segment becomes Gradle's rootProject.name, because the
 * settings.gradle Bubblewrap emits is just `include ':app'` with no explicit
 * name. Gradle 8.11 rejects project names that start or end with a dot, so this
 * segment must not be dot-prefixed. The hidden `.build` parent keeps the whole
 * thing out of the way instead.
 */
export const WORK_DIR = path.join(ANDROID_DIR, ".build", "twa");
export const OUT_DIR = path.join(ANDROID_DIR, "out");
export const KEYSTORE_PATH = path.join(ANDROID_DIR, "android.keystore");
export const KEYSTORE_PROPERTIES = path.join(ANDROID_DIR, "keystore.properties");
export const TWA_MANIFEST = path.join(ANDROID_DIR, "twa-manifest.json");
export const PUBLIC_DIR = path.join(ROOT, "public");

/** Bubblewrap 1.25 hard-requires exactly these. Checked upfront so failures are legible. */
export const REQUIRED_JDK_MAJOR = "17";
export const REQUIRED_BUILD_TOOLS = "36.1.0";

export const isWindows = process.platform === "win32";

export function log(message) {
  process.stdout.write(`[36m›[0m ${message}\n`);
}

export function warn(message) {
  process.stdout.write(`[33m![0m ${message}\n`);
}

export class BuildError extends Error {}

export function fail(message) {
  throw new BuildError(message);
}

export async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wraps a value in double quotes if cmd.exe would otherwise split it.
 *
 * Only needed when spawning through a shell. Paths like
 * "C:\Program Files\..." break without this, because Node concatenates argv
 * into a single command line and cmd.exe re-splits it on spaces.
 */
function quoteForShell(value) {
  const text = String(value);
  if (text.length > 0 && !/[\s&|<>^"]/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

/**
 * Runs a command, streaming its output. Rejects on a non-zero exit code.
 *
 * `env`     merged over process.env, so secrets can be injected per-call.
 * `shell`   only for .cmd/.bat shims such as npx.cmd, which Node refuses to
 *           spawn directly on Windows. Real executables are spawned without a
 *           shell, which is both safer and immune to the space-splitting above.
 * `redact`  values scrubbed from any error message. Passwords are passed as
 *           argv, and argv ends up in the failure text otherwise.
 */
export function run(
  command,
  args,
  { cwd = ROOT, env = {}, capture = false, shell = false, redact = [] } = {},
) {
  return new Promise((resolve, reject) => {
    const useShell = shell && isWindows;

    const scrub = (text) =>
      redact.filter(Boolean).reduce((acc, secret) => acc.split(secret).join("***"), String(text));

    const child = spawn(
      useShell ? quoteForShell(command) : command,
      useShell ? args.map(quoteForShell) : args,
      {
        cwd,
        env: { ...process.env, ...env },
        stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
        shell: useShell,
      },
    );

    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
    }

    child.on("error", (error) =>
      reject(new BuildError(scrub(`could not run "${command}": ${error.message}`))),
    );
    child.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(
        new BuildError(
          scrub(
            `"${command} ${args.join(" ")}" exited with code ${code}` +
              (capture && stderr.trim() ? `\n${stderr.trim()}` : ""),
          ),
        ),
      );
    });
  });
}

/** Locates a JDK and verifies it is version 17, which Bubblewrap requires exactly. */
export async function resolveJdk() {
  const candidates = [
    process.env.BUBBLEWRAP_JDK_PATH,
    process.env.JAVA_HOME_17_X64, // GitHub-hosted runners expose this
    process.env.JAVA_HOME,
  ].filter(Boolean);

  if (candidates.length === 0) {
    fail(
      "No JDK found. Set JAVA_HOME (or BUBBLEWRAP_JDK_PATH) to a JDK 17 install.\n" +
        "  Bubblewrap 1.25 requires JDK 17 specifically - 11 and 21 are both rejected.",
    );
  }

  for (const candidate of candidates) {
    const releaseFile = path.join(candidate, "release");
    try {
      const release = await readFile(releaseFile, "utf8");
      if (release.includes(`JAVA_VERSION="${REQUIRED_JDK_MAJOR}.0`)) return candidate;
    } catch {
      // No readable release file - try the next candidate.
    }
  }

  fail(
    `None of these look like a JDK ${REQUIRED_JDK_MAJOR} install:\n` +
      candidates.map((c) => `    ${c}`).join("\n") +
      `\n  Bubblewrap reads <JDK>/release and requires JAVA_VERSION="${REQUIRED_JDK_MAJOR}.0...".` +
      "\n  Install Temurin 17 and point JAVA_HOME at it, or set BUBBLEWRAP_JDK_PATH.",
  );
}

/**
 * Locates the Android SDK, applying Bubblewrap's own validation rules.
 *
 * Bubblewrap checks for `<sdk>/tools` or `<sdk>/bin` and rejects the path
 * otherwise, with the unhelpful message "The provided androidSdk isn't
 * correct." That expects the legacy layout, where the command-line tools sit
 * directly at the SDK root. Modern installs put them at
 * `<sdk>/cmdline-tools/latest/bin`, which fails the check even though the SDK
 * is complete. We detect that case specifically and say how to fix it, rather
 * than letting the build die twenty seconds later with no explanation.
 */
export async function resolveAndroidSdk() {
  const candidates = [
    process.env.BUBBLEWRAP_ANDROID_SDK_PATH,
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), "AppData", "Local", "Android", "Sdk"),
    path.join(os.homedir(), "Library", "Android", "sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
  ].filter(Boolean);

  /** Mirrors AndroidSdkTools.validatePath from @bubblewrap/core. */
  const passesBubblewrapCheck = async (dir) =>
    (await exists(path.join(dir, "tools"))) || (await exists(path.join(dir, "bin")));

  const seen = [];

  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue;
    seen.push(candidate);

    const hasBuildTools = await exists(path.join(candidate, "build-tools"));

    if (await passesBubblewrapCheck(candidate)) {
      if (!hasBuildTools) {
        fail(
          `Android SDK at ${candidate} has no build-tools directory.\n` +
            `  Install it:  sdkmanager --install "build-tools;${REQUIRED_BUILD_TOOLS}"`,
        );
      }
      return candidate;
    }

    // Complete SDK, wrong shape. This is the common modern layout.
    if (await exists(path.join(candidate, "cmdline-tools", "latest", "bin"))) {
      const link = path.join(candidate, "bin");
      const target = path.join(candidate, "cmdline-tools", "latest", "bin");
      fail(
        `Android SDK at ${candidate} is complete, but Bubblewrap cannot read it.\n\n` +
          `  Bubblewrap looks for "${link}" or "${path.join(candidate, "tools")}".\n` +
          `  Your command-line tools are at "${target}" instead, which is the\n` +
          `  layout every current Android SDK uses. Bubblewrap has not caught up.\n\n` +
          `  Fix it by linking the directory Bubblewrap expects to the real one:\n\n` +
          (isWindows
            ? `      cmd /c mklink /J "${link}" "${target}"\n\n` +
              `  A junction needs no admin rights and takes no extra disk space.\n`
            : `      ln -s "${target}" "${link}"\n`) +
          `\n  Then rerun this command. Nothing else about your SDK needs to change.`,
      );
    }
  }

  fail(
    "Android SDK not found. Set ANDROID_HOME to your SDK directory.\n" +
      "  Looked in:\n" +
      (seen.length ? seen : candidates).map((c) => `    ${c}`).join("\n") +
      `\n  It needs build-tools ${REQUIRED_BUILD_TOOLS} and a cmdline-tools install.`,
  );
}

/** Resolves the keytool binary that ships with the JDK. */
export function keytoolPath(jdkPath) {
  return path.join(jdkPath, "bin", isWindows ? "keytool.exe" : "keytool");
}

/**
 * Reads keystore.properties if present. This file is gitignored and holds the
 * two passwords Bubblewrap needs. Environment variables always win, so CI can
 * supply them from secrets without a file on disk.
 */
export async function readSigningSecrets() {
  const fromEnv = {
    keystorePassword: process.env.BUBBLEWRAP_KEYSTORE_PASSWORD,
    keyPassword: process.env.BUBBLEWRAP_KEY_PASSWORD,
  };
  if (fromEnv.keystorePassword && fromEnv.keyPassword) {
    return { ...fromEnv, source: "environment" };
  }

  if (await exists(KEYSTORE_PROPERTIES)) {
    const parsed = Object.fromEntries(
      (await readFile(KEYSTORE_PROPERTIES, "utf8"))
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );
    const keystorePassword = fromEnv.keystorePassword ?? parsed.storePassword;
    const keyPassword = fromEnv.keyPassword ?? parsed.keyPassword;
    if (keystorePassword && keyPassword) {
      return { keystorePassword, keyPassword, source: "android/keystore.properties" };
    }
  }

  return null;
}

/** Prompts on the TTY without echoing what is typed. */
export function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      if ([`\n`, `\r`, ``].includes(char.toString("utf8"))) {
        process.stdin.removeListener("data", onData);
      } else {
        process.stdout.write(`[2K[200D${question}`);
      }
    };
    process.stdin.on("data", onData);
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

export function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Reads and validates version.json. */
export async function readVersion() {
  const raw = await readFile(path.join(ROOT, "version.json"), "utf8");
  const { versionName, versionCode } = JSON.parse(raw);
  if (!/^\d+\.\d+\.\d+$/.test(versionName ?? "")) {
    fail(`version.json: versionName must be MAJOR.MINOR.PATCH, got ${JSON.stringify(versionName)}`);
  }
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    fail(
      `version.json: versionCode must be a positive integer, got ${JSON.stringify(versionCode)}`,
    );
  }
  return { versionName, versionCode };
}
