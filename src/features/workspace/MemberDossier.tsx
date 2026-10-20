/**
 * The organization's full view of someone on its team: who they are, what
 * they've built and learned on Zero Club, how active they are, and the
 * controls to manage their place on the team.
 *
 * Only the organization and its admins can open it (checked server-side in
 * get_team_member_dossier). Everything shown is the person's real Zero Club
 * record; experience and certificates are self-reported and labelled so.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  Calendar,
  ExternalLink,
  Flame,
  GraduationCap,
  Loader2,
  MapPin,
  MessageCircle,
  Rocket,
  Trophy,
  Users,
} from "@/components/icons/glyphs";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { SocialLinksRow } from "@/features/profile/ProfileCredentials";
import { experienceSpan, monthYear } from "@/features/profile/credentials";
import { describePost, postImages } from "@/features/portfolio/parse";
import { getLevelFromXp } from "@/lib/utils";
import { ROLE_LABEL, staffLabel, workspaceApi, type WorkspaceRole } from "./api";

import { confirmCard } from "@/components/ConfirmCard";
const PINK = "#cc208f";

export function MemberDossier({
  orgId,
  memberId,
  canEdit,
  kind,
  onClose,
}: {
  orgId: string;
  memberId: string | null;
  /** Only the organization account changes roles and removes people. */
  canEdit: boolean;
  kind: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const d = useQuery({
    queryKey: ["team-dossier", orgId, memberId],
    queryFn: () => workspaceApi.dossier(orgId, memberId!),
    enabled: Boolean(memberId),
  });
  const [title, setTitle] = useState("");
  useEffect(() => setTitle(d.data?.membership?.title || ""), [d.data?.membership?.title]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["team-dossier", orgId, memberId] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-people", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["workspace", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["business-team"] });
  };
  const setRole = useMutation({
    mutationFn: ({ role, t }: { role: "admin" | "staff" | "member"; t?: string }) => workspaceApi.setRole(memberId!, role, t ?? null),
    onSuccess: () => {
      toast.success("Saved");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });
  const remove = useMutation({
    mutationFn: () => workspaceApi.removeMember(orgId, memberId!),
    onSuccess: () => {
      toast.success("Removed from the team");
      refresh();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Could not remove"),
  });

  const p = d.data?.profile;
  const m = d.data?.membership;
  const s = d.data?.stats || {};
  const name = p?.full_name || p?.username || "Team member";
  const level = getLevelFromXp(Number(p?.xp || 0));
  const role = (m?.role || "member") as Exclude<WorkspaceRole, "owner">;
  const skills: string[] = (d.data?.portfolio?.skills?.length ? d.data.portfolio.skills : p?.interests) || [];
  const active = p?.last_seen_at ? (Date.now() - new Date(p.last_seen_at).getTime()) / 60_000 : null;
  const activity =
    active === null ? "No recent activity" : active < 5 ? "Active now" : active < 60 * 24 ? "Active today" : `Last active ${monthYear(p.last_seen_at)}`;

  return (
    <Drawer open={Boolean(memberId)} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent desktopVariant="panel" overlayClassName="z-[10090]" className="z-[10100] mx-auto max-h-[94dvh] border-none bg-background md:max-h-none" hideHandle>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {d.isLoading || !p ? (
            <div className="grid h-64 place-items-center">
              {d.error ? <p className="px-6 text-center text-[13.5px] text-muted-foreground">{(d.error as any)?.message || "Couldn't load this profile"}</p> : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
          ) : (
            <>
              {/* Identity */}
              <div className="relative">
                <div className="h-28 w-full overflow-hidden" style={{ background: p.banner_url ? undefined : `linear-gradient(135deg, #2a0b20, ${PINK} 150%)` }}>
                  {p.banner_url && <img src={p.banner_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="px-5">
                  <div className="-mt-10 flex items-end justify-between gap-3">
                    <span className="relative rounded-full ring-4 ring-background">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-20 w-20 place-items-center rounded-full bg-[#cc208f]/15 font-display text-[28px] font-semibold text-[#cc208f]">{name.charAt(0)}</span>
                      )}
                      {active !== null && active < 5 && <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-emerald-500 ring-[3px] ring-background" />}
                    </span>
                    <div className="flex gap-2 pb-1">
                      <Link to="/app/chat/$id" params={{ id: p.id }} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background">
                        <MessageCircle className="h-4 w-4" /> Message
                      </Link>
                      <Link to="/app/profile/$id" params={{ id: p.username || p.id }} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-semibold">
                        Profile <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                  <h2 className="mt-3 font-display text-[23px] font-semibold leading-tight tracking-tight">{name}</h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                    <span>@{p.username}</span>
                    <span className="inline-flex h-[22px] items-center rounded-full bg-[#cc208f]/12 px-2 text-[11px] font-semibold text-[#cc208f]">{ROLE_LABEL(role, kind)}</span>
                    {m?.status === "invited" && <span className="inline-flex h-[22px] items-center rounded-full bg-amber-500/12 px-2 text-[11px] font-semibold text-amber-600">Invite pending</span>}
                    {m?.title && <span className="font-medium text-foreground/80">{m.title}</span>}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                    {p.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.location}</span>}
                    <span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5" />{activity}</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />On Zero Club since {monthYear(p.created_at)}</span>
                  </p>
                  {p.bio && <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-foreground/85">{p.bio}</p>}
                  <SocialLinksRow links={p.social_links} className="mt-3" />
                </div>
              </div>

              {/* Numbers */}
              <div className="mx-5 mt-5 grid grid-cols-4 overflow-hidden rounded-2xl border border-border bg-card">
                {[
                  { label: "Level", value: level },
                  { label: "XP", value: Number(p.xp || 0) },
                  { label: "Projects", value: s.projects || 0 },
                  { label: "Verified", value: s.verified || 0 },
                  { label: "Bootcamps", value: s.bootcamps || 0 },
                  { label: "Posts · 30d", value: s.posts_30d || 0 },
                  { label: "Followers", value: s.followers || 0 },
                  { label: "Clubs", value: s.clubs || 0 },
                ].map((x, i) => (
                  <div key={x.label} className={`px-2 py-3 text-center ${i % 4 ? "border-l border-border" : ""} ${i > 3 ? "border-t border-border" : ""}`}>
                    <p className="font-display text-[19px] font-semibold tabular-nums leading-none">{Number(x.value).toLocaleString()}</p>
                    <p className="mt-1 text-[10.5px] font-medium text-muted-foreground">{x.label}</p>
                  </div>
                ))}
              </div>

              {/* Team controls */}
              <Block title="On your team" icon={<Users className="h-4 w-4" />}>
                <p className="text-[12.5px] text-muted-foreground">
                  {m?.status === "invited" ? `Invited ${monthYear(m.invited_at)} — waiting for them to accept.` : `Joined ${monthYear(m?.joined_at)}.`}
                </p>
                {canEdit ? (
                  <>
                    <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-foreground/[0.06] p-1">
                      {(["member", "staff", "admin"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          disabled={setRole.isPending}
                          onClick={() => r !== role && setRole.mutate({ role: r })}
                          className={`h-9 rounded-full text-[12.5px] font-semibold transition ${role === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                        >
                          {r === "member" ? "Member" : r === "staff" ? staffLabel(kind) : "Admin"}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
                      {role === "admin"
                        ? "Admins manage channels and meetings, post announcements and can see team records like this one."
                        : role === "staff"
                          ? `${staffLabel(kind)} post announcements and host meetings, and appear under ${staffLabel(kind)}.`
                          : "Members chat, join meetings and take programmes."}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Job title, e.g. Lead tutor" className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-[14px] outline-none" />
                      <button type="button" disabled={setRole.isPending || title === (m?.title || "")} onClick={() => setRole.mutate({ role, t: title })} className="h-10 rounded-xl bg-foreground px-4 text-[13px] font-semibold text-background disabled:opacity-40">Save</button>
                    </div>
                  </>
                ) : null}
                {(d.data.training || []).length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Assigned training</p>
                    {d.data.training.map((t: any) => (
                      <Link key={t.bootcamp_id} to="/app/bootcamps/$id" params={{ id: t.bootcamp_id }} className="flex items-center gap-2.5 rounded-xl bg-foreground/[0.03] px-3 py-2">
                        <GraduationCap className="h-4 w-4 shrink-0 text-[#cc208f]" />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{t.title}</span>
                        <span className={`shrink-0 text-[11.5px] font-semibold ${t.enrolled_at ? "text-emerald-600" : "text-amber-600"}`}>{t.enrolled_at ? `Enrolled ${monthYear(t.enrolled_at)}` : "Not started"}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </Block>

              {/* Work */}
              {(d.data.projects || []).length > 0 && (
                <Block title="Shipped on Zero Club" icon={<Rocket className="h-4 w-4" />} note={`${s.projects} projects`}>
                  <div className="grid grid-cols-2 gap-2.5">
                    {d.data.projects.map((post: any) => {
                      const { title: t } = describePost({ ...post, is_build_post: true });
                      const img = postImages(post)[0];
                      return (
                        <Link key={post.id} to="/app/post/$id" params={{ id: post.id }} className="group overflow-hidden rounded-xl border border-border bg-card">
                          <div className="aspect-[16/10] overflow-hidden bg-foreground/[0.04]">
                            {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <span className="grid h-full place-items-center px-2 text-center text-[12px] font-semibold text-[#cc208f]">{t}</span>}
                          </div>
                          <p className="flex items-center gap-1 px-2.5 py-2 text-[12.5px] font-semibold">
                            <span className="truncate">{t}</span>
                            {post.is_verified_build && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#cc208f]" />}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                  {d.data.portfolio?.status === "published" && p.username && (
                    <a href={`/@${p.username}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#cc208f]">
                      Open their portfolio <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </Block>
              )}

              {skills.length > 0 && (
                <Block title={d.data.portfolio?.skills?.length ? "Skills" : "Interests"} icon={<Trophy className="h-4 w-4" />}>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((k) => <span key={k} className="rounded-full bg-foreground/[0.05] px-3 py-1.5 text-[12.5px] font-medium">{k}</span>)}
                  </div>
                </Block>
              )}

              {(d.data.experiences || []).length > 0 && (
                <Block title="Experience" icon={<BriefcaseBusiness className="h-4 w-4" />} note="Self-reported">
                  <ol>
                    {d.data.experiences.map((e: any, i: number) => (
                      <li key={e.id} className={`relative border-l border-border pl-5 ${i === d.data.experiences.length - 1 ? "" : "pb-5"}`}>
                        <span className={`absolute -left-[5px] top-1.5 h-[9px] w-[9px] rounded-full ${e.is_current ? "bg-[#cc208f]" : "bg-foreground/25"}`} />
                        <p className="text-[14.5px] font-semibold">{e.title}</p>
                        <p className="text-[13px] text-muted-foreground">{e.company}{e.employment_type ? ` · ${e.employment_type}` : ""}{e.location ? ` · ${e.location}` : ""}</p>
                        <p className="text-[12px] text-muted-foreground">{experienceSpan(e)}</p>
                        {e.description && <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-foreground/80">{e.description}</p>}
                      </li>
                    ))}
                  </ol>
                </Block>
              )}

              {(d.data.learning || []).length > 0 && (
                <Block title="Learning on Zero Club" icon={<GraduationCap className="h-4 w-4" />} note="Verified">
                  <div className="space-y-2">
                    {d.data.learning.map((l: any) => (
                      <Link key={l.bootcamp_id} to="/app/bootcamps/$id" params={{ id: l.bootcamp_id }} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
                        <span className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-foreground/[0.05]">{l.banner_url && <img src={l.banner_url} alt="" className="h-full w-full object-cover" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold">{l.title}</span>
                          <span className="block truncate text-[12px] text-muted-foreground">{[l.category, `Enrolled ${monthYear(l.enrolled_at)}`].filter(Boolean).join(" · ")}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </Block>
              )}

              {(d.data.certificates || []).length > 0 && (
                <Block title="Certificates" icon={<Award className="h-4 w-4" />} note="Self-reported">
                  <div className="space-y-2">
                    {d.data.certificates.map((c: any) => (
                      <div key={c.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
                        <Award className="mt-0.5 h-4 w-4 shrink-0 text-[#cc208f]" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-semibold">{c.name}</p>
                          <p className="text-[12px] text-muted-foreground">{c.issuer}{c.issued_on ? ` · ${monthYear(c.issued_on)}` : ""}</p>
                        </div>
                        {c.credential_url && (
                          <a href={c.credential_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[12px] font-semibold text-[#cc208f]">Verify</a>
                        )}
                      </div>
                    ))}
                  </div>
                </Block>
              )}

              {canEdit && (
                <div className="px-5 pt-6">
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={async () => (await confirmCard(`Remove ${name} from the team? They lose access to the workspace.`)) && remove.mutate()}
                    className="h-11 w-full rounded-full border border-rose-500/30 text-[14px] font-semibold text-rose-600 transition hover:bg-rose-500/[0.06]"
                  >
                    {m?.status === "invited" ? "Withdraw invitation" : "Remove from team"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Block({ title, icon, note, children }: { title: string; icon: ReactNode; note?: string; children: ReactNode }) {
  return (
    <section className="mx-5 mt-5 rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#cc208f]/10 text-[#cc208f]">{icon}</span>
        <h3 className="flex-1 font-display text-[15px] font-semibold">{title}</h3>
        {note && <span className="text-[11.5px] font-medium text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}
