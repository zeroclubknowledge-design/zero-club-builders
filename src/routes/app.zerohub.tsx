import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Rocket, Trophy, Flame, ChevronLeft, Calendar, Loader2, Target } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { PostCard } from "@/components/PostCard";
import { format, subDays, isSameDay } from "date-fns";

export const Route = createFileRoute("/app/zerohub")({
  component: ZeroHubPage,
});

function ZeroHubPage() {
  const navigate = useNavigate();
  const { data: currentUser } = useUser();

  // Fetch only posts that are "Ships" (is_build_post = true) for the current user
  const { data: ships, isLoading } = useQuery({
    queryKey: ['my_ships', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const { data, error } = await supabase
        .from('posts')
        .select(`*, profiles:author_id(username, full_name, avatar_url, tier)`)
        .eq('author_id', currentUser.id)
        .eq('is_build_post', true)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentUser?.id,
  });

  // Calculate stats
  const totalShips = ships?.length || 0;
  const xpEarned = totalShips * 50; // 50 XP per ship
  
  // Calculate Streak (Simplified: just checks consecutive days from today backwards)
  let streak = 0;
  if (ships && ships.length > 0) {
    const today = new Date();
    const shipDates = ships.map(s => new Date(s.created_at));
    
    // Check if shipped today or yesterday
    let currentCheckDate = today;
    let hasShippedRecently = shipDates.some(d => isSameDay(d, today)) || 
                             shipDates.some(d => isSameDay(d, subDays(today, 1)));
                             
    if (hasShippedRecently) {
      streak = 1;
      // Walk backwards to find streak
      for (let i = 1; i < 365; i++) {
        const checkDate = subDays(today, i);
        if (shipDates.some(d => isSameDay(d, checkDate))) {
          streak++;
        } else {
          // Break if there's a day without a ship, unless it's today (and they shipped yesterday)
          if (i !== 0 || !shipDates.some(d => isSameDay(d, subDays(today, 1)))) {
            break;
          }
        }
      }
    }
  }

  // Generate Activity Graph (Last 60 days)
  const today = new Date();
  const activityDays = Array.from({ length: 60 }).map((_, i) => {
    const date = subDays(today, 59 - i);
    const dayShips = ships?.filter(s => isSameDay(new Date(s.created_at), date)) || [];
    return {
      date,
      count: dayShips.length,
      level: dayShips.length === 0 ? 0 : dayShips.length < 2 ? 1 : dayShips.length < 3 ? 2 : 3
    };
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl backdrop-saturate-150 border-b hairline pt-[env(safe-area-inset-top)]">
        <div className="flex items-center px-4 py-3.5 gap-3">
          <button
            onClick={() => navigate({ to: "/app" })}
            className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04]"
          >
            <ChevronLeft className="h-[18px] w-[18px] text-foreground" />
          </button>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight">ZeroHub</h1>
            <p className="text-[11px] text-muted-foreground">Proof-of-work infrastructure</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-5 mt-2">

        {/* Hero summary — premium dark card */}
        <section className="relative overflow-hidden rounded-[28px] bg-[#141117] p-6 text-white shadow-lift ring-1 ring-white/[0.06]">
          <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#cc208f]/25 blur-[80px]" />
          <div className="relative z-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/50">Your proof of work</p>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.08]">
              <div className="pr-4">
                <div className="flex items-center gap-1.5 text-white/60">
                  <Rocket className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="text-[10px] font-medium uppercase tracking-[0.1em]">Ships</span>
                </div>
                <p className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums leading-none">{totalShips}</p>
              </div>
              <div className="px-4">
                <div className="flex items-center gap-1.5 text-white/60">
                  <Flame className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="text-[10px] font-medium uppercase tracking-[0.1em]">Streak</span>
                </div>
                <p className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums leading-none">{streak}<span className="text-[13px] font-normal text-white/50 ml-1">d</span></p>
              </div>
              <div className="pl-4">
                <div className="flex items-center gap-1.5 text-white/60">
                  <Trophy className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="text-[10px] font-medium uppercase tracking-[0.1em]">XP</span>
                </div>
                <p className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums leading-none">{xpEarned.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Contribution Graph */}
        <section className="bg-card rounded-2xl p-5 ring-1 ring-border shadow-soft">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} />
              Shipping history
            </h2>
            <span className="text-[11px] text-muted-foreground">Last 60 days</span>
          </div>

          <div className="flex flex-wrap gap-1.5 justify-end">
            {activityDays.map((day, i) => (
              <div
                key={i}
                title={`${day.count} ships on ${format(day.date, 'MMM d, yyyy')}`}
                className={`h-4 w-4 sm:h-5 sm:w-5 rounded-[4px] transition-colors ${
                  day.level === 0 ? "bg-foreground/[0.05]" :
                  day.level === 1 ? "bg-primary/35" :
                  day.level === 2 ? "bg-primary/65" :
                  "bg-primary"
                }`}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="h-3 w-3 rounded-[3px] bg-foreground/[0.05]" />
              <div className="h-3 w-3 rounded-[3px] bg-primary/35" />
              <div className="h-3 w-3 rounded-[3px] bg-primary/65" />
              <div className="h-3 w-3 rounded-[3px] bg-primary" />
            </div>
            <span>More</span>
          </div>
        </section>

        {/* Portfolio Feed */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-2">
              <Target className="h-3.5 w-3.5" strokeWidth={1.75} />
              Shipped projects
            </h2>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center py-12">
              <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
                <div className="h-full w-1/3 rounded-full bg-primary animate-progress" />
              </div>
            </div>
          ) : ships && ships.length > 0 ? (
            <div className="flex flex-col gap-3">
              {ships.map((post: any) => (
                <div key={post.id} className="bg-card rounded-2xl overflow-hidden ring-1 ring-border shadow-soft">
                  <PostCard post={post} currentUser={currentUser} />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-2xl p-12 ring-1 ring-border text-center flex flex-col items-center">
              <div className="h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center mb-5">
                <Rocket className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
              </div>
              <h3 className="text-[17px] font-semibold tracking-tight mb-1.5">Your portfolio is empty</h3>
              <p className="text-[13.5px] text-muted-foreground max-w-[260px] mb-7 leading-relaxed">
                Ship your first project to start building your resume and earn XP.
              </p>
              <Link
                to="/app/ship"
                className="rounded-full bg-foreground px-6 py-2.5 text-[13px] font-semibold tracking-tight text-background tap hover:opacity-90"
              >
                Ship your first project
              </Link>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
