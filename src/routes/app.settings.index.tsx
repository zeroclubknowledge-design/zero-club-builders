import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Accessibility, ArrowLeft, Bell, ChevronRight, Crown, Info, Lock, LogOut, Search, ShieldCheck, User, X,
} from "@/components/icons/glyphs";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { logoutCurrentAccount } from "@/lib/multiAccount";
import { getLevelFromXp } from "@/lib/utils";

export const Route = createFileRoute("/app/settings/")({
  component: SettingsIndex,
});

type SettingsItem = {
  id: string;
  icon: typeof User;
  title: string;
  description: string;
  to: string;
};

const settingsGroups: { title: string; items: SettingsItem[] }[] = [
  {
    title: "Your account",
    items: [
      {
        id: "account",
        icon: User,
        title: "Account information",
        description: "Your details, a copy of your data and deactivation options",
        to: "/app/settings/account",
      },
      {
        id: "premium",
        icon: Crown,
        title: "Premium",
        description: "What's included in Premium and your membership settings",
        to: "/app/settings/premium",
      },
    ],
  },
  {
    title: "Security and privacy",
    items: [
      {
        id: "security",
        icon: Lock,
        title: "Password and sign-in",
        description: "Keep your account secure and see where you're signed in",
        to: "/app/settings/security",
      },
      {
        id: "privacy",
        icon: ShieldCheck,
        title: "Privacy and safety",
        description: "What you see and share on Zero Club",
        to: "/app/settings/privacy",
      },
    ],
  },
  {
    title: "Preferences",
    items: [
      {
        id: "notifications",
        icon: Bell,
        title: "Notifications",
        description: "Push alerts on this device and what you hear about",
        to: "/app/settings/notifications",
      },
      {
        id: "accessibility",
        icon: Accessibility,
        title: "Accessibility",
        description: "Display, motion and reading options",
        to: "/app/settings/accessibility",
      },
    ],
  },
  {
    title: "Additional resources",
    items: [
      {
        id: "resources",
        icon: Info,
        title: "Help and resources",
        description: "Help centre, terms and more about Zero Club",
        to: "/app/settings/resources",
      },
    ],
  },
];

function SettingsIndex() {
  const { data: profile } = useUser();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  // The search box used to be decoration. It now narrows the list, matching
  // either the title or the line under it.
  const groups = settingsGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !needle || `${item.title} ${item.description}`.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.items.length > 0);

  const name = profile?.full_name || profile?.username || "Your account";

  const signOut = async () => {
    if (profile?.id) {
      await logoutCurrentAccount(profile.id);
    } else {
      await supabase.auth.signOut();
      window.location.href = "/signin";
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-50 bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <Link to="/app" aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </Link>
          <h1 className="flex-1 font-display text-[18px] font-semibold text-foreground">Settings</h1>
        </div>
        <div className="mx-auto w-full max-w-[680px] px-3 pb-3">
          <label className="flex h-[38px] items-center gap-2 rounded-full bg-foreground/[0.06] px-3">
            <Search className="h-[17px] w-[17px] shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settings"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        {!needle && (
          <section className="flex items-center gap-3 bg-card px-4 py-3.5 md:rounded-xl md:border md:border-border">
            <div className="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-full bg-accent/10 text-[17px] font-semibold text-accent">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-semibold">{name}</p>
              <p className="truncate text-[13px] text-muted-foreground">
                {profile?.username ? `@${profile.username} · ` : ""}Level {getLevelFromXp(Number(profile?.xp || 0))}
              </p>
            </div>
            {profile?.id && (
              <Link to="/app/profile/$id" params={{ id: profile.username || profile.id }} className="shrink-0 text-[14px] font-semibold text-[#cc208f] hover:text-[#a3186f]">
                View profile
              </Link>
            )}
          </section>
        )}

        {groups.map((group) => (
          <section key={group.title} className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
            <h2 className="px-4 pb-2 pt-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{group.title}</h2>
            {group.items.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                className="group flex items-center gap-3.5 border-t border-border/60 px-4 py-3 hover:bg-foreground/[0.02]"
              >
                <item.icon className="h-5 w-5 shrink-0 text-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-foreground">{item.title}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{item.description}</span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            ))}
          </section>
        ))}

        {needle && groups.length === 0 && (
          <div className="bg-card px-6 py-14 text-center md:rounded-xl md:border md:border-border">
            <p className="text-[15px] font-semibold">No settings match "{query}"</p>
          </div>
        )}

        {!needle && (
          <section className="flex flex-1 flex-col bg-card pb-28 md:flex-none md:rounded-xl md:border md:border-border md:pb-0">
            <button
              type="button"
              onClick={signOut}
              className="flex items-center gap-3.5 px-4 py-3.5 text-left text-[15px] font-semibold text-[#cc208f] hover:bg-[#cc208f]/[0.04]"
            >
              <LogOut className="h-5 w-5" /> Sign out
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
