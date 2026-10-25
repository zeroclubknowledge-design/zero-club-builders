import { Compass, Gift, Plus } from "@/components/icons/glyphs";
import type { NavItem } from "@/components/AppShell";

/** Browse what's open to claim, create a gift, and see everything you've sent and received. */
export const NAV: NavItem[] = [
  { to: "/", label: "Browse", icon: Compass, exact: true },
  { to: "/create", label: "Create", icon: Plus },
  { to: "/me", label: "My Gifts", icon: Gift },
];
