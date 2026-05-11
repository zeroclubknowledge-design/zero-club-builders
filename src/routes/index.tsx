import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, Zap, Users, Wallet, BadgeCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Zero Club — A private club for builders" },
      { name: "description", content: "Learn, ship, and earn. Zero Club is a high-signal cohort academy and builder community." },
    ],
  }),
});

function Landing() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-6 pb-16 pt-10">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-primary shadow-glow">
            <span className="font-display text-lg font-bold text-primary-foreground">0</span>
          </div>
          <span className="font-display text-lg font-semibold">Zero Club</span>
        </div>
        <Link to="/app" className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="mt-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" /> Invite-only · Cohort 03 open
        </div>
        <h1 className="mt-5 text-[44px] font-bold leading-[1.05] tracking-tight">
          A private club <br /> for <span className="text-gradient">builders.</span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Learn digital skills in cohort bootcamps, ship daily builds, and earn XP that converts to real cash.
        </p>

        <div className="mt-7 flex flex-col gap-3">
          <Link to="/app" className="group flex items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-6 py-4 font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]">
            Enter the club <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <button className="rounded-2xl border border-border bg-card/50 px-6 py-4 text-sm font-medium text-foreground">
            I have an invite code
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex -space-x-2">
            {["#f0abfc", "#c084fc", "#fb7185", "#a78bfa"].map((c) => (
              <div key={c} className="h-7 w-7 rounded-full border-2 border-background" style={{ background: c }} />
            ))}
          </div>
          <span>4,812 builders shipped this week</span>
        </div>
      </section>

      {/* Stat strip */}
      <section className="mt-14 grid grid-cols-3 gap-3">
        {[
          { k: "₦42M", v: "Paid to students" },
          { k: "120+", v: "Bootcamps" },
          { k: "9 kobo", v: "Per XP" },
        ].map((s) => (
          <div key={s.v} className="rounded-2xl bg-gradient-card p-3 text-center shadow-soft">
            <div className="font-display text-xl font-bold text-gradient">{s.k}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{s.v}</div>
          </div>
        ))}
      </section>

      {/* Features */}
      <section className="mt-14 space-y-3">
        <h2 className="mb-4 text-2xl font-bold">Built for serious builders</h2>
        {[
          { i: Zap, t: "Gamified learning", d: "Earn XP for every build, comment, and module completed." },
          { i: Users, t: "Build in public", d: "Daily Feed for shipping work, getting feedback, finding collabs." },
          { i: Wallet, t: "Earn while you learn", d: "Convert XP to Naira. 1 XP = 9 kobo, paid to your bank." },
          { i: BadgeCheck, t: "Zero-Proof verified", d: "Get vetted by top pros and unlock career placement." },
        ].map(({ i: Icon, t, d }) => (
          <div key={t} className="flex gap-4 rounded-2xl bg-gradient-card p-4 shadow-soft">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">{t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{d}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Tiers */}
      <section className="mt-14">
        <h2 className="mb-4 text-2xl font-bold">Club tiers</h2>
        <div className="space-y-2">
          {[
            { n: 1, name: "Free", perk: "Feed + public channels" },
            { n: 2, name: "Learn", perk: "Bootcamps + certificates" },
            { n: 3, name: "Network", perk: "Collabs + XP to cash", featured: true },
            { n: 4, name: "IRL", perk: "Events + career placement" },
          ].map((t) => (
            <div key={t.n} className={`flex items-center gap-4 rounded-2xl border p-4 ${t.featured ? "border-primary/40 bg-primary/5 shadow-glow" : "border-border bg-card/50"}`}>
              <div className={`grid h-10 w-10 place-items-center rounded-xl font-display font-bold ${t.featured ? "bg-gradient-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                {t.n}
              </div>
              <div className="flex-1">
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.perk}</div>
              </div>
              {t.featured && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">POPULAR</span>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mt-14 overflow-hidden rounded-3xl bg-gradient-primary p-8 text-center shadow-glow">
        <h3 className="font-display text-2xl font-bold text-primary-foreground">Your seat is waiting.</h3>
        <p className="mt-2 text-sm text-primary-foreground/80">Get 500 XP when you join with a referral code.</p>
        <Link to="/app" className="mt-5 inline-flex items-center gap-2 rounded-full bg-background px-5 py-3 text-sm font-semibold text-foreground">
          Open the app <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <footer className="mt-12 text-center text-xs text-muted-foreground">
        © Zero Club · Lagos · Building in public since 2024
      </footer>
    </main>
  );
}
