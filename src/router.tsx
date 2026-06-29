import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
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
        <div className="h-full bg-gradient-to-r from-primary via-[#cc208f] to-secondary animate-progress shadow-[0_0_15px_rgba(204,32,143,0.5)" />
      </div>
    ),
  });

  return router;
};
