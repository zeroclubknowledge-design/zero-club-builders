import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Clock,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  Lock,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
} from "@/components/icons/glyphs";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ImageLightbox } from "@/components/ImageLightbox";
import { openShareSheet } from "@/components/ShareSheet";
import { useUser } from "@/hooks/useUser";
import { useGoBack } from "@/hooks/useGoBack";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/storage";
import { parseShip, postImages } from "@/features/portfolio/parse";
import {
  addEntryToPortfolio,
  adminResolveChallenge,
  closeChallenge,
  disputeChallenge,
  disqualifyEntry,
  fetchChallenge,
  finalizeChallenge,
  markAdopted,
  scoreEntry,
  submitEntry,
  updateChallenge,
  withdrawEntry,
  type ChallengeDetail,
  type Entry,
} from "@/features/challenges/api";
import {
  HoldToConfirm,
  PrizeHero,
  StatusPill,
  formatPrize,
  placeLabel,
  rightsInfo,
  taskLabel,
  useCountdown,
} from "@/features/challenges/ui";

export const Route = createFileRoute("/app/challenge/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    created: typeof s.created === "string" ? s.created : undefined,
  }),
  component: ChallengePage,
});

type Sheet = null | "enter" | "finalize" | "close" | "dispute" | "extend" | "adopt" | "resolve";

function ChallengePage() {
  const { id } = Route.useParams();
  const { created } = Route.useSearch();
  const goBack = useGoBack("/app/zerohub");
  const queryClient = useQueryClient();
  const { data: me } = useUser() as { data: any };
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showTerms, setShowTerms] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["challenge", id],
    queryFn: () => fetchChallenge(id),
    refetchInterval: 60_000,
  });
  const refresh = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
    void queryClient.invalidateQueries({ queryKey: ["challenge_badges"] });
  };

  if (isLoading) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data || !data.found) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-[19px] font-semibold">Challenge not found</p>
        <Link to="/app/zerohub" className="mt-4 text-[14px] font-semibold text-[#cc208f]">
          Back to Zero Proofs
        </Link>
      </div>
    );
  }
  return (
    <ChallengeView
      d={data}
      me={me}
      created={created === "1"}
      sheet={sheet}
      setSheet={setSheet}
      showTerms={showTerms}
      setShowTerms={setShowTerms}
      goBack={goBack}
      refresh={refresh}
    />
  );
}

function ChallengeView({
  d,
  me,
  created,
  sheet,
  setSheet,
  showTerms,
  setShowTerms,
  goBack,
  refresh,
}: {
  d: ChallengeDetail;
  me: any;
  created: boolean;
  sheet: Sheet;
  setSheet: (s: Sheet) => void;
  showTerms: boolean;
  setShowTerms: (v: boolean) => void;
  goBack: () => void;
  refresh: () => void;
}) {
  const c = d.challenge;
  const ship = useMemo(() => (d.project ? parseShip(d.project.content) : null), [d.project]);
  const cover = d.project ? postImages(d.project)[0] : undefined;
  const deadline = useCountdown(c.status === "open" ? c.deadline : null);
  const judging = useCountdown(c.status === "judging" ? c.judging_until : null);
  const objection = useCountdown(c.status === "result_posted" ? c.objection_until : null);
  const signedIn = Boolean(me?.id);
  const owner = d.is_owner;
  const judge = owner || (d.is_admin && c.status === "admin_review");
  const results = c.status === "result_posted" || c.status === "completed";
  const mine = d.my_entry;
  const canEnter = c.status === "open" && !owner && signedIn && deadline.ms > 0;
  const winners = d.entries
    .filter((e) => e.status === "winner")
    .sort((a, b) => (a.place || 9) - (b.place || 9));
  const rights = rightsInfo(c.rights_preset);
  const url = `https://www.zeroclubs.xyz/app/challenge/${c.id}`;

  const share = () =>
    void openShareSheet({
      url,
      title: c.title,
      text: `${c.title} — ${formatPrize(c.prize_total, c.prize_type)} to win on Zero Club`,
      heading: "Share this challenge",
    });

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="grid h-11 w-10 place-items-center rounded-full hover:bg-foreground/[0.04]"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[17px] font-semibold">Challenge</h1>
          <button
            type="button"
            onClick={share}
            aria-label="Share"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-foreground/[0.04]"
          >
            <Share2 className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[680px] flex-1 space-y-3 px-3 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-3">
        {created && owner && c.status === "open" && (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-3.5">
            <Sparkles className="h-5 w-5 shrink-0 text-emerald-500" />
            <p className="flex-1 text-[13.5px] leading-snug">
              <b>Your challenge is live.</b> {formatPrize(c.prize_total, c.prize_type)} is held
              safely. Share it to get entries.
            </p>
            <button
              type="button"
              onClick={share}
              className="h-9 shrink-0 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background"
            >
              Share
            </button>
          </div>
        )}

        {/* Hero */}
        <section className="overflow-hidden rounded-3xl border border-border bg-card">
          <Link
            to="/app/post/$id"
            params={{ id: c.project_id }}
            className="flex items-center gap-3 border-b border-border/70 px-4 py-3 transition hover:bg-foreground/[0.02]"
          >
            {cover ? (
              <img src={cover} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-foreground/[0.06]">
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Challenge on
              </span>
              <span className="block truncate text-[14.5px] font-semibold">
                {ship?.name || "Project"}
              </span>
              <span className="block truncate text-[12px] text-muted-foreground">
                by {d.owner.full_name || d.owner.username} · v{d.project?.version_label || "1.0.0"}
              </span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={c.status} payout={c.payout_status} />
              <span className="rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[12px] font-medium text-muted-foreground">
                {taskLabel(c.task_type)}
              </span>
            </div>
            <h2 className="font-display text-[24px] font-bold leading-[1.15] tracking-tight">
              {c.title}
            </h2>
            <PrizeHero total={c.prize_total} type={c.prize_type} places={c.prizes.length}>
              {c.prizes.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.prizes.map((p) => (
                    <span
                      key={p.place}
                      className="rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[12px] font-semibold"
                    >
                      {placeLabel(p.place)} · {formatPrize(p.amount, c.prize_type)}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Held by Zero Club
                {c.payout_status === "paid" && " · paid to the winner"}
                {c.payout_status === "refunded" && " · returned to the owner"}
                {c.payout_status === "split_refunded" && " · 20% shared with entrants"}
              </p>
            </PrizeHero>
            <div className="grid grid-cols-2 gap-2">
              <Stat
                icon={<Users className="h-4 w-4" />}
                label="Entries"
                value={String(d.entry_count)}
              />
              <Stat
                icon={<Clock className="h-4 w-4" />}
                label={
                  c.status === "open"
                    ? "Closes in"
                    : c.status === "judging"
                      ? "Winner due in"
                      : c.status === "result_posted"
                        ? "Prize paid in"
                        : "Status"
                }
                value={
                  c.status === "open"
                    ? deadline.label
                    : c.status === "judging"
                      ? judging.label
                      : c.status === "result_posted"
                        ? c.payout_status === "frozen"
                          ? "On hold"
                          : objection.label
                        : c.status === "completed"
                          ? "Done"
                          : "Closed"
                }
              />
            </div>
          </div>
        </section>

        {/* Results */}
        {results && winners.length > 0 && (
          <section className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="relative px-4 pb-2 pt-4">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#cc208f]/15 to-transparent"
              />
              <p className="relative flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#cc208f]">
                <Trophy className="h-4 w-4" /> {winners.length > 1 ? "Winners" : "Winner"}
              </p>
            </div>
            <div className="space-y-2 px-3 pb-3">
              {winners.map((w) => (
                <Link
                  key={w.id}
                  to="/app/profile/$id"
                  params={{ id: w.entrant.username || w.entrant.id }}
                  className="flex items-center gap-3 rounded-2xl bg-foreground/[0.03] p-3"
                >
                  <Avatar p={w.entrant} size={48} ring />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {w.entrant.full_name || w.entrant.username}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">
                      {placeLabel(w.place || 1)} place
                    </span>
                  </span>
                  <span className="font-display text-[15px] font-bold tabular-nums">
                    {formatPrize(
                      c.prizes.find((p) => p.place === w.place)?.amount || 0,
                      c.prize_type,
                    )}
                  </span>
                </Link>
              ))}
              {c.result_note && (
                <p className="rounded-2xl bg-foreground/[0.03] p-3 text-[13.5px] leading-relaxed text-foreground/85">
                  <span className="font-semibold">{d.owner.full_name || d.owner.username}:</span>{" "}
                  {c.result_note}
                </p>
              )}
              {c.status === "result_posted" && (
                <p className="px-1 text-[12.5px] text-muted-foreground">
                  {c.payout_status === "frozen"
                    ? "An entrant objected. Payment is on hold while Zero Club reviews the result."
                    : `Prize is paid automatically in ${objection.label} unless an entrant objects.`}
                </p>
              )}
            </div>
          </section>
        )}
        {c.status === "cancelled" && (
          <Panel title="Closed without a winner">
            <p className="text-[13.5px] text-muted-foreground">{c.cancel_reason}</p>
          </Panel>
        )}

        {/* My entry */}
        {mine && mine.status !== "withdrawn" && (
          <MyEntry d={d} refresh={refresh} onObject={() => setSheet("dispute")} />
        )}

        {/* Brief & rules */}
        <Panel title="The brief">
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground/90">
            {c.brief}
          </p>
          {c.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.skills.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[12.5px]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="How it's judged">
          <ul className="space-y-2">
            {c.criteria.map((cr) => (
              <li key={cr.name} className="flex items-center gap-3">
                <span className="flex-1 text-[14px]">{cr.name}</span>
                <span className="flex gap-0.5" aria-label={`Weight ${cr.weight}`}>
                  {[1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-4 rounded-full ${i <= cr.weight ? "bg-[#cc208f]" : "bg-foreground/[0.08]"}`}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            The owner decides against these and must explain the result publicly.
          </p>
        </Panel>
        <Panel title="Entries must include">
          <ul className="space-y-1.5 text-[14px]">
            <Req ok>A written explanation of what you made</Req>
            {c.requirements.images && <Req ok>Images or screenshots</Req>}
            {c.requirements.live_url && <Req ok>A live link</Req>}
            {c.requirements.repo_url && <Req ok>A code repository link</Req>}
          </ul>
        </Panel>
        <Panel title={`The winning work · ${rights.title}`}>
          <p className="text-[14px] leading-relaxed text-foreground/85">{rights.body}</p>
          <button
            type="button"
            onClick={() => setShowTerms(!showTerms)}
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#cc208f]"
          >
            {showTerms ? "Hide full terms" : "Read the full terms"}{" "}
            <ChevronDown className={`h-3.5 w-3.5 transition ${showTerms ? "rotate-180" : ""}`} />
          </button>
          {showTerms && (
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-foreground/[0.03] p-3 text-[12.5px] leading-relaxed text-muted-foreground">
              {c.terms_text}
            </p>
          )}
        </Panel>
        <Timeline c={c} />

        {/* Entries: sealed until results, except to the owner. */}
        {(judge || results) && d.entries.length > 0 ? (
          <section className="space-y-2">
            <h3 className="px-1 pt-2 font-display text-[17px] font-semibold">
              {results ? "All entries" : `Entries · ${d.entries.length}`}
            </h3>
            {d.entries.map((e) => (
              <EntryCard key={e.id} c={c} e={e} judge={judge && !results} refresh={refresh} />
            ))}
          </section>
        ) : (
          c.status === "open" && (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3.5 text-[13px] text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" />
              {owner
                ? "No entries yet. Share the challenge to get people building."
                : "Entries stay private until the winner is announced, so nobody can copy them."}
            </div>
          )
        )}

        {/* Owner adoption */}
        {owner &&
          results &&
          winners.length > 0 &&
          c.rights_preset !== "showcase" &&
          !c.adopted_version_id && (
            <Panel title="Use the winning work">
              <p className="text-[13.5px] text-muted-foreground">
                Publish the improvement as a new version of your project. Your original stays as it
                is, and the winner is credited.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/app/ship"
                  search={{ versionOf: c.project_id } as any}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13.5px] font-semibold text-background"
                >
                  <GitBranch className="h-4 w-4" /> Publish new version
                </Link>
                <button
                  type="button"
                  onClick={() => setSheet("adopt")}
                  className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[13.5px] font-semibold"
                >
                  I've published it
                </button>
              </div>
            </Panel>
          )}
        {c.adopted_version_id && (
          <Link
            to="/app/post/$id"
            params={{ id: c.adopted_version_id }}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <GitBranch className="h-5 w-5 text-[#cc208f]" />
            <span className="flex-1 text-[14px] font-semibold">
              The winning work was adopted into a new version
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}
      </main>

      {/* Bottom action bar */}
      <ActionBar
        d={d}
        canEnter={canEnter}
        signedIn={signedIn}
        onEnter={() => setSheet("enter")}
        onFinalize={() => setSheet("finalize")}
        onClose={() => setSheet("close")}
        onExtend={() => setSheet("extend")}
        onResolve={() => setSheet("resolve")}
      />

      <EnterSheet
        open={sheet === "enter"}
        onClose={() => setSheet(null)}
        d={d}
        me={me}
        refresh={refresh}
      />
      <FinalizeSheet
        open={sheet === "finalize"}
        onClose={() => setSheet(null)}
        d={d}
        refresh={refresh}
      />
      <CloseSheet open={sheet === "close"} onClose={() => setSheet(null)} d={d} refresh={refresh} />
      <DisputeSheet
        open={sheet === "dispute"}
        onClose={() => setSheet(null)}
        d={d}
        refresh={refresh}
      />
      <ExtendSheet
        open={sheet === "extend"}
        onClose={() => setSheet(null)}
        d={d}
        refresh={refresh}
      />
      <AdoptSheet open={sheet === "adopt"} onClose={() => setSheet(null)} d={d} refresh={refresh} />
      <ResolveSheet
        open={sheet === "resolve"}
        onClose={() => setSheet(null)}
        d={d}
        refresh={refresh}
      />
    </div>
  );
}

/* ── Action bar ───────────────────────────────────────── */

function ActionBar({
  d,
  canEnter,
  signedIn,
  onEnter,
  onFinalize,
  onClose,
  onExtend,
  onResolve,
}: {
  d: ChallengeDetail;
  canEnter: boolean;
  signedIn: boolean;
  onEnter: () => void;
  onFinalize: () => void;
  onClose: () => void;
  onExtend: () => void;
  onResolve: () => void;
}) {
  const c = d.challenge;
  const judge = d.is_owner || (d.is_admin && c.status === "admin_review");
  let content: ReactNode = null;
  if (d.is_admin && c.status === "result_posted" && c.payout_status === "frozen") {
    content = <Primary onClick={onResolve}>Review objection</Primary>;
  } else if (judge && (c.status === "judging" || c.status === "admin_review")) {
    content = (
      <div className="flex gap-2">
        <Secondary onClick={onClose}>No winner</Secondary>
        <Primary onClick={onFinalize} disabled={!d.entries.some((e) => e.status === "submitted")}>
          Pick the winner
        </Primary>
      </div>
    );
  } else if (d.is_owner && c.status === "open") {
    content = (
      <div className="flex gap-2">
        <Secondary onClick={onClose}>Close</Secondary>
        <Primary onClick={onExtend}>Extend or edit</Primary>
      </div>
    );
  } else if (canEnter) {
    const editing = d.my_entry && d.my_entry.status === "submitted";
    content = (
      <Primary onClick={onEnter}>{editing ? "Edit your entry" : "Enter challenge"}</Primary>
    );
  } else if (!signedIn && c.status === "open") {
    content = (
      <Link
        to="/signin"
        className="flex h-12 w-full items-center justify-center rounded-full bg-[#cc208f] text-[15px] font-semibold text-white"
      >
        Sign in to enter
      </Link>
    );
  }
  if (!content) return null;
  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
      <div className="mx-auto max-w-[680px]">{content}</div>
    </footer>
  );
}

function Primary({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-12 flex-1 rounded-full bg-[#cc208f] px-5 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-40 w-full"
    >
      {children}
    </button>
  );
}
function Secondary({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 shrink-0 rounded-full border border-border px-5 text-[15px] font-semibold"
    >
      {children}
    </button>
  );
}

/* ── My entry ─────────────────────────────────────────── */

function MyEntry({
  d,
  refresh,
  onObject,
}: {
  d: ChallengeDetail;
  refresh: () => void;
  onObject: () => void;
}) {
  const c = d.challenge;
  const e = d.my_entry!;
  const [busy, setBusy] = useState(false);
  const results = c.status === "result_posted" || c.status === "completed";
  const ended = results || c.status === "cancelled";
  const canObject =
    c.status === "result_posted" &&
    c.objection_until &&
    new Date(c.objection_until).getTime() > Date.now() &&
    !d.my_dispute;
  const label =
    e.status === "winner"
      ? `You won ${placeLabel(e.place || 1)} place`
      : e.status === "mention"
        ? "Honourable mention"
        : e.status === "disqualified"
          ? "Disqualified"
          : e.status === "not_selected"
            ? "Not selected this time"
            : "Your entry is in";
  const paid = d.paid.filter((p) => p.profile_id === e.entrant_id);
  return (
    <section
      className={`rounded-3xl border p-4 ${e.status === "winner" ? "border-[#cc208f]/50 bg-[#cc208f]/[0.05]" : "border-border bg-card"}`}
    >
      <div className="flex items-center gap-2">
        {e.status === "winner" ? (
          <Trophy className="h-5 w-5 text-[#cc208f]" />
        ) : (
          <BadgeCheck className="h-5 w-5 text-emerald-500" />
        )}
        <p className="flex-1 font-display text-[16px] font-semibold">{label}</p>
        {e.revision > 1 && (
          <span className="text-[12px] text-muted-foreground">Edited {e.revision - 1}×</span>
        )}
      </div>
      {c.status === "open" && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          You can edit it until entries close. Only you and the owner can see it for now.
        </p>
      )}
      {e.disqualify_reason && (
        <p className="mt-2 text-[13px] text-rose-500">{e.disqualify_reason}</p>
      )}
      {paid.map((p, i) => (
        <p
          key={i}
          className="mt-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400"
        >
          {formatPrize(p.amount, c.prize_type)}{" "}
          {p.kind === "prize" ? "prize paid to you" : "share paid to you"} ✓
        </p>
      ))}
      {results && e.scores && Object.keys(e.scores).length > 0 && (
        <div className="mt-3 space-y-1.5">
          {c.criteria.map((cr) => (
            <ScoreLine key={cr.name} name={cr.name} score={e.scores?.[cr.name]} />
          ))}
        </div>
      )}
      {results && e.owner_feedback && (
        <p className="mt-3 rounded-xl bg-foreground/[0.04] p-3 text-[13.5px] leading-relaxed">
          <span className="font-semibold">Feedback:</span> {e.owner_feedback}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {c.status === "open" && e.status === "submitted" && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Withdraw your entry? You can enter again before the deadline."))
                return;
              setBusy(true);
              try {
                await withdrawEntry(c.id);
                toast.success("Entry withdrawn");
                refresh();
              } catch (err: any) {
                toast.error(err.message);
              } finally {
                setBusy(false);
              }
            }}
            className="h-9 rounded-full border border-border px-3.5 text-[13px] font-semibold"
          >
            Withdraw
          </button>
        )}
        {ended &&
          !["withdrawn", "disqualified"].includes(e.status) &&
          (e.published_post_id ? (
            <Link
              to="/app/post/$id"
              params={{ id: e.published_post_id }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-semibold"
            >
              <Check className="h-3.5 w-3.5" /> On your portfolio
            </Link>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await addEntryToPortfolio(e.id);
                  toast.success("Added to your Zero Proofs and portfolio");
                  refresh();
                } catch (err: any) {
                  toast.error(err.message);
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}{" "}
              Add to my portfolio
            </button>
          ))}
        {canObject && (
          <button
            type="button"
            onClick={onObject}
            className="h-9 rounded-full border border-border px-3.5 text-[13px] font-semibold text-muted-foreground"
          >
            Object to the result
          </button>
        )}
        {d.my_dispute && (
          <span className="inline-flex h-9 items-center rounded-full bg-amber-500/12 px-3.5 text-[13px] font-semibold text-amber-700 dark:text-amber-300">
            Objection {d.my_dispute.status === "open" ? "under review" : d.my_dispute.status}
          </span>
        )}
      </div>
    </section>
  );
}

/* ── Entry card (owner review + public results) ───────── */

function EntryCard({
  c,
  e,
  judge,
  refresh,
}: {
  c: ChallengeDetail["challenge"];
  e: Entry;
  judge: boolean;
  refresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, number>>(e.scores || {});
  const [feedback, setFeedback] = useState(e.owner_feedback || "");
  const [saving, setSaving] = useState(false);
  const total = c.criteria.reduce((sum, cr) => sum + (scores[cr.name] || 0) * cr.weight, 0);
  const max = c.criteria.reduce((sum, cr) => sum + 5 * cr.weight, 0);
  const badge =
    e.status === "winner"
      ? { t: `${placeLabel(e.place || 1)} place`, cls: "bg-[#cc208f] text-white" }
      : e.status === "mention"
        ? { t: "Honourable mention", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-300" }
        : e.status === "disqualified"
          ? { t: "Disqualified", cls: "bg-rose-500/12 text-rose-500" }
          : null;

  const save = async () => {
    setSaving(true);
    try {
      await scoreEntry(e.id, scores, feedback);
      toast.success("Saved");
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article
      className={`overflow-hidden rounded-3xl border bg-card ${e.status === "winner" ? "border-[#cc208f]/50" : "border-border"}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-3.5 text-left"
      >
        <Avatar p={e.entrant} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold">
            {e.entrant.full_name || e.entrant.username}
          </span>
          <span className="block truncate text-[12.5px] text-muted-foreground">
            {e.explanation}
          </span>
        </span>
        {badge && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${badge.cls}`}
          >
            {badge.t}
          </span>
        )}
        {judge && total > 0 && (
          <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-muted-foreground">
            {Math.round((total / max) * 100)}%
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/70 p-3.5">
          {e.media_urls.length > 0 && (
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {e.media_urls.map((u, i) => (
                <button key={u} type="button" onClick={() => setViewer(i)} className="shrink-0">
                  <img
                    src={u}
                    alt=""
                    className="h-40 w-auto max-w-[260px] rounded-xl object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{e.explanation}</p>
          <div className="flex flex-wrap gap-2">
            {e.links.live_url && <LinkChip href={e.links.live_url} label="Live" />}
            {e.links.repo_url && <LinkChip href={e.links.repo_url} label="Code" />}
            {e.links.design_url && <LinkChip href={e.links.design_url} label="Design" />}
            {e.published_post_id && (
              <Link
                to="/app/post/$id"
                params={{ id: e.published_post_id }}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground/[0.06] px-3 text-[12.5px] font-semibold"
              >
                Zero Proof <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground">
            Submitted{" "}
            {new Date(e.submitted_at).toLocaleString([], {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {e.revision > 1 ? ` · edited ${e.revision - 1}×` : ""}
          </p>

          {judge && e.status === "submitted" && (
            <div className="space-y-3 rounded-2xl bg-foreground/[0.03] p-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Your scores · private
              </p>
              {c.criteria.map((cr) => (
                <div key={cr.name}>
                  <div className="flex justify-between text-[13px]">
                    <span>{cr.name}</span>
                    <span className="text-muted-foreground">×{cr.weight}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setScores({ ...scores, [cr.name]: n })}
                        className={`h-9 rounded-lg text-[13px] font-semibold transition ${scores[cr.name] === n ? "bg-[#cc208f] text-white" : (scores[cr.name] || 0) >= n ? "bg-[#cc208f]/20" : "bg-foreground/[0.06] text-muted-foreground"}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <textarea
                value={feedback}
                onChange={(ev) => setFeedback(ev.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Feedback for this entrant (they'll see it after results)"
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-[15px] outline-none focus:border-foreground/40"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={save}
                  className="h-10 flex-1 rounded-full bg-foreground text-[13.5px] font-semibold text-background disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save scores"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const reason = window.prompt(
                      "Why is this entry disqualified? The entrant will see this.",
                    );
                    if (!reason) return;
                    try {
                      await disqualifyEntry(e.id, reason);
                      toast.success("Entry disqualified");
                      refresh();
                    } catch (err: any) {
                      toast.error(err.message);
                    }
                  }}
                  className="h-10 rounded-full border border-border px-4 text-[13px] font-semibold text-rose-500"
                >
                  Disqualify
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {viewer !== null && (
        <ImageLightbox
          mediaUrls={e.media_urls}
          initialIndex={viewer}
          isOpen
          onClose={() => setViewer(null)}
          allowDownload
        />
      )}
    </article>
  );
}

/* ── Sheets ───────────────────────────────────────────── */

function SheetShell({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} repositionInputs={false}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-[560px]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const input =
  "w-full rounded-xl border border-border bg-background px-3.5 text-[16px] outline-none transition focus:border-foreground/40";

function EnterSheet({
  open,
  onClose,
  d,
  me,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  d: ChallengeDetail;
  me: any;
  refresh: () => void;
}) {
  const c = d.challenge;
  const prev = d.my_entry && d.my_entry.status === "submitted" ? d.my_entry : null;
  const [explanation, setExplanation] = useState(prev?.explanation || "");
  const [live, setLive] = useState(prev?.links?.live_url || "");
  const [repo, setRepo] = useState(prev?.links?.repo_url || "");
  const [design, setDesign] = useState(prev?.links?.design_url || "");
  const [media, setMedia] = useState<string[]>(prev?.media_urls || []);
  const [uploading, setUploading] = useState(false);
  const [accept, setAccept] = useState(Boolean(prev));
  const [busy, setBusy] = useState(false);
  const urlOk = (u: string) => !u || /^https?:\/\/\S+$/i.test(u.trim());
  const problem =
    explanation.trim().length < 30
      ? "Explain what you made and why (30+ characters)"
      : c.requirements.live_url && !live.trim()
        ? "Add a live link"
        : c.requirements.repo_url && !repo.trim()
          ? "Add a repository link"
          : c.requirements.images && media.length === 0
            ? "Add at least one image"
            : ![live, repo, design].every(urlOk)
              ? "Links must start with https://"
              : !accept
                ? "Accept the terms to enter"
                : null;

  const submit = async () => {
    if (problem || busy) return;
    setBusy(true);
    try {
      const res = await submitEntry(c.id, {
        accept_terms: true,
        explanation: explanation.trim(),
        links: {
          live_url: live.trim() || null,
          repo_url: repo.trim() || null,
          design_url: design.trim() || null,
        },
        media_urls: media,
      });
      toast.success(res.updated ? "Entry updated" : "You're in! Good luck", {
        description: `You can edit until entries close.`,
      });
      onClose();
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell
      open={open}
      onClose={onClose}
      title={prev ? "Edit your entry" : "Enter the challenge"}
      description={`${formatPrize(c.prize_total, c.prize_type)} to win · ${c.criteria.map((x) => x.name).join(", ")}`}
    >
      <div className="space-y-4">
        <div>
          <p className="text-[13px] font-semibold">What did you make, and why?</p>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={6}
            maxLength={5000}
            placeholder="What you changed, how it meets the brief, and your part in it."
            className={`${input} mt-1.5 resize-none py-3 leading-relaxed`}
          />
        </div>
        <div>
          <p className="text-[13px] font-semibold">
            Images {c.requirements.images ? "" : "(optional)"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {media.map((u) => (
              <span key={u} className="relative">
                <img src={u} alt="" className="h-20 w-20 rounded-xl object-cover" />
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => setMedia(media.filter((x) => x !== u))}
                  className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {media.length < 8 && (
              <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-xl border border-dashed border-border text-muted-foreground">
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImageIcon className="h-5 w-5" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (ev) => {
                    const files = Array.from(ev.target.files || [])
                      .filter((f) => f.type.startsWith("image/"))
                      .slice(0, 8 - media.length);
                    ev.target.value = "";
                    if (!files.length || !me?.id) return;
                    setUploading(true);
                    try {
                      const urls = await uploadMedia(files, me.id);
                      setMedia((m) => [...m, ...urls].slice(0, 8));
                    } catch (err: any) {
                      toast.error(err.message || "Upload failed");
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[13px] font-semibold">Links</p>
          <input
            value={live}
            onChange={(e) => setLive(e.target.value)}
            placeholder={`Live link${c.requirements.live_url ? "" : " (optional)"}`}
            className={`${input} h-11`}
          />
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder={`Code repository${c.requirements.repo_url ? "" : " (optional)"}`}
            className={`${input} h-11`}
          />
          <input
            value={design}
            onChange={(e) => setDesign(e.target.value)}
            placeholder="Design file or preview (optional)"
            className={`${input} h-11`}
          />
        </div>
        <label className="flex items-start gap-3 rounded-2xl border border-border p-3">
          <input
            type="checkbox"
            checked={accept}
            onChange={(e) => setAccept(e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-[#cc208f]"
          />
          <span className="text-[13px] leading-snug">
            This is my own work, and I accept the <b>{rightsInfo(c.rights_preset).title}</b> terms:{" "}
            {rightsInfo(c.rights_preset).body}
          </span>
        </label>
        {problem && <p className="text-center text-[12.5px] text-muted-foreground">{problem}</p>}
        <button
          type="button"
          disabled={Boolean(problem) || busy || uploading}
          onClick={submit}
          className="h-12 w-full rounded-full bg-[#cc208f] text-[15px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Sending…" : prev ? "Save changes" : "Submit entry"}
        </button>
      </div>
    </SheetShell>
  );
}

function FinalizeSheet({
  open,
  onClose,
  d,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  d: ChallengeDetail;
  refresh: () => void;
}) {
  const c = d.challenge;
  const eligible = d.entries.filter((e) => e.status === "submitted");
  const ranked = [...eligible].sort((a, b) => weighted(c, b) - weighted(c, a));
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [mentions, setMentions] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = Object.values(picks);
  const problem = !picks[1]
    ? "Choose the 1st place winner"
    : note.trim().length < 10
      ? "Explain your decision in a sentence or two"
      : null;
  return (
    <SheetShell
      open={open}
      onClose={onClose}
      title="Pick the winner"
      description="Ranked by your scores. The result and your reason are public; the prize is paid 48 hours later."
    >
      <div className="space-y-4">
        {c.prizes.map((p) => (
          <div key={p.place}>
            <p className="text-[13px] font-semibold">
              {placeLabel(p.place)} · {formatPrize(p.amount, c.prize_type)}
            </p>
            <div className="mt-1.5 space-y-1.5">
              {ranked.map((e) => {
                const taken = chosen.includes(e.id) && picks[p.place] !== e.id;
                const on = picks[p.place] === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={taken}
                    onClick={() => setPicks({ ...picks, [p.place]: on ? "" : e.id })}
                    className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition disabled:opacity-35 ${on ? "border-[#cc208f] bg-[#cc208f]/[0.06]" : "border-border"}`}
                  >
                    <Avatar p={e.entrant} size={32} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {e.entrant.full_name || e.entrant.username}
                    </span>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {scorePct(c, e)}
                    </span>
                    {on && <Check className="h-4 w-4 text-[#cc208f]" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {eligible.length > chosen.filter(Boolean).length && (
          <div>
            <p className="text-[13px] font-semibold">Honourable mentions (optional)</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {eligible
                .filter((e) => !chosen.includes(e.id))
                .map((e) => {
                  const on = mentions.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() =>
                        setMentions(on ? mentions.filter((x) => x !== e.id) : [...mentions, e.id])
                      }
                      className={`h-8 rounded-full px-3 text-[13px] font-medium ${on ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "bg-foreground/[0.06] text-muted-foreground"}`}
                    >
                      {e.entrant.full_name || e.entrant.username}
                    </button>
                  );
                })}
            </div>
          </div>
        )}
        <div>
          <p className="text-[13px] font-semibold">Why this result? (public)</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="What made the winning entry stand out against the criteria."
            className={`${input} mt-1.5 resize-none py-3`}
          />
        </div>
        {problem && <p className="text-center text-[12.5px] text-muted-foreground">{problem}</p>}
        <HoldToConfirm
          disabled={Boolean(problem)}
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              const winners = Object.entries(picks)
                .filter(([, id]) => id)
                .map(([place, entry_id]) => ({ entry_id, place: Number(place) }));
              await finalizeChallenge(c.id, winners, mentions, note.trim());
              toast.success("Result posted", {
                description: "The prize is paid in 48 hours unless an entrant objects.",
              });
              onClose();
              refresh();
            } catch (err: any) {
              toast.error(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Hold to post the result
        </HoldToConfirm>
      </div>
    </SheetShell>
  );
}

function CloseSheet({
  open,
  onClose,
  d,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  d: ChallengeDetail;
  refresh: () => void;
}) {
  const c = d.challenge;
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const n =
    d.entries.filter((e) => e.status === "submitted").length || (d.is_owner ? 0 : d.entry_count);
  const share = n > 0 ? (c.prize_total * 0.2) / n : 0;
  return (
    <SheetShell
      open={open}
      onClose={onClose}
      title={c.status === "open" ? "Close this challenge?" : "Close without a winner?"}
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-foreground/[0.04] p-3.5 text-[13.5px] leading-relaxed">
          {n === 0 ? (
            <>
              No one has entered yet, so the full <b>{formatPrize(c.prize_total, c.prize_type)}</b>{" "}
              comes back to you.
            </>
          ) : (
            <>
              {n} {n === 1 ? "person has" : "people have"} entered. <b>20%</b> of the prize is
              shared among them (about {formatPrize(Math.floor(share), c.prize_type)} each) and{" "}
              <b>{formatPrize(c.prize_total * 0.8, c.prize_type)}</b> comes back to you. Entries
              sent in the last hour aren't counted.
            </>
          )}
        </div>
        <div>
          <p className="text-[13px] font-semibold">Reason (entrants will see it)</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            className={`${input} mt-1.5 resize-none py-3`}
          />
        </div>
        <HoldToConfirm
          disabled={reason.trim().length < 10}
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              await closeChallenge(c.id, reason.trim());
              toast.success("Challenge closed");
              onClose();
              refresh();
            } catch (err: any) {
              toast.error(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Hold to close
        </HoldToConfirm>
      </div>
    </SheetShell>
  );
}

function DisputeSheet({
  open,
  onClose,
  d,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  d: ChallengeDetail;
  refresh: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <SheetShell
      open={open}
      onClose={onClose}
      title="Object to the result"
      description="Payment is paused and Zero Club reviews the result against the published criteria."
    >
      <div className="space-y-3">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="What's wrong with the result? Be specific."
          className={`${input} resize-none py-3`}
        />
        <button
          type="button"
          disabled={reason.trim().length < 10 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await disputeChallenge(d.challenge.id, reason.trim());
              toast.success("Objection sent. Payment is paused.");
              onClose();
              refresh();
            } catch (err: any) {
              toast.error(err.message);
            } finally {
              setBusy(false);
            }
          }}
          className="h-12 w-full rounded-full bg-foreground text-[15px] font-semibold text-background disabled:opacity-40"
        >
          Send objection
        </button>
      </div>
    </SheetShell>
  );
}

function ExtendSheet({
  open,
  onClose,
  d,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  d: ChallengeDetail;
  refresh: () => void;
}) {
  const c = d.challenge;
  const [brief, setBrief] = useState(c.brief);
  const [extra, setExtra] = useState(0);
  const [busy, setBusy] = useState(false);
  const maxEnd = new Date(c.created_at).getTime() + 60 * 86_400_000;
  const newDeadline = new Date(new Date(c.deadline).getTime() + extra * 86_400_000);
  return (
    <SheetShell
      open={open}
      onClose={onClose}
      title="Edit the challenge"
      description="Deadlines can only move later. Entrants are told about changes."
    >
      <div className="space-y-4">
        <div>
          <p className="text-[13px] font-semibold">Brief</p>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={6}
            maxLength={5000}
            className={`${input} mt-1.5 resize-none py-3 leading-relaxed`}
          />
        </div>
        <div>
          <p className="text-[13px] font-semibold">Extend the deadline</p>
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {[0, 3, 7, 14].map((x) => (
              <button
                key={x}
                type="button"
                disabled={new Date(c.deadline).getTime() + x * 86_400_000 > maxEnd}
                onClick={() => setExtra(x)}
                className={`h-11 rounded-xl border text-[14px] font-semibold disabled:opacity-30 ${extra === x ? "border-[#cc208f] bg-[#cc208f]/[0.06]" : "border-border text-muted-foreground"}`}
              >
                {x === 0 ? "Keep" : `+${x}d`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">
            Closes{" "}
            {newDeadline.toLocaleString([], {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <button
          type="button"
          disabled={busy || (brief.trim() === c.brief && extra === 0)}
          onClick={async () => {
            setBusy(true);
            try {
              const patch: Record<string, unknown> = {};
              if (brief.trim() !== c.brief) patch.brief = brief.trim();
              if (extra > 0) patch.deadline = newDeadline.toISOString();
              await updateChallenge(c.id, patch);
              toast.success("Challenge updated");
              onClose();
              refresh();
            } catch (err: any) {
              toast.error(err.message);
            } finally {
              setBusy(false);
            }
          }}
          className="h-12 w-full rounded-full bg-foreground text-[15px] font-semibold text-background disabled:opacity-40"
        >
          Save changes
        </button>
      </div>
    </SheetShell>
  );
}

function AdoptSheet({
  open,
  onClose,
  d,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  d: ChallengeDetail;
  refresh: () => void;
}) {
  const c = d.challenge;
  const { data: versions = [] } = useQuery({
    queryKey: ["project_versions", c.project_id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, version_label, release_notes, created_at")
        .eq("project_root_id", c.project_id)
        .eq("author_id", c.owner_id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <SheetShell
      open={open}
      onClose={onClose}
      title="Which version uses the winning work?"
      description="The winner is notified and credited."
    >
      {versions.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-muted-foreground">
          Publish a new version of your project first.
        </p>
      ) : (
        <div className="space-y-2">
          {versions.map((v: any) => (
            <button
              key={v.id}
              type="button"
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy(v.id);
                try {
                  await markAdopted(c.id, v.id);
                  toast.success("Linked. The winner has been credited.");
                  onClose();
                  refresh();
                } catch (err: any) {
                  toast.error(err.message);
                } finally {
                  setBusy(null);
                }
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left"
            >
              <GitBranch className="h-4 w-4 text-[#cc208f]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">v{v.version_label}</span>
                <span className="block truncate text-[12.5px] text-muted-foreground">
                  {v.release_notes || new Date(v.created_at).toLocaleDateString()}
                </span>
              </span>
              {busy === v.id && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
          ))}
        </div>
      )}
    </SheetShell>
  );
}

function ResolveSheet({
  open,
  onClose,
  d,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  d: ChallengeDetail;
  refresh: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (release: boolean) => {
    setBusy(true);
    try {
      await adminResolveChallenge(d.challenge.id, release, note.trim());
      toast.success(release ? "Prize released" : "Result overturned; 20/80 applied");
      onClose();
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SheetShell
      open={open}
      onClose={onClose}
      title="Review the objection"
      description={`${d.open_disputes} open objection(s). Release pays the winner; overturn shares 20% among entrants and returns 80% to the owner.`}
    >
      <div className="space-y-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Decision note (logged)"
          className={`${input} resize-none py-3`}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || note.trim().length < 5}
            onClick={() => run(false)}
            className="h-12 flex-1 rounded-full border border-border text-[14px] font-semibold disabled:opacity-40"
          >
            Overturn
          </button>
          <button
            type="button"
            disabled={busy || note.trim().length < 5}
            onClick={() => run(true)}
            className="h-12 flex-1 rounded-full bg-[#cc208f] text-[14px] font-semibold text-white disabled:opacity-40"
          >
            Release prize
          </button>
        </div>
      </div>
    </SheetShell>
  );
}

/* ── Small pieces ─────────────────────────────────────── */

function weighted(c: ChallengeDetail["challenge"], e: Entry) {
  return c.criteria.reduce((s, cr) => s + (e.scores?.[cr.name] || 0) * cr.weight, 0);
}
function scorePct(c: ChallengeDetail["challenge"], e: Entry) {
  const max = c.criteria.reduce((s, cr) => s + 5 * cr.weight, 0);
  const w = weighted(c, e);
  return w > 0 ? `${Math.round((w / max) * 100)}%` : "Not scored";
}

function Timeline({ c }: { c: ChallengeDetail["challenge"] }) {
  const steps = [
    { label: "Opened", at: c.created_at, done: true },
    { label: "Entries close", at: c.deadline, done: c.status !== "open" },
    { label: "Winner picked", at: c.finalized_at, done: Boolean(c.finalized_at) },
    {
      label: c.status === "cancelled" ? "Closed" : "Prize paid",
      at: c.completed_at,
      done: c.status === "completed" || c.status === "cancelled",
    },
  ];
  return (
    <Panel title="Timeline">
      <ol className="relative ml-1.5 space-y-3 border-l border-border pl-4">
        {steps.map((s) => (
          <li key={s.label} className="relative">
            <span
              className={`absolute -left-[21.5px] top-1 h-2.5 w-2.5 rounded-full ${s.done ? "bg-[#cc208f]" : "border border-border bg-card"}`}
            />
            <p className={`text-[13.5px] ${s.done ? "font-semibold" : "text-muted-foreground"}`}>
              {s.label}
            </p>
            {s.at && (
              <p className="text-[12px] text-muted-foreground">
                {new Date(s.at).toLocaleString([], {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-4">
      <h3 className="mb-2.5 text-[15px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}
function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-foreground/[0.04] p-3">
      <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 font-display text-[20px] font-bold tabular-nums">{value}</p>
    </div>
  );
}
function Req({ children }: { children: ReactNode; ok?: boolean }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-[#cc208f]/12 text-[#cc208f]">
        <FileText className="h-3 w-3" />
      </span>
      {children}
    </li>
  );
}
function ScoreLine({ name, score }: { name: string; score?: number }) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="flex-1">{name}</span>
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`h-1.5 w-4 rounded-full ${(score || 0) >= n ? "bg-[#cc208f]" : "bg-foreground/[0.08]"}`}
          />
        ))}
      </span>
    </div>
  );
}
function LinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground/[0.06] px-3 text-[12.5px] font-semibold"
    >
      {label} <ArrowUpRight className="h-3.5 w-3.5" />
    </a>
  );
}
function Avatar({
  p,
  size,
  ring,
}: {
  p: { avatar_url: string | null; full_name: string | null; username: string | null };
  size: number;
  ring?: boolean;
}) {
  const style = { width: size, height: size };
  const cls = `shrink-0 rounded-full object-cover ${ring ? "ring-2 ring-[#cc208f] ring-offset-2 ring-offset-card" : ""}`;
  return p.avatar_url ? (
    <img src={p.avatar_url} alt="" style={style} className={cls} />
  ) : (
    <span
      style={style}
      className={`grid place-items-center bg-foreground/[0.08] text-[13px] font-semibold ${cls}`}
    >
      {(p.full_name || p.username || "?").charAt(0).toUpperCase()}
    </span>
  );
}
