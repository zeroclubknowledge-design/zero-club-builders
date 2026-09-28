import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, Rocket, Target, Wallet } from "@/components/icons/glyphs";

export const Route = createFileRoute("/app/boost")({
  component: BoostPage,
});

/*
 * Boosting is not built yet. The page used to carry a price list and a
 * purchase handler that only showed a success toast — nothing was charged and
 * nothing was boosted — so that code is gone rather than left looking real.
 */
const PREVIEW = [
  { icon: Target, text: "Choose who sees it — skills, city or club" },
  { icon: Wallet, text: "Pay from your wallet or with ZP" },
  { icon: BarChart3, text: "See the results in your metrics" },
];

function BoostPage() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-canvas md:relative md:inset-auto md:z-0 md:min-h-screen">
      <header className="sticky top-0 z-50 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={() => navigate({ to: "/app/compose" })}
            aria-label="Back"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Boost</h1>
        </div>
      </header>

      <main className="zc-page-width mx-auto mt-2 flex w-full max-w-[680px] flex-1 flex-col items-center bg-card px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-10 text-center md:mb-6 md:rounded-xl md:border md:border-border">
        <span className="grid h-[88px] w-[88px] place-items-center rounded-3xl bg-[#cc208f]/10 text-[#cc208f]">
          <Rocket className="h-10 w-10" />
        </span>
        <span className="mt-5 flex h-6 items-center rounded-full bg-foreground px-2.5 text-[12px] font-bold tracking-[0.04em] text-background">
          COMING SOON
        </span>
        <h2 className="mt-3.5 max-w-[340px] font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.02em]">
          Put your best work in front of more people
        </h2>
        <p className="mt-2.5 max-w-[360px] text-[15px] leading-relaxed text-muted-foreground">
          Boost a ship, a ZeroNote or your store to reach learners, clubs and recruiters beyond your followers.
        </p>

        <ul className="mt-7 grid w-full max-w-[380px] gap-3 text-left text-[14px]">
          {PREVIEW.map((item) => (
            <li key={item.text} className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-foreground/[0.05]">
                <item.icon className="h-[18px] w-[18px]" />
              </span>
              {item.text}
            </li>
          ))}
        </ul>

        <button
          onClick={() => navigate({ to: "/app/compose" })}
          className="mt-auto h-12 w-full max-w-[380px] rounded-full bg-foreground text-[15px] font-semibold text-background transition hover:opacity-90 active:scale-[0.98]"
        >
          Back to your post
        </button>
      </main>
    </div>
  );
}
