import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Award,
  ChevronDown,
  ClipboardCheck,
  Crown,
  Flame,
  HelpCircle,
  Loader2,
  MessageCircle,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { hasShareSheet, openShareSheet } from "@/components/ShareSheet";
import { clubInviteLink } from "./clubInvites";

/**
 * Contributors: the members doing the most for a club's growth — bringing
 * people in, answering and asking questions, handing in assignments, taking
 * quizzes and showing up consistently. Scores come from club_contributors(),
 * which counts a community's cohorts too. The owner isn't ranked.
 */

type Person = {
  profile_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: string | null;
  place: number;
  points: number;
  invites: number;
  answers: number;
  questions: number;
  assignments: number;
  quizzes: number;
  quizzes_passed: number;
  messages: number;
  active_days: number;
};
type Board = {
  period_days: number;
  members: number;
  active: number;
  totals: { invites: number; answers: number; questions: number; assignments: number; quizzes: number };
  people: Person[];
  me: Person | null;
};

const PERIODS = [
  { days: 7, label: "This week" },
  { days: 30, label: "This month" },
  { days: 0, label: "All time" },
] as const;

const KINDS = [
  { key: "invites", label: "Invited", one: "invite", Icon: UserPlus, color: "#ff4fc3" },
  { key: "answers", label: "Answers", one: "answer", Icon: MessageCircle, color: "#34d399" },
  { key: "questions", label: "Questions", one: "question", Icon: HelpCircle, color: "#60a5fa" },
  { key: "assignments", label: "Assignments", one: "assignment", Icon: ClipboardCheck, color: "#fbbf24" },
  { key: "quizzes", label: "Quizzes", one: "quiz", Icon: Target, color: "#a78bfa" },
] as const;

const MEDAL = [
  { ring: "linear-gradient(135deg,#fde68a,#f59e0b,#fbbf24)", glow: "rgba(245,158,11,0.45)", ink: "#f59e0b", label: "1st" },
  { ring: "linear-gradient(135deg,#f1f5f9,#94a3b8,#e2e8f0)", glow: "rgba(148,163,184,0.4)", ink: "#94a3b8", label: "2nd" },
  { ring: "linear-gradient(135deg,#fed7aa,#c2410c,#fb923c)", glow: "rgba(194,65,12,0.4)", ink: "#ea7a3b", label: "3rd" },
];

const nameOf = (p: Person) => p.full_name?.trim() || p.username || "Member";

/** What a person stands out for, for the little label under their name. */
function strength(p: Person): string {
  const scored = [
    { v: p.invites * 25, t: p.invites === 1 ? "Brought in 1 member" : `Brought in ${p.invites} members` },
    { v: p.answers * 5, t: p.answers === 1 ? "Answered a question" : `Answered ${p.answers} questions` },
    { v: p.assignments * 8, t: p.assignments === 1 ? "Handed in an assignment" : `${p.assignments} assignments in` },
    { v: p.quizzes * 5, t: p.quizzes === 1 ? "Took a quiz" : `Took ${p.quizzes} quizzes` },
    { v: p.questions * 3, t: p.questions === 1 ? "Asked a question" : `Asked ${p.questions} questions` },
    { v: p.active_days * 2, t: `Active ${p.active_days} ${p.active_days === 1 ? "day" : "days"}` },
  ].filter((s) => s.v > 0);
  scored.sort((a, b) => b.v - a.v);
  return scored[0]?.t || "Getting started";
}

function Avatar({ p, size, ring }: { p: Person; size: number; ring?: string }) {
  const inner = (
    <span
      className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-foreground/[0.08] font-semibold text-foreground/80"
      style={{ fontSize: size * 0.38 }}
    >
      {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : nameOf(p).charAt(0).toUpperCase()}
    </span>
  );
  return (
    <span className="inline-block shrink-0 rounded-full p-[2.5px]" style={{ width: size, height: size, background: ring || "transparent" }}>
      <span className="block h-full w-full rounded-full bg-background p-[2px]">{inner}</span>
    </span>
  );
}

export function ContributorsView({
  clubId,
  clubName,
  meId,
  onBack,
}: {
  clubId: string;
  clubName: string;
  meId?: string | null;
  onBack: () => void;
}) {
  const [days, setDays] = useState<number>(30);
  const [howOpen, setHowOpen] = useState(false);
  const board = useQuery({
    queryKey: ["club-contributors", clubId, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("club_contributors" as never, { p_club: clubId, p_days: days } as never);
      if (error) throw error;
      return data as unknown as Board;
    },
    staleTime: 60_000,
  });
  const data = board.data;
  const people = data?.people || [];
  const top = people.slice(0, 3);
  const rest = people.slice(3);
  const best = people[0]?.points || 1;
  const me = data?.me || null;
  const meIndex = me ? people.findIndex((p) => p.profile_id === me.profile_id) : -1;
  const ahead = meIndex > 0 ? people[meIndex - 1] : null;

  const invite = async () => {
    const url = clubInviteLink(clubId, meId);
    try {
      if (hasShareSheet()) {
        await openShareSheet({ heading: `Invite to ${clubName}`, title: `Join ${clubName} on Zero Club`, text: `I'm learning in ${clubName}. Come join me.`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Your invite link is copied. You get credit when they join.");
    } catch {
      toast.error("Couldn't share the link");
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 flex min-h-[60px] items-center gap-2 border-b border-border bg-background/85 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:px-6">
        <button type="button" onClick={onBack} aria-label="Back" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-foreground/[0.05] md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 py-2">
          <h2 className="truncate font-display text-[17px] font-semibold leading-tight">Contributors</h2>
          <p className="truncate text-[12.5px] text-muted-foreground">The people growing {clubName}</p>
        </div>
        <button type="button" onClick={() => void invite()} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#cc208f] px-3.5 text-[13px] font-semibold text-white transition active:scale-95">
          <UserPlus className="h-4 w-4" /> Invite
        </button>
      </header>

      <div className="mx-auto max-w-[760px] px-4 pb-16 pt-5 md:px-8">
        {/* Period */}
        <div className="mx-auto flex w-fit gap-1 rounded-full bg-foreground/[0.05] p-1" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              role="tab"
              aria-selected={days === p.days}
              onClick={() => setDays(p.days)}
              className={`h-9 rounded-full px-4 text-[13px] font-semibold transition ${days === p.days ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {board.isLoading ? (
          <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : board.error ? (
          <p className="mt-10 rounded-2xl bg-foreground/[0.04] p-5 text-center text-[14px] text-muted-foreground">
            {(board.error as { message?: string })?.message?.includes("Join this club") ? "Join this club to see its contributors." : "Couldn't load contributors. Pull to refresh or try again shortly."}
          </p>
        ) : !people.length ? (
          <div className="mt-10 rounded-[28px] border border-dashed border-border px-6 py-14 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]"><Sparkles className="h-6 w-6" /></span>
            <p className="mt-4 font-display text-[18px] font-semibold">No contributions {days === 7 ? "this week" : days === 30 ? "this month" : "yet"}</p>
            <p className="mx-auto mt-1 max-w-[340px] text-[13.5px] leading-relaxed text-muted-foreground">
              Answer a question, hand in an assignment or invite a friend, and you'll be the first name here.
            </p>
            <button type="button" onClick={() => void invite()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background">
              <UserPlus className="h-4 w-4" /> Invite someone
            </button>
          </div>
        ) : (
          <>
            {/* Podium */}
            <section
              className="relative mt-6 overflow-hidden rounded-[30px] px-3 pb-6 pt-8 ring-1 ring-foreground/[0.06]"
              style={{ background: "radial-gradient(90% 70% at 50% 0%, rgba(204,32,143,0.16), transparent 70%), radial-gradient(60% 60% at 100% 100%, rgba(245,158,11,0.10), transparent 70%)" }}
            >
              <div className="grid grid-cols-3 items-end gap-2">
                {[1, 0, 2].map((i) => {
                  const p = top[i];
                  if (!p) return <div key={i} />;
                  const m = MEDAL[i];
                  const first = i === 0;
                  return (
                    <div key={p.profile_id} className="flex min-w-0 flex-col items-center text-center">
                      <div className="relative">
                        {first && <Crown className="absolute -top-6 left-1/2 h-6 w-6 -translate-x-1/2 text-amber-400 drop-shadow-[0_2px_6px_rgba(245,158,11,0.6)]" />}
                        <span className="block rounded-full" style={{ boxShadow: `0 14px 40px -10px ${m.glow}` }}>
                          <Avatar p={p} size={first ? 92 : 70} ring={m.ring} />
                        </span>
                        <span className="absolute -bottom-2 left-1/2 grid h-7 min-w-7 -translate-x-1/2 place-items-center rounded-full px-1.5 text-[12px] font-extrabold text-white ring-[3px] ring-background" style={{ background: m.ring }}>
                          {p.place}
                        </span>
                      </div>
                      <p className={`mt-4 w-full truncate font-semibold ${first ? "text-[15px]" : "text-[13.5px]"}`}>
                        {p.profile_id === meId ? "You" : nameOf(p).split(" ")[0]}
                      </p>
                      <p className="mt-0.5 font-display text-[18px] font-bold tabular-nums" style={{ color: m.ink }}>
                        {p.points.toLocaleString()}
                        <span className="ml-0.5 text-[11px] font-semibold text-muted-foreground">pts</span>
                      </p>
                      <p className="mt-0.5 line-clamp-2 min-h-[30px] text-[11px] leading-tight text-muted-foreground">{strength(p)}</p>
                      <div
                        className="mt-3 w-full rounded-t-2xl"
                        style={{ height: first ? 54 : i === 1 ? 38 : 26, background: `linear-gradient(180deg, ${m.glow}, transparent)` }}
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Club totals */}
            <section className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-5 md:px-0">
              {KINDS.map(({ key, label, Icon, color }) => (
                <div key={key} className="min-w-[112px] shrink-0 rounded-2xl bg-card p-3 ring-1 ring-foreground/[0.06]">
                  <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `${color}1f`, color }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="mt-2 font-display text-[20px] font-bold tabular-nums leading-none">{(data?.totals?.[key] || 0).toLocaleString()}</p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </section>

            {/* Your standing */}
            {me && (
              <section className="mt-5 overflow-hidden rounded-[24px] p-[1px]" style={{ background: "linear-gradient(135deg, rgba(204,32,143,0.6), rgba(245,158,11,0.4), rgba(204,32,143,0.15))" }}>
                <div className="flex items-center gap-3 rounded-[23px] bg-card p-4">
                  <Avatar p={me} size={48} ring="linear-gradient(135deg,#ff4fc3,#cc208f)" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#cc208f]">Your standing</p>
                    <p className="font-display text-[18px] font-bold">
                      {me.points > 0 ? <>#{me.place} <span className="text-muted-foreground">·</span> {me.points.toLocaleString()} pts</> : "Not ranked yet"}
                    </p>
                    <p className="truncate text-[12.5px] text-muted-foreground">
                      {me.points === 0
                        ? "Your first answer, assignment or invite puts you on the board."
                        : ahead
                          ? `${(ahead.points - me.points + 1).toLocaleString()} pts to pass ${nameOf(ahead).split(" ")[0]}`
                          : me.place === 1
                            ? "You're leading. Keep it up."
                            : strength(me)}
                    </p>
                  </div>
                  <button type="button" onClick={() => void invite()} aria-label="Share your invite link" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground/[0.06] transition hover:bg-foreground/[0.1]">
                    <Share2 className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )}

            {/* Everyone else */}
            {rest.length > 0 && (
              <section className="mt-6">
                <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" /> Rising contributors
                </h3>
                <ol className="space-y-2">
                  {rest.map((p) => {
                    const mine = p.profile_id === meId;
                    return (
                      <li key={p.profile_id} className={`flex items-center gap-3 rounded-2xl p-3 ring-1 transition ${mine ? "bg-[#cc208f]/[0.07] ring-[#cc208f]/30" : "bg-card ring-foreground/[0.06]"}`}>
                        <span className="w-7 shrink-0 text-center font-display text-[15px] font-bold tabular-nums text-muted-foreground">{p.place}</span>
                        <Avatar p={p} size={42} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14.5px] font-semibold">{mine ? "You" : nameOf(p)}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            {KINDS.filter((k) => p[k.key] > 0).map(({ key, Icon, color }) => (
                              <span key={key} className="inline-flex items-center gap-1 text-[11.5px] font-medium tabular-nums text-muted-foreground">
                                <Icon className="h-3 w-3" style={{ color }} /> {p[key]}
                              </span>
                            ))}
                            {p.active_days > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium tabular-nums text-muted-foreground">
                                <Flame className="h-3 w-3 text-orange-400" /> {p.active_days}d
                              </span>
                            )}
                          </div>
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                            <div className="h-full rounded-full bg-[linear-gradient(90deg,#cc208f,#ff7ac8)]" style={{ width: `${Math.max(4, (p.points / best) * 100)}%` }} />
                          </div>
                        </div>
                        <span className="shrink-0 text-right">
                          <span className="block font-display text-[16px] font-bold tabular-nums">{p.points.toLocaleString()}</span>
                          <span className="block text-[10.5px] text-muted-foreground">pts</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            <p className="mt-5 text-center text-[12px] text-muted-foreground">
              {data?.active || 0} of {data?.members || 0} members contributed {days === 7 ? "this week" : days === 30 ? "this month" : "so far"}
            </p>
          </>
        )}

        {/* How points work */}
        <section className="mt-6 rounded-2xl bg-foreground/[0.03] ring-1 ring-foreground/[0.06]">
          <button type="button" onClick={() => setHowOpen((v) => !v)} aria-expanded={howOpen} className="flex w-full items-center gap-2 px-4 py-3.5 text-left">
            <Award className="h-4 w-4 text-[#cc208f]" />
            <span className="flex-1 text-[14px] font-semibold">How contributions are counted</span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${howOpen ? "rotate-180" : ""}`} />
          </button>
          {howOpen && (
            <ul className="space-y-2 px-4 pb-4 text-[13px]">
              <Rule icon={<UserPlus className="h-3.5 w-3.5 text-[#ff4fc3]" />} text="Invite someone who joins (share your link)" pts="25" />
              <Rule icon={<ClipboardCheck className="h-3.5 w-3.5 text-amber-400" />} text="Hand in an assignment (more for a good grade)" pts="8–12" />
              <Rule icon={<Target className="h-3.5 w-3.5 text-violet-400" />} text="Take a quiz (more when you pass)" pts="5–8" />
              <Rule icon={<MessageCircle className="h-3.5 w-3.5 text-emerald-400" />} text="Answer someone's question" pts="5" />
              <Rule icon={<HelpCircle className="h-3.5 w-3.5 text-sky-400" />} text="Ask a question in Q&A" pts="3" />
              <Rule icon={<Flame className="h-3.5 w-3.5 text-orange-400" />} text="Each day you're active (consistency)" pts="2" />
              <Rule icon={<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />} text="Taking part in General chat (up to 30)" pts="1" />
              <li className="pt-1 text-[12px] text-muted-foreground">Activity in this club's bootcamps counts too. The club owner isn't ranked.</li>
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Rule({ icon, text, pts }: { icon: ReactNode; text: string; pts: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-background ring-1 ring-foreground/[0.06]">{icon}</span>
      <span className="flex-1 text-foreground/85">{text}</span>
      <span className="shrink-0 rounded-full bg-[#cc208f]/10 px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-[#cc208f]">+{pts}</span>
    </li>
  );
}
