import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Rocket, Trophy, Flame, GitBranch,
  Coins, ShieldCheck, ChevronDown, Plus, CheckCircle2, Loader2,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { format, subDays, isSameDay } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { useGoBack } from "@/hooks/useGoBack";

export const Route = createFileRoute("/app/zerohub")({
  component: ZeroHubPage,
});

const getProjectName = (content = '') => {
  const match = content.match(/\*\*Project:\*\*\s*(.+)/);
  return match?.[1]?.trim() || 'Untitled project';
};

const licenseLabel: Record<string, string> = {
  standard: 'Standard use',
  commercial: 'Commercial use',
  full_ownership: 'Full ownership',
};

function ZeroHubPage() {
  const navigate = useNavigate();
  const goBack = useGoBack("/app");
  const queryClient = useQueryClient();
  const { data: currentUser } = useUser();
  const [view, setView] = useState<'mine' | 'explore' | 'history'>('mine');
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [commentingPost, setCommentingPost] = useState<any>(null);
  const [acquiringId, setAcquiringId] = useState<string | null>(null);

  const { data: ships = [], isLoading } = useQuery({
    queryKey: ['zerohub_projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles:author_id(username, full_name, avatar_url, tier)')
        .eq('is_build_post', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: licences = [] } = useQuery({
    queryKey: ['project_licenses', currentUser?.id],
    enabled: Boolean(currentUser?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_licenses')
        .select('project_id, license_type')
        .eq('buyer_id', currentUser!.id);
      if (error) return [];
      return data || [];
    },
  });

  const myShips = ships.filter((ship: any) => ship.author_id === currentUser?.id);
  const projectGroups = Array.from(
    ships.reduce((groups: Map<string, any[]>, ship: any) => {
      const rootId = ship.project_root_id || ship.id;
      groups.set(rootId, [...(groups.get(rootId) || []), ship]);
      return groups;
    }, new Map<string, any[]>()).entries()
  ).map(([rootId, releases]) => ({
    rootId,
    releases: releases.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  })).sort((a, b) => new Date(b.releases[0].created_at).getTime() - new Date(a.releases[0].created_at).getTime());

  const visibleProjects = projectGroups.filter(({ releases }) => (
    view === 'mine'
      ? releases[0].author_id === currentUser?.id
      : releases[0].author_id !== currentUser?.id
  ));

  const totalShips = myShips.length;
  const xpEarned = totalShips * 50;
  let streak = 0;
  if (myShips.length > 0) {
    const today = new Date();
    const dates = myShips.map((ship: any) => new Date(ship.created_at));
    if (dates.some((date: Date) => isSameDay(date, today) || isSameDay(date, subDays(today, 1)))) {
      streak = 1;
      for (let i = 1; i < 365; i++) {
        if (dates.some((date: Date) => isSameDay(date, subDays(today, i)))) streak++;
        else break;
      }
    }
  }

  const activityDays = Array.from({ length: 60 }).map((_, index) => {
    const date = subDays(new Date(), 59 - index);
    const count = myShips.filter((ship: any) => isSameDay(new Date(ship.created_at), date)).length;
    return { date, count, level: count === 0 ? 0 : count < 2 ? 1 : count < 3 ? 2 : 3 };
  });

  const acquireRights = async (project: any) => {
    if (!currentUser?.id) return toast.error('Sign in to use this project.');
    const price = Number(project.license_price || 0);
    const rights = licenseLabel[project.license_type] || licenseLabel.standard;
    if (price > 0 && !window.confirm(`Acquire ${rights.toLowerCase()} for ${price.toLocaleString()} Coins?`)) return;

    setAcquiringId(project.id);
    try {
      const { error } = await supabase.rpc('acquire_project_license', { p_project_id: project.id });
      if (error) throw error;
      toast.success(price > 0 ? 'Usage rights acquired.' : 'Free usage rights added to your account.');
      queryClient.invalidateQueries({ queryKey: ['project_licenses', currentUser.id] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    } catch (error: any) {
      toast.error(error.message || 'Could not acquire this project.');
    } finally {
      setAcquiringId(null);
    }
  };

  const tabs = [
    { id: 'mine' as const, label: 'My projects' },
    { id: 'explore' as const, label: 'Explore' },
    { id: 'history' as const, label: 'Shipping history' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button onClick={goBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Zero Proofs</h1>
          <Link to="/app/ship" className="mr-1 inline-flex h-9 items-center gap-1 rounded-full bg-[#cc208f] px-3.5 text-[14px] font-semibold text-white hover:bg-[#b01c7b]">
            <Plus className="h-4 w-4" /> Ship
          </Link>
        </div>
        <div className="zc-page-width no-scrollbar mx-auto flex w-full max-w-[680px] gap-5 overflow-x-auto border-b border-border px-4 text-[14px] font-semibold">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`flex h-10 shrink-0 items-center transition-colors ${view === tab.id ? 'text-foreground shadow-[inset_0_-2px_0_currentColor]' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        {view === 'history' ? (
          <>
            <section className="grid grid-cols-3 bg-card py-4 text-center md:rounded-xl md:border md:border-border">
              {[
                { label: 'Ships', value: totalShips, Icon: Rocket },
                { label: 'Day streak', value: streak, Icon: Flame },
                { label: 'XP from ships', value: xpEarned.toLocaleString(), Icon: Trophy },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="border-l border-border/60 first:border-l-0">
                  <Icon className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-1 font-display text-[22px] font-semibold tabular-nums">{value}</p>
                  <p className="text-[12px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </section>
            <section className="flex-1 bg-card p-4 pb-28 md:flex-none md:rounded-xl md:border md:border-border md:pb-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-[18px] font-semibold">Last 60 days</h2>
                <span className="text-[13px] text-muted-foreground">One square a day</span>
              </div>
              <div className="mt-3 grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5">
                {activityDays.map((day, index) => (
                  <div
                    key={index}
                    title={`${day.count} ships on ${format(day.date, 'MMM d, yyyy')}`}
                    className={`aspect-square rounded-[4px] ${day.level === 0 ? 'bg-foreground/[0.06]' : day.level === 1 ? 'bg-[#cc208f]/35' : day.level === 2 ? 'bg-[#cc208f]/65' : 'bg-[#cc208f]'}`}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-end gap-1.5 text-[12px] text-muted-foreground">
                Less
                <span className="h-3 w-3 rounded-[3px] bg-foreground/[0.06]" />
                <span className="h-3 w-3 rounded-[3px] bg-[#cc208f]/35" />
                <span className="h-3 w-3 rounded-[3px] bg-[#cc208f]/65" />
                <span className="h-3 w-3 rounded-[3px] bg-[#cc208f]" />
                More
              </div>
            </section>
          </>
        ) : isLoading ? (
          <div className="grid flex-1 place-items-center bg-card py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : visibleProjects.length > 0 ? (
          <>
            {visibleProjects.map(({ rootId, releases }) => {
              const latest = releases[0];
              const acquired = licences.some((licence: any) => licence.project_id === latest.id);
              const isExpanded = expandedProject === rootId;
              return (
                <article key={rootId} className="overflow-hidden bg-card md:rounded-xl md:border md:border-border">
                  <div className="flex items-center gap-3 px-4 pb-1 pt-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate font-display text-[17px] font-semibold">{getProjectName(latest.content)}</h2>
                        <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[12px] font-semibold text-foreground/75">v{latest.version_label || '1.0.0'}</span>
                      </div>
                      <p className="text-[13px] text-muted-foreground">Latest release {format(new Date(latest.created_at), 'MMM d, yyyy')}</p>
                    </div>
                    {view === 'mine' ? (
                      <Link to="/app/ship" search={{ versionOf: latest.id }} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-foreground px-3 text-[13px] font-semibold">
                        <GitBranch className="h-3.5 w-3.5" /> New version
                      </Link>
                    ) : latest.available_for_use ? (
                      <button
                        disabled={acquired || acquiringId === latest.id}
                        onClick={() => acquireRights(latest)}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 text-[13px] font-semibold text-background disabled:opacity-60"
                      >
                        {acquiringId === latest.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : acquired ? <CheckCircle2 className="h-3.5 w-3.5" /> : latest.license_price > 0 ? <Coins className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        {acquired ? 'Rights acquired' : latest.license_price > 0 ? `${Number(latest.license_price).toLocaleString()} Coins` : 'Use for free'}
                      </button>
                    ) : (
                      <span className="shrink-0 text-[12px] text-muted-foreground">Showcase only</span>
                    )}
                  </div>
                  {latest.release_notes && (
                    <p className="px-4 pb-1 pt-1.5 text-[13px] text-muted-foreground">
                      <span className="font-semibold text-foreground">What changed:</span> {latest.release_notes}
                    </p>
                  )}
                  {/* The drawer the comment button opens is the same one the
                      feed uses, so replies behave here as anywhere else. */}
                  <PostCard post={latest} currentUser={currentUser} onCommentClick={setCommentingPost} />

                  <button onClick={() => setExpandedProject(isExpanded ? null : rootId)} className="flex w-full items-center justify-between border-t border-border/60 px-4 py-3 text-left text-[14px] font-semibold hover:bg-foreground/[0.02]">
                    <span className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-muted-foreground" /> {releases.length} {releases.length === 1 ? 'version' : 'versions'}</span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border/60 px-4 py-1">
                      {releases.map((release: any, index: number) => (
                        <Link key={release.id} to="/app/post/$id" params={{ id: release.id }} className="flex items-center justify-between gap-4 border-b border-border/40 py-3 last:border-0">
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold">v{release.version_label || (index === releases.length - 1 ? '1.0.0' : 'Update')}</p>
                            <p className="truncate text-[13px] text-muted-foreground">{release.release_notes || 'Project release'}</p>
                          </div>
                          <span className="shrink-0 text-[12px] text-muted-foreground">{format(new Date(release.created_at), 'MMM d, yyyy')}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
            <div aria-hidden className="min-h-24 flex-1 bg-card md:hidden" />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-card px-8 pb-28 pt-16 text-center md:rounded-xl md:border md:border-border md:pb-16">
            <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05]"><Rocket className="h-5 w-5 text-muted-foreground" /></span>
            <h3 className="font-display text-[18px] font-semibold">{view === 'mine' ? 'Nothing shipped yet' : 'No reusable projects yet'}</h3>
            <p className="mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-muted-foreground">{view === 'mine' ? 'Ship your first project, then publish improvements as new versions.' : 'Projects offered for free or paid use will show up here.'}</p>
            {view === 'mine' && <Link to="/app/ship" className="mt-5 flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background">Ship your first project</Link>}
          </div>
        )}
      </main>

      <CommentDrawer
        post={commentingPost}
        isOpen={Boolean(commentingPost)}
        onClose={() => setCommentingPost(null)}
      />
    </div>
  );
}
