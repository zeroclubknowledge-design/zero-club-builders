import { createFileRoute } from "@tanstack/react-router";
import { MonitorPlay, Settings, BarChart, Video, Plus } from "lucide-react";

export const Route = createFileRoute("/app/tutor-studio")({
  component: TutorStudioPage,
});

function TutorStudioPage() {
  const stats = [
    { label: "Students", value: "1,240", change: "+12%" },
    { label: "Courses", value: "4", change: "+0" },
    { label: "Earnings", value: "₦142.5k", change: "+₦14k" },
  ];

  return (
    <div className="px-5 pt-6 pb-24">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient">Tutor Studio</h1>
          <p className="text-sm text-muted-foreground">Manage your cohorts and content.</p>
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60">
          <Settings className="h-4 w-4" />
        </button>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-sm font-bold">{s.value}</p>
            <p className="text-[10px] text-success font-medium">{s.change}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg font-bold">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-4">
          <button className="flex flex-col gap-3 rounded-3xl border border-primary/20 bg-primary/5 p-4 text-left transition active:scale-95">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold">New Module</p>
              <p className="text-xs text-muted-foreground">Create content</p>
            </div>
          </button>
          <button className="flex flex-col gap-3 rounded-3xl border border-border bg-card/40 p-4 text-left transition active:scale-95">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold">Live Stream</p>
              <p className="text-xs text-muted-foreground">Start session</p>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-8 rounded-3xl border border-dashed border-border p-8 text-center">
        <MonitorPlay className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm font-medium text-muted-foreground">No recent sessions found.</p>
      </div>
    </div>
  );
}
