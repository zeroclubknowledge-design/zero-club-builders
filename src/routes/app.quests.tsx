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
    <div className="relative flex flex-col min-h-screen bg-background pb-20 text-foreground overflow-x-hidden">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-background/85 backdrop-blur-xl backdrop-saturate-150 border-b hairline px-5 pb-3.5 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/app/wallet" className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04]">
            <ChevronLeft className="h-[18px] w-[18px] text-foreground" />
          </Link>
          <h1 className="font-display text-[17px] font-semibold tracking-tight text-foreground">
            Quests
          </h1>
        </div>

        {/* Real Profile XP badge */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-card ring-1 ring-border px-3 py-1.5 rounded-full text-[12px] font-semibold tracking-tight text-foreground tabular-nums">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span>{isMounted ? `${profileXp.toLocaleString()} XP` : "0 XP"}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-5 pt-24">
        {isLoading ? (
          <div className="py-24 flex flex-col items-center gap-4">
            <div className="h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div className="h-full w-1/3 rounded-full bg-primary animate-progress" />
            </div>
          </div>
        ) : (
          <>
            {/* Rank & Progress Card */}
            <section className="relative overflow-hidden rounded-[28px] bg-[#141117] p-6 text-white shadow-lift ring-1 ring-white/[0.06]">
              <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[#cc208f]/25 blur-[80px]" />

              <div className="relative z-10 flex items-center gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
                  <Trophy className="h-5 w-5 text-white/90" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/50">Builder rank</h2>
                  <p className="mt-0.5 text-[19px] font-semibold tracking-tight">Level {level} Master</p>
                </div>
              </div>
              <div className="relative z-10 mt-6 space-y-2">
                <div className="flex justify-between text-[11px] text-white/60 tabular-nums">
                  <span>Progress to Level {level + 1}</span>
                  <span>{currentXP} / {maxXP} XP</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#cc208f] transition-all duration-1000 ease-out"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            </section>

            {/* Redesigned Daily Streaks Section */}
            <section className="rounded-2xl ring-1 ring-border bg-card p-5 shadow-soft relative overflow-hidden">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Daily streaks</h3>
                <span className="text-[10px] font-semibold text-primary bg-primary/8 px-2.5 py-0.5 rounded-full ring-1 ring-primary/15">
                  Active
                </span>
              </div>

              <div className="flex justify-between items-center px-2 py-4 bg-foreground/[0.03] rounded-2xl mb-4 overflow-visible">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
                  const now = new Date();
                  const currentDayIndex = (now.getDay() + 6) % 7; // Convert to Monday=0 start
                  const isCompleted = idx < currentDayIndex;
                  const isCurrent = idx === currentDayIndex;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1.5 flex-1 min-w-[28px]">
                      <span className="text-[9px] font-medium text-muted-foreground">{day}</span>
                      <div className={`h-7 w-7 sm:h-8 sm:w-8 shrink-0 rounded-full flex items-center justify-center transition-all ${
                        isCompleted
                          ? 'bg-success/10 ring-1 ring-success/25 text-success'
                          : isCurrent
                            ? 'bg-primary/10 ring-1 ring-primary/40 text-primary'
                            : 'ring-1 ring-border text-muted-foreground'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                        ) : isCurrent ? (
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        ) : (
                          <span className="text-[9px] font-medium opacity-60">{idx + 1}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Day Streak Claim Banner */}
              {isMounted && (localClaimedIds['streak_reward'] || (typeof window !== 'undefined' && localStorage.getItem('streak_claimed') === getLocalDateString())) ? (
                <div className="flex items-center justify-between bg-success/5 ring-1 ring-success/15 p-3.5 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-success/10 ring-1 ring-success/20 flex items-center justify-center text-success">
                      <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-semibold tracking-tight text-foreground">Daily login reward</h4>
                      <p className="text-[11px] text-success mt-0.5">Claimed for today</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-primary/[0.04] ring-1 ring-primary/15 p-3.5 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full shrink-0 bg-primary/8 ring-1 ring-primary/15 flex items-center justify-center text-primary">
                      <Trophy className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <div className="flex flex-col justify-center">
                      <h4 className="text-[13px] font-semibold tracking-tight text-foreground leading-tight">Daily login reward</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 font-medium">
                        <span className="text-amber-600 dark:text-amber-400">+100 XP</span>
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
                    className="rounded-full bg-foreground px-3.5 py-1.5 text-[11px] font-semibold tracking-tight text-background tap hover:opacity-90"
                  >
                    Claim
                  </button>
                </div>
              )}
            </section>

            {/* Redesigned Available Quests Section */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Available quests</h3>
                <div className="flex items-center gap-1 rounded-full bg-primary/8 px-2.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/15">
                  <Zap className="h-2.5 w-2.5" />
                  <span>Double XP active</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {activeQuests.length > 0 ? (
                  activeQuests.map((q: any) => {
                    const Icon = ICON_MAP[q.icon_name] || Rocket;
                    const isReady = q.isCompleted && !q.isClaimed;

                    return (
                      <div
                        key={q.id}
                        className={`group relative overflow-hidden rounded-2xl transition-all duration-300 ${
                          isReady
                            ? "ring-1 ring-primary/30 bg-primary/[0.03] shadow-soft"
                            : "ring-1 ring-border bg-card shadow-soft"
                        }`}
                      >
                        <div className="p-5">
                          <div className="flex gap-3.5">
                            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ring-1 ${
                              isReady ? 'ring-primary/20 bg-primary/8 text-primary' : 'ring-border bg-background/60 text-muted-foreground'
                            }`}>
                              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h4 className="font-semibold tracking-tight text-[14px] text-foreground truncate">{q.title}</h4>
                                  <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed line-clamp-2">
                                    {q.description}
                                  </p>
                                </div>
                                <div className="shrink-0 rounded-full bg-primary/8 ring-1 ring-primary/15 px-2.5 py-1 text-[10px] font-semibold text-primary tabular-nums">
                                  +{q.reward_xp} XP
                                </div>
                              </div>

                              <div className="mt-4 flex items-center gap-3">
                                <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                                  <div
                                    className="h-full rounded-full bg-primary transition-all duration-700"
                                    style={{ width: `${(q.progress / q.criteria_count) * 100}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
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
                              className="mt-4 w-full rounded-full bg-foreground py-3 text-[13px] font-semibold tracking-tight text-background tap hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              {claimingId === q.id ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  <span>Claiming</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Claim reward</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-14 text-center rounded-2xl ring-1 ring-border bg-card">
                    <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full ring-1 ring-border">
                      <CheckCircle2 className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
                    </div>
                    <h4 className="text-[15px] font-semibold tracking-tight text-foreground">All caught up</h4>
                    <p className="text-[12.5px] text-muted-foreground mt-1">Check back later for new quests.</p>
                  </div>
                )}
              </div>
            </section>

            {/* Redesigned Completed Quests Section */}
            {completedQuests.length > 0 && (
              <section className="mt-2">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recently completed</h3>
                <div className="flex flex-col divide-y divide-hairline rounded-2xl ring-1 ring-border bg-card overflow-hidden">
                  {completedQuests.map((q: any) => (
                    <div key={q.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-success/10 ring-1 ring-success/20 flex items-center justify-center">
                          <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[13px] font-medium tracking-tight text-foreground leading-snug break-words">{q.title}</h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Claimed · {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                        </div>
                      </div>
                      <div className="text-[12px] font-semibold text-muted-foreground tabular-nums shrink-0">+{q.reward_xp} XP</div>
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
