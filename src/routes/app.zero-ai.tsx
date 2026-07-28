import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Brain, ChevronLeft, Code2, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/zero-ai")({
  component: ZeroAIPage,
});

const capabilities = [
  {
    Icon: Brain,
    title: "Learning support",
    description: "Explain lessons using the learner's bootcamp, curriculum, and current progress as context.",
  },
  {
    Icon: Code2,
    title: "Project guidance",
    description: "Help builders reason through projects while preserving ownership of the work they ship.",
  },
  {
    Icon: MessageSquare,
    title: "Tutor assistance",
    description: "Support curriculum planning, learner feedback, and structured knowledge interviews for tutors.",
  },
];

function ZeroAIPage() {
  return (
    <div className="min-h-screen bg-[#f8f7f5] text-foreground dark:bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[68px] w-full max-w-[1180px] items-center justify-between gap-4 px-4 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/app"
              aria-label="Back to feed"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card transition hover:bg-accent"
            >
              <ChevronLeft className="h-[18px] w-[18px]" />
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Zero Club intelligence</p>
              <h1 className="truncate font-display text-[18px] font-semibold tracking-tight">Zero AI</h1>
            </div>
          </div>
          <span className="rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-[10px] font-semibold text-primary">
            In development
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 py-7 md:px-7 md:py-10">
        <section className="grid overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <div className="flex flex-col justify-center px-6 py-10 sm:px-9 md:py-14 lg:px-12">
            <div className="grid h-12 w-12 place-items-center rounded-lg border border-primary/20 bg-primary/[0.07] text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Context-aware support</p>
            <h2 className="mt-3 max-w-[650px] font-display text-[36px] font-semibold leading-[1.08] tracking-tight sm:text-[42px]">
              Assistance grounded in the work happening on Zero Club.
            </h2>
            <p className="mt-5 max-w-[620px] text-[15px] leading-7 text-muted-foreground">
              Zero AI is being designed to understand bootcamps, projects, learning progress, and tutor workflows. It will help people move forward without replacing the proof, judgment, or human guidance that makes the platform valuable.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/app/bootcamps" className="inline-flex h-11 items-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background transition hover:opacity-90">
                Explore bootcamps <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/app" className="inline-flex h-11 items-center rounded-lg border border-border bg-background px-5 text-[13px] font-semibold transition hover:bg-accent">
                Return to feed
              </Link>
            </div>
          </div>

          <div className="border-t border-border bg-background/55 p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-5">
              <div>
                <h3 className="text-[16px] font-semibold tracking-tight">Capabilities in development</h3>
                <p className="mt-1 text-[12px] text-muted-foreground">Built around each role's real workflow.</p>
              </div>
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
            </div>

            <div className="divide-y divide-border">
              {capabilities.map(({ Icon, title, description }) => (
                <article key={title} className="flex gap-4 py-5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div>
                    <h4 className="text-[13.5px] font-semibold">{title}</h4>
                    <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">{description}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[0.045] p-4">
              <p className="text-[11.5px] leading-5 text-muted-foreground">
                Access will be introduced gradually. Tutor verification interviews and AI assistance remain unavailable until the underlying service is ready.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
