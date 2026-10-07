import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  Accessibility,
  Languages,
  Eye,
  Type,
  ChevronRight,
  Play,
} from "@/components/icons/glyphs";
import { Switch } from "@/components/ui/switch";
import { setAnimatedAvatarsPref, useAnimatedAvatarsPref } from "@/features/profile/avatarMotionApi";
import { useSyncExternalStore } from "react";

export const Route = createFileRoute("/app/settings/accessibility")({
  component: AccessibilitySettings,
});

function AccessibilitySettings() {
  const pref = useAnimatedAvatarsPref();
  const reduced = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener?.("change", cb);
      return () => mq.removeEventListener?.("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  // Without a choice: animated pictures play, unless the device asks for less motion.
  const playing = pref ? pref === "on" : !reduced;
  const items = [
    { icon: Eye, title: "Display", desc: "Manage your font size, color, and background" },
    { icon: Languages, title: "Languages", desc: "Manage which languages you see on Zero Club" },
    { icon: Type, title: "Keyboard shortcuts", desc: "View and customize your keyboard shortcuts" },
    { icon: Accessibility, title: "Motion", desc: "Manage reduced motion settings" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center">
        <Link to="/app/settings" className="mr-6 p-2 rounded-full transition active:bg-accent/10">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Accessibility</h1>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <label className="mt-4 flex cursor-pointer items-start gap-5 border-b border-border px-5 py-4">
          <div className="mt-1 shrink-0">
            <Play className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-bold text-foreground">
              Play animated profile pictures
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {reduced && !pref
                ? "Off because your device asks for reduced motion. You can still turn it on."
                : "Profile pictures with subtle movement play on profile pages."}
            </p>
          </div>
          <Switch
            checked={playing}
            onCheckedChange={(v) => setAnimatedAvatarsPref(v ? "on" : "off")}
            aria-label="Play animated profile pictures"
          />
        </label>
        <div className="mt-4 flex flex-col border-b border-border">
          {items.map((item) => (
            <button
              key={item.title}
              className="flex items-start gap-5 px-5 py-4 transition active:bg-accent/10 text-left group"
            >
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
