import { createFileRoute } from "@tanstack/react-router";
import { Search, Clock, Users, Star } from "lucide-react";

export const Route = createFileRoute("/app/bootcamps")({
  component: Bootcamps,
});

const camps = [
  { t: "Product Design Sprint", tutor: "Kemi A.", price: "₦25,000", weeks: 4, students: 142, rating: 4.9, color: "linear-gradient(135deg,#f472b6,#a78bfa)", tag: "Design" },
  { t: "Full-Stack with Supabase", tutor: "Ife O.", price: "₦40,000", weeks: 6, students: 89, rating: 4.8, color: "linear-gradient(135deg,#c084fc,#60a5fa)", tag: "Dev" },
  { t: "Growth Marketing 101", tutor: "Tola B.", price: "₦18,000", weeks: 3, students: 211, rating: 4.7, color: "linear-gradient(135deg,#fb7185,#f59e0b)", tag: "Growth" },
  { t: "Motion Design in After Effects", tutor: "Dami K.", price: "₦30,000", weeks: 5, students: 67, rating: 4.9, color: "linear-gradient(135deg,#34d399,#a78bfa)", tag: "Design" },
];

function Bootcamps() {
  return (
    <div className="px-5">

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-card/40 px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input placeholder="Search by skill or tutor" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {["All", "Design", "Dev", "Growth", "Motion", "AI"].map((c, i) => (
          <button key={c} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium ${i === 0 ? "bg-foreground text-background" : "border border-border bg-card/40 text-muted-foreground"}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Featured */}
      <section className="mt-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-primary p-6 shadow-glow">
          <span className="rounded-full bg-background/15 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">FEATURED</span>
          <h2 className="mt-3 font-display text-2xl font-bold text-primary-foreground">Zero to Shipped: Build a SaaS in 6 weeks</h2>
          <p className="mt-2 text-sm text-primary-foreground/85">Live cohort with Ife O. Limited to 30 builders.</p>
          <div className="mt-5 flex items-center justify-between">
            <div className="text-primary-foreground"><span className="font-display text-2xl font-bold">₦55,000</span></div>
            <button className="rounded-full bg-background px-4 py-2 text-xs font-semibold text-foreground">Enroll →</button>
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="mt-6 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground">All cohorts</h3>
        {camps.map((c) => (
          <article key={c.t} className="overflow-hidden rounded-3xl bg-gradient-card shadow-soft">
            <div className="h-24" style={{ background: c.color }} />
            <div className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{c.tag}</span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 fill-warning text-warning" /> {c.rating}
                </div>
              </div>
              <h4 className="mt-2 font-display text-lg font-semibold leading-tight">{c.t}</h4>
              <p className="mt-1 text-xs text-muted-foreground">with {c.tutor}</p>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {c.weeks} wks</span>
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {c.students}</span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="font-display text-lg font-bold text-gradient">{c.price}</span>
                <button className="rounded-full bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow">Enroll</button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
