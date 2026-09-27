import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Gift, Sparkles } from "@/components/icons/glyphs";
import { useZeroGiftBalance } from "@/components/ZeroGiftPaymentOption";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

export const Route = createFileRoute("/app/zero-ai")({
  component: ZeroAIPage,
});

const roles = [
  {
    index: "01",
    audience: "For learners",
    title: "Learning support",
    description:
      "Explanations grounded in your bootcamp, curriculum, and current progress — not generic answers. Zero AI meets you exactly where you are in the material.",
  },
  {
    index: "02",
    audience: "For tutors",
    title: "Teaching leverage",
    description:
      "Support for curriculum planning, learner feedback, and structured knowledge interviews, so tutors spend their time on the judgment only they can provide.",
  },
  {
    index: "03",
    audience: "For institutions",
    title: "Program insight",
    description:
      "A clear view of cohort progress and program quality, built on the same context that powers learning support — never on surveillance.",
  },
];

const principles = [
  "Grounded in real work happening on Zero Club",
  "Assists judgment, never replaces it",
  "Ownership of shipped work stays with the builder",
];

function ZeroAIPage() {
  const { available } = useZeroGiftBalance("zero-ai");
  const { format } = useWalletCurrency();

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-[680px] items-center gap-2 px-2">
          <Link to="/app" aria-label="Back to feed" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </Link>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white" style={{ background: "linear-gradient(135deg,#cc208f,#6b2a8f)" }}>
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-semibold leading-tight">Zero AI</h1>
            <p className="text-[12px] text-muted-foreground">Your study and build buddy</p>
          </div>
          <span className="mr-1 shrink-0 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">In development</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        {available > 0 && (
          <section className="flex items-start gap-3 bg-card p-4 md:rounded-xl md:border md:border-border">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#cc208f]/10 text-[#cc208f]"><Gift className="h-5 w-5" /></span>
            <div>
              <p className="text-[15px] font-semibold">You have {format(available)} in Zero AI cards</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">It's kept for you and can be applied when paid Zero AI tools launch.</p>
            </div>
          </section>
        )}

        <section className="bg-card px-5 py-8 md:rounded-xl md:border md:border-border">
          <p className="text-[12px] font-semibold text-[#a3186f]">Zero Club intelligence</p>
          <h2 className="mt-2 font-display text-[28px] font-semibold leading-[1.12] tracking-[-0.02em]">
            Help grounded in your work, not the hype.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Zero AI is being built around your bootcamps, projects, progress and tutors. It will help you move forward without replacing the proof, judgement or human guidance that make Zero Club valuable.
          </p>

          {/* What it will do, shaped like the prompts it will answer, but
              clearly not pressable yet. */}
          <p className="mt-6 text-[13px] font-semibold text-muted-foreground">Coming to Zero AI</p>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {[
              ["Explain this lesson", "In the context of your bootcamp"],
              ["Review my ship", "Feedback before you publish"],
              ["Quiz me", "On what you just learned"],
              ["Plan my week", "Around your cohort's schedule"],
            ].map(([title, hint]) => (
              <div key={title} className="rounded-xl border border-foreground/12 p-3 text-[14px] leading-snug">
                <p className="font-semibold">{title}</p>
                <p className="mt-0.5 text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link to="/app/bootcamps" className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background transition hover:opacity-90">
              Explore bootcamps <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/app" className="inline-flex h-11 items-center rounded-full px-4 text-[15px] font-semibold text-muted-foreground hover:text-foreground">
              Back to feed
            </Link>
          </div>
        </section>

        <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
          <h2 className="px-4 pb-2 pt-4 font-display text-[18px] font-semibold">Who it's for</h2>
          {roles.map(({ audience, title, description }) => (
            <article key={title} className="border-t border-border/60 px-4 py-3.5">
              <p className="text-[12px] font-semibold text-[#a3186f]">{audience}</p>
              <h3 className="mt-0.5 text-[16px] font-semibold">{title}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{description}</p>
            </article>
          ))}
        </section>

        <section className="flex-1 bg-card px-4 pb-28 pt-4 md:flex-none md:rounded-xl md:border md:border-border md:pb-5">
          <h2 className="font-display text-[18px] font-semibold">Built deliberately, shipped carefully</h2>
          <ul className="mt-3 grid gap-2.5 text-[14px]">
            {principles.map((principle) => (
              <li key={principle} className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#1a7f4b]" />
                {principle}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            Access will open gradually. Tutor verification interviews and AI assistance stay off until the service meets our bar for accuracy and reliability.
          </p>
        </section>
      </main>
    </div>
  );
}
