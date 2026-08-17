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
import { LiveSessionProvider } from "@/contexts/LiveSessionContext";
import { isChunkLoadError, isStaleShellError, recoverFromChunkError } from "@/lib/chunk-recovery";

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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  
  const handleHardReload = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
        }
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  };

  useEffect(() => {
    // Guarded, so a chunk that stays missing shows this screen rather than
    // reloading forever. The button below is still an unconditional hard
    // reload, because a person pressing it cannot become a loop.
    if ((isChunkLoadError(error) || isStaleShellError(error)) && !recoverFromChunkError()) {
      console.warn("Chunk error recovery already attempted; showing the error screen.");
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-semibold">Something broke</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow">
            Try again
          </button>
          <button onClick={handleHardReload} className="text-xs text-muted-foreground hover:text-foreground underline">
            Clear cache and reload
          </button>
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
      { title: "Zero Club — A private club for builders" },
      { name: "description", content: "Zero Club is a high-signal community for students and builders. Learn digital skills, ship real work, build visible XP, and earn Zero Points." },
      { property: "og:title", content: "Zero Club — A private club for builders" },
      { property: "og:description", content: "Zero Club is a high-signal community for students and builders. Learn digital skills, ship real work, build visible XP, and earn Zero Points." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Zero Club — A private club for builders" },
      { name: "twitter:description", content: "Zero Club is a high-signal community for students and builders. Learn digital skills, ship real work, build visible XP, and earn Zero Points." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4215c30d-ff7b-4508-a899-c922d00e5475/id-preview-fa4e9537--ee5d9983-4748-4793-a658-4041e1470658.lovable.app-1778475055046.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4215c30d-ff7b-4508-a899-c922d00e5475/id-preview-fa4e9537--ee5d9983-4748-4793-a658-4041e1470658.lovable.app-1778475055046.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
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
                root.classList.remove('dark', 'dim', 'lights-out', 'premium');

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
    if ('serviceWorker' in navigator) {
      // Registered as a classic script: module service workers are still
      // unsupported in Firefox, and the worker needs no module features.
      // Registration is deferred until the page is idle so it never competes
      // with the first render.
      const registerServiceWorker = () => {
        navigator.serviceWorker.register('/sw.js').catch((error) => {
          console.warn('Service worker registration failed:', error);
        });
      };

      if (document.readyState === 'complete') {
        registerServiceWorker();
      } else {
        window.addEventListener('load', registerServiceWorker, { once: true });
      }
    }
    
    // Initialize multi-account session sync
    setupMultiAccountSync();
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
