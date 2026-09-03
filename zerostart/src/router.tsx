import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AmbassadorHome } from "@/screens/AmbassadorHome";
import { JoinAmbassador } from "@/screens/JoinAmbassador";
import { AmbassadorRoster } from "@/screens/AmbassadorRoster";
import { AdminReview } from "@/screens/AdminReview";
import { SignIn } from "@/screens/SignIn";

/*
 * ZeroStart is the Zero Ambassador platform.
 *
 * The MVP-and-campaign routes are gone: there is no listing, no campaign, no
 * tester and no builder here any more. What is left is the ambassador's own
 * loop — where you represent, what you push, what the team has asked for, and
 * how far up the levels that has taken you.
 *
 * Routes are written out longhand rather than through a helper, because
 * TanStack builds its typed-link system out of the literal paths and a helper
 * with a `path: string` parameter throws that away.
 */

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/", component: AmbassadorHome,
});
const joinRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/join", component: JoinAmbassador,
});
const rosterRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/ambassadors", component: AmbassadorRoster,
});
const signInRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/signin", component: SignIn,
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/admin", component: AdminReview,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  joinRoute,
  rosterRoute,
  signInRoute,
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
