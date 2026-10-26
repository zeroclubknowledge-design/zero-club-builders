import { ClipboardList, Compass, TicketPercent as Ticket, LayoutDashboard } from "@/components/icons/glyphs";
import type { NavItem } from "@/components/AppShell";

export const NAV: NavItem[] = [
  { to: "/", label: "Browse", icon: Compass, exact: true },
  { to: "/forms", label: "My forms", icon: LayoutDashboard },
  { to: "/me", label: "Registrations", icon: ClipboardList },
];
void Ticket;
