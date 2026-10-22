import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Home } from "@/screens/Home";
import { SentGifts } from "@/screens/Sent";
import { ReceivedGifts } from "@/screens/Received";
import { ClaimGift } from "@/screens/Claim";
import { AuthPage } from "@/screens/AuthPage";

/*
 * Zero Gifts: the stand-alone home of Zero Cards. Same tables and RPCs as
 * Zero Club's gifts (create_gift_campaign, claim_gift_card, …) and the same
 * link shape (/gift/<code>), so a card made in either place works in both.
 */
const rootRoute = createRootRoute({ component: () => <Outlet /> });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });
const sentRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sent", component: SentGifts });
const receivedRoute = createRoute({ getParentRoute: () => rootRoute, path: "/received", component: ReceivedGifts });
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

const routeTree = rootRoute.addChildren([homeRoute, sentRoute, receivedRoute, signInRoute, signUpRoute, giftRoute, legacyGiftRoute]);
export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
