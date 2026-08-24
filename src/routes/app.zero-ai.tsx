import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, Gift } from "@/components/icons/solar";
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[68px] w-full max-w-[1080px] items-center justify-between gap-4 px-5 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/app"
              aria-label="Back to feed"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card transition hover:bg-accent"
            >
              <ChevronLeft className="h-[18px] w-[18px]" />
            </Link>
            <h1 className="truncate font-display text-[17px] font-semibold tracking-tight">Zero AI</h1>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            In development
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] px-5 pb-24 md:px-8">
        {available > 0 && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Gift className="h-4 w-4" /></div>
            <div>
              <p className="text-[13px] font-semibold">You have {format(available)} in Zero AI gifts</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">Your balance is reserved and will be available through “Apply Zero Gift” when paid Zero AI tools launch.</p>
            </div>
          </div>
        )}
        <section className="py-16 md:py-24">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-primary">
            Zero Club intelligence
          </p>
          <h2 className="mt-5 max-w-[780px] font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[52px] md:text-[60px]">
            Assistance grounded in the work, not the hype.
          </h2>
          <p className="mt-7 max-w-[560px] text-[16px] leading-8 text-muted-foreground">
            Zero AI is being designed around bootcamps, projects, learning progress, and tutor
            workflows. It helps people move forward without replacing the proof, judgment, or human
            guidance that makes Zero Club valuable.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              to="/app/bootcamps"
              className="inline-flex h-12 items-center gap-2.5 rounded-full bg-foreground px-7 text-[14px] font-semibold text-background transition hover:opacity-90"
            >
              Explore bootcamps <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/app"
              className="inline-flex h-12 items-center rounded-full px-4 text-[14px] font-semibold text-muted-foreground transition hover:text-foreground"
            >
              Return to feed
            </Link>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="grid gap-0 md:grid-cols-3 md:gap-10">
            {roles.map(({ index, audience, title, description }) => (
              <article
                key={title}
                className="border-b border-border py-10 md:border-b-0 md:py-14"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-[14px] font-semibold text-muted-foreground/60 tabular-nums">
                    {index}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                    {audience}
                  </span>
                </div>
                <h3 className="mt-6 font-display text-[22px] font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="mt-3 text-[14px] leading-7 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-12 md:py-16">
          <div className="grid gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <h3 className="font-display text-[24px] font-semibold leading-snug tracking-tight">
              Built deliberately,
              <br className="hidden md:block" /> shipped carefully.
            </h3>
            <div>
              <ul className="space-y-5">
                {principles.map((principle) => (
                  <li
                    key={principle}
                    className="flex items-baseline gap-4 text-[15px] leading-7 text-foreground"
                  >
                    <span className="h-px w-6 shrink-0 translate-y-[-4px] bg-foreground/40" />
                    {principle}
                  </li>
                ))}
              </ul>
              <p className="mt-9 max-w-[520px] text-[13px] leading-6 text-muted-foreground">
                Access will be introduced gradually. Tutor verification interviews and AI assistance
                remain unavailable until the underlying service meets our bar for accuracy and
                reliability.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
