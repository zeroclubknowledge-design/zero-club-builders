import { ClipboardList, Compass, TicketPercent as Ticket, LayoutDashboard } from "@/components/icons/glyphs";
import type { NavItem } from "@/components/AppShell";

export const NAV: NavItem[] = [
  { to: "/browse", label: "Browse", icon: Compass },
  { to: "/", label: "My forms", icon: LayoutDashboard, exact: true },
  { to: "/me", label: "Registrations", icon: ClipboardList },
];
void Ticket;
