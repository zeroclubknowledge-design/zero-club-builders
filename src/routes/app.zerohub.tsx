import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Rocket, Trophy, Flame, ChevronLeft, Calendar, Target, GitBranch,
  Coins, ShieldCheck, ChevronDown, Plus, Compass, CheckCircle2, Loader2,
} from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { PostCard } from "@/components/PostCard";
import { CommentDrawer } from "@/components/CommentDrawer";
import { format, subDays, isSameDay } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

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
  const queryClient = useQueryClient();
  const { data: currentUser } = useUser();
  const [view, setView] = useState<'mine' | 'explore'>('mine');
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

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-3.5 md:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate({ to: "/app" })} className="grid h-9 w-9 place-items-center rounded-lg border border-border/60 bg-card tap hover:bg-foreground/[0.04]">
              <ChevronLeft className="h-[18px] w-[18px]" />
            </button>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight">ZeroHub</h1>
              <p className="text-[11px] text-muted-foreground">Versioned proof of work and reusable projects</p>
            </div>
          </div>
          <Link to="/app/ship" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[12px] font-semibold text-background">
            <Plus className="h-4 w-4" /> Ship
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] space-y-5 p-4 md:grid md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-7 md:space-y-0 md:px-6 md:py-8">
        <aside className="space-y-5 md:sticky md:top-24">
          <section className="overflow-hidden rounded-lg border-t-2 border-primary bg-[#141117] p-6 text-white ring-1 ring-white/[0.06]">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/50">Your proof of work</p>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.08]">
              {[
                { label: 'Ships', value: totalShips, Icon: Rocket },
                { label: 'Streak', value: `${streak}d`, Icon: Flame },
                { label: 'XP', value: xpEarned.toLocaleString(), Icon: Trophy },
              ].map(({ label, value, Icon }, index) => (
                <div key={label} className={index === 0 ? 'pr-4' : index === 2 ? 'pl-4' : 'px-4'}>
                  <div className="flex items-center gap-1.5 text-white/60"><Icon className="h-3.5 w-3.5" /><span className="text-[10px] uppercase tracking-[0.1em]">{label}</span></div>
                  <p className="mt-2 text-[25px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg bg-card p-5 ring-1 ring-border">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Shipping history</h2>
              <span className="text-[11px] text-muted-foreground">60 days</span>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              {activityDays.map((day, index) => (
                <div key={index} title={`${day.count} ships on ${format(day.date, 'MMM d, yyyy')}`} className={`h-4 w-4 rounded-[3px] ${day.level === 0 ? 'bg-foreground/[0.05]' : day.level === 1 ? 'bg-primary/35' : day.level === 2 ? 'bg-primary/65' : 'bg-primary'}`} />
              ))}
            </div>
          </section>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-border bg-card p-1">
              <button onClick={() => setView('mine')} className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[12.5px] font-semibold ${view === 'mine' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}><Target className="h-4 w-4" /> My projects</button>
              <button onClick={() => setView('explore')} className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[12.5px] font-semibold ${view === 'explore' ? 'bg-foreground text-background' : 'text-muted-foreground'}`}><Compass className="h-4 w-4" /> Explore</button>
            </div>
            <span className="text-[11px] text-muted-foreground">{visibleProjects.length} projects</span>
          </div>

          {isLoading ? (
            <div className="grid min-h-52 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : visibleProjects.length > 0 ? (
            <div className="space-y-4">
              {visibleProjects.map(({ rootId, releases }) => {
                const latest = releases[0];
                const acquired = licences.some((licence: any) => licence.project_id === latest.id);
                const isExpanded = expandedProject === rootId;
                return (
                  <article key={rootId} className="overflow-hidden rounded-lg bg-card ring-1 ring-border">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate text-[15px] font-semibold tracking-tight">{getProjectName(latest.content)}</h2>
                          <span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">v{latest.version_label || '1.0.0'}</span>
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">Latest release {format(new Date(latest.created_at), 'MMM d, yyyy')}</p>
                      </div>
                      {view === 'mine' ? (
                        <Link to="/app/ship" search={{ versionOf: latest.id }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-semibold hover:bg-accent"><GitBranch className="h-4 w-4" /> Add version</Link>
                      ) : latest.available_for_use ? (
                        <button disabled={acquired || acquiringId === latest.id} onClick={() => acquireRights(latest)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-60">
                          {acquiringId === latest.id ? <Loader2 className="h-4 w-4 animate-spin" /> : acquired ? <CheckCircle2 className="h-4 w-4" /> : latest.license_price > 0 ? <Coins className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                          {acquired ? 'Rights acquired' : latest.license_price > 0 ? `${Number(latest.license_price).toLocaleString()} Coins` : 'Use for free'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Showcase only</span>
                      )}
                    </div>

                    {latest.release_notes && <div className="border-b border-border/60 bg-primary/[0.035] px-4 py-2.5 text-[12px] text-muted-foreground"><span className="font-semibold text-foreground">What changed:</span> {latest.release_notes}</div>}
                    {/* The comment button on a card did nothing here, because
                        nothing was listening to it. The drawer it opens is the
                        same one the feed uses, so replies can be edited and
                        deleted from ZeroHub exactly as they can anywhere else. */}
                    <PostCard post={latest} currentUser={currentUser} onCommentClick={setCommentingPost} />

                    <button onClick={() => setExpandedProject(isExpanded ? null : rootId)} className="flex w-full items-center justify-between border-t border-border/60 px-4 py-3 text-left text-[12px] font-semibold hover:bg-accent/40">
                      <span className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-muted-foreground" /> {releases.length} {releases.length === 1 ? 'version' : 'versions'}</span>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {isExpanded && (
                      <div className="border-t border-border/60 bg-foreground/[0.02] px-4 py-2">
                        {releases.map((release: any, index: number) => (
                          <Link key={release.id} to="/app/post/$id" params={{ id: release.id }} className="flex items-center justify-between gap-4 border-b border-border/40 py-3 last:border-0">
                            <div className="min-w-0"><p className="text-[12.5px] font-semibold">v{release.version_label || (index === releases.length - 1 ? '1.0.0' : 'Update')}</p><p className="truncate text-[11px] text-muted-foreground">{release.release_notes || 'Project release'}</p></div>
                            <span className="shrink-0 text-[10.5px] text-muted-foreground">{format(new Date(release.created_at), 'MMM d, yyyy')}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-lg bg-card p-8 text-center ring-1 ring-border">
              <div className="mb-5 grid h-14 w-14 place-items-center rounded-lg border border-border"><Rocket className="h-6 w-6 text-muted-foreground" /></div>
              <h3 className="text-[17px] font-semibold tracking-tight">{view === 'mine' ? 'Your portfolio is empty' : 'No reusable projects yet'}</h3>
              <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">{view === 'mine' ? 'Ship your first project, then publish future improvements as versions.' : 'Projects offered for free or paid use will appear here.'}</p>
              {view === 'mine' && <Link to="/app/ship" className="mt-6 rounded-lg bg-foreground px-5 py-2.5 text-[12.5px] font-semibold text-background">Ship your first project</Link>}
            </div>
          )}
        </section>
      </main>

      <CommentDrawer
        post={commentingPost}
        isOpen={Boolean(commentingPost)}
        onClose={() => setCommentingPost(null)}
      />
    </div>
  );
}
