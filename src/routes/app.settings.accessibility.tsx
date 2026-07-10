import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Accessibility, Languages, Eye, Type, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/app/settings/accessibility")({
  component: AccessibilitySettings,
});

function AccessibilitySettings() {
  const items = [
    { icon: Eye, title: "Display", desc: "Manage your font size, color, and background" },
    { icon: Languages, title: "Languages", desc: "Manage which languages you see on Zero Club" },
    { icon: Type, title: "Keyboard shortcuts", desc: "View and customize your keyboard shortcuts" },
    { icon: Accessibility, title: "Motion", desc: "Manage reduced motion settings" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center border-b border-border">
        <Link to="/app/settings" className="mr-6 p-2 rounded-full transition active:bg-accent/10">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Accessibility</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="mt-4 flex flex-col border-b border-border">
          {items.map((item) => (
            <button key={item.title} className="flex items-start gap-5 px-5 py-4 transition active:bg-accent/10 text-left group">
              <div className="mt-1 shrink-0">
                <item.icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-foreground">{item.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
