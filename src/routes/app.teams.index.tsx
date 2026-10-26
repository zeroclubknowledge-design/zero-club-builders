import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, BadgeCheck, Building2, Check, ChevronLeft, GraduationCap, Loader2, Users, X } from "@/components/icons/glyphs";
import { useGoBack } from "@/hooks/useGoBack";
import { ROLE_LABEL, workspaceApi } from "@/features/workspace/api";

/* Teams: every organization workspace you belong to, and invitations to new ones. */
export const Route = createFileRoute("/app/teams/")({
  component: MyTeams,
  head: () => ({ meta: [{ title: "Teams — Zero Club" }] }),
});

function OrgLogo({ url, name, size = 52 }: { url?: string | null; name?: string; size?: number }) {
  return url ? (
    <img src={url} alt="" className="shrink-0 rounded-[14px] object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-[14px] bg-[#c3217e]/12 font-display font-semibold text-[#c3217e]" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {(name || "O").charAt(0)}
    </span>
  );
}

function MyTeams() {
  const goBack = useGoBack("/app");
  const queryClient = useQueryClient();
  const teams = useQuery({ queryKey: ["my-teams"], queryFn: workspaceApi.myTeams });
  const respond = useMutation({
    mutationFn: ({ org, accept }: { org: string; accept: boolean }) => workspaceApi.respond(org, accept).then(() => accept),
    onSuccess: (accept) => {
      toast.success(accept ? "Welcome to the team" : "Invitation declined");
      void queryClient.invalidateQueries({ queryKey: ["my-teams"] });
    },
    onError: (e: any) => toast.error(e?.message || "Something went wrong"),
  });

  const all = teams.data || [];
  const invites = all.filter((t) => t.status === "invited");
  const spaces = all.filter((t) => t.status === "active");

  return (
    <div className="mx-auto min-h-screen max-w-[860px] pb-24">
      <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-3 backdrop-blur">
        <button type="button" onClick={goBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full hover:bg-foreground/[0.05]"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="font-display text-[18px] font-semibold">Teams</h1>
      </div>

      <div className="px-4 pt-5 md:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 md:p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-25 blur-3xl" style={{ background: "#c3217e" }} />
          <p className="relative font-display text-[22px] font-semibold leading-tight tracking-tight md:text-[26px]">Your organizations</p>
          <p className="relative mt-1.5 max-w-[520px] text-[14px] leading-relaxed text-muted-foreground">
            Companies and tech hubs you work or learn with. Each has its own workspace — announcements, channels, meetings, programmes, communities and the people behind them.
          </p>
        </div>

        {teams.isLoading ? (
          <div className="mt-5 space-y-3">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-foreground/[0.05]" />)}</div>
        ) : (
          <>
            {invites.length > 0 && (
              <section className="mt-6">
                <p className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Invitations</p>
                <div className="mt-2 space-y-3">
                  {invites.map((t) => (
                    <div key={t.org_id} className="rounded-2xl border border-[#c3217e]/30 bg-[#c3217e]/[0.04] p-4">
                      <div className="flex items-center gap-3">
                        <OrgLogo url={t.avatar_url} name={t.org_name} size={48} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15.5px] font-semibold">{t.org_name}</p>
                          <p className="truncate text-[12.5px] text-muted-foreground">
                            {t.org_kind === "institutional" ? "Tech hub" : "Company"}{t.industry ? ` · ${t.industry}` : ""}{t.title ? ` · as ${t.title}` : ""}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-snug text-foreground/75">
                        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#c3217e]" />
                        Joining lets {t.org_name} see your Zero Club record — profile, experience, credentials, learning, shipped projects and activity. Your messages and wallet stay private.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" disabled={respond.isPending} onClick={() => respond.mutate({ org: t.org_id, accept: true })} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-foreground text-[14px] font-semibold text-background disabled:opacity-60">
                          {respond.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Join the team</>}
                        </button>
                        <button type="button" disabled={respond.isPending} onClick={() => respond.mutate({ org: t.org_id, accept: false })} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-border px-4 text-[14px] font-semibold disabled:opacity-60">
                          <X className="h-4 w-4" /> Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6">
              {spaces.length > 0 && <p className="px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Workspaces</p>}
              {spaces.length === 0 && invites.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#c3217e]/10 text-[#c3217e]"><Building2 className="h-6 w-6" /></span>
                  <p className="mt-4 font-display text-[17px] font-semibold">No teams yet</p>
                  <p className="mx-auto mt-1.5 max-w-[380px] text-[13.5px] leading-relaxed text-muted-foreground">
                    When a company or tech hub adds you to its team on Zero Club, its workspace opens up here.
                  </p>
                </div>
              ) : (
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  {spaces.map((t) => (
                    <Link key={t.org_id} to="/app/teams/$orgId" params={{ orgId: t.org_id }} className="group flex flex-col rounded-2xl border border-border bg-card p-4 transition hover:border-foreground/25">
                      <div className="flex items-center gap-3">
                        <OrgLogo url={t.avatar_url} name={t.org_name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[16px] font-semibold">{t.org_name}</p>
                          <p className="truncate text-[12.5px] text-muted-foreground">{t.org_kind === "institutional" ? "Tech hub" : "Company"}{t.industry ? ` · ${t.industry}` : ""}</p>
                        </div>
                        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
                        <span className={`inline-flex h-[22px] items-center rounded-full px-2 font-semibold ${t.role === "owner" ? "bg-foreground text-background" : "bg-[#c3217e]/12 text-[#c3217e]"}`}>
                          {t.role === "owner" ? "Your organization" : ROLE_LABEL(t.role, t.org_kind)}
                        </span>
                        {t.title && t.role !== "owner" && <span className="font-medium text-foreground/75">{t.title}</span>}
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="h-3.5 w-3.5" />{Number(t.members || 0) + 1}</span>
                        {(t.training || []).length > 0 && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground"><GraduationCap className="h-3.5 w-3.5" />{t.training.length} assigned</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
