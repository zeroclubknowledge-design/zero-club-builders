import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Users, Hash, Lock, Sparkles, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/app/clubs")({
  component: Clubs,
});

const myClubs = [
  { id: "design-03", name: "Design · Cohort 03", members: 142, last: "Kemi: drop your Figma links 👀", time: "2m", unread: 4, color: "linear-gradient(135deg,#f472b6,#a78bfa)", tag: "Bootcamp" },
  { id: "fs-supabase", name: "Full-Stack Supabase", members: 89, last: "Ife: pushed the auth starter", time: "12m", unread: 1, color: "linear-gradient(135deg,#c084fc,#60a5fa)", tag: "Bootcamp" },
  { id: "lagos-builders", name: "Lagos Builders IRL", members: 312, last: "Meetup Sat @ Yaba — who's in?", time: "1h", unread: 0, color: "linear-gradient(135deg,#fb7185,#f59e0b)", tag: "Network" },
];

const discover = [
  { name: "Growth Marketing 101", members: 211, color: "linear-gradient(135deg,#34d399,#a78bfa)", locked: true },
  { name: "AI Builders Africa", members: 540, color: "linear-gradient(135deg,#60a5fa,#f472b6)", locked: false },
  { name: "Motion Designers", members: 67, color: "linear-gradient(135deg,#f59e0b,#fb7185)", locked: true },
];

function Clubs() {
  return (
    <div className="px-5 pt-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Talk to your people</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Clubs</h1>
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
          <MessageCircle className="h-4 w-4" />
        </button>
      </header>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-card/40 px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input placeholder="Search clubs and people" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Your clubs</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">3 active</span>
        </div>
        <div className="space-y-3">
          {myClubs.map((c) => (
            <Link key={c.id} to="/app/clubs" className="block">
              <article className="flex items-center gap-3 rounded-3xl bg-gradient-card p-3 shadow-soft">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-primary-foreground" style={{ background: c.color }}>
                  <Hash className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="truncate font-display text-sm font-semibold">{c.name}</h4>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{c.time}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.last}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">{c.tag}</span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Users className="h-3 w-3" />{c.members}</span>
                  </div>
                </div>
                {c.unread > 0 && (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-primary text-[10px] font-bold text-primary-foreground shadow-glow">{c.unread}</span>
                )}
              </article>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Discover clubs</h3>
          <button className="text-xs font-semibold text-primary">See all</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {discover.map((d) => (
            <article key={d.name} className="overflow-hidden rounded-2xl bg-gradient-card shadow-soft">
              <div className="relative h-20" style={{ background: d.color }}>
                {d.locked && (
                  <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-background/30 text-primary-foreground backdrop-blur">
                    <Lock className="h-3 w-3" />
                  </span>
                )}
              </div>
              <div className="p-3">
                <div className="text-sm font-semibold leading-tight">{d.name}</div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Users className="h-3 w-3" /> {d.members} members
                </div>
                <button className="mt-3 w-full rounded-full bg-foreground/95 py-1.5 text-[11px] font-semibold text-background">
                  {d.locked ? "Unlock with cohort" : "Join"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-7 mb-2 rounded-3xl bg-gradient-primary p-5 shadow-glow">
        <div className="flex items-center gap-2 text-primary-foreground">
          <Sparkles className="h-4 w-4" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Club perk</span>
        </div>
        <h4 className="mt-2 font-display text-lg font-bold text-primary-foreground">Bootcamp clubs are unlocked when you enroll</h4>
        <p className="mt-1 text-xs text-primary-foreground/85">Chat with tutors, post your builds, and find a co-builder for the final project.</p>
      </section>
    </div>
  );
}
