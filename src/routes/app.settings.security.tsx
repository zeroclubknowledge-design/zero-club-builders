import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Key, Shield, Smartphone, History, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/app/settings/security")({
  component: SecuritySettings,
});

function SecuritySettings() {
  const sections = [
    {
      title: "Security",
      items: [
        { icon: Smartphone, label: "Two-factor authentication", desc: "Add another layer of security to your account" },
        { icon: Key, label: "Password", desc: "Change your password at any time" },
      ]
    },
    {
      title: "Account access",
      items: [
        { icon: Shield, label: "Connected apps", desc: "Manage the apps you've connected to your account" },
        { icon: History, label: "Login history", desc: "See where you've logged in and manage your sessions" },
      ]
    }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center border-b border-border">
        <Link to="/app/settings" className="mr-6 p-2 rounded-full transition active:bg-accent/10">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Security</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {sections.map((section) => (
          <div key={section.title} className="mt-4">
            <h2 className="px-5 py-3 text-sm text-muted-foreground">{section.title}</h2>
            <div className="flex flex-col border-b border-border">
              {section.items.map((item) => (
                <button key={item.label} className="flex items-start gap-5 px-5 py-4 transition active:bg-accent/10 text-left group">
                  <div className="mt-1 shrink-0">
                    <item.icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[15px] font-bold text-foreground">{item.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
