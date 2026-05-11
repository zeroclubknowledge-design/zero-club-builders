import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, Settings, Share2, Flame, MapPin, LinkIcon, CalendarDays, Sparkles, Hash, Users } from "lucide-react";

export const Route = createFileRoute("/app/profile")({
  component: Profile,
});

const skills = ["UI Design", "Webflow", "Figma", "Brand", "Motion"];

const builds = [
  { t: "Day 16 · Shipped onboarding for FinTech client", time: "2h", likes: 84, comments: 12, xp: 120, c: "linear-gradient(135deg,#f472b6,#a78bfa)" },
  { t: "Portfolio v3 is live — feedback welcome", time: "1d", likes: 142, comments: 28, xp: 200, c: "linear-gradient(135deg,#c084fc,#60a5fa)" },
  { t: "Habit tracker concept (Figma)", time: "3d", likes: 67, comments: 8, xp: 80, c: "linear-gradient(135deg,#fb7185,#f59e0b)" },
];

const clubs = [
  { name: "Design · Cohort 03", members: 142, c: "linear-gradient(135deg,#f472b6,#a78bfa)" },
  { name: "Lagos Builders IRL", members: 312, c: "linear-gradient(135deg,#fb7185,#f59e0b)" },
  { name: "Motion Designers", members: 67, c: "linear-gradient(135deg,#f59e0b,#fb7185)" },
];

const networks = [
  { name: "Tunde A.", handle: "tundeships", c: "#a78bfa", role: "Growth · Cohort 02" },
  { name: "Kemi A.", handle: "kemidesigns", c: "#f472b6", role: "Tutor · Design" },
  { name: "Ife O.", handle: "ifebuilds", c: "#60a5fa", role: "Tutor · Dev" },
  { name: "Dami K.", handle: "damimotion", c: "#34d399", role: "Motion · Cohort 03" },
];

const tabs = ["Builds", "Clubs", "Network", "Media"] as const;
type Tab = typeof tabs[number];

function Profile() {
  const [tab, setTab] = useState<Tab>("Builds");

  return (
    <div>
      {/* Cover */}
      <div className="relative h-32 w-full" style={{ background: "linear-gradient(135deg,#f0abfc,#a78bfa,#60a5fa)" }}>
        <div className="absolute right-4 top-4 flex gap-2">
          <button className="grid h-9 w-9 place-items-center rounded-full bg-background/30 text-primary-foreground backdrop-blur"><Share2 className="h-4 w-4" /></button>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-background/30 text-primary-foreground backdrop-blur"><Settings className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="px-5">
        {/* Avatar + edit */}
        <div className="-mt-10 flex items-end justify-between">
          <div className="grid h-20 w-20 place-items-center rounded-3xl border-4 border-background text-3xl font-display font-bold text-primary-foreground shadow-glow" style={{ background: "linear-gradient(135deg,#f0abfc,#a78bfa)" }}>
            A
          </div>
          <button className="mt-10 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-semibold">Edit profile</button>
        </div>

        {/* Identity */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h2 className="font-display text-xl font-bold">Ada Okafor</h2>
            <BadgeCheck className="h-4 w-4 fill-primary text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">@adabuilds</p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Sparkles className="h-3 w-3" /> LVL 2 · LEARN TIER
          </div>
          <p className="mt-3 text-sm leading-relaxed">
            Product designer shipping daily. Currently in Cohort 03. Building tools for African students.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Lagos, NG</span>
            <a className="flex items-center gap-1 text-primary"><LinkIcon className="h-3 w-3" /> adabuilds.co</a>
            <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Joined Jan 2026</span>
          </div>

          {/* Follow stats — X style */}
          <div className="mt-4 flex gap-5 text-sm">
            <button className="hover:underline"><span className="font-bold">284</span> <span className="text-muted-foreground">Following</span></button>
            <button className="hover:underline"><span className="font-bold">1,204</span> <span className="text-muted-foreground">Followers</span></button>
          </div>

          {/* XP stats row */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { k: "3,420", v: "XP" },
              { k: "28", v: "Builds" },
              { k: "7d", v: "Streak", icon: Flame },
            ].map(({ k, v, icon: Icon }) => (
              <div key={v} className="rounded-2xl border border-border bg-card/40 py-2.5">
                <div className="flex items-center justify-center gap-1 font-display text-base font-bold">
                  {Icon && <Icon className="h-3.5 w-3.5 text-primary" />} {k}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{v}</div>
              </div>
            ))}
          </div>

          {/* Skills */}
          <div className="mt-4 flex flex-wrap gap-2">
            {skills.map((s) => (
              <span key={s} className="rounded-full border border-border bg-card/40 px-3 py-1 text-[11px] font-medium">{s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5 border-b border-border">
        <div className="flex">
          {tabs.map((t) => {
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)} className="relative flex-1 py-3 text-sm font-semibold">
                <span className={active ? "text-foreground" : "text-muted-foreground"}>{t}</span>
                {active && <span className="absolute inset-x-6 -bottom-px h-0.5 rounded-full bg-gradient-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-5 py-5">
        {tab === "Builds" && (
          <div className="space-y-3">
            {builds.map((b, i) => (
              <article key={i} className="overflow-hidden rounded-2xl bg-gradient-card shadow-soft">
                <div className="h-24" style={{ background: b.c }} />
                <div className="p-4">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>@adabuilds · {b.time}</span>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">+{b.xp} XP</span>
                  </div>
                  <p className="mt-2 text-sm font-medium leading-snug">{b.t}</p>
                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                    <span>♥ {b.likes}</span>
                    <span>💬 {b.comments}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {tab === "Clubs" && (
          <div className="space-y-3">
            {clubs.map((c) => (
              <article key={c.name} className="flex items-center gap-3 rounded-2xl bg-gradient-card p-3 shadow-soft">
                <div className="grid h-12 w-12 place-items-center rounded-xl text-primary-foreground" style={{ background: c.c }}>
                  <Hash className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{c.name}</div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Users className="h-3 w-3" /> {c.members} members</div>
                </div>
                <button className="rounded-full bg-foreground/95 px-3 py-1.5 text-[11px] font-semibold text-background">Open</button>
              </article>
            ))}
          </div>
        )}

        {tab === "Network" && (
          <div className="space-y-3">
            {networks.map((n) => (
              <article key={n.handle} className="flex items-center gap-3 rounded-2xl bg-gradient-card p-3 shadow-soft">
                <div className="grid h-11 w-11 place-items-center rounded-full font-display font-bold text-primary-foreground" style={{ background: n.c }}>
                  {n.name[0]}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{n.name}</div>
                  <div className="text-[11px] text-muted-foreground">@{n.handle} · {n.role}</div>
                </div>
                <button className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold">Following</button>
              </article>
            ))}
          </div>
        )}

        {tab === "Media" && (
          <div className="grid grid-cols-3 gap-1.5">
            {[...builds, ...builds].map((b, i) => (
              <div key={i} className="aspect-square rounded-xl" style={{ background: b.c }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
