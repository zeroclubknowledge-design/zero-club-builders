import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, MessageCircle, Share2, Flame, Plus, Bell, User, Zap, Users, Bookmark, GraduationCap, MonitorPlay, BarChart3, MoreHorizontal, Settings, HelpCircle, UserPlus, ChevronDown } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";

export const Route = createFileRoute("/app/")({
  component: Feed,
});

type Post = {
  id: string; user: string; handle: string; avatar: string; time: string;
  title: string; body: string; xp: number; likes: number; comments: number; tag: string;
};

const posts: Post[] = [
  { id: "1", user: "Ada Okafor", handle: "adabuilds", avatar: "#f0abfc", time: "2h",
    title: "Day 14 · Shipped my first Figma → Webflow build",
    body: "Used auto-layout religiously. The hardest part wasn't the design — it was naming the variables. Onto the next one.",
    xp: 120, likes: 84, comments: 12, tag: "Design", views: "12.4k" },
  { id: "2", user: "Tunde A.", handle: "tundeships", avatar: "#a78bfa", time: "5h",
    title: "Closed my first ₦80k client from a Feed post 🤝",
    body: "Posted my portfolio thread last week. DM came in Tuesday. Lesson: build in public, then build again.",
    xp: 250, likes: 312, comments: 41, tag: "Growth", views: "45k" },
  { id: "3", user: "Zara M.", handle: "zaracodes", avatar: "#fb7185", time: "1d",
    title: "Completed the React Cohort 02 final challenge",
    body: "Built a habit tracker with Supabase + animations. Certificate unlocked. On to Network tier.",
    xp: 400, likes: 198, comments: 27, tag: "Dev", views: "8.2k" },
];

function Feed() {
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  return (
    <div className="px-5">
      {/* Filters */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {["For you", "Following", "Design", "Dev", "Growth", "Cohort 03"].map((c, i) => (
          <button key={c} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium transition ${i === 0 ? "bg-foreground text-background" : "border border-border bg-card/40 text-muted-foreground"}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Compose */}
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-border bg-card/40 p-4">
        <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-gradient-primary text-primary-foreground transition hover:opacity-90 active:scale-95">
          <Plus className="h-4 w-4" />
          <input type="file" className="hidden" accept="image/*,video/*" />
        </label>
        <textarea 
          className="min-h-[40px] w-full resize-none bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Share today's build…"
          rows={1}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = target.scrollHeight + 'px';
          }}
        />
        <button className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-glow transition active:scale-95">
          Publish
        </button>
      </div>

      {/* Posts */}
      <section className="mt-5 space-y-4">
        {posts.map((p) => (
          <article key={p.id} className="rounded-3xl bg-gradient-card p-5 shadow-soft">
            <header className="flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 rounded-full" style={{ background: p.avatar }} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-col">
                  <span className="font-bold truncate">{p.user}</span>
                  <span className="text-xs text-muted-foreground truncate">@{p.handle} · {p.time}</span>
                </div>
              </div>
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                {p.tag}
              </span>
            </header>
            <h3 className="mt-3 font-display text-lg font-semibold leading-tight">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            <footer className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <button onClick={() => setLiked((l) => ({ ...l, [p.id]: !l[p.id] }))} className="flex items-center gap-1.5 transition active:scale-95">
                <Heart className={`h-4 w-4 transition ${liked[p.id] ? "fill-primary text-primary" : ""}`} />
                <span>{p.likes + (liked[p.id] ? 1 : 0)}</span>
              </button>
              <button className="flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" />
                <span>{p.comments}</span>
              </button>
              <button className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4" />
                <span>{p.views}</span>
              </button>
              <div className="flex items-center gap-4">
                <button>
                  <Bookmark className="h-4 w-4" />
                </button>
                <button>
                  <Share2 className="h-4 w-4" />
                </button>
              </div>
            </footer>
          </article>
        ))}
      </section>
    </div>
  );
}
