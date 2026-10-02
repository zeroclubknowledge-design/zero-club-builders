import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useGoBack } from "@/hooks/useGoBack";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, BadgeCheck, BookOpen, CalendarClock, Check, Clock, GraduationCap, Link2,
  LayoutDashboard, Loader2, PlayCircle, Plus, ShieldCheck, Sparkles, Users, X,
} from "@/components/icons/glyphs";
import { ZeroLoader, ZeroMark } from "@/components/ZeroLoader";
import { useUser } from "@/hooks/useUser";
import { INTEREST_OPTIONS, switchMode } from "@/lib/modes";
import {
  EMPTY_DRAFT, SUBMIT_REFUSAL, getTutorStatus, submitTutorApplication,
  type TutorApplication, type TutorApplicationDraft,
} from "@/lib/tutorApplication";

export const Route = createFileRoute("/app/tutor-apply")({
  component: TutorApplyPage,
});

const DRAFT_KEY = "zc-tutor-application-draft";
const PINK = "#cc208f";

const EXPERIENCE = ["Under 1 year", "1–2 years", "3–5 years", "6–10 years", "10+ years"];
const LEVELS = ["Beginners", "Intermediate", "Advanced"];
const FORMATS = ["Live classes", "Bootcamps", "1:1 mentoring", "Workshops", "Recorded lessons"];
const AVAILABILITY = ["Weekday mornings", "Weekday afternoons", "Weekday evenings", "Weekends"];
const HOURS = ["1–3 hrs", "4–6 hrs", "7–10 hrs", "10+ hrs"];

const STEPS = [
  { key: "about", title: "About you", hint: "How learners will first meet you." },
  { key: "teach", title: "What you'll teach", hint: "Your subjects, who they're for and how you teach." },
  { key: "proof", title: "Proof of expertise", hint: "Help the team verify your skills." },
  { key: "class", title: "Your first class", hint: "A taste of what you'd run on Zero Club." },
  { key: "review", title: "Review & submit", hint: "One last look before it goes to the team." },
] as const;

function readDraft(): TutorApplicationDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...EMPTY_DRAFT, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return EMPTY_DRAFT;
}

function saveDraft(draft: TutorApplicationDraft | null) {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
}

const looksLikeUrl = (v: string) => !v.trim() || /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v.trim());

function stepValid(step: number, d: TutorApplicationDraft) {
  switch (step) {
    case 0: return d.headline.trim().length >= 8 && Boolean(d.experience_years);
    case 1: return d.subjects.length > 0 && d.levels.length > 0 && d.formats.length > 0;
    case 2: return d.teaching_experience.trim().length >= 60 && Boolean(d.linkedin_url.trim() || d.portfolio_url.trim())
      && looksLikeUrl(d.linkedin_url) && looksLikeUrl(d.portfolio_url) && looksLikeUrl(d.intro_video_url);
    case 3: return d.sample_title.trim().length >= 6 && d.sample_outline.trim().length >= 60 && d.availability.length > 0 && Boolean(d.weekly_hours);
    case 4: return d.agreed;
    default: return false;
  }
}

/* ── Page ─────────────────────────────────────────────────────────────── */

function TutorApplyPage() {
  const router = useRouter();
  const { data: profile } = useUser();
  const status = useQuery({ queryKey: ["tutor-status"], queryFn: getTutorStatus, staleTime: 15_000 });
  const [mode, setMode] = useState<"auto" | "form">("auto");
  const [prefill, setPrefill] = useState<TutorApplication | null>(null);

  const back = useGoBack("/app");

  // The app's tab bar sits over the form's Continue button, so it's hidden
  // while applying and comes back once the application is submitted.
  const submitted = status.data?.application?.status === "pending";
  useEffect(() => {
    if (submitted) return;
    const root = document.documentElement;
    root.setAttribute("data-zc-focus-flow", "");
    return () => root.removeAttribute("data-zc-focus-flow");
  }, [submitted]);

  if (status.isLoading || !status.data) {
    return <div className="flex min-h-[80vh] items-center justify-center"><ZeroLoader /></div>;
  }

  const { approved, application } = status.data;
  const firstName = String(profile?.full_name || profile?.username || "there").split(" ")[0];

  if (approved) return <ApprovedScreen firstName={firstName} onBack={back} />;
  if (application?.status === "pending") return <PendingScreen application={application} onBack={back} />;
  if (application?.status === "rejected" && mode !== "form") {
    return (
      <RejectedScreen
        application={application}
        onBack={back}
        onReapply={() => {
          setPrefill(application);
          setMode("form");
        }}
      />
    );
  }
  if (mode !== "form") return <IntroScreen firstName={firstName} onStart={() => setMode("form")} onBack={back} />;
  return <ApplicationForm prefill={prefill} onExit={() => setMode("auto")} onSubmitted={() => void status.refetch()} />;
}

/* ── Shared chrome ───────────────────────────────────────────────────── */

function TopBar({ onBack, children }: { onBack: () => void; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-card/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-2 px-2">
        <button onClick={onBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full tap hover:bg-foreground/[0.05]">
          <ArrowLeft className="h-[22px] w-[22px]" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </header>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-canvas">{children}</div>;
}

/* ── Intro ───────────────────────────────────────────────────────────── */

function IntroScreen({ firstName, onStart, onBack }: { firstName: string; onStart: () => void; onBack: () => void }) {
  return (
    <Shell>
      <TopBar onBack={onBack}><p className="text-[15px] font-semibold">Become a Tutor</p></TopBar>
      <main className="mx-auto w-full max-w-[680px] flex-1 px-4 pb-32 pt-4">
        <section className="relative overflow-hidden rounded-[26px] bg-[#16111a] px-6 pb-7 pt-8 text-white shadow-[0_30px_60px_-30px_rgba(204,32,143,0.55)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_100%_0%,rgba(204,32,143,0.55),transparent_60%),radial-gradient(70%_60%_at_0%_100%,rgba(109,40,217,0.45),transparent_60%)]" />
          <ZeroMark size={220} className="pointer-events-none absolute -right-16 -top-10 rotate-12 text-white/[0.07]" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold tracking-wide ring-1 ring-white/15">
              <ShieldCheck className="h-3.5 w-3.5" /> Vetted by Zero Club
            </span>
            <h1 className="mt-4 font-display text-[30px] font-bold leading-[1.08] tracking-[-0.02em]">
              Teach what you know,<br />{firstName}.
            </h1>
            <p className="mt-3 max-w-[440px] text-[14.5px] leading-relaxed text-white/75">
              Every Zero Club tutor is reviewed by our team, so learners can trust who they learn from. Tell us about your
              skills and the class you'd love to run.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-[12.5px] font-medium text-white/85">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Clock className="h-3.5 w-3.5" /> About 5 minutes</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><CalendarClock className="h-3.5 w-3.5" /> Decision within 48 hours</span>
            </div>
          </div>
        </section>

        <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">What you unlock</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Perk icon={<LayoutDashboard className="h-5 w-5" />} title="Tutor Studio" body="Run bootcamps, live classes and cohorts from one place." />
          <Perk icon={<Users className="h-5 w-5" />} title="Your learners" body="Track progress, projects and attendance for every student." />
          <Perk icon={<Sparkles className="h-5 w-5" />} title="Earn on Zero Club" body="Get paid for bootcamps and memberships, straight to your wallet." />
          <Perk icon={<BadgeCheck className="h-5 w-5" />} title="Tutor badge" body="A verified Tutor mark on your profile and posts." />
        </div>

        <h2 className="mb-3 mt-8 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">What the team looks for</h2>
        <div className="rounded-2xl border border-border bg-card p-1.5">
          {[
            ["Real-world skill", "Work you've shipped, roles you've held or results you can point to."],
            ["Ability to teach", "Mentoring, training, content — anything that shows you can explain."],
            ["A clear first class", "A specific topic with an outline learners can follow."],
          ].map(([t, b], i) => (
            <div key={t} className={`flex gap-3 px-3.5 py-3 ${i ? "border-t border-border/70" : ""}`}>
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white" style={{ background: PINK }}><Check className="h-3.5 w-3.5" /></span>
              <div>
                <p className="text-[14px] font-semibold text-foreground">{t}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{b}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
      <StickyFooter>
        <button onClick={onStart} className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white shadow-[0_12px_28px_-12px_rgba(204,32,143,0.8)] transition active:scale-[0.99]" style={{ background: PINK }}>
          Start application <ArrowRight className="h-4 w-4" />
        </button>
      </StickyFooter>
    </Shell>
  );
}

function Perk({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${PINK}14`, color: PINK }}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/92 px-4 pt-3 backdrop-blur-xl" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto w-full max-w-[680px]">{children}</div>
    </div>
  );
}

/* ── The form ────────────────────────────────────────────────────────── */

function ApplicationForm({ prefill, onExit, onSubmitted }: { prefill: TutorApplication | null; onExit: () => void; onSubmitted: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<TutorApplicationDraft>(() => {
    if (prefill) {
      return {
        ...EMPTY_DRAFT,
        headline: prefill.headline || "",
        location: prefill.location || "",
        experience_years: prefill.experience_years || "",
        bio: prefill.bio || "",
        subjects: prefill.subjects || [],
        levels: prefill.levels || [],
        formats: prefill.formats || [],
        teaching_experience: prefill.teaching_experience || "",
        linkedin_url: prefill.linkedin_url || "",
        portfolio_url: prefill.portfolio_url || "",
        intro_video_url: prefill.intro_video_url || "",
        sample_title: prefill.sample_title || "",
        sample_outline: prefill.sample_outline || "",
        availability: prefill.availability || [],
        weekly_hours: prefill.weekly_hours || "",
      };
    }
    return readDraft();
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => saveDraft(draft), [draft]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const set = <K extends keyof TutorApplicationDraft>(key: K, value: TutorApplicationDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggle = (key: "subjects" | "levels" | "formats" | "availability", value: string, max = 8) =>
    setDraft((d) => {
      const has = d[key].includes(value);
      if (!has && d[key].length >= max) return d;
      return { ...d, [key]: has ? d[key].filter((v) => v !== value) : [...d[key], value] };
    });

  const valid = stepValid(step, draft);
  const last = step === STEPS.length - 1;

  const next = async () => {
    if (!valid) return;
    if (!last) {
      setStep((s) => s + 1);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitTutorApplication(draft);
      if (!res.ok) {
        setError(SUBMIT_REFUSAL[res.reason || ""] || "Couldn't submit your application. Please try again.");
        return;
      }
      saveDraft(null);
      toast.success("Application submitted");
      await queryClient.invalidateQueries({ queryKey: ["tutor-status"] });
      onSubmitted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <TopBar onBack={() => (step === 0 ? onExit() : setStep((s) => s - 1))}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
        <p className="truncate text-[15px] font-semibold leading-tight">{STEPS[step].title}</p>
      </TopBar>
      <div className="mx-auto w-full max-w-[680px] px-4 pt-3">
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.key} className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
              <span className="block h-full rounded-full transition-all duration-500" style={{ width: i < step ? "100%" : i === step ? "50%" : "0%", background: PINK }} />
            </span>
          ))}
        </div>
      </div>

      <main key={step} className="zc-apply-step mx-auto w-full max-w-[680px] flex-1 px-4 pb-36 pt-6">
        <h1 className="font-display text-[24px] font-bold leading-tight tracking-[-0.02em]">{STEPS[step].title}</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">{STEPS[step].hint}</p>

        <div className="mt-6 space-y-6">
          {step === 0 && (
            <>
              <Field label="Professional headline" hint="The line learners see under your name.">
                <input className="zc-apply-input" value={draft.headline} maxLength={140} onChange={(e) => set("headline", e.target.value)} placeholder="e.g. Senior Product Designer at Flutterwave" />
              </Field>
              <Field label="Where you're based" optional>
                <input className="zc-apply-input" value={draft.location} maxLength={120} onChange={(e) => set("location", e.target.value)} placeholder="City, Country" />
              </Field>
              <Field label="Years of experience in your field">
                <Chips options={EXPERIENCE} selected={draft.experience_years ? [draft.experience_years] : []} onToggle={(v) => set("experience_years", v)} />
              </Field>
              <Field label="Short bio" optional hint="A few sentences about you and your work.">
                <textarea className="zc-apply-input min-h-[110px]" value={draft.bio} maxLength={1200} onChange={(e) => set("bio", e.target.value)} placeholder="I design fintech products used by millions of Africans…" />
                <Counter value={draft.bio} max={1200} />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Subjects you'll teach" hint="Pick up to 5, or add your own.">
                <Chips options={Array.from(new Set([...INTEREST_OPTIONS, ...draft.subjects]))} selected={draft.subjects} onToggle={(v) => toggle("subjects", v, 5)} />
                <CustomChip onAdd={(v) => !draft.subjects.includes(v) && draft.subjects.length < 5 && set("subjects", [...draft.subjects, v])} />
              </Field>
              <Field label="Who you teach best">
                <Chips options={LEVELS} selected={draft.levels} onToggle={(v) => toggle("levels", v)} />
              </Field>
              <Field label="How you like to teach">
                <Chips options={FORMATS} selected={draft.formats} onToggle={(v) => toggle("formats", v)} />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Your teaching or industry experience" hint="Roles, projects, people you've mentored, classes you've run. Be specific.">
                <textarea className="zc-apply-input min-h-[150px]" value={draft.teaching_experience} maxLength={3000} onChange={(e) => set("teaching_experience", e.target.value)} placeholder="I've led a team of 6 engineers at… I mentored 40+ junior developers through… I ran a weekend React workshop for…" />
                <Counter value={draft.teaching_experience} max={3000} min={60} />
              </Field>
              <Field label="LinkedIn profile" hint="LinkedIn or a portfolio link is required.">
                <UrlInput value={draft.linkedin_url} onChange={(v) => set("linkedin_url", v)} placeholder="linkedin.com/in/yourname" />
              </Field>
              <Field label="Portfolio, GitHub or website" optional>
                <UrlInput value={draft.portfolio_url} onChange={(v) => set("portfolio_url", v)} placeholder="github.com/yourname" />
              </Field>
              <Field label="Intro video" optional hint="A 1–2 minute YouTube or Loom video of you explaining something. Applications with one are reviewed first.">
                <UrlInput value={draft.intro_video_url} onChange={(v) => set("intro_video_url", v)} placeholder="loom.com/share/…" icon={<PlayCircle className="h-4 w-4" />} />
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <Field label="Title of a class or bootcamp you'd run">
                <input className="zc-apply-input" value={draft.sample_title} maxLength={160} onChange={(e) => set("sample_title", e.target.value)} placeholder="e.g. Figma to shipped: design your first mobile app" />
              </Field>
              <Field label="Outline" hint="What learners will do, week by week or session by session.">
                <textarea className="zc-apply-input min-h-[170px]" value={draft.sample_outline} maxLength={3000} onChange={(e) => set("sample_outline", e.target.value)} placeholder={"Week 1 — Research and user flows\nWeek 2 — Wireframes\nWeek 3 — Visual design system\nWeek 4 — Prototype and case study"} />
                <Counter value={draft.sample_outline} max={3000} min={60} />
              </Field>
              <Field label="When you can teach">
                <Chips options={AVAILABILITY} selected={draft.availability} onToggle={(v) => toggle("availability", v)} />
              </Field>
              <Field label="Hours per week you can give">
                <Chips options={HOURS} selected={draft.weekly_hours ? [draft.weekly_hours] : []} onToggle={(v) => set("weekly_hours", v)} />
              </Field>
            </>
          )}

          {step === 4 && (
            <>
              <ReviewCard title="About you" onEdit={() => setStep(0)} rows={[
                ["Headline", draft.headline],
                ["Based in", draft.location || "—"],
                ["Experience", draft.experience_years],
              ]} />
              <ReviewCard title="What you'll teach" onEdit={() => setStep(1)} rows={[
                ["Subjects", draft.subjects.join(", ")],
                ["Learners", draft.levels.join(", ")],
                ["Formats", draft.formats.join(", ")],
              ]} />
              <ReviewCard title="Proof of expertise" onEdit={() => setStep(2)} rows={[
                ["Experience", draft.teaching_experience],
                ["LinkedIn", draft.linkedin_url || "—"],
                ["Portfolio", draft.portfolio_url || "—"],
                ["Intro video", draft.intro_video_url || "—"],
              ]} />
              <ReviewCard title="Your first class" onEdit={() => setStep(3)} rows={[
                ["Title", draft.sample_title],
                ["Outline", draft.sample_outline],
                ["Availability", `${draft.availability.join(", ")} · ${draft.weekly_hours}/week`],
              ]} />

              <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${draft.agreed ? "border-[#cc208f]/50 bg-[#cc208f]/[0.05]" : "border-border bg-card"}`}>
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition ${draft.agreed ? "border-transparent text-white" : "border-foreground/25"}`} style={draft.agreed ? { background: PINK } : undefined}>
                  {draft.agreed && <Check className="h-3.5 w-3.5" />}
                </span>
                <input type="checkbox" className="sr-only" checked={draft.agreed} onChange={(e) => set("agreed", e.target.checked)} />
                <span className="text-[13.5px] leading-relaxed text-foreground/90">
                  I confirm this information is accurate, and I agree to the Zero Club Tutor standards: teach original material,
                  treat every learner with respect, show up for sessions I schedule and keep learners' data private.
                </span>
              </label>
            </>
          )}
        </div>

        {error && <p className="mt-6 rounded-xl bg-rose-500/10 px-4 py-3 text-[13px] font-medium text-rose-600">{error}</p>}
      </main>

      <StickyFooter>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="h-12 rounded-full bg-foreground/[0.06] px-5 text-[14px] font-semibold text-foreground">
              Back
            </button>
          )}
          <button
            onClick={() => void next()}
            disabled={!valid || submitting}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white shadow-[0_12px_28px_-12px_rgba(204,32,143,0.8)] transition active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
            style={{ background: PINK }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {last ? "Submit for review" : "Continue"}
            {!last && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </StickyFooter>
    </Shell>
  );
}

function Field({ label, hint, optional, children }: { label: string; hint?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold text-foreground">{label}</span>
        {optional && <span className="text-[12px] text-muted-foreground">Optional</span>}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Counter({ value, max, min }: { value: string; max: number; min?: number }) {
  const n = value.trim().length;
  const short = min != null && n < min;
  return (
    <p className={`mt-1 text-right text-[11.5px] ${short ? "text-muted-foreground" : "text-emerald-600"}`}>
      {short ? `${min! - n} more characters` : `${n}/${max}`}
    </p>
  );
}

function Chips({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            aria-pressed={on}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[13.5px] font-medium transition active:scale-[0.97] ${
              on ? "border-transparent text-white shadow-[0_8px_18px_-10px_rgba(204,32,143,0.9)]" : "border-border bg-card text-foreground hover:border-foreground/25"
            }`}
            style={on ? { background: PINK } : undefined}
          >
            {on && <Check className="h-3.5 w-3.5" />}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function CustomChip({ onAdd }: { onAdd: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const add = () => {
    const v = value.trim();
    if (v.length >= 2) onAdd(v.slice(0, 40));
    setValue("");
    setOpen(false);
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-foreground/25 px-4 text-[13.5px] font-medium text-muted-foreground hover:text-foreground">
        <Plus className="h-4 w-4" /> Add another
      </button>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <input autoFocus className="zc-apply-input h-10 flex-1" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="e.g. Video editing" />
      <button type="button" onClick={add} className="h-10 rounded-full px-4 text-[13.5px] font-semibold text-white" style={{ background: PINK }}>Add</button>
      <button type="button" onClick={() => setOpen(false)} aria-label="Cancel" className="grid h-10 w-10 place-items-center rounded-full bg-foreground/[0.06]"><X className="h-4 w-4" /></button>
    </div>
  );
}

function UrlInput({ value, onChange, placeholder, icon }: { value: string; onChange: (v: string) => void; placeholder: string; icon?: ReactNode }) {
  const bad = !looksLikeUrl(value);
  return (
    <div>
      <div className={`zc-apply-input flex items-center gap-2 !py-0 ${bad ? "!border-rose-400" : ""}`}>
        <span className="text-muted-foreground">{icon || <Link2 className="h-4 w-4" />}</span>
        <input className="h-12 flex-1 bg-transparent outline-none" inputMode="url" autoCapitalize="none" autoCorrect="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
      {bad && <p className="mt-1 text-[12px] text-rose-600">That doesn't look like a link.</p>}
    </div>
  );
}

function ReviewCard({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
        <button onClick={onEdit} className="text-[13px] font-semibold" style={{ color: PINK }}>Edit</button>
      </div>
      <dl className="px-4 pb-3">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[96px_1fr] gap-3 border-t border-border/60 py-2.5 first:border-t-0">
            <dt className="text-[12.5px] text-muted-foreground">{k}</dt>
            <dd className="line-clamp-4 whitespace-pre-line break-words text-[13.5px] text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ── After submitting ────────────────────────────────────────────────── */

function PendingScreen({ application, onBack }: { application: TutorApplication; onBack: () => void }) {
  const submitted = new Date(application.created_at);
  const steps = [
    { title: "Application received", body: submitted.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }), done: true },
    { title: "In review", body: "The Zero Club team is looking at your experience and sample class.", active: true },
    { title: "Decision", body: "You'll get a notification as soon as it's made — usually within 48 hours." },
  ];
  return (
    <Shell>
      <TopBar onBack={onBack}><p className="text-[15px] font-semibold">Tutor application</p></TopBar>
      <main className="mx-auto w-full max-w-[680px] flex-1 px-4 pb-16 pt-8">
        <div className="flex flex-col items-center text-center">
          <ZeroLoader size={64} />
          <h1 className="mt-6 font-display text-[26px] font-bold leading-tight tracking-[-0.02em]">You're in the queue</h1>
          <p className="mt-2 max-w-[400px] text-[14.5px] leading-relaxed text-muted-foreground">
            Thanks for applying to teach on Zero Club. You can keep learning and building while we review it.
          </p>
        </div>
        <ol className="mx-auto mt-8 max-w-[440px] rounded-2xl border border-border bg-card p-5">
          {steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
              {i < steps.length - 1 && <span className="absolute left-[13px] top-8 h-[calc(100%-24px)] w-px bg-border" />}
              <span
                className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${s.done || s.active ? "" : "bg-foreground/15"}`}
                style={s.done || s.active ? { background: PINK } : undefined}
              >
                {s.done ? <Check className="h-4 w-4" /> : s.active ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : <span className="h-2 w-2 rounded-full bg-white/80" />}
              </span>
              <div className="pt-0.5">
                <p className="text-[14.5px] font-semibold text-foreground">{s.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mx-auto mt-4 max-w-[440px] rounded-2xl bg-foreground/[0.04] p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><BookOpen className="h-4 w-4" /> {application.sample_title}</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">{application.subjects.join(" · ")}</p>
        </div>
      </main>
    </Shell>
  );
}

function RejectedScreen({ application, onBack, onReapply }: { application: TutorApplication; onBack: () => void; onReapply: () => void }) {
  return (
    <Shell>
      <TopBar onBack={onBack}><p className="text-[15px] font-semibold">Tutor application</p></TopBar>
      <main className="mx-auto w-full max-w-[520px] flex-1 px-4 pb-32 pt-10 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-foreground/[0.06]"><GraduationCap className="h-7 w-7" /></span>
        <h1 className="mt-5 font-display text-[24px] font-bold leading-tight">Not approved this time</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
          The team reviewed your application and couldn't approve it yet. It's often about more proof of expertise or a clearer first class.
        </p>
        {application.review_note && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-left">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Note from the team</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-foreground">{application.review_note}</p>
          </div>
        )}
      </main>
      <StickyFooter>
        <button onClick={onReapply} className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white" style={{ background: PINK }}>
          Update and apply again <ArrowRight className="h-4 w-4" />
        </button>
      </StickyFooter>
    </Shell>
  );
}

function ApprovedScreen({ firstName, onBack }: { firstName: string; onBack: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useUser();
  const [switching, setSwitching] = useState(false);
  const inTutorMode = useMemo(() => String(profile?.account_type || "").toLowerCase() === "tutor", [profile?.account_type]);

  const go = async () => {
    if (!profile?.id) return;
    setSwitching(true);
    try {
      if (!inTutorMode) await switchMode(profile.id, "tutor");
      await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      navigate({ to: "/app/tutor-studio" });
    } catch (e) {
      toast.error((e as Error).message || "Couldn't switch to Tutor mode");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Shell>
      <TopBar onBack={onBack} />
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center px-4 pb-32 pt-10 text-center">
        <div className="relative grid h-28 w-28 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ background: PINK }} />
          <span className="relative grid h-24 w-24 place-items-center rounded-full text-white shadow-[0_20px_40px_-16px_rgba(204,32,143,0.9)]" style={{ background: PINK }}>
            <ZeroMark size={52} />
          </span>
          <span className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-card text-emerald-600 shadow ring-4 ring-canvas"><BadgeCheck className="h-6 w-6" /></span>
        </div>
        <h1 className="mt-7 font-display text-[28px] font-bold leading-tight tracking-[-0.02em]">You're a Zero Club Tutor, {firstName}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
          Your application was approved. Tutor Studio is open: create your first bootcamp, schedule live classes and meet your learners.
        </p>
      </main>
      <StickyFooter>
        <button onClick={() => void go()} disabled={switching} className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-white disabled:opacity-60" style={{ background: PINK }}>
          {switching && <Loader2 className="h-4 w-4 animate-spin" />}
          {inTutorMode ? "Open Tutor Studio" : "Switch to Tutor mode"}
        </button>
      </StickyFooter>
    </Shell>
  );
}
