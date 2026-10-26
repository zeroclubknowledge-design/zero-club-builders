import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { Home } from "@/screens/Home";
import { MyRegistrations } from "@/screens/MyRegistrations";
import { AuthPage } from "@/screens/AuthPage";
import { ZeroFormPublicPage } from "@/screens/PublicForm";
import { BrowsePage } from "@/screens/BrowsePage";

/*
 * Zero Form: the stand-alone home of Zero Club's registration forms.
 * Same database, same RPCs and same links (/form/<slug>) as the forms inside
 * Zero Club, so a form made in either place is the same form.
 */
const rootRoute = createRootRoute({ component: () => <Outlet /> });

// form.zeroclubs.xyz opens on Browse for everyone; your own forms live at /forms.
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: BrowsePage });
const myFormsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/forms", component: Home });
// Older links to /browse still work.
const browseRoute = createRoute({ getParentRoute: () => rootRoute, path: "/browse", beforeLoad: () => { throw redirect({ to: "/", replace: true }); } });
const meRoute = createRoute({ getParentRoute: () => rootRoute, path: "/me", component: MyRegistrations });
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signin", component: () => <AuthPage mode="signin" /> });
const signUpRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signup", component: () => <AuthPage mode="signup" /> });
const formRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/form/$slug",
  component: function FormPage() {
    const { slug } = formRoute.useParams();
    return <ZeroFormPublicPage key={slug} slug={slug} />;
  },
});
const shortFormRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/f/$slug",
  component: function ShortFormPage() {
    const { slug } = shortFormRoute.useParams();
    return <ZeroFormPublicPage key={slug} slug={slug} />;
  },
});

const routeTree = rootRoute.addChildren([homeRoute, myFormsRoute, browseRoute, meRoute, signInRoute, signUpRoute, formRoute, shortFormRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
