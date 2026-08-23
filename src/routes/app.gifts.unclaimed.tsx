import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Gift, Loader2, Share2 } from "@/components/icons/solar";
import { supabase } from "@/lib/supabase";
import { GiftCardVisual, giftServices } from "@/components/GiftCardVisual";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { copyToClipboard, giftLinkUrl } from "@/lib/share";
import { ShareMenu } from "@/components/ShareMenu";

/**
 * Gifts you created that nobody has claimed yet.
 *
 * This page exists because creating a gift debits the wallet immediately while
 * the code was shown exactly once, on the screen straight after creation.
 * Closing that screen stranded real money with no way to reach anyone.
 *
 * Each gift is shown as the card the recipient will see, not a list row —
 * the card carries the amount, the purpose and the code, so it is the thing
 * worth looking at. Copy sits on the card itself.
 */
export const Route = createFileRoute("/app/gifts/unclaimed")({
  component: UnclaimedGiftsPage,
});

function UnclaimedGiftsPage() {
  const navigate = useNavigate();
  const { format } = useWalletCurrency();

  const { data: gifts, isLoading } = useQuery({
    queryKey: ["unclaimed-gifts"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data, error } = await supabase
        .from("gift_cards")
        .select("id, code, amount, service, template_id, message, custom_purpose, created_at")
        .eq("creator_id", session.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const giftUrl = (code: string) => giftLinkUrl(code);

  const total = (gifts || []).reduce((sum, card: any) => sum + Number(card.amount || 0), 0);

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate({ to: "/app/gifts" })}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
              aria-label="Back to gifts"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Cards</p>
              <h1 className="truncate text-[18px] font-semibold tracking-tight">Unclaimed</h1>
            </div>
          </div>
          {total > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-[9px] uppercase text-muted-foreground">Value waiting</p>
              <p className="text-[13px] font-semibold tabular-nums">{format(total)}</p>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-4 py-6 md:px-7 md:py-8">
        {isLoading ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !gifts || gifts.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-border bg-card px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full ring-1 ring-border">
              <Gift className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
            </span>
            <h2 className="mt-5 text-[17px] font-semibold tracking-tight">Nothing waiting</h2>
            <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
              Every gift you have created has been claimed.
            </p>
            <Link
              to="/app/gifts"
              className="mt-7 rounded-full bg-foreground px-6 py-2.5 text-[13px] font-semibold text-background transition hover:opacity-90"
            >
              Create a gift
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-5 max-w-[520px] text-[13px] leading-relaxed text-muted-foreground">
              These have already left your wallet. Send a link so someone can claim one.
            </p>

            <div className="grid gap-8 lg:grid-cols-2">
              {gifts.map((card: any) => {
                const label = giftServices.find((item) => item.id === card.service)?.label || card.service;
                return (
                  <div key={card.id} className="min-w-0">
                    {/* Full size, exactly as it appears on the Gifts page —
                        nothing overlaid, so the card is never obscured. */}
                    <GiftCardVisual
                      amount={card.amount}
                      service={card.service}
                      templateId={card.template_id}
                      code={card.code}
                      message={card.message}
                    />

                    {/* Just the actions. The amount and purpose are on the
                        card above, so repeating them was noise. */}
                    <div className="mt-3 w-full max-w-[520px]">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => copyToClipboard(giftUrl(card.code), "Gift link copied")}
                          aria-label={`Copy the link to gift ${card.code}`}
                          className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-[12px] font-semibold text-foreground transition hover:bg-accent/40 active:scale-[0.98]"
                        >
                          <Copy className="h-3.5 w-3.5" /> Copy link
                        </button>
                        <ShareMenu
                          url={giftUrl(card.code)}
                          title="A Zero Card for you"
                          text={`You received a ${format(Number(card.amount))} Zero Card — ${label}.`}
                          wrapperClassName="w-full"
                          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-foreground text-[12px] font-semibold text-background transition hover:opacity-90 active:scale-[0.98]"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
