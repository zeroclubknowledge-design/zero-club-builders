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
    defaultPreloadStaleTime: 1000 * 60 * 5, // 5 minutes
    defaultPendingMs: 0, 
    defaultPendingMinMs: 0,
    defaultPendingComponent: () => (
      <div className="fixed top-0 left-0 right-0 z-[100] h-1 overflow-hidden bg-muted">
        <div className="h-full bg-gradient-to-r from-accent via-[#cc208f] to-secondary animate-progress shadow-[0_0_15px_rgba(204,32,143,0.5)]" />
      </div>
    ),
  });

  return router;
};
