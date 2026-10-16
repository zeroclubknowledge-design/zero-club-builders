import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Building2, Check, GraduationCap, Loader2, X } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useGoBack } from "@/hooks/useGoBack";
import { ChevronLeft } from "@/components/icons/glyphs";

/* A person's side of business teams: invitations and assigned training. */
export const Route = createFileRoute("/app/teams")({
  component: MyTeams,
  head: () => ({ meta: [{ title: "Teams — Zero Club" }] }),
});

function MyTeams() {
  const goBack = useGoBack("/app");
  const queryClient = useQueryClient();
  const teams = useQuery({
    queryKey: ["my-teams"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_teams" as never);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  const respond = useMutation({
    mutationFn: async ({ org, accept }: { org: string; accept: boolean }) => {
      const { error } = await supabase.rpc("respond_team_invite" as never, { p_org: org, p_accept: accept } as never);
      if (error) throw error;
      return accept;
    },
    onSuccess: (accept) => {
      toast.success(accept ? "You joined the team" : "Invitation declined");
      void queryClient.invalidateQueries({ queryKey: ["my-teams"] });
    },
    onError: (e: any) => toast.error(e?.message || "Something went wrong"),
  });
  const leave = useMutation({
    mutationFn: async (org: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.rpc("leave_or_remove_team_member" as never, { p_org: org, p_member: auth.user?.id } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("You left the team");
      void queryClient.invalidateQueries({ queryKey: ["my-teams"] });
    },
  });

  return (
    <div className="mx-auto min-h-screen max-w-[720px] pb-24">
      <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-3 backdrop-blur">
        <button type="button" onClick={goBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full hover:bg-foreground/[0.05]"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="font-display text-[18px] font-semibold">Teams</h1>
      </div>
      <div className="px-4 pt-4">
        <p className="text-[13.5px] leading-5 text-muted-foreground">Companies and tech hubs you work with on Zero Club, and the training they've assigned you.</p>
        <div className="mt-4 space-y-3">
          {teams.isLoading ? (
            <div className="h-24 animate-pulse rounded-2xl bg-foreground/[0.05]" />
          ) : !teams.data?.length ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-[15px] font-semibold">No teams yet</p>
              <p className="mx-auto mt-1 max-w-[360px] text-[13.5px] text-muted-foreground">When an organization invites you to its team, you'll see it here.</p>
            </div>
          ) : (
            teams.data.map((t) => (
              <div key={t.org_id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Link to="/app/profile/$id" params={{ id: t.username || t.org_id }} className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-foreground/[0.06]">
                    {t.avatar_url ? <img src={t.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center font-semibold text-muted-foreground">{(t.org_name || "O").charAt(0)}</span>}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{t.org_name}</p>
                    <p className="truncate text-[12.5px] text-muted-foreground">
                      {t.org_kind === "institutional" ? "Tech hub" : "Company"}{t.industry ? ` · ${t.industry}` : ""}{t.title ? ` · ${t.title}` : ""}
                    </p>
                  </div>
                  {t.status === "active" && (
                    <button type="button" onClick={() => { if (confirm(`Leave ${t.org_name}'s team?`)) leave.mutate(t.org_id); }} className="text-[12.5px] font-semibold text-muted-foreground hover:text-rose-600">Leave</button>
                  )}
                </div>

                {t.status === "invited" ? (
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={respond.isPending} onClick={() => respond.mutate({ org: t.org_id, accept: false })} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-border text-[13.5px] font-semibold"><X className="h-4 w-4" /> Decline</button>
                    <button type="button" disabled={respond.isPending} onClick={() => respond.mutate({ org: t.org_id, accept: true })} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#cc208f] text-[13.5px] font-semibold text-white">
                      {respond.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Join team
                    </button>
                  </div>
                ) : (t.training || []).length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Assigned training</p>
                    {t.training.map((b: any) => (
                      <Link key={b.bootcamp_id} to="/app/bootcamps/$id" params={{ id: b.bootcamp_id }} className="flex items-center gap-3 rounded-xl bg-foreground/[0.03] px-3 py-2.5 hover:bg-foreground/[0.05]">
                        <GraduationCap className="h-4 w-4 shrink-0 text-[#cc208f]" />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{b.title}</span>
                        {b.enrolled ? <span className="text-[11.5px] font-semibold text-emerald-600">Enrolled</span> : <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#cc208f]">Enroll <ArrowRight className="h-3.5 w-3.5" /></span>}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[12.5px] text-muted-foreground">No training assigned yet.</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
