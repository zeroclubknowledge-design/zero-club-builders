import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Star, Zap, Users, Share2, Rocket, CheckCircle2, ChevronLeft, GraduationCap, Trophy, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getQuests, claimQuestRewardAction } from "@/api";
import { getLevelFromXp, getLevelProgress } from "@/lib/utils";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/app/quests")({
  component: QuestsPage,
});

const ICON_MAP: Record<string, any> = {
  Rocket,
  Users,
  Share2,
  GraduationCap,
  Star,
  Trophy
};

const BG_MAP: Record<string, string> = {
  post: "bg-blue-500/10",
  follow: "bg-purple-500/10",
  enrollment: "bg-orange-500/10",
  profile: "bg-primary/10"
};

const COLOR_MAP: Record<string, string> = {
  post: "text-blue-500",
  follow: "text-purple-500",
  enrollment: "text-orange-500",
  profile: "text-primary"
};

function QuestsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [localClaimedIds, setLocalClaimedIds] = useState<Record<string, boolean>>({});
  const [isMounted, setIsMounted] = useState(false);

  // Set mounted on client to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
    
    // Safely load and initialize localClaimedIds from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('localClaimedIds');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const dateStr = getLocalDateString();
          if (parsed.date === dateStr) {
            setLocalClaimedIds(parsed.claims || {});
          } else {
            // Clear old claims from previous days
            localStorage.removeItem('localClaimedIds');
          }
        } catch (e) {
          console.error("Error parsing localClaimedIds:", e);
        }
      }
    }
  }, []);

  // Helper to format date in user's local timezone
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fetch real profile details from Supabase (including XP and coins)
  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      return data;
    }
  });

  // Use query for quests updates
  const { data: quests, isLoading } = useQuery({
    queryKey: ['quests'],
    queryFn: () => getQuests(),
    staleTime: 1000 * 30
  });

  const claimMutation = useMutation({
    mutationFn: (questId: string) => claimQuestRewardAction({ data: questId }),
    onMutate: (questId: string) => {
      setLocalClaimedIds(prev => {
        const next = { ...prev, [questId]: true };
        if (typeof window !== 'undefined') {
          const dateStr = getLocalDateString();
          localStorage.setItem('localClaimedIds', JSON.stringify({
            date: dateStr,
            claims: next
          }));
          localStorage.setItem(`client_claimed_${questId}`, dateStr);
        }
        return next;
      });
    },
    onSuccess: (res: any, questId: string) => {
      if (res.success) {
        toast.success(`Success! You earned ${res.reward} XP`);
        queryClient.setQueryData(['profile'], (old: any) => old ? { ...old, xp: (old.xp || 0) + res.reward } : old);
        queryClient.setQueryData(['profile', 'current'], (old: any) => old ? { ...old, xp: (old.xp || 0) + res.reward } : old);
        queryClient.invalidateQueries({ queryKey: ['quests'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      } else {
        toast.error(res.message || "Failed to claim reward.");
        // Revert local state on error
        setLocalClaimedIds(prev => ({ ...prev, [questId]: false }));
      }
      setClaimingId(null);
    },
    onError: (err: any, questId: string) => {
      toast.error(err.message || "An error occurred while claiming.");
      setLocalClaimedIds(prev => ({ ...prev, [questId]: false }));
      setClaimingId(null);
    }
  });

  const isQuestClaimedLocal = (qId: string) => {
    if (!isMounted) return false; // Match server on initial SSR & hydration
    if (localClaimedIds[qId]) return true;
    if (typeof window !== 'undefined') {
      const today = getLocalDateString();
      const claimDate = localStorage.getItem(`client_claimed_${qId}`);
      if (claimDate === today) return true;
      
      // Secondary scanner check
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes(`_${qId}_`) && key.includes(today)) {
            if (localStorage.getItem(key) === 'true') return true;
          }
        }
      } catch (e) {}
    }
    return false;
  };

  const activeQuests = (quests || []).filter((q: any) => !q.isClaimed && !isQuestClaimedLocal(q.id));
  const completedQuests = (quests || []).filter((q: any) => q.isClaimed || isQuestClaimedLocal(q.id));

  // XP and rank calculation using real profile XP
  const profileXp = profile?.xp || 0;
  
  // Real level calculation to align with profile
  const { currentXP, maxXP, percent } = getLevelProgress(profileXp);
  const level = getLevelFromXp(profileXp);

  return (
    <div className="relative flex flex-col min-h-screen bg-background pb-28 text-foreground overflow-x-hidden">
      {/* Sleek top radial gradient glow background */}
      <div className="absolute top-0 right-0 left-0 h-[260px] bg-gradient-to-b from-primary/15 via-purple-500/5 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Revamped Header */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/40 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/app/wallet" className="grid h-10 w-10 place-items-center rounded-full transition active:bg-accent/10">
            <ChevronLeft className="h-6 w-6 text-foreground" />
          </Link>
          <h1 className="font-display text-lg font-bold text-foreground">
            Quests
          </h1>
        </div>

        {/* Real Profile XP badge */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full text-xs font-black text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.1)">
            <Zap className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <span>{isMounted ? `${profileXp} XP` : "0 XP"}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-5 pt-24">
        {isLoading ? (
          <div className="py-24 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Rank & Progress Card */}
            <section className="rounded-2xl bg-gradient-to-br from-primary to-purple-800 p-6 text-white shadow-[0_0_35px_rgba(204,32,143,0.25)] relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 h-32 w-32 bg-white/5 rounded-full blur-2xl" />
              
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 backdrop-blur-md border border-white/10">
                  <Trophy className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-[10px] opacity-80">Builder Rank</h2>
                  <p className="text-xl font-black">Level {level} Master</p>
                </div>
              </div>
              <div className="mt-6 space-y-2">
                <div className="flex justify-between text-[10px] opacity-85">
                  <span>Progress to Level {level + 1}</span>
                  <span>{currentXP} / {maxXP} XP</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-black/20">
                  <div 
                    className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)] transition-all duration-1000 ease-out" 
                    style={{ width: `${percent}%` }} 
                  />
                </div>
              </div>
            </section>

            {/* Redesigned Daily Streaks Section */}
            <section className="rounded-2xl border border-border/40 bg-card/65 backdrop-blur-md p-5 shadow-lg relative overflow-hidden">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[10px] text-muted-foreground">Daily Streaks</h3>
                <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/10">
                  Active
                </span>
              </div>
              
              <div className="flex justify-between items-center px-2 py-4 bg-black/25 rounded-2xl mb-4 border border-white/5 overflow-visible">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
                  const now = new Date();
                  const currentDayIndex = (now.getDay() + 6) % 7; // Convert to Monday=0 start
                  const isCompleted = idx < currentDayIndex;
                  const isCurrent = idx === currentDayIndex;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1.5 flex-1 min-w-[28px]">
                      <span className="text-[9px] font-black text-muted-foreground">{day}</span>
                      <div className={`h-7 w-7 sm:h-8 sm:w-8 shrink-0 rounded-full flex items-center justify-center transition-all ${
                        isCompleted 
                          ?'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]' 
                          : isCurrent 
                            ? 'bg-primary/20 border border-primary/50 text-primary animate-pulse shadow-[0_0_10px_rgba(204,32,143,0.2)]' 
                            : 'bg-muted/5 border border-muted/10 text-muted-foreground'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 stroke-[3px" />
                        ) : isCurrent ? (
                          <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                        ) : (
                          <span className="text-[9px] font-bold opacity-60">{idx + 1}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Day Streak Claim Banner */}
              {isMounted && (localClaimedIds['streak_reward'] || (typeof window !== 'undefined' && localStorage.getItem('streak_claimed') === getLocalDateString())) ? (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-2xl opacity-80">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                      <CheckCircle2 className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-foreground">Daily Login Reward</h4>
                      <p className="text-[10px] text-emerald-500 mt-0.5">Claimed for today</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/15 p-3.5 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl shrink-0 bg-primary/25 flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_15px_rgba(204,32,143,0.15)">
                      <Trophy className="h-4.5 w-4.5" />
                    </div>
                    <div className="flex flex-col justify-center">
                      <h4 className="text-xs font-black text-foreground leading-tight">Daily Login Reward</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 font-bold">
                        <span className="text-amber-400">⚡ +100 XP</span>
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                      if (profile) {
                        const { data } = await supabase.from('profiles').select('xp').eq('id', profile.id).single();
                        if (data) {
                          await supabase.from('profiles').update({ xp: data.xp + 100 }).eq('id', profile.id);
                          queryClient.invalidateQueries({ queryKey: ['profile'] });
                        }
                      }
                      toast.success("Login reward claimed!");
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('streak_claimed', getLocalDateString());
                      }
                      setLocalClaimedIds(prev => {
                        const next = { ...prev, streak_reward: true };
                        if (typeof window !== 'undefined') {
                          localStorage.setItem('localClaimedIds', JSON.stringify({
                            date: getLocalDateString(),
                            claims: next
                          }));
                        }
                        return next;
                      });
                    }}
                    className="text-[10px] font-black text-primary hover:brightness-110 active:scale-95 transition-all flex items-center gap-0.5"
                  >
                    Claim Reward »
                  </button>
                </div>
              )}
            </section>

            {/* Redesigned Available Quests Section */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[10px] text-muted-foreground">Available Quests</h3>
                <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[9px] font-black text-primary border border-primary/10">
                  <Zap className="h-2.5 w-2.5" />
                  <span>Double XP Active</span>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {activeQuests.length > 0 ? (
                  activeQuests.map((q: any) => {
                    const Icon = ICON_MAP[q.icon_name] || Rocket;
                    const isReady = q.isCompleted && !q.isClaimed;

                    return (
                      <div 
                        key={q.id} 
                        className={`group relative overflow-hidden rounded-[24px] border transition-all duration-300 ${
                          isReady 
                            ?"border-primary/45 bg-primary/5 shadow-[0_0_20px_rgba(204,32,143,0.08)]" 
                            : "border-border/30 bg-card/65 backdrop-blur-md"
                        }`}
                      >
                        <div className="p-5">
                          <div className="flex gap-4">
                            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted/5 border border-border/20 ${
                              isReady ?'text-primary' : 'text-muted-foreground'
                            }`}>
                              <Icon className="h-5.5 w-5.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h4 className="font-bold text-sm text-foreground truncate">{q.title}</h4>
                                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                    {q.description}
                                  </p>
                                </div>
                                <div className="shrink-0 bg-gradient-to-r from-primary to-purple-600 px-2.5 py-1 rounded-lg text-[9px] font-black text-white shadow-md">
                                  +{q.reward_xp} XP
                                </div>
                              </div>

                              <div className="mt-4 flex items-center gap-3">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/25">
                                  <div 
                                    className={`h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-700`} 
                                    style={{ width: `${(q.progress / q.criteria_count) * 100}%` }}
                                  />
                                </div>
                                <span className="text-[9px] font-black text-muted-foreground tabular-nums">
                                  {q.progress}/{q.criteria_count}
                                </span>
                              </div>
                            </div>
                          </div>

                          {isReady && (
                            <button 
                              onClick={() => {
                                if (isQuestClaimedLocal(q.id)) {
                                  toast.error("Quest already claimed today!");
                                  return;
                                }
                                setClaimingId(q.id);
                                claimMutation.mutate(q.id);
                              }}
                              disabled={claimingId === q.id}
                              className="mt-4 w-full rounded-xl bg-gradient-to-r from-primary to-purple-600 py-3 text-xs font-black text-white shadow-glow transition-all active:scale-95 hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              {claimingId === q.id ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  <span>Claiming...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Claim Reward</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center rounded-[24px] bg-card/65 backdrop-blur-md border border-dashed border-border/40">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                    <h4 className="text-foreground font-bold text-sm">All caught up!</h4>
                    <p className="text-xs text-muted-foreground mt-1">Check back later for new quests.</p>
                  </div>
                )}
              </div>
            </section>

            {/* Redesigned Completed Quests Section */}
            {completedQuests.length > 0 && (
              <section className="mt-2">
                <h3 className="mb-4 text-[10px] text-muted-foreground"> Recently Completed</h3>
                <div className="flex flex-col gap-3">
                  {completedQuests.map((q: any) => (
                    <div key={q.id} className="flex items-center justify-between rounded-2xl bg-card/35 border border-border/20 p-4 opacity-70">
                      <div className="flex items-start gap-3 flex-1 min-w-0 pr-4">
                        <div className="h-9 w-9 shrink-0 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mt-0.5">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-foreground leading-snug break-words">{q.title}</h4>
                          <p className="text-[8px] text-muted-foreground mt-1">Claimed • {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        </div>
                      </div>
                      <div className="text-xs font-black text-primary shrink-0">+{q.reward_xp} XP</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
