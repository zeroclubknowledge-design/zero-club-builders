import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { 
  Home, GraduationCap, Wallet, User, Users, 
  Plus, Bell, Flame, Zap, Bookmark, MonitorPlay, 
  MoreHorizontal, Settings, HelpCircle, UserPlus 
} from "lucide-react";
import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
      if (Math.abs(currentScrollPos - prevScrollPos) > 5) {
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

  const getPageTitle = () => {
    if (pathname === "/app") return "Feed";
    if (pathname.includes("bootcamps")) return "Bootcamps";
    if (pathname.includes("clubs")) return "Clubs";
    if (pathname.includes("wallet")) return "Wallet";
    if (pathname.includes("profile")) return "Profile";
    if (pathname.includes("premium")) return "Premium";
    if (pathname.includes("bookmarks")) return "Bookmarks";
    if (pathname.includes("tutor-studio")) return "Tutor Studio";
    return "Zero Club";
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-md">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-background/80 px-5 py-4 backdrop-blur-md">
        <Sheet>
          <SheetTrigger asChild>
            <button className="h-9 w-9 overflow-hidden rounded-full border border-border transition active:scale-95">
              <div className="h-full w-full bg-gradient-primary" style={{ background: "#f0abfc" }} />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85%] border-r-border bg-background p-0 sm:max-w-xs [&>button]:hidden">
            <div className="flex h-full flex-col p-6">
              <div className="flex items-start justify-between">
                <div className="h-12 w-12 rounded-full" style={{ background: "#f0abfc" }} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="grid h-8 w-8 place-items-center rounded-full border border-border transition active:scale-95">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl border-border bg-card">
                    <DropdownMenuItem className="gap-3 py-3">
                      <Plus className="h-4 w-4" />
                      <span>Create a new account</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-3 py-3">
                      <UserPlus className="h-4 w-4" />
                      <span>Add an existing account</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-3 flex flex-col gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold">Ada Okafor</h2>
                  <p className="text-sm text-muted-foreground">@adabuilds</p>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="flex gap-1">
                    <span className="font-bold">42</span>
                    <span className="text-muted-foreground">Following</span>
                  </div>
                  <div className="flex gap-1">
                    <span className="font-bold">1.2k</span>
                    <span className="text-muted-foreground">Followers</span>
                  </div>
                </div>
              </div>

              <nav className="mt-8 flex flex-col gap-1">
                {[
                  { icon: User, label: "Profile", to: "/app/profile" },
                  { icon: Zap, label: "Premium", to: "/app/premium" },
                  { icon: Users, label: "Clubs", to: "/app/clubs" },
                  { icon: Bookmark, label: "Bookmarks", to: "/app/bookmarks" },
                  { icon: GraduationCap, label: "Bootcamps", to: "/app/bootcamps" },
                  { icon: MonitorPlay, label: "Tutor Studio", to: "/app/tutor-studio" },
                ].map((item) => (
                  <Link 
                    key={item.label} 
                    to={item.to}
                    className="flex items-center gap-4 rounded-xl px-2 py-3 text-lg font-semibold transition active:bg-accent/50"
                  >
                    <item.icon className="h-6 w-6" />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
              
              <div className="mt-auto border-t border-border pt-2">
                <Accordion type="single" collapsible className="w-full border-none">
                  <AccordionItem value="settings" className="border-none">
                    <AccordionTrigger className="px-2 py-4 text-sm font-bold hover:no-underline text-muted-foreground">
                      Settings & Support
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-1 pb-4">
                      <button className="flex items-center gap-3 rounded-lg px-2 py-3 text-sm font-medium transition active:bg-accent/50">
                        <Settings className="h-4 w-4" />
                        <span>Settings and privacy</span>
                      </button>
                      <button className="flex items-center gap-3 rounded-lg px-2 py-3 text-sm font-medium transition active:bg-accent/50">
                        <HelpCircle className="h-4 w-4" />
                        <span>Help Center</span>
                      </button>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        
        <h1 className="font-display text-lg font-bold">{getPageTitle()}</h1>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs">
            <Flame className="h-3.5 w-3.5 text-primary" />
            <span className="font-bold">7</span>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card/60">
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="pb-24">
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
