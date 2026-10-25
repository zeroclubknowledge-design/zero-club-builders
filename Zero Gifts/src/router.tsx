import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { BrowseGifts } from "@/screens/Browse";
import { SendGift } from "@/screens/Send";
import { MyGifts, type MyGiftsTab } from "@/screens/MyGifts";
import { redirect } from "@tanstack/react-router";
import { ClaimGift } from "@/screens/Claim";
import { AuthPage } from "@/screens/AuthPage";

/*
 * Zero Gifts: the stand-alone home of Zero Cards. Same tables and RPCs as
 * Zero Club's gifts (create_gift_campaign, claim_gift_card, …) and the same
 * link shape (/gift/<code>), so a card made in either place works in both.
 */
const rootRoute = createRootRoute({ component: () => <Outlet /> });
// Browse (home) · Create · My Gifts (Sent / Received).
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: BrowseGifts });
const createGiftRoute = createRoute({ getParentRoute: () => rootRoute, path: "/create", component: SendGift });
const meRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/me",
  validateSearch: (search: Record<string, unknown>): { tab?: MyGiftsTab } => ({
    tab: search.tab === "received" ? "received" : search.tab === "sent" ? "sent" : undefined,
  }),
  component: function MyGiftsPage() {
    const { tab } = meRoute.useSearch();
    return <MyGifts tab={tab || "sent"} />;
  },
});
// Older links keep working.
const sentRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sent", beforeLoad: () => { throw redirect({ to: "/me", search: { tab: "sent" } }); } });
const receivedRoute = createRoute({ getParentRoute: () => rootRoute, path: "/received", beforeLoad: () => { throw redirect({ to: "/me", search: { tab: "received" } }); } });
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signin", component: () => <AuthPage mode="signin" /> });
const signUpRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signup", component: () => <AuthPage mode="signup" /> });
const giftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gift/$code",
  component: function GiftPage() {
    const { code } = giftRoute.useParams();
    return <ClaimGift key={code} code={code} />;
  },
});
const legacyGiftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/gifts/$code",
  component: function LegacyGiftPage() {
    const { code } = legacyGiftRoute.useParams();
    return <ClaimGift key={code} code={code} />;
  },
});

const routeTree = rootRoute.addChildren([homeRoute, createGiftRoute, meRoute, sentRoute, receivedRoute, signInRoute, signUpRoute, giftRoute, legacyGiftRoute]);
export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
