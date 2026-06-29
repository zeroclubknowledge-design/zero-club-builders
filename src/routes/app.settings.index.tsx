import { createFileRoute, Link } from "@tanstack/react-router";
import { 
  ChevronLeft, Search, User, Lock, Zap, ShieldCheck, 
  Bell, Info, ChevronRight, CreditCard 
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getFirstName } from "@/lib/utils";

export const Route = createFileRoute("/app/settings/")({
  component: SettingsIndex,
});

const settingsItems = [
  {
    id: "account",
    icon: User,
    title: "Your account",
    description: "See information about your account, download an archive of your data, or learn about your account deactivation options.",
    to: "/app/settings/account",
  },
  {
    id: "security",
    icon: Lock,
    title: "Security and account access",
    description: "Manage your account's security and keep track of your account's usage including apps that you have connected to your account.",
    to: "/app/settings/security",
  },
  {
    id: "premium",
    icon: Zap,
    title: "Premium",
    description: "See what's included in Premium and manage your settings",
    to: "/app/settings/premium",
  },
  {
    id: "privacy",
    icon: ShieldCheck,
    title: "Privacy and safety",
    description: "Manage what information you see and share on Zero Club.",
    to: "/app/settings/privacy",
  },
  {
    id: "notifications",
    icon: Bell,
    title: "Notifications",
    description: "Select the kinds of notifications you get about your activities, interests, and recommendations.",
    to: "/app/settings/notifications",
  },
  {
    id: "resources",
    icon: Info,
    title: "Additional resources",
    description: "Check out other places for helpful information and more about Zero Club.",
    to: "/app/settings/resources",
  },
];

function SettingsIndex() {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('username').eq('id', user.id).single()
          .then(({ data }) => setProfile(data));
      }
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center border-b border-border">
        <Link to="/app" className="mr-6 p-2 rounded-full transition active:bg-accent/10">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground">{getFirstName(profile)}</p>
        </div>
      </header>

      {/* Search */}
      <div className="px-4 py-4">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search settings"
            className="w-full bg-accent rounded-full py-2.5 pl-12 pr-4 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
          />
        </div>
      </div>

      {/* Settings List */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
        <div className="flex flex-col">
          {settingsItems.map((item) => (
            <Link 
              key={item.id}
              to={item.to}
              className="flex items-start gap-5 px-5 py-4 transition active:bg-accent/10 text-left border-b border-border last:border-0"
            >
              <div className="mt-1 shrink-0">
                <item.icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <div className="flex-1 pr-4">
                <h3 className="text-[15px] font-bold text-foreground">{item.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
              <div className="mt-1">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
          
        </div>
      </div>
    </div>
  );
}
