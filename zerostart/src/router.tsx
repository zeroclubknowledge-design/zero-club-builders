import {
  createRootRoute, createRoute, createRouter, Outlet,
} from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Discover } from "@/screens/Discover";
import { CampaignDetail } from "@/screens/CampaignDetail";
import { TestFlow } from "@/screens/TestFlow";
import { MyTests } from "@/screens/MyTests";
import { Build } from "@/screens/Build";
import { NewMvp } from "@/screens/NewMvp";
import { NewCampaign } from "@/screens/NewCampaign";
import { CampaignReview } from "@/screens/CampaignReview";
import { AdminReview } from "@/screens/AdminReview";
import { SignIn } from "@/screens/SignIn";

/**
 * Routes declared in code rather than generated from the filesystem. Zero Club
 * uses the generated tree because it is large enough to need it; ZeroStart has
 * ten routes, and a file that must be regenerated after every rename earns
 * nothing at this size.
 *
 * Each route is written out in full rather than through a `route(path, cmp)`
 * helper. The helper existed briefly and had to go: its `path: string`
 * parameter widened the literal away, and TanStack builds its entire typed-link
 * system out of those literals. With the helper, `<Link to="/tests">` compiled
 * as happily as `<Link to="/tsets">`. Eight lines saved is a poor trade for
 * every navigation in the app going unchecked.
 */

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/", component: Discover,
});
const signInRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/signin", component: SignIn,
});
const campaignRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/campaign/$id", component: CampaignDetail,
});
const testRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/test/$participationId", component: TestFlow,
});
const testsRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/tests", component: MyTests,
});
const buildRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/build", component: Build,
});
/*
 * The only route that takes search params. The hero on the board carries what
 * someone already typed into this form so they never type it twice, and
 * validateSearch is what makes those params typed rather than a bag of
 * strings — a link with the wrong key fails to compile instead of silently
 * arriving empty.
 */
const newMvpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/build/new",
  component: NewMvp,
  validateSearch: (search: Record<string, unknown>): { url?: string; category?: string } => ({
    url: typeof search.url === "string" ? search.url : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
  }),
});
const newCampaignRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/build/$mvpId/campaign", component: NewCampaign,
});
const campaignReviewRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/build/campaign/$id", component: CampaignReview,
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/admin", component: AdminReview,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  campaignRoute,
  testRoute,
  testsRoute,
  buildRoute,
  newMvpRoute,
  newCampaignRoute,
  campaignReviewRoute,
  adminRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
