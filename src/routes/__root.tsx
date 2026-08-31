import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { lazy, Suspense, useState, useEffect } from "react";
import { LiveSessionProvider, useLiveSession } from "@/contexts/LiveSessionContext";
import { isChunkLoadError, isRecovering, isStaleShellError, recoverFromChunkError } from "@/lib/chunk-recovery";

const GlobalLiveRoom = lazy(() => 
  import("@/components/GlobalLiveRoom")
    .then(m => ({ default: m.GlobalLiveRoom }))
    .catch((error) => {
      console.error("GlobalLiveRoom import failed:", error);
      // Guarded: this used to reload unconditionally, so a chunk that stayed
      // missing would reload the app forever. The live room is optional, so
      // when recovery is on cooldown the app renders without it rather than
      // taking the whole page down.
      if (isChunkLoadError(error)) recoverFromChunkError();
      return { default: () => null };
    })
);

function ClientOnlyGlobalLiveRoom() {
  const { isActive } = useLiveSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The Agora/live-room bundle is one of the largest parts of the app. Loading
  // it on every page made normal navigation and button taps compete with video
  // code parsing, especially on mobile. Only download it when a live session
  // has actually been started.
  if (!mounted || !isActive) return null;
  return (
    <Suspense fallback={null}>
      <GlobalLiveRoom />
    </Suspense>
  );
}
function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-7xl font-bold text-gradient">404</h1>
        <p className="mt-3 text-muted-foreground">This door isn't on the floorplan.</p>
        <Link to="/" className="mt-6 inline-flex rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow">
          Back to the club
        </Link>
      </div>
    </div>
  );
}

const isNetworkFailure = (error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error || "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|internet disconnected|err_internet|timeout|timed out/i.test(message);
};

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [retrying, setRetrying] = useState(false);
  const needsRefresh = isChunkLoadError(error) || isStaleShellError(error);
  const connectionProblem = !online || isNetworkFailure(error);

  /*
   * An update is the app's problem, not the person's.
   *
   * A stale chunk is fixed by a reload, and the app can do that itself. Showing
   * a card headed "Zero Club is updating" with a Reload button asked people to
   * perform a mechanical step on the app's behalf, and it appeared at the worst
   * possible moment — mid-tap, on the way to somewhere they wanted to be.
   *
   * So while recovery is running, this renders nothing at all. The reload is
   * already on its way and the screen would be gone before it could be read.
   */
  const [recovering, setRecovering] = useState(() => needsRefresh && isRecovering());

  const retry = async () => {
    if (!online) return;
    setRetrying(true);
    try {
      await router.invalidate();
    } catch (retryError) {
      console.warn("Page retry did not complete", retryError);
    } finally {
      reset();
      setRetrying(false);
    }
  };

  useEffect(() => {
    console.error("Zero Club page error", {
      path: typeof window === "undefined" ? "unknown" : window.location.pathname,
      error,
    });

    // Guarded, so a build that stays broken eventually shows this screen
    // rather than reloading forever. A manual reload remains available below.
    if (isChunkLoadError(error) || isStaleShellError(error)) {
      if (recoverFromChunkError()) {
        setRecovering(true);
      } else {
        console.warn("Automatic app update recovery is exhausted.");
        setRecovering(false);
      }
    }
  }, [error]);

  useEffect(() => {
    const handleOffline = () => setOnline(false);
    const handleOnline = () => {
      setOnline(true);
      setRetrying(true);
      void router.invalidate()
        .catch((retryError) => console.warn("Reconnect retry did not complete", retryError))
        .finally(() => {
          reset();
          setRetrying(false);
        });
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [reset, router]);

  // Blank rather than a spinner: the page is milliseconds from being replaced,
  // and a flash of loading UI reads as a second thing going wrong.
  if (recovering) return null;

  const title = connectionProblem
    ? "You're offline"
    : needsRefresh
      ? "This page needs a reload"
      : "This page couldn't open";
  const description = connectionProblem
    ? "Check your connection. We’ll reconnect this page as soon as you’re back online."
    : needsRefresh
      ? "We tried to update in the background and it did not take. One reload should sort it."
      : "Your other pages are still safe. Try opening this page again or return to your feed.";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_24px_80px_-36px_rgba(0,0,0,0.45)]">
        <div className="flex flex-col items-center px-7 pb-8 pt-9 text-center">
          <div className="relative grid h-16 w-16 place-items-center rounded-[22px] bg-primary/10 ring-1 ring-primary/15">
            <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-[15px]" loading="lazy" decoding="async" />
            <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-4 ring-card ${connectionProblem ? "bg-amber-500" : "bg-primary"}`} />
          </div>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Zero Club</p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{description}</p>

          <div className="mt-7 grid w-full gap-2.5">
            <button
              type="button"
              onClick={needsRefresh ? () => window.location.reload() : retry}
              disabled={retrying || (connectionProblem && !online)}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-[13px] font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-55"
            >
              {retrying ? "Reconnecting…" : !online ? "Waiting for connection…" : needsRefresh ? "Reload Zero Club" : "Try again"}
            </button>
            <Link
              to="/app"
              className="flex h-11 w-full items-center justify-center rounded-xl border border-border bg-background px-5 text-[13px] font-semibold text-foreground transition hover:bg-accent active:scale-[0.98]"
            >
              Return to feed
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" },
      { name: "theme-color", content: "#f4f2ef" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Zero Club" },
      /* The fallback preview for every link that does not draw its own.
         It said "a private club for builders" and described earning XP, which
         Zero Club stopped doing — quests pay ZP — and the picture it pointed at
         was still a lovable.app export on a third-party bucket. */
      { title: "Zero Club — Build skills. Build proof. Build opportunities." },
      { name: "description", content: "Learn in live bootcamps, ship work in public, join serious communities — and turn proof of work into reputation and income." },
      { property: "og:title", content: "Zero Club — Build skills. Build proof. Build opportunities." },
      { property: "og:description", content: "Learn in live bootcamps, ship work in public, join serious communities — and turn proof of work into reputation and income." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Zero Club — Build skills. Build proof. Build opportunities." },
      { name: "twitter:description", content: "Learn in live bootcamps, ship work in public, join serious communities — and turn proof of work into reputation and income." },
      { property: "og:image", content: "https://www.zeroclubs.xyz/api/og-default" },
      { name: "twitter:image", content: "https://www.zeroclubs.xyz/api/og-default" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      /*
       * The tab icon.
       *
       * There was no icon link at all — not a broken path, simply nothing
       * declared. A browser with no favicon draws its own tile from the first
       * letters of the site name, which is where "ZO" came from. The PWA icons
       * already existed and were already being shipped; nothing was pointing
       * the browser at them.
       *
       * Two sizes because a tab wants roughly 32px and a bookmark or a pinned
       * shortcut wants far more, and left to one file the browser will scale
       * whichever it has. apple-touch-icon is separate: iOS ignores rel="icon"
       * when a page is saved to the home screen.
       */
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icons/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Montserrat:wght@400;500;600;700;800;900&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var root = document.documentElement;
                root.classList.remove('dark', 'dim', 'lights-out', 'rose-noir', 'premium');

                // Signed-out pages have their own light/dark choice, kept
                // separately from the member's app theme. It has to be applied
                // HERE, before first paint. Applying it from a React effect
                // instead meant the page painted with the app theme and then
                // visibly flipped — and mutating <html> during hydration is
                // exactly the kind of thing that makes a page blank out.
                var p = location.pathname;
                var isPublic = p === '/' || p === '/docs' || p === '/signin' ||
                               p === '/signup' || p.indexOf('/explore/') === 0;

                if (isPublic) {
                  if (localStorage.getItem('zc_public_theme') === 'dark') {
                    root.classList.add('dark');
                  }
                } else {
                  var dM = localStorage.getItem('darkMode') || 'off';
                  var dT = localStorage.getItem('darkTheme') || 'lights-out';
                  if (dM !== 'premium') {
                    var isD = dM === 'on' || (dM === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                    if (isD) {
                      root.classList.add('dark');
                      root.classList.add(dT);
                    }
                  }
                }

                var themeMeta = document.querySelector('meta[name="theme-color"]');
                if (themeMeta) {
                  themeMeta.content = root.classList.contains('dark')
                    ? (root.classList.contains('lights-out') ? '#000000'
                      : root.classList.contains('rose-noir') ? '#0a0409'
                      : '#100e13')
                    : '#f4f2ef';
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}<Scripts /></body>
    </html>
  );
}

import { Toaster } from "sonner";
import { setupMultiAccountSync } from "@/lib/multiAccount";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    let stopUpdateChecks: (() => void) | undefined;

    if ('serviceWorker' in navigator) {
      // Registered as a classic script: module service workers are still
      // unsupported in Firefox, and the worker needs no module features.
      // Registration is deferred until the page is idle so it never competes
      // with the first render.
      let registration: ServiceWorkerRegistration | undefined;

      const registerServiceWorker = () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => { registration = reg; })
          .catch((error) => {
            console.warn('Service worker registration failed:', error);
          });
      };

      if (document.readyState === 'complete') {
        registerServiceWorker();
      } else {
        window.addEventListener('load', registerServiceWorker, { once: true });
      }

      /*
       * Look for a new worker when the app comes back to the foreground.
       *
       * A worker only notices a deploy when something asks it to check, and
       * nothing did — so a phone left open for days kept serving a manifest
       * that named chunks the server had already replaced, and the person met
       * an update error the moment they opened a page they had not visited.
       *
       * This only checks. It does not activate anything or reload the page,
       * because doing that mid-session swaps the assets out from under code
       * that is already running. Returning to the app is simply the natural
       * moment to find out that an update exists.
       */
      const checkForUpdate = () => {
        if (document.hidden) return;
        registration?.update().catch(() => undefined);
      };

      document.addEventListener('visibilitychange', checkForUpdate);
      stopUpdateChecks = () => document.removeEventListener('visibilitychange', checkForUpdate);
    }

    // Initialize multi-account session sync
    setupMultiAccountSync();

    return () => stopUpdateChecks?.();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LiveSessionProvider>
        <div vaul-drawer-wrapper="">
          <Outlet />
          <ClientOnlyGlobalLiveRoom />
        </div>
        <Toaster 
          position="top-center" 
          toastOptions={{
            unstyled: true,
            classNames: {
              toast: "flex w-[calc(100vw-24px)] max-w-[340px] items-center gap-2.5 rounded-md border border-border/50 bg-card/97 px-3 py-2.5 font-sans text-[12px] font-medium text-foreground shadow-[0_12px_32px_-16px_rgba(0,0,0,0.45)] backdrop-blur-xl",
              title: "text-[12px] font-semibold leading-4 tracking-tight text-foreground",
              description: "mt-0.5 text-[11px] font-normal leading-4 text-muted-foreground",
              actionButton: "ml-auto shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground",
              cancelButton: "ml-auto shrink-0 rounded-md bg-muted px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground",
              success: "!border-emerald-500/25",
              error: "!border-red-500/25",
              info: "!border-sky-500/25",
              warning: "!border-amber-500/25",
            },
          }}
        />
      </LiveSessionProvider>
    </QueryClientProvider>
  );
}
