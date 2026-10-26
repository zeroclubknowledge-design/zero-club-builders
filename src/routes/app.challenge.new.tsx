import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Trophy,
  X,
} from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { parseShip, postImages } from "@/features/portfolio/parse";
import { createChallenge } from "@/features/challenges/api";
import type { PrizeType, RightsPreset, TaskType } from "@/features/challenges/api";
import {
  HoldToConfirm,
  MIN_PRIZE,
  RIGHTS,
  TASK_TYPES,
  defaultCriteria,
  formatPrize,
  placeLabel,
} from "@/features/challenges/ui";

/**
 * Create a Challenge on one of your shipped projects.
 * Four short steps; the prize is held from your wallet (or ZP) only when you
 * confirm on the last one, and the challenge goes live in the same step.
 */
export const Route = createFileRoute("/app/challenge/new")({
  validateSearch: (s: Record<string, unknown>) => ({
    project: typeof s.project === "string" ? s.project : "",
  }),
  component: NewChallenge,
});

const STEPS = ["Brief", "Rules", "Prize", "Review"] as const;
const DEADLINE_PRESETS = [7, 14, 30];

function NewChallenge() {
  const { project: projectId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useUser() as { data: any };
  const clientKey = useRef(crypto.randomUUID());

  const { data: project, isLoading } = useQuery({
    queryKey: ["challenge_project", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, author_id, content, media_urls, version_label, is_build_post, project_root_id, audience",
        )
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const ship = useMemo(() => (project ? parseShip(project.content) : null), [project]);
  const cover = project ? postImages(project)[0] : undefined;

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [task, setTask] = useState<TaskType>("improve");
  const [skills, setSkills] = useState<string[] | null>(null);
  const [skillDraft, setSkillDraft] = useState("");
  const [criteria, setCriteria] = useState<{ name: string; weight: number }[] | null>(null);
  const [criterionDraft, setCriterionDraft] = useState("");
  const [req, setReq] = useState({ live_url: false, repo_url: false, images: true });
  const [days, setDays] = useState(14);
  const [prizeType, setPrizeType] = useState<PrizeType>("funds");
  const [prizes, setPrizes] = useState<string[]>(["10000"]);
  const [rights, setRights] = useState<RightsPreset>("use_with_credit");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const skillList = skills ?? (ship?.tools || []).slice(0, 6);
  const criteriaList =
    criteria ?? defaultCriteria(ship?.category).map((name) => ({ name, weight: 1 }));
  const amounts = prizes.map((p) => Math.max(0, Math.round(Number(p) || 0)));
  const total = amounts.reduce((a, b) => a + b, 0);
  const balance = prizeType === "zp" ? Number(user?.zp || 0) : Number(user?.coins || 0);
  const deadline = new Date(Date.now() + days * 86_400_000);

  const stepError = (() => {
    if (step === 0) {
      if (title.trim().length < 4) return "Give the challenge a clear title";
      if (brief.trim().length < 20) return "Describe what entrants should do (20+ characters)";
    }
    if (step === 1 && criteriaList.length === 0) return "Add at least one judging criterion";
    if (step === 2) {
      if (amounts.some((a) => a <= 0)) return "Every prize needs an amount";
      if (amounts.some((a, i) => i > 0 && a > amounts[i - 1]))
        return "Each prize must be no bigger than the one above";
      if (total < MIN_PRIZE)
        return `The total prize must be at least ${formatPrize(MIN_PRIZE, prizeType)}`;
      if (total > balance) return `You need ${formatPrize(total - balance, prizeType)} more`;
    }
    if (step === 3 && !agreed) return "Confirm the terms to publish";
    return null;
  })();

  if (
    !projectId ||
    (!isLoading &&
      (!project ||
        project.author_id !== user?.id ||
        !project.is_build_post ||
        project.project_root_id))
  ) {
    return (
      <Centered>
        <p className="font-display text-[19px] font-semibold">Pick one of your shipped projects</p>
        <p className="mt-1 max-w-xs text-[14px] text-muted-foreground">
          Challenges live on your original shipped projects in Zero Proofs.
        </p>
        <Link
          to="/app/zerohub"
          className="mt-5 inline-flex h-11 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background"
        >
          Go to Zero Proofs
        </Link>
      </Centered>
    );
  }
  if (isLoading || !project) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  const publish = async () => {
    if (saving || stepError) return;
    setSaving(true);
    try {
      const res = await createChallenge({
        client_key: clientKey.current,
        project_id: project.id,
        title: title.trim(),
        brief: brief.trim(),
        task_type: task,
        skills: skillList,
        requirements: req,
        criteria: criteriaList,
        rights_preset: rights,
        prize_type: prizeType,
        prizes: amounts.map((amount) => ({ amount })),
        deadline: deadline.toISOString(),
      });
      void queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      void queryClient.invalidateQueries({ queryKey: ["challenge_badges"] });
      toast.success("Your challenge is live", {
        description: `${formatPrize(total, prizeType)} is held safely until a winner is paid.`,
      });
      navigate({
        to: "/app/challenge/$id",
        params: { id: res.id },
        search: { created: "1" },
        replace: true,
      });
    } catch (error: any) {
      toast.error(error?.message || "Could not create the challenge");
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[640px] items-center gap-1 px-2">
          <button
            type="button"
            onClick={() => (step > 0 ? setStep(step - 1) : navigate({ to: "/app/zerohub" }))}
            className="grid h-11 w-10 place-items-center rounded-full hover:bg-foreground/[0.04]"
            aria-label="Back"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[17px] font-semibold leading-tight">
              Create challenge
            </h1>
            <p className="text-[12px] text-muted-foreground">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </p>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[640px] gap-1.5 px-4 pb-2.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-[#c3217e]" : "bg-foreground/[0.08]"}`}
            />
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[640px] flex-1 space-y-4 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
        {/* The project being challenged, locked, so it's clear what is being improved. */}
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
          {cover ? (
            <img src={cover} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-foreground/[0.06]">
              <Trophy className="h-5 w-5 text-muted-foreground" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Challenge on
            </p>
            <p className="truncate text-[15px] font-semibold">{ship?.name || "Your project"}</p>
            <p className="text-[12px] text-muted-foreground">
              {ship?.category || "Project"} · v{project.version_label || "1.0.0"} · stays unchanged
            </p>
          </div>
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        {step === 0 && (
          <>
            <Card>
              <Label>What should people do?</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {TASK_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTask(t.key)}
                    className={`rounded-xl border p-3 text-left transition ${task === t.key ? "border-[#c3217e] bg-[#c3217e]/[0.06]" : "border-border hover:bg-foreground/[0.03]"}`}
                  >
                    <span className="block text-[14px] font-semibold">{t.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                      {t.hint}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
            <Card>
              <Label>Challenge title</Label>
              <input
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. Redesign the onboarding of ${ship?.name || "my app"}`}
                className={field}
              />
              <Label className="mt-4">The brief</Label>
              <textarea
                value={brief}
                maxLength={5000}
                rows={6}
                onChange={(e) => setBrief(e.target.value)}
                placeholder={
                  "What the project does, what to improve and why it matters.\nWhat should entrants deliver? Any constraints?"
                }
                className={`${field} h-auto resize-none py-3 leading-relaxed`}
              />
              <p className="mt-1.5 text-right text-[11.5px] tabular-nums text-muted-foreground">
                {brief.length}/5000
              </p>
            </Card>
            <Card>
              <Label>Skills needed</Label>
              <Chips
                items={skillList}
                onRemove={(s) => setSkills(skillList.filter((x) => x !== s))}
              />
              <AddRow
                value={skillDraft}
                onChange={setSkillDraft}
                placeholder="Add a skill"
                onAdd={() => {
                  const s = skillDraft.trim();
                  if (
                    s &&
                    !skillList.some((x) => x.toLowerCase() === s.toLowerCase()) &&
                    skillList.length < 12
                  )
                    setSkills([...skillList, s]);
                  setSkillDraft("");
                }}
              />
            </Card>
          </>
        )}

        {step === 1 && (
          <>
            <Card>
              <Label>How you'll judge</Label>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                Entrants see these before they start. More weight means it counts more.
              </p>
              <ul className="mt-3 space-y-2">
                {criteriaList.map((c, i) => (
                  <li
                    key={c.name}
                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {c.name}
                    </span>
                    <div className="flex gap-1">
                      {[1, 2, 3].map((w) => (
                        <button
                          key={w}
                          type="button"
                          aria-label={`Weight ${w}`}
                          onClick={() =>
                            setCriteria(
                              criteriaList.map((x, j) => (j === i ? { ...x, weight: w } : x)),
                            )
                          }
                          className={`h-7 w-7 rounded-full text-[12px] font-semibold transition ${c.weight === w ? "bg-foreground text-background" : "bg-foreground/[0.06] text-muted-foreground"}`}
                        >
                          ×{w}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => setCriteria(criteriaList.filter((_, j) => j !== i))}
                      className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              {criteriaList.length < 8 && (
                <AddRow
                  value={criterionDraft}
                  onChange={setCriterionDraft}
                  placeholder="Add a criterion"
                  onAdd={() => {
                    const n = criterionDraft.trim();
                    if (
                      n.length >= 2 &&
                      !criteriaList.some((x) => x.name.toLowerCase() === n.toLowerCase())
                    )
                      setCriteria([...criteriaList, { name: n, weight: 1 }]);
                    setCriterionDraft("");
                  }}
                />
              )}
            </Card>
            <Card>
              <Label>Entries must include</Label>
              <div className="mt-2 divide-y divide-border">
                <Toggle label="A written explanation" hint="Always required" checked disabled />
                <Toggle
                  label="Images or screenshots"
                  checked={req.images}
                  onChange={(v) => setReq({ ...req, images: v })}
                />
                <Toggle
                  label="A live link"
                  checked={req.live_url}
                  onChange={(v) => setReq({ ...req, live_url: v })}
                />
                <Toggle
                  label="A code repository link"
                  checked={req.repo_url}
                  onChange={(v) => setReq({ ...req, repo_url: v })}
                />
              </div>
            </Card>
            <Card>
              <Label>Entries close in</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {DEADLINE_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className={`h-12 rounded-xl border text-[15px] font-semibold transition ${days === d ? "border-[#c3217e] bg-[#c3217e]/[0.06] text-foreground" : "border-border text-muted-foreground"}`}
                  >
                    {d} days
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                Closes{" "}
                {deadline.toLocaleString([], {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                . You'll have 7 days after that to pick a winner.
              </p>
            </Card>
          </>
        )}

        {step === 2 && (
          <>
            <Card>
              <div className="flex items-center justify-between">
                <Label>Prize</Label>
                <div className="flex rounded-full bg-foreground/[0.06] p-0.5">
                  {(["funds", "zp"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPrizeType(t)}
                      className={`h-8 rounded-full px-3.5 text-[13px] font-semibold transition ${prizeType === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                    >
                      {t === "funds" ? "₦ Wallet" : "ZP"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {prizes.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-[13px] font-semibold text-muted-foreground">
                      {placeLabel(i + 1)}
                    </span>
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground">
                        {prizeType === "zp" ? "ZP" : "₦"}
                      </span>
                      <input
                        inputMode="numeric"
                        value={p}
                        onChange={(e) =>
                          setPrizes(
                            prizes.map((x, j) =>
                              j === i ? e.target.value.replace(/[^\d]/g, "") : x,
                            ),
                          )
                        }
                        className={`${field} mt-0 pl-11 text-[16px] font-semibold tabular-nums`}
                      />
                    </div>
                    {i > 0 && (
                      <button
                        type="button"
                        aria-label="Remove prize"
                        onClick={() => setPrizes(prizes.filter((_, j) => j !== i))}
                        className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {prizes.length < 3 && (
                <button
                  type="button"
                  onClick={() =>
                    setPrizes([
                      ...prizes,
                      String(Math.round((amounts[amounts.length - 1] || 0) / 2)),
                    ])
                  }
                  className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 text-[13px] font-medium text-muted-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Add {placeLabel(prizes.length + 1)} place
                </button>
              )}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-foreground/[0.04] px-3 py-2.5 text-[13px]">
                <span className="text-muted-foreground">
                  Your {prizeType === "zp" ? "ZP" : "wallet"} balance
                </span>
                <span
                  className={`font-semibold tabular-nums ${total > balance ? "text-rose-500" : ""}`}
                >
                  {formatPrize(balance, prizeType)}
                </span>
              </div>
              {prizeType === "funds" && total > balance && (
                <Link
                  to="/app/wallet/add-money"
                  className="mt-2 inline-flex text-[13px] font-semibold text-[#c3217e]"
                >
                  Add money to your wallet →
                </Link>
              )}
            </Card>
            <Card>
              <Label>What the winner's work can be used for</Label>
              <div className="mt-2 space-y-2">
                {RIGHTS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRights(r.key)}
                    className={`flex w-full gap-3 rounded-xl border p-3 text-left transition ${rights === r.key ? "border-[#c3217e] bg-[#c3217e]/[0.06]" : "border-border"}`}
                  >
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${rights === r.key ? "border-[#c3217e] bg-[#c3217e] text-white" : "border-foreground/30"}`}
                    >
                      {rights === r.key && <Check className="h-3 w-3" />}
                    </span>
                    <span>
                      <span className="block text-[14px] font-semibold">
                        {r.title}{" "}
                        <span className="font-normal text-muted-foreground">· {r.short}</span>
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
                        {r.body}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </>
        )}

        {step === 3 && (
          <>
            <Card>
              <p className="font-display text-[19px] font-semibold leading-snug">{title}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {TASK_TYPES.find((t) => t.key === task)?.label} · closes in {days} days ·{" "}
                {criteriaList.length} criteria
              </p>
            </Card>
            {/* Receipt: nothing is charged until Publish. */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-dashed border-border px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Held from your {prizeType === "zp" ? "ZP" : "wallet"}
                </p>
              </div>
              <div className="space-y-2 px-4 py-3 text-[14px]">
                {amounts.map((a, i) => (
                  <Row
                    key={i}
                    label={`${placeLabel(i + 1)} prize`}
                    value={formatPrize(a, prizeType)}
                  />
                ))}
                <Row label="Zero Club fee" value={formatPrize(0, prizeType)} />
                <div className="border-t border-border pt-2">
                  <Row label="Total held" value={formatPrize(total, prizeType)} strong />
                </div>
              </div>
            </div>
            <Card>
              <Label>What happens to the prize</Label>
              <ul className="mt-2 space-y-2.5 text-[13.5px] leading-snug text-foreground/85">
                <Bullet>
                  It's held safely by Zero Club — you can't spend it elsewhere while the challenge
                  runs.
                </Bullet>
                <Bullet>
                  You pick the winner after entries close. It's paid 48 hours later, unless an
                  entrant objects and Zero Club reviews it.
                </Bullet>
                <Bullet>No entries by the deadline: you get it all back.</Bullet>
                <Bullet>
                  Cancel or pick no winner once people have entered: 20% is shared equally among
                  them and 80% comes back to you.
                </Bullet>
                <Bullet>
                  Not decided within 7 days of the deadline: Zero Club reviews and decides.
                </Bullet>
              </ul>
            </Card>
            <label className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-[#c3217e]"
              />
              <span className="text-[13.5px] leading-snug">
                I'll judge fairly against the criteria above, and I agree to the prize rules and the{" "}
                <b>{RIGHTS.find((r) => r.key === rights)?.title}</b> terms for the winning work.
              </span>
            </label>
          </>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="mx-auto max-w-[640px]">
          {stepError && (
            <p className="mb-2 text-center text-[12.5px] text-muted-foreground">{stepError}</p>
          )}
          {step < 3 ? (
            <button
              type="button"
              disabled={Boolean(stepError)}
              onClick={() => setStep(step + 1)}
              className="h-12 w-full rounded-full bg-foreground text-[15px] font-semibold text-background transition active:scale-[0.99] disabled:opacity-40"
            >
              Continue
            </button>
          ) : (
            <HoldToConfirm
              disabled={Boolean(stepError) || saving}
              busy={saving}
              onConfirm={publish}
            >
              Hold to publish · {formatPrize(total, prizeType)}
            </HoldToConfirm>
          )}
        </div>
      </footer>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────── */

const field =
  "mt-1.5 h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3.5 text-[16px] outline-none transition focus:border-foreground/40";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-4">{children}</section>;
}
function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[14px] font-semibold ${className}`}>{children}</p>;
}
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? "text-[16px] font-bold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#c3217e]" />
      <span>{children}</span>
    </li>
  );
}
function Chips({ items, onRemove }: { items: string[]; onRemove: (s: string) => void }) {
  if (!items.length) return <p className="mt-2 text-[13px] text-muted-foreground">None yet.</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.07] py-1 pl-3 pr-1 text-[13px]"
        >
          {s}
          <button
            type="button"
            aria-label={`Remove ${s}`}
            onClick={() => onRemove(s)}
            className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
function AddRow({
  value,
  onChange,
  onAdd,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd();
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${field} mt-0 h-11`}
      />
      <button
        type="submit"
        className="h-11 shrink-0 rounded-xl bg-foreground px-4 text-[14px] font-semibold text-background"
      >
        Add
      </button>
    </form>
  );
}
function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-3 py-2.5 ${disabled ? "opacity-60" : ""}`}>
      <span className="flex-1">
        <span className="block text-[14px]">{label}</span>
        {hint && <span className="block text-[12px] text-muted-foreground">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="h-5 w-5 accent-[#c3217e]"
      />
    </label>
  );
}
