import { Gift, Send, WalletCards } from "@/components/icons/glyphs";
import type { NavItem } from "@/components/AppShell";

export const NAV: NavItem[] = [
  { to: "/", label: "Send", icon: Send, exact: true },
  { to: "/sent", label: "Sent", icon: Gift },
  { to: "/received", label: "Received", icon: WalletCards },
];
