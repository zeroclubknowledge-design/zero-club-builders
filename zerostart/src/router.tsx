import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AmbassadorHome } from "@/screens/AmbassadorHome";
import { JoinAmbassador } from "@/screens/JoinAmbassador";
import { SignIn } from "@/screens/SignIn";
import { Home } from "@/screens/Home";
import { Campaigns } from "@/screens/Campaigns";
import { Earnings } from "@/screens/Earnings";
import { Leaderboard } from "@/screens/Leaderboard";
import { AdminHub } from "@/screens/admin/AdminHub";

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
  getParentRoute: () => rootRoute, path: "/", component: Home,
});
const campaignsRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/campaigns", component: Campaigns,
});
const earningsRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/earnings", component: Earnings,
});
const leaderboardRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/leaderboard", component: Leaderboard,
});
const tasksRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/tasks", component: AmbassadorHome,
});
const joinRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/join", component: JoinAmbassador,
});
// Old links to the roster land on the leaderboard.
const rosterRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/ambassadors", component: Leaderboard,
});
const signInRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/signin", component: SignIn,
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute, path: "/admin", component: AdminHub,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  campaignsRoute,
  earningsRoute,
  leaderboardRoute,
  tasksRoute,
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
