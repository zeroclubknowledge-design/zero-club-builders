import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Building2,
  GraduationCap,
  Menu,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  X,
} from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { useZeroGiftBalance } from "@/components/ZeroGiftPaymentOption";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { toast } from "sonner";
import "./zero-ai.css";

const modes = {
  learner: {
    label: "Learner",
    icon: BookOpen,
    heading: "What would you like to understand?",
    description: "A little clarity. A better plan. Your next breakthrough.",
    placeholder: "Bring a question, a tricky concept, or a learning goal…",
    prompts: [
      [
        "Make it click",
        "Explain a difficult concept",
        "Help me understand this concept step by step, with a simple example: ",
      ],
      [
        "Build a study plan",
        "Make room for steady progress",
        "Help me build a study plan. My goal is… My available time is…",
      ],
      [
        "Test my understanding",
        "Practice with a short quiz",
        "Quiz me on this topic, one question at a time, and explain my mistakes: ",
      ],
      [
        "Review my work",
        "Find your next improvement",
        "Give constructive feedback on my project. Here is the goal and what I have built: ",
      ],
    ],
  },
  tutor: {
    label: "Tutor",
    icon: GraduationCap,
    heading: "What will you teach next?",
    description: "Turn your expertise into lessons that stay with people.",
    placeholder: "Describe a lesson, a learner challenge, or an assessment…",
    prompts: [
      [
        "Plan a lesson",
        "From objective to activity",
        "Plan a lesson. Topic: … Learner level: … Duration: … Learning outcome: …",
      ],
      [
        "Create an assessment",
        "Reveal what learners understand",
        "Draft an assessment and marking rubric for these learning objectives: ",
      ],
      [
        "Give better feedback",
        "Clear, specific, and encouraging",
        "Help me write actionable feedback on this anonymized learner submission: ",
      ],
      [
        "Design a bootcamp",
        "Build a curriculum with purpose",
        "Outline a bootcamp. Audience: … Skills: … Duration: … Final project: …",
      ],
    ],
  },
  creator: {
    label: "Creator",
    icon: Rocket,
    heading: "What are we building today?",
    description: "Give your next idea a clear direction and a first step.",
    placeholder: "Tell me about your idea, audience, or next launch…",
    prompts: [
      [
        "Shape an idea",
        "Turn a thought into a brief",
        "Shape this idea into a project brief with an audience, value proposition, and first milestone: ",
      ],
      [
        "Plan my content",
        "Show up with something useful",
        "Create a content plan for my community. Audience: … Topic: … Goal: …",
      ],
      [
        "Prepare a launch",
        "From building to sharing",
        "Plan a launch for this project, with a checklist and announcement draft: ",
      ],
      [
        "Grow my community",
        "Create reasons to come back",
        "Suggest activities for my community. We focus on… Members need help with…",
      ],
    ],
  },
  institution: {
    label: "Institution",
    icon: Building2,
    heading: "How can your programs do more?",
    description: "Thoughtful planning for your learners, teams, and programs.",
    placeholder: "Describe a program, a cohort goal, or a planning task…",
    prompts: [
      [
        "Design a program",
        "Connect teaching to outcomes",
        "Design a learning program. Audience: … Outcomes: … Timeline: … Resources: …",
      ],
      [
        "Reflect on a cohort",
        "Turn a summary into next steps",
        "Review this anonymized cohort summary. Suggest support actions and separate evidence from assumptions: ",
      ],
      [
        "Support my tutors",
        "Make great teaching repeatable",
        "Create a tutor onboarding checklist and support plan for this program: ",
      ],
      [
        "Draft a report",
        "Communicate progress clearly",
        "Structure a program progress report from these aggregate results and observations: ",
      ],
    ],
  },
} as const;
type Mode = keyof typeof modes;
type Draft = { id: string; mode: Mode; text: string; updatedAt: number };
const isMode = (value: string): value is Mode => Object.prototype.hasOwnProperty.call(modes, value);

export function ZeroAIWorkspace() {
  const { data: profile, isLoading } = useUser();
  if (isLoading || !profile?.id)
    return (
      <div className="grid min-h-[60dvh] place-items-center text-muted-foreground" role="status">
        Loading your workspace…
      </div>
    );
  const account = String(profile.account_type || "learner").toLowerCase();
  return (
    <Workspace
      key={profile.id}
      userId={profile.id}
      name={String(profile.full_name || profile.username || "").split(" ")[0]}
      initialMode={isMode(account) ? account : "learner"}
    />
  );
}

function Workspace({
  userId,
  name,
  initialMode,
}: {
  userId: string;
  name: string;
  initialMode: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const { available } = useZeroGiftBalance("zero-ai");
  const { format } = useWalletCurrency();
  const storageKey = `zc-zero-ai-drafts:${userId}`;
  const current = modes[mode];
  const Icon = current.icon;
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved))
        setDrafts(
          saved
            .filter(
              (d): d is Draft =>
                d &&
                typeof d.id === "string" &&
                typeof d.text === "string" &&
                typeof d.mode === "string" &&
                isMode(d.mode) &&
                Number.isFinite(d.updatedAt),
            )
            .slice(0, 50),
        );
    } catch {
      toast.error("Saved prompts could not be loaded on this device.");
    }
  }, [storageKey]);
  function persist(next: Draft[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setDrafts(next);
      return true;
    } catch {
      toast.error("Your device could not save this prompt. Copy your text before leaving.");
      return false;
    }
  }
  function save() {
    if (!text.trim()) return;
    const draft = {
      id: selected || crypto.randomUUID(),
      mode,
      text: text.trim(),
      updatedAt: Date.now(),
    };
    if (persist([draft, ...drafts.filter((d) => d.id !== draft.id)].slice(0, 50))) {
      setSelected(draft.id);
      toast.success("Prompt saved on this device. AI replies are not available yet.");
    }
  }
  function fresh() {
    setSelected(null);
    setText("");
    setHistoryOpen(false);
    input.current?.focus();
  }
  const history = (
    <>
      <p className="mb-3 px-2 text-xs font-semibold text-muted-foreground">Saved on this device</p>
      {drafts.length ? (
        drafts.map((d) => (
          <div
            key={d.id}
            className={`flex items-center rounded-lg ${selected === d.id ? "bg-foreground/5" : "hover:bg-foreground/5"}`}
          >
            <button
              onClick={() => {
                setSelected(d.id);
                setMode(d.mode);
                setText(d.text);
                setHistoryOpen(false);
              }}
              className="min-w-0 flex-1 truncate px-2 py-3 text-left text-sm"
            >
              {d.text}
            </button>
            <button
              aria-label={`Delete prompt: ${d.text.slice(0, 30)}`}
              onClick={() => {
                if (persist(drafts.filter((item) => item.id !== d.id)) && selected === d.id)
                  setSelected(null);
              }}
              className="rounded-lg p-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))
      ) : (
        <p className="px-2 text-xs leading-5 text-muted-foreground">
          Your saved prompts will appear here.
        </p>
      )}
    </>
  );
  return (
    <div className="zero-ai-workspace relative flex min-h-[calc(100dvh-env(safe-area-inset-top))] w-full min-w-0 bg-card text-foreground">
      <aside
        className="zero-ai-history hidden w-56 shrink-0 flex-col border-r border-border bg-background/70 p-3 xl:flex"
        aria-label="Saved prompts"
      >
        <Link
          to="/app"
          className="mb-6 flex h-10 items-center gap-2 px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Zero Club
        </Link>
        <button
          onClick={fresh}
          className="mb-8 flex h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold hover:bg-foreground/5"
        >
          <Plus className="h-4 w-4" /> New prompt
        </button>
        <div className="flex-1">{history}</div>
        <div className="mt-8 border-t border-border px-2 pt-4">
          <p className="text-sm font-semibold">{name || "Your workspace"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{current.label} workspace</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              aria-label="Toggle saved prompts"
              aria-expanded={historyOpen}
              className="zero-ai-history-toggle rounded-lg p-2 hover:bg-foreground/5 xl:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-lg font-semibold tracking-tight">
              Zero AI
              <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Preview
              </span>
            </span>
          </div>
          <button
            onClick={fresh}
            aria-label="New prompt"
            title="New prompt"
            className="rounded-full p-2.5 hover:bg-foreground/5"
          >
            <Plus className="h-5 w-5" />
          </button>
        </header>
        {historyOpen && (
          <section
            className="zero-ai-mobile-history mx-4 mb-4 rounded-xl border border-border bg-background p-3 xl:hidden"
            aria-label="Saved prompts"
          >
            <div className="flex items-center justify-between">
              <Link to="/app" className="text-xs text-muted-foreground">
                ← Back to Zero Club
              </Link>
              <button
                aria-label="Close saved prompts"
                onClick={() => setHistoryOpen(false)}
                className="p-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto">{history}</div>
          </section>
        )}
        <main className="zero-ai-main mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col justify-center px-4 pb-8 pt-8 sm:px-8 sm:pt-12">
          <div className="mb-8 text-center">
            <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[#cc208f]/10 text-[#cc208f]">
              <Sparkles className="h-6 w-6" />
            </span>
            <p className="mb-2 text-sm text-muted-foreground">
              A space for your next step{name ? `, ${name}` : ""}.
            </p>
            <h1 className="font-display text-[28px] font-medium leading-tight tracking-tight sm:text-[36px]">
              {current.heading}
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              {current.description}
            </p>
          </div>
          <div
            className="mb-6 flex flex-wrap justify-center gap-1.5"
            aria-label="Choose your workspace"
          >
            {(Object.keys(modes) as Mode[]).map((value) => {
              const RoleIcon = modes[value].icon;
              return (
                <button
                  key={value}
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition ${mode === value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-foreground/5"}`}
                >
                  <RoleIcon className="h-4 w-4" />
                  {modes[value].label}
                </button>
              );
            })}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
            className="rounded-[24px] border border-foreground/15 bg-background/60 p-3 shadow-sm focus-within:border-[#cc208f]/40 focus-within:ring-2 focus-within:ring-[#cc208f]/5"
          >
            <label htmlFor="zero-ai-prompt" className="sr-only">
              Your {current.label.toLowerCase()} prompt
            </label>
            <textarea
              id="zero-ai-prompt"
              ref={input}
              value={text}
              maxLength={12000}
              onChange={(event) => setText(event.target.value)}
              placeholder={current.placeholder}
              rows={4}
              className="max-h-64 min-h-28 w-full resize-y bg-transparent px-2 py-2 text-[16px] leading-7 outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                <Icon className="h-4 w-4" />
                {current.label} mode
              </span>
              <button
                type="submit"
                disabled={!text.trim()}
                className="flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-xs font-semibold text-background transition hover:opacity-85 disabled:opacity-30"
              >
                Save prompt <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </form>
          <p role="status" className="mt-3 text-center text-xs leading-5 text-muted-foreground">
            AI replies are coming soon. Prompts are saved only on this device.
          </p>
          <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {current.prompts.map(([title, hint, prompt]) => (
              <button
                key={title}
                onClick={() => {
                  setText(prompt);
                  setSelected(null);
                  input.current?.focus();
                }}
                className="group flex items-start gap-3 rounded-2xl border border-border px-4 py-4 text-left transition hover:border-foreground/20 hover:bg-foreground/[0.025]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{hint}</span>
                </span>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-foreground" />
              </button>
            ))}
          </div>
          {available > 0 && (
            <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
              Your {format(available)} in Zero AI cards is reserved for paid tools when they launch.
              Saving prompts is free.
            </p>
          )}
          <p className="mt-8 text-center text-[11px] leading-5 text-muted-foreground/75">
            Built around your goals. Your courses, files, and learner records are not connected yet.
          </p>
        </main>
      </div>
    </div>
  );
}
