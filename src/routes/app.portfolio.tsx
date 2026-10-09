import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { Builder } from "@/features/portfolio/Builder";
import { SetupWizard } from "@/features/portfolio/SetupWizard";
import { fetchMyPortfolio, fetchPublicPortfolio } from "@/features/portfolio/api";

/**
 * /app/portfolio — the Smart Portfolio builder.
 *
 * First visit runs the smart setup (scan → recommend → choose). After that
 * it is the editor with a live preview, and the publish flow.
 */
export const Route = createFileRoute("/app/portfolio")({
  component: PortfolioPage,
});

function PortfolioPage() {
  const { data: user, isLoading: userLoading } = useUser() as { data: any; isLoading: boolean };
  const queryClient = useQueryClient();

  const mine = useQuery({
    queryKey: ["my_portfolio", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchMyPortfolio(user.id),
  });

  // The owner's view of the full page, draft or live, from the same RPC the
  // public page uses — so the preview can never disagree with the real thing.
  const full = useQuery({
    queryKey: ["portfolio_owner_view", user?.username, mine.data?.id],
    enabled: Boolean(user?.username && mine.data?.id),
    // Always fresh on entry: the builder keeps its own copy while open.
    gcTime: 0,
    refetchOnWindowFocus: false,
    queryFn: () => fetchPublicPortfolio(user.username),
  });

  if (userLoading || (user && mine.isLoading) || (mine.data && full.isLoading)) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-[20px] font-semibold">Sign in to build your portfolio</p>
        <Link
          to="/signin"
          className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!mine.data) {
    return (
      <div className="min-h-screen bg-canvas">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-[680px] items-center px-4">
            <h1 className="font-display text-[18px] font-semibold">Build your portfolio</h1>
          </div>
        </header>
        <SetupWizard
          profile={user}
          onCreated={(portfolio) => {
            queryClient.setQueryData(["my_portfolio", user.id], portfolio);
          }}
        />
      </div>
    );
  }

  if (!full.data?.found) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-[20px] font-semibold">Couldn't open your portfolio</p>
        <button
          type="button"
          onClick={() => void full.refetch()}
          className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background"
        >
          Try again
        </button>
      </div>
    );
  }

  return <Builder key={full.data.portfolio.id} initial={full.data} />;
}
