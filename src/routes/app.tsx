import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Home, GraduationCap, Wallet, User, Users } from "lucide-react";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const tabs = [
  { to: "/app", label: "Feed", icon: Home, exact: true },
  { to: "/app/bootcamps", label: "Learn", icon: GraduationCap },
  { to: "/app/clubs", label: "Clubs", icon: Users },
  { to: "/app/wallet", label: "Wallet", icon: Wallet },
  { to: "/app/profile", label: "Profile", icon: User },
];

function AppLayout() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(true);
  const [prevScrollPos, setPrevScrollPos] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollPos = window.scrollY;
      
      // Only trigger if we've scrolled more than a small threshold to avoid jitter
      if (Math.abs(currentScrollPos - prevScrollPos) > 5) {
        // User requested: 
        // "When scrolling up the page, let the taskbar disappear but when scrolling downwards again, let the taskbar appear"
        // Scrolling up (towards top): currentScrollPos < prevScrollPos
        // Scrolling downwards (towards bottom): currentScrollPos > prevScrollPos
        if (currentScrollPos > prevScrollPos) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
      
      setPrevScrollPos(currentScrollPos);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [prevScrollPos]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-md">
      <div className="pb-20">
        <Outlet />
      </div>
      <nav 
        className={`fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-3 pb-2 transition-transform duration-300 ${
          visible ? "translate-y-0" : "translate-y-full opacity-0"
        }`}
      >
        <div className="flex items-center justify-around rounded-2xl bg-card border border-border px-1 py-1 shadow-soft">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            const Icon = t.icon;
            return (
              <Link key={t.to} to={t.to} className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition">
                <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[10px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
