import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppToaster } from "@/components/AppToaster";
import { ShareSheetHost } from "@/components/ShareSheet";
import { AuthProvider } from "@/lib/auth";
import { router } from "./router";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <AppToaster />
        {/* The share sheet (Browse cards, the form editor). */}
        <ShareSheetHost />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
