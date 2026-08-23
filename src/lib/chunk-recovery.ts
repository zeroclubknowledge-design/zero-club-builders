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
const ATTEMPTS = "zc_chunk_reload_attempts";
const COOLDOWN_MS = 60_000;
/**
 * Three, because each attempt is a different remedy rather than the same one
 * repeated: clear the caches, then retire the service worker, then bypass it
 * entirely. Trying the same thing twice would just be a loop with extra steps.
 */
const MAX_ATTEMPTS = 3;

/** True while a recovery reload has been started and the page is on its way out. */
export function isRecovering(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).__zcRecovering);
}

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

/**
 * Why one reload was not enough.
 *
 * Clearing the caches and reloading looks like it should be sufficient, and it
 * was not, for two reasons that compound each other:
 *
 *   1. The old service worker is still the one controlling the page. Deletes
 *      from `caches` do not retire it — it activates on the next cold start —
 *      so it simply repopulates its precache from the manifest it was built
 *      with, the one naming the chunks that no longer exist.
 *
 *   2. Navigations are served NetworkFirst with a four second timeout. On a
 *      slow connection that timeout wins and the reload is answered with the
 *      *cached* HTML, which references the old chunk names all over again.
 *
 * So the reload lands right back on the error, inside the cooldown, and the
 * person is shown an update screen asking them to do the thing that just
 * failed twice. Each attempt below therefore does something the previous one
 * did not.
 */
function reloadOnce(): boolean {
  let attempt = 1;

  try {
    const last = Number(sessionStorage.getItem(MARKER) || 0);
    const previous = Number(sessionStorage.getItem(ATTEMPTS) || 0);

    // A fresh error long after the last one starts the sequence again; the
    // deploy that caused it is over and this is a new problem.
    attempt = Date.now() - last < COOLDOWN_MS ? previous + 1 : 1;
    if (attempt > MAX_ATTEMPTS) return false;

    sessionStorage.setItem(MARKER, String(Date.now()));
    sessionStorage.setItem(ATTEMPTS, String(attempt));
  } catch {
    // Private mode with storage disabled. Reloading blind risks a loop, so
    // leave it to the error screen's manual retry.
    return false;
  }

  (window as any).__zcRecovering = true;

  void (async () => {
    try {
      // Always: drop every cache, including the stale page HTML.
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // Storage refused. The steps below still stand a chance.
    }

    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();

        if (attempt === 1) {
          // Politely: ask the waiting worker to take over now instead of at
          // the next cold start, so the reload is served the new manifest.
          for (const registration of registrations) {
            registration.waiting?.postMessage({ type: "SKIP_WAITING" });
            await registration.update().catch(() => undefined);
          }
        } else {
          // Firmly: remove it. An unregistered worker cannot answer the next
          // navigation from a cache built against the previous deploy.
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
      }
    } catch {
      // Nothing more to do here; the reload below is still worth making.
    }

    reloadNow(attempt);
  })();

  return true;
}

/**
 * The last attempt goes to the network with a parameter the cache has never
 * seen, which no cached entry can match. It is dropped from the address bar
 * immediately afterwards so nobody ends up sharing a link with it attached.
 */
function reloadNow(attempt: number) {
  if (attempt < MAX_ATTEMPTS) {
    window.location.reload();
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_zc", String(Date.now()));
  window.location.replace(url.toString());
}

/*
 * Note there is deliberately no "clear the counter on a successful load".
 * The load that follows a recovery reload *is* successful — the error comes a
 * moment later, when the router reaches for the chunk. Resetting on load would
 * put the attempt count back to one every time and turn the escalation into an
 * endless loop of the first remedy. The cooldown does the resetting instead: a
 * new error a minute later is a new problem and starts from the top.
 */

/** Removes the cache-busting parameter so it never gets copied or shared. */
function tidyRecoveryParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_zc")) return;
    url.searchParams.delete("_zc");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // Cosmetic only.
  }
}

/** Call once on the client. Safe to call more than once. */
export function installChunkRecovery() {
  if (typeof window === "undefined") return;
  if ((window as any).__zcChunkRecovery) return;
  (window as any).__zcChunkRecovery = true;

  tidyRecoveryParam();

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
