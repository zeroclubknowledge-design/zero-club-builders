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
    <div className="min-h-screen bg-background pb-24">
      {/* Premium Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-2xl border-b border-border/40 h-[calc(72px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]">
        <div className="flex items-center px-4 h-[72px] gap-3">
          <button 
            onClick={() => navigate({ to: "/app" })}
            className="h-10 w-10 rounded-full bg-accent/50 grid place-items-center transition active:scale-95 hover:bg-accent"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              ZeroHub
            </h1>
            <p className="text-[11px] text-muted-foreground font-medium">Proof-of-work infrastructure</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6 mt-4">
        
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-3xl p-4 border border-border/40 flex flex-col items-center justify-center text-center">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <span className="text-2xl font-black">{totalShips}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total Ships</span>
          </div>
          
          <div className="bg-card rounded-3xl p-4 border border-border/40 flex flex-col items-center justify-center text-center">
            <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center mb-2">
              <Flame className="h-5 w-5 text-orange-500" />
            </div>
            <span className="text-2xl font-black">{streak}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Day Streak</span>
          </div>
          
          <div className="bg-card rounded-3xl p-4 border border-border/40 flex flex-col items-center justify-center text-center">
            <div className="h-10 w-10 rounded-full bg-[#ffcf00]/10 flex items-center justify-center mb-2">
              <Trophy className="h-5 w-5 text-[#ffcf00]" />
            </div>
            <span className="text-2xl font-black">{xpEarned}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">XP Earned</span>
          </div>
        </div>

        {/* Contribution Graph */}
        <section className="bg-card rounded-[32px] p-6 border border-border/40 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Shipping History
            </h2>
            <span className="text-[11px] text-muted-foreground font-medium">Last 60 Days</span>
          </div>
          
          <div className="flex flex-wrap gap-1.5 justify-end">
            {activityDays.map((day, i) => (
              <div 
                key={i}
                title={`${day.count} ships on ${format(day.date, 'MMM d, yyyy')}`}
                className={`h-4 w-4 sm:h-5 sm:w-5 rounded-[4px] sm:rounded-md transition-colors ${
                  day.level === 0 ? "bg-accent/40" :
                  day.level === 1 ? "bg-primary/40" :
                  day.level === 2 ? "bg-primary/70" :
                  "bg-primary shadow-[0_0_10px_rgba(204,32,143,0.4)]"
                }`}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="h-3 w-3 rounded-[3px] bg-accent/40" />
              <div className="h-3 w-3 rounded-[3px] bg-primary/40" />
              <div className="h-3 w-3 rounded-[3px] bg-primary/70" />
              <div className="h-3 w-3 rounded-[3px] bg-primary" />
            </div>
            <span>More</span>
          </div>
        </section>

        {/* Portfolio Feed */}
        <section>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Shipped Projects
            </h2>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : ships && ships.length > 0 ? (
            <div className="flex flex-col gap-4">
              {ships.map((post: any) => (
                <div key={post.id} className="bg-card rounded-[32px] overflow-hidden border border-border/40 shadow-sm">
                  {/* Reuse PostCard but it will render beautifully because we formatted it via Markdown */}
                  <PostCard post={post} currentUser={currentUser} />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-[32px] p-10 border border-border/40 text-center flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-accent/50 flex items-center justify-center mb-4">
                <Rocket className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold mb-2">Your portfolio is empty</h3>
              <p className="text-sm text-muted-foreground max-w-[250px] mb-6">
                Ship your first project to start building your on-chain resume and earn XP.
              </p>
              <Link 
                to="/app/ship"
                className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-glow transition active:scale-95"
              >
                Ship Now
              </Link>
            </div>
          )}
        </section>
        
      </main>
    </div>
  );
}
