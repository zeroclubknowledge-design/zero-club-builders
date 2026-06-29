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

const GlobalLiveRoom = lazy(() => 
  import("@/components/GlobalLiveRoom")
    .then(m => ({ default: m.GlobalLiveRoom }))
    .catch((error) => {
      console.error("GlobalLiveRoom import failed:", error);
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
    const isChunkError = error.message?.includes('Failed to fetch dynamically imported module') || 
                        error.message?.includes('Importing a module script failed') || 
                        error.name === 'ChunkLoadError';
                        
    if (isChunkError) {
      handleHardReload();
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
      { name: "theme-color", content: "#000000" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Zero Club" },
      { title: "Zero Club — A private club for builders" },
      { name: "description", content: "Zero Club is a high-signal community for students and builders. Learn digital skills, ship real work, and earn XP that converts to cash." },
      { property: "og:title", content: "Zero Club — A private club for builders" },
      { property: "og:description", content: "Zero Club is a high-signal community for students and builders. Learn digital skills, ship real work, and earn XP that converts to cash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Zero Club — A private club for builders" },
      { name: "twitter:description", content: "Zero Club is a high-signal community for students and builders. Learn digital skills, ship real work, and earn XP that converts to cash." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4215c30d-ff7b-4508-a899-c922d00e5475/id-preview-fa4e9537--ee5d9983-4748-4793-a658-4041e1470658.lovable.app-1778475055046.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4215c30d-ff7b-4508-a899-c922d00e5475/id-preview-fa4e9537--ee5d9983-4748-4793-a658-4041e1470658.lovable.app-1778475055046.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Montserrat:wght@500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var dM = localStorage.getItem('darkMode') || 'on';
                var dT = localStorage.getItem('darkTheme') || 'lights-out';
                document.documentElement.classList.remove('dark', 'dim', 'lights-out', 'premium');
                if (dM === 'premium') {
                  document.documentElement.classList.add('premium');
                } else {
                  var isD = dM === 'on' || (dM === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isD) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.classList.add(dT);
                  }
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

import { Toaster } from "sonner";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Register the service worker generated by vite-plugin-pwa
      navigator.serviceWorker.register('/sw.js', { type: 'module' }).catch(console.error);
    }
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
              toast: "w-full flex items-center gap-3 px-5 py-4 rounded-2xl backdrop-blur-2xl bg-card/95 border border-border/30 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.05)_inset] font-sans text-sm font-semibold text-foreground",
              title: "text-[13px] font-bold tracking-tight text-foreground",
              description: "text-[12px] font-medium text-muted-foreground mt-0.5",
              actionButton: "ml-auto shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-bold text-primary-foreground shadow-sm",
              cancelButton: "ml-auto shrink-0 rounded-full bg-muted px-3.5 py-1.5 text-[11px] font-bold text-muted-foreground",
              success: "!border-emerald-500/20 !shadow-[0_12px_40px_-8px_rgba(16,185,129,0.15),0_0_0_1px_rgba(16,185,129,0.1)_inset]",
              error: "!border-red-500/20 !shadow-[0_12px_40px_-8px_rgba(239,68,68,0.15),0_0_0_1px_rgba(239,68,68,0.1)_inset]",
              info: "!border-blue-500/20 !shadow-[0_12px_40px_-8px_rgba(59,130,246,0.15),0_0_0_1px_rgba(59,130,246,0.1)_inset]",
              warning: "!border-amber-500/20 !shadow-[0_12px_40px_-8px_rgba(245,158,11,0.15),0_0_0_1px_rgba(245,158,11,0.1)_inset]",
            },
          }}
        />
      </LiveSessionProvider>
    </QueryClientProvider>
  );
}

