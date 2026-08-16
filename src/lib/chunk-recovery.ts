/**
 * Recover from a code chunk that no longer exists on the server.
 *
 * The app is code-split, so pages load their JavaScript on demand. Vite gives
 * every chunk a content hash, and a new deploy replaces those files with new
 * names. A browser that has been sitting on the old page since before the
 * deploy still holds the old names, so the moment it opens a page it has not
 * visited yet, it asks for a file that is no longer there:
 *
 *   Failed to fetch dynamically imported module: .../assets/app.premium-XXXX.js
 *
 * The service worker used to hide this by force-reloading on every update, at
 * the cost of throwing away whatever the person was doing each time they came
 * back to the app. Updates now wait for a cold start instead, which means this
 * error is possible and has to be handled properly rather than papered over.
 *
 * The handling is: reload once, quietly. Fresh HTML references the chunk names
 * that actually exist, so the page the person asked for opens normally.
 *
 * "Once" is the important part. A reload loop is far worse than the original
 * error, so a marker in sessionStorage means at most one automatic reload per
 * tab per minute. If it fails again the error surfaces normally and the
 * existing error screen offers a manual retry.
 */

const MARKER = "zc_chunk_reload_at";
const COOLDOWN_MS = 60_000;

/** Both the Vite and browser wordings for the same underlying failure. */
export function isChunkLoadError(value: unknown): boolean {
  const message =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : typeof value === "string"
      ? value
      : "";

  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("ChunkLoadError")
  );
}

/**
 * A stale app shell running against freshly deployed code.
 *
 * Distinct from a missing chunk: here the module loads fine, it just is not
 * the shape the running shell expects, so the router reads `component` off a
 * route that no longer exists in the build it was given. It surfaces as
 * "Cannot read properties of undefined (reading 'component')".
 *
 * Same cure as a missing chunk — one reload picks up an app shell and a route
 * tree that agree with each other. Kept narrow deliberately: only the router's
 * own property names, so an ordinary null-reference bug elsewhere still
 * reaches the error screen where it belongs.
 */
export function isStaleShellError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  return /Cannot read propert(y|ies) of undefined \(reading '(component|options|routeTree|_addFileChildren)'\)/.test(
    message,
  );
}

/**
 * Reload at most once per tab per minute. Returns false when the attempt was
 * suppressed, so the caller can fall back to showing an error instead.
 */
export function recoverFromChunkError(): boolean {
  return reloadOnce();
}

function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(MARKER) || 0);
    if (Date.now() - last < COOLDOWN_MS) return false;
    sessionStorage.setItem(MARKER, String(Date.now()));
  } catch {
    // Private mode with storage disabled. Reloading blind risks a loop, so
    // leave it to the error screen's manual retry.
    return false;
  }

  // Drop the service worker's precache first, or the reload can be served the
  // very manifest that points at the missing files.
  if ("serviceWorker" in navigator) {
    caches
      ?.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => undefined)
      .finally(() => window.location.reload());
  } else {
    window.location.reload();
  }
  return true;
}

/** Call once on the client. Safe to call more than once. */
export function installChunkRecovery() {
  if (typeof window === "undefined") return;
  if ((window as any).__zcChunkRecovery) return;
  (window as any).__zcChunkRecovery = true;

  // Vite's own signal for a failed module preload — fires before the import
  // rejects, so this is the earliest and cleanest place to catch it.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnce();
  });

  // A lazy import that rejects with nobody to catch it.
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason) || isStaleShellError(event.reason)) {
      event.preventDefault();
      reloadOnce();
    }
  });

  // Failure to load a <script> the router injected for a preload.
  window.addEventListener(
    "error",
    (event) => {
      if (isChunkLoadError(event.message) || isChunkLoadError(event.error)) {
        reloadOnce();
      }
    },
    true,
  );
}
