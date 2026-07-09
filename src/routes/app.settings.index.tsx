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
      <header className="sticky top-0 z-50 bg-background/85 backdrop-blur-xl backdrop-saturate-150 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center border-b hairline">
        <Link to="/app" className="mr-4 grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04]">
          <ChevronLeft className="h-[18px] w-[18px] text-foreground" />
        </Link>
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="text-[12px] text-muted-foreground">{getFirstName(profile)}</p>
        </div>
      </header>

      {/* Search */}
      <div className="px-4 py-4">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search settings"
            className="w-full bg-foreground/[0.04] rounded-full py-2.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-transparent focus:ring-primary/40 focus:bg-background transition-all"
          />
        </div>
      </div>

      {/* Settings List */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
        <div className="flex flex-col divide-y divide-hairline">
          {settingsItems.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              className="group flex items-start gap-4 px-5 py-4 tap hover:bg-foreground/[0.02] text-left"
            >
              <div className="mt-0.5 shrink-0 grid h-9 w-9 place-items-center rounded-full ring-1 ring-border bg-card">
                <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.75} />
              </div>
              <div className="flex-1 pr-4">
                <h3 className="text-[14.5px] font-semibold tracking-tight text-foreground">{item.title}</h3>
                <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed line-clamp-2">{item.description}</p>
              </div>
              <div className="mt-2.5">
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          ))}

        </div>
      </div>
    </div>
  );
}
