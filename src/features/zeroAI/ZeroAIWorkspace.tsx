import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Brain,
  Building2,
  ClipboardCheck,
  GraduationCap,
  Sparkles,
  ListChecks,
  Megaphone,
  Menu,
  Mic,
  Loader2,
  NotebookPen,
  Plus,
  Rocket,
  Target,
  Trash2,
  Users,
  X,
} from "@/components/icons/glyphs";
import { ZeroMark } from "@/components/ZeroLoader";
import { useUser } from "@/hooks/useUser";
import { isInstitution, modeOf } from "@/lib/modes";
import { useZeroGiftBalance } from "@/components/ZeroGiftPaymentOption";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { toast } from "sonner";
import { getCachedSession } from "@/lib/auth";
import { readAIStream } from "./stream";
import { useVoiceConversation } from "./useVoiceConversation";
import { ZeroAICalls } from "./ZeroAICalls";
import "./zero-ai.css";

/*
 * Zero AI — one workspace, shaped around who you are.
 *
 * The logo is the Zero Club mark: Zero AI is Zero Club's own assistant.
 * Each role (learner, tutor, creator, institution) gets its own greeting,
 * starters, "made for you" promises and shortcuts into the parts of Zero Club
 * it already uses.
 *
 * GPT replies are streamed through authenticated server routes. The API key
 * stays on the server; conversation history stays within this account/role.
 */

type Icon = ComponentType<{ className?: string }>;
type Starter = { title: string; hint: string; prompt: string; icon: Icon };
type RoleConfig = {
  label: string;
  icon: Icon;
  accent: string;
  eyebrow: string;
  heading: string;
  description: string;
  placeholder: string;
  starters: Starter[];
  promises: { title: string; body: string }[];
  shortcuts: { label: string; hint: string; to: string }[];
};

const roles: Record<"learner" | "tutor" | "creator" | "institution", RoleConfig> = {
  learner: {
    label: "Learner",
    icon: BookOpen,
    accent: "#cc208f",
    eyebrow: "Your learning companion",
    heading: "What would you like to understand today?",
    description: "Break down hard topics, plan steady progress and get honest feedback on your work.",
    placeholder: "Ask about a concept, paste a question from class, or describe a goal…",
    starters: [
      { title: "Make it click", hint: "A hard concept, explained simply", prompt: "Help me understand this concept step by step, with a simple real-world example: ", icon: Sparkles },
      { title: "Build a study plan", hint: "Steady progress around your week", prompt: "Build me a study plan. My goal is … I have … hours a week, and I'm starting from …", icon: ListChecks },
      { title: "Quiz me", hint: "One question at a time", prompt: "Quiz me on this topic one question at a time, and explain any mistakes I make: ", icon: Brain },
      { title: "Review my project", hint: "Clear next improvements", prompt: "Give me constructive feedback on my project. The goal was … and here is what I built: ", icon: Target },
    ],
    promises: [
      { title: "Explains at your level", body: "Plain language first, depth when you ask for it." },
      { title: "Keeps you on track", body: "Plans that fit your week and your bootcamp schedule." },
      { title: "Feedback, not answers", body: "Hints and reviews that help you learn, not copy." },
    ],
    shortcuts: [
      { label: "My bootcamps", hint: "Continue learning", to: "/app/bootcamps" },
      { label: "ZeroNotes", hint: "Notes from your tutors", to: "/app/notes" },
      { label: "Zero Games", hint: "Practise and compete", to: "/app/games" },
    ],
  },
  tutor: {
    label: "Tutor",
    icon: GraduationCap,
    accent: "#8b5cf6",
    eyebrow: "Your teaching assistant",
    heading: "What will you teach next?",
    description: "Plan lessons, build fair assessments and write feedback learners actually use.",
    placeholder: "Describe a lesson, a learner challenge, or an assessment you need…",
    starters: [
      { title: "Plan a lesson", hint: "From objective to activity", prompt: "Plan a lesson. Topic: … Learner level: … Duration: … Learning outcome: …", icon: NotebookPen },
      { title: "Create an assessment", hint: "With a marking rubric", prompt: "Draft an assessment and marking rubric for these learning objectives: ", icon: ClipboardCheck },
      { title: "Write better feedback", hint: "Specific and encouraging", prompt: "Help me write actionable, encouraging feedback on this anonymised learner submission: ", icon: Target },
      { title: "Design a bootcamp", hint: "A curriculum with purpose", prompt: "Outline a bootcamp. Audience: … Skills: … Duration: … Final project: …", icon: GraduationCap },
    ],
    promises: [
      { title: "Lesson-ready drafts", body: "Structure, activities and timings you can adjust." },
      { title: "Fair assessment", body: "Rubrics tied to the outcomes you set." },
      { title: "Your voice, faster", body: "Feedback drafts that sound like you." },
    ],
    shortcuts: [
      { label: "Tutor Studio", hint: "Your classes and learners", to: "/app/tutor-studio" },
      { label: "Clubs", hint: "Talk to your cohorts", to: "/app/clubs" },
      { label: "ZeroNotes", hint: "Publish class notes", to: "/app/notes" },
    ],
  },
  creator: {
    label: "Creator",
    icon: Rocket,
    accent: "#f97316",
    eyebrow: "Your creative partner",
    heading: "What are we building today?",
    description: "Shape ideas into briefs, plan content that helps people and launch with confidence.",
    placeholder: "Tell me about your idea, your audience, or your next launch…",
    starters: [
      { title: "Shape an idea", hint: "From a thought to a brief", prompt: "Shape this idea into a project brief with an audience, value proposition and first milestone: ", icon: Sparkles },
      { title: "Plan my content", hint: "Useful, consistent, yours", prompt: "Create a 4-week content plan for my community. Audience: … Topic: … Goal: …", icon: ListChecks },
      { title: "Prepare a launch", hint: "Checklist and announcement", prompt: "Plan a launch for this product, with a checklist and an announcement draft: ", icon: Megaphone },
      { title: "Grow my community", hint: "Reasons to come back", prompt: "Suggest activities for my community. We focus on … and members need help with …", icon: Users },
    ],
    promises: [
      { title: "Clarity before effort", body: "A sharp brief before you build anything." },
      { title: "Content with a plan", body: "Posts and sessions that build on each other." },
      { title: "Launches that land", body: "Checklists and words that get people moving." },
    ],
    shortcuts: [
      { label: "My Store", hint: "Products and sales", to: "/app/my-store" },
      { label: "Creator Workspace", hint: "Your creator tools", to: "/app/creator" },
      { label: "Metrics", hint: "What's working", to: "/app/metrics" },
    ],
  },
  institution: {
    label: "Institution",
    icon: Building2,
    accent: "#0ea5e9",
    eyebrow: "Your programme planner",
    heading: "How can your programmes do more?",
    description: "Design programmes, support your tutors and report progress with clarity.",
    placeholder: "Describe a programme, a cohort goal, or a report you need to write…",
    starters: [
      { title: "Design a programme", hint: "Teaching tied to outcomes", prompt: "Design a learning programme. Audience: … Outcomes: … Timeline: … Resources: …", icon: Target },
      { title: "Reflect on a cohort", hint: "From summary to next steps", prompt: "Review this anonymised cohort summary. Suggest support actions and separate evidence from assumptions: ", icon: Users },
      { title: "Support my tutors", hint: "Make great teaching repeatable", prompt: "Create a tutor onboarding checklist and support plan for this programme: ", icon: ClipboardCheck },
      { title: "Draft a report", hint: "Progress, clearly told", prompt: "Structure a programme progress report from these aggregate results and observations: ", icon: BarChart3 },
    ],
    promises: [
      { title: "Outcome-first design", body: "Programmes built backwards from results." },
      { title: "Evidence, not guesses", body: "Clear lines between data and assumptions." },
      { title: "Reports in minutes", body: "Structure for stakeholders and partners." },
    ],
    shortcuts: [
      { label: "Digital Hub", hint: "Your institution studio", to: "/app/institution-studio" },
      { label: "Bootcamps", hint: "Programmes and cohorts", to: "/app/bootcamps" },
      { label: "Metrics", hint: "Reach and results", to: "/app/metrics" },
    ],
  },
};

type Mode = keyof typeof roles;
type ChatMessage = { role: "user" | "assistant"; content: string };
type Draft = { id: string; mode: Mode; text: string; updatedAt: number; messages?: ChatMessage[] };
const MODES = Object.keys(roles) as Mode[];
const isMode = (value: string): value is Mode => Object.prototype.hasOwnProperty.call(roles, value);

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function timeAgo(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ZeroAIWorkspace() {
  const { data: profile, isLoading } = useUser();
  if (isLoading || !profile?.id)
    return (
      <div className="grid min-h-[60dvh] place-items-center" role="status">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <ZeroMark size={36} className="zero-ai-pulse text-[#cc208f]" />
          <span className="text-sm">Opening Zero AI…</span>
        </div>
      </div>
    );
  const own: Mode = isInstitution(profile) ? "institution" : modeOf(profile) || "learner";
  return (
    <Workspace
      key={`${profile.id}:${own}`}
      userId={profile.id}
      name={String(profile.full_name || profile.username || "").split(" ")[0]}
      avatar={profile.avatar_url || null}
      ownMode={own}
    />
  );
}

function Workspace({ userId, name, avatar, ownMode }: { userId: string; name: string; avatar: string | null; ownMode: Mode }) {
  const mode = ownMode;
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const voice = useVoiceConversation();
  const input = useRef<HTMLTextAreaElement>(null);
  const { available } = useZeroGiftBalance("zero-ai");
  const { format } = useWalletCurrency();
  const storageKey = `zc-zero-ai-drafts:${userId}:${ownMode}`;
  const role = roles[mode];
  const RoleIcon = role.icon;
  const hello = useMemo(greeting, []);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: "nearest" }); }, [messages]);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem(`zc-zero-ai-drafts:${userId}`) || "[]");
      if (Array.isArray(saved))
        setDrafts(
          saved
            .filter((d): d is Draft => d && typeof d.id === "string" && typeof d.text === "string" && typeof d.mode === "string" && isMode(d.mode) && d.mode === ownMode && Number.isFinite(d.updatedAt))
            .slice(0, 50),
        );
    } catch {
      toast.error("Chats could not be loaded on this device.");
    }
  }, [storageKey, ownMode, userId]);

  function persist(next: Draft[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setDrafts(next);
      return true;
    } catch {
      toast.error("Your device could not save this chat. Copy your conversation before leaving.");
      return false;
    }
  }
  async function send() {
    if (!text.trim() || pending.current || voice.status !== "idle") return;
    const prompt = text.trim();
    const context = [...messages, { role: "user" as const, content: prompt }].slice(-23);
    const id = selected || crypto.randomUUID();
    const abort = new AbortController();
    pending.current = abort;
    setSending(true);
    setChatError("");
    setText("");
    setMessages([...context, { role: "assistant", content: "" }]);
    let reply = "";
    let completed = false;
    try {
      const { data: { session } } = await getCachedSession();
      if (!session) throw new Error("Please sign in to use Zero AI.");
      const response = await fetch("/api/zero-ai/chat", {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: context }), signal: abort.signal,
      });
      await readAIStream(response, (delta) => {
        reply += delta;
        setMessages([...context, { role: "assistant", content: reply }]);
      });
      if (!reply.trim()) throw new Error("Zero AI returned an empty reply. Please try again.");
      completed = true;
    } catch (error) {
      if (!abort.signal.aborted) setChatError(error instanceof Error ? error.message : "Couldn't send your message. Please try again.");
    } finally {
      if (completed || (abort.signal.aborted && reply.trim())) {
        const draft: Draft = { id, mode, text: drafts.find((d) => d.id === id)?.text || prompt, updatedAt: Date.now(), messages: [...context, { role: "assistant", content: reply }] };
        if (persist([draft, ...drafts.filter((d) => d.id !== id)].slice(0, 50))) setSelected(id);
      } else {
        setMessages(messages);
        setText(prompt);
      }
      if (pending.current === abort) pending.current = null;
      setSending(false);
    }
  }
  function fresh() {
    if (pending.current || voice.status !== "idle") return;
    setSelected(null);
    setMessages([]);
    setChatError("");
    setText("");
    setHistoryOpen(false);
    requestAnimationFrame(() => input.current?.focus());
  }
  function applyStarter(prompt: string) {
    if (pending.current) return;
    setText(prompt);
    setSelected(null);
    setMessages([]);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prompt.length, prompt.length);
    });
  }

  const history = (
    <div className="space-y-1">
      {drafts.length ? (
        drafts.map((d) => {
          const DraftIcon = roles[d.mode].icon;
          return (
            <div key={d.id} className={`group flex items-center rounded-xl transition ${selected === d.id ? "bg-[#cc208f]/[0.08]" : "hover:bg-foreground/[0.04]"}`}>
              <button
                disabled={sending || voice.status !== "idle"}
                onClick={() => {
                  setSelected(d.id);
                  const history = Array.isArray(d.messages) ? d.messages.filter((message) => message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.length <= 12000).slice(-24) : [];
                  setMessages(history);
                  setText(history.length ? "" : d.text);
                  setChatError("");
                  setHistoryOpen(false);
                }}
                className="flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2.5 text-left"
              >
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ background: `${roles[d.mode].accent}18`, color: roles[d.mode].accent }}>
                  <DraftIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">{d.text}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{roles[d.mode].label} · {timeAgo(d.updatedAt)}</span>
                </span>
              </button>
              <button
                aria-label={`Delete chat: ${d.text.slice(0, 30)}`}
                disabled={sending || voice.status !== "idle"}
                onClick={() => { if (persist(drafts.filter((item) => item.id !== d.id)) && selected === d.id) fresh(); }}
                className="mr-1 rounded-lg p-2 text-muted-foreground opacity-60 transition hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })
      ) : (
        <div className="rounded-xl border border-dashed border-border px-3 py-5 text-center">
          <p className="text-[12.5px] font-medium">No chats yet</p>
          <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">Your conversations appear here, on this device.</p>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="zero-ai-workspace relative flex min-h-[calc(100dvh-env(safe-area-inset-top))] w-full min-w-0 overflow-hidden bg-background text-foreground"
      style={{ ["--zai-accent" as string]: role.accent }}
    >
      {/* Ambient brand light, tinted by the role in use. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="zero-ai-glow absolute left-1/2 top-[-260px] h-[560px] w-[860px] -translate-x-1/2 rounded-full opacity-[0.16] blur-3xl dark:opacity-[0.22]" style={{ background: `radial-gradient(closest-side, ${role.accent}, transparent)` }} />
        <ZeroMark size={520} className="absolute -right-40 -top-32 rotate-12 text-foreground opacity-[0.025] dark:opacity-[0.04]" />
      </div>

      {/* ── Chats (desktop) ── */}
      <aside className="zero-ai-history relative z-10 hidden w-[264px] shrink-0 flex-col border-r border-border/70 bg-background/80 p-4 backdrop-blur-xl xl:flex" aria-label="Chats">
        <div className="mb-5 flex items-center gap-2.5 px-1">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#cc208f] to-[#7a1e66] text-white shadow-[0_8px_24px_-10px_rgba(204,32,143,0.8)]">
            <ZeroMark size={20} />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight">Zero AI</span>
            <span className="block text-[11px] text-muted-foreground">by Zero Club</span>
          </span>
        </div>
        <button onClick={fresh} className="mb-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground text-[13.5px] font-semibold text-background transition hover:opacity-90 active:scale-[0.99]">
          <Plus className="h-4 w-4" /> New chat
        </button>
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Chats</p>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{history}</div>
        <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
          <Link to="/app" className="flex items-center gap-2 px-1 text-[12.5px] text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Zero Club
          </Link>
          <div className="flex items-center gap-2.5 rounded-xl bg-foreground/[0.03] p-2.5">
            {avatar ? <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" /> : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#cc208f]/10 text-[13px] font-bold text-[#cc208f]">{(name || "Z")[0].toUpperCase()}</span>
            )}
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-semibold">{name || "Your workspace"}</span>
              <span className="block text-[11px] text-muted-foreground">{roles[ownMode].label} workspace</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* ── Top bar ── */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              aria-label="Chats"
              aria-expanded={historyOpen}
              className="zero-ai-history-toggle rounded-xl p-2 transition hover:bg-foreground/5 xl:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="flex items-center gap-2 xl:hidden">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#cc208f] to-[#7a1e66] text-white"><ZeroMark size={17} /></span>
              <span className="text-[16px] font-bold tracking-tight">Zero AI</span>
            </span>
            <span className="rounded-full border border-[#cc208f]/25 bg-[#cc208f]/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cc208f]">GPT</span>
          </div>
          <button onClick={fresh} aria-label="New chat" title="New chat" className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 text-[12.5px] font-semibold backdrop-blur transition hover:bg-foreground/5">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New</span>
          </button>
        </header>

        {historyOpen && (
          <section className="zero-ai-mobile-history mx-4 mb-4 rounded-2xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur-xl xl:hidden" aria-label="Chats">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Chats</p>
              <button aria-label="Close chats" onClick={() => setHistoryOpen(false)} className="rounded-lg p-1.5 hover:bg-foreground/5"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-72 overflow-y-auto">{history}</div>
            <Link to="/app" className="mt-2 flex items-center gap-2 px-1 py-1 text-[12.5px] text-muted-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Back to Zero Club</Link>
          </section>
        )}

        <main className="zero-ai-main mx-auto flex w-full min-w-0 max-w-[880px] flex-1 flex-col px-4 pb-12 pt-4 sm:px-8 sm:pt-8">
          {/* ── Hero ── */}
          <div className="text-center">
            <div className="relative mx-auto mb-6 h-[76px] w-[76px]">
              <div aria-hidden className="zero-ai-halo absolute inset-[-14px] rounded-[30px] opacity-70 blur-xl" style={{ background: `conic-gradient(from 120deg, #cc208f, ${role.accent}, #7a1e66, #cc208f)` }} />
              <div className="relative grid h-full w-full place-items-center rounded-[24px] bg-gradient-to-br from-[#cc208f] via-[#a3197a] to-[#4c0f3f] text-white shadow-[0_20px_44px_-18px_rgba(204,32,143,0.9)] ring-1 ring-white/20">
                <ZeroMark size={40} />
              </div>
            </div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em]" style={{ color: role.accent }}>{role.eyebrow}</p>
            <h1 className="mx-auto mt-3 max-w-[640px] font-display text-[28px] font-bold leading-[1.12] tracking-[-0.02em] sm:text-[40px]">
              {hello}{name ? `, ${name}` : ""}.
              <span className="block text-foreground/70">{role.heading}</span>
            </h1>
            <p className="mx-auto mt-3 max-w-[520px] text-[14.5px] leading-6 text-muted-foreground">{role.description}</p>
          </div>

          {/* Account workspace */}
          <div className="mt-7 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-foreground/5 px-4 py-2 text-sm font-semibold">
              <RoleIcon className="h-4 w-4" />{role.label} workspace
            </span>
          </div>

          {messages.length > 0 && (
            <section className="mt-6 space-y-5" aria-label="Conversation with Zero AI" aria-live="polite" aria-busy={sending}>
              {messages.map((message, index) => (
                <article key={index} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-2xl bg-foreground/[0.06] px-4 py-3" : "px-1 py-2"}>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{message.role === "user" ? "You" : "Zero AI"}</p>
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-7 [overflow-wrap:anywhere]">{message.content || (sending ? "Thinking…" : "")}</p>
                </article>
              ))}
              <div ref={transcriptEnd} />
            </section>
          )}
          {chatError && <p role="alert" className="mt-4 text-sm text-destructive">{chatError} Your message is below so you can retry.</p>}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {voice.status === "idle" ? (
              <button type="button" disabled={sending} onClick={() => void voice.start()} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40"><Mic className="h-4 w-4" /> Talk to Zero AI</button>
            ) : (
              <>
                <span role="status" className="text-sm text-muted-foreground">{voice.status === "connecting" ? "Connecting…" : "Voice connected"}</span>
                {voice.status === "connected" && <button onClick={voice.toggleMute} className="rounded-full border border-border px-3 py-2 text-sm">{voice.muted ? "Unmute" : "Mute"}</button>}
                <button onClick={voice.stop} className="rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-white">End voice chat</button>
              </>
            )}
          </div>
          {voice.error && <div role="alert" className="mt-2 text-center text-sm text-destructive">{voice.error}{voice.status !== "idle" && <button onClick={voice.enableAudio} className="ml-2 underline">Enable audio</button>}</div>}
          <ZeroAICalls userId={userId} />

          {/* Composer */}
          <form
            onSubmit={(event) => { event.preventDefault(); void send(); }}
            className="zero-ai-composer group relative mt-6 rounded-[26px] p-[1.5px]"
          >
            <div className="rounded-[25px] bg-card p-3 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.45)]">
              <label htmlFor="zero-ai-prompt" className="sr-only">Your {role.label.toLowerCase()} prompt</label>
              <textarea
                id="zero-ai-prompt"
                ref={input}
                value={text}
                disabled={sending || voice.status !== "idle"}
                maxLength={12000}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }}
                placeholder={role.placeholder}
                rows={4}
                className="max-h-72 min-h-[116px] w-full resize-none bg-transparent px-2 py-2 text-[16px] leading-7 outline-none placeholder:text-muted-foreground/70"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-1 pt-3">
                <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold" style={{ background: `${role.accent}14`, color: role.accent }}>
                    <RoleIcon className="h-3.5 w-3.5" /> {role.label}
                  </span>
                  <span className="hidden tabular-nums sm:inline">{text.length ? `${text.length.toLocaleString()} characters` : "Ctrl + Enter to send"}</span>
                </span>
                <button
                  type={sending ? "button" : "submit"}
                  onClick={sending ? () => pending.current?.abort() : undefined}
                  disabled={!sending && (!text.trim() || voice.status !== "idle")}
                  className="flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-[#cc208f] to-[#e0458f] px-5 text-[13px] font-bold text-white shadow-[0_10px_24px_-12px_rgba(204,32,143,0.9)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-35 disabled:shadow-none"
                >
                  {sending ? <>Stop reply <Loader2 className="h-4 w-4 animate-spin" /></> : <>Send <ArrowUpRight className="h-4 w-4" /></>}
                </button>
              </div>
            </div>
          </form>
          <p role="status" className="mt-3 flex items-center justify-center gap-2 text-center text-[12px] text-muted-foreground">
            Chats are saved on this device. Zero AI can make mistakes; check important answers.
          </p>

          {/* ── Starters ── */}
          <section className="mt-9" aria-labelledby="zai-starters">
            <div className="mb-3 flex items-end justify-between">
              <h2 id="zai-starters" className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Start with</h2>
              <span className="text-[12px] text-muted-foreground">Tap to use</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {role.starters.map(({ title, hint, prompt, icon: StarterIcon }) => (
                <button
                  key={title}
                  onClick={() => applyStarter(prompt)}
                  className="group relative flex items-start gap-3.5 overflow-hidden rounded-2xl border border-border bg-card/80 p-4 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_18px_40px_-28px_rgba(0,0,0,0.5)]"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition group-hover:scale-105" style={{ background: `${role.accent}14`, color: role.accent }}>
                    <StarterIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold">{title}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-5 text-muted-foreground">{hint}</span>
                  </span>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </button>
              ))}
            </div>
          </section>

          {/* ── Made for you + shortcuts ── */}
          <section className="mt-6 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card/80 p-5">
              <div aria-hidden className="absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-20 blur-2xl" style={{ background: role.accent }} />
              <p className="relative text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: role.accent }}>Made for {role.label.toLowerCase()}s</p>
              <ul className="relative mt-3 space-y-3">
                {role.promises.map((item, i) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: role.accent }}>{i + 1}</span>
                    <span>
                      <span className="block text-[14px] font-semibold">{item.title}</span>
                      <span className="block text-[12.5px] leading-5 text-muted-foreground">{item.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card/80 p-2">
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your Zero Club</p>
              {role.shortcuts.map((item) => (
                <Link key={item.to + item.label} to={item.to as any} className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-foreground/[0.04]">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold">{item.label}</span>
                    <span className="block text-[12px] text-muted-foreground">{item.hint}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          </section>

          {available > 0 && (
            <p className="mt-6 rounded-xl bg-[#cc208f]/[0.06] px-4 py-3 text-center text-[12.5px] leading-5 text-foreground/80">
              Your {format(available)} in Zero AI cards is reserved for paid tools. Chat does not spend your cards.
            </p>
          )}
          <p className="mt-8 text-center text-[11.5px] leading-5 text-muted-foreground/80">
            Zero AI by Zero Club · Your courses, files and learner records are not connected yet.
          </p>
        </main>
      </div>
    </div>
  );
}
