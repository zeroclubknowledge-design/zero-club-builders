import { ZeroLoader } from "@/components/ZeroLoader";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installChunkRecovery } from "./lib/chunk-recovery";

export const getRouter = () => {
  // Registered here rather than in a component: a chunk can fail to load
  // before any component has mounted, and this runs on both the first render
  // and every subsequent navigation attempt.
  installChunkRecovery();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 10, // 10 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Start fetching a page the moment a finger touches its link, not 50ms later.
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 1000 * 60 * 5, // 5 minutes
    defaultPendingMs: 300, // only for loads you would notice; no flash on quick taps
    defaultPendingMinMs: 400,
    defaultPendingComponent: () => (
      // A small floating Zero Club mark while the next page loads.
      <div className="pointer-events-none fixed inset-x-0 top-[calc(10px+env(safe-area-inset-top))] z-[100] flex justify-center">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-[0_8px_24px_-10px_rgba(0,0,0,0.45)] ring-1 ring-border/60">
          <ZeroLoader size={24} />
        </div>
      </div>
    ),
  });

  return router;
};
