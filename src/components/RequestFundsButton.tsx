import { useState } from "react";
import { HandCoins, Loader2, Copy, Check } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { copyToClipboard, fundLinkUrl } from "@/lib/share";
import { ShareMenu } from "@/components/ShareMenu";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "sonner";

/**
 * "I cannot afford this on my own" — answered at the point it is felt.
 *
 * Someone short of the price of a bootcamp had to leave checkout, find the
 * wallet, work out that a fund link is the thing they want, create one, then
 * remember the amount and what it was for. Most people simply close the page
 * instead, and the sale is lost to friction rather than to price.
 *
 * So the request is made from wherever the payment is: the amount and the
 * purpose are already known, and the person only has to decide who to send it
 * to. It creates the same fund link as the wallet does — one mechanism, one
 * place it is implemented, offered in the moment it is useful.
 */

export function RequestFundsButton({
  amount,
  purpose,
  className,
  label = "Ask someone to help",
  compact = false,
}: {
  /** In base wallet units, the same units as a price on the page. */
  amount: number;
  /** What the money is for. Appears on the page the payer sees. */
  purpose: string;
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  const { format } = useWalletCurrency();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);

  const shareUrl = slug ? fundLinkUrl(slug) : "";
  const requested = Math.max(0, Number(amount) || 0);

  const create = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("create_fund_link", {
        p_amount: requested > 0 ? requested : null,
        p_note: purpose || null,
        p_expires_days: null,
      });
      if (error) throw error;
      setSlug((data as any)?.slug || null);
    } catch (error: any) {
      toast.error(error?.message || "Could not create the request");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const start = () => {
    setSlug(null);
    setOpen(true);
    // Made straight away. The only question left is who to send it to, and
    // making somebody press "create" first is a step that decides nothing.
    void create();
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        className={
          className ??
          (compact
            ? "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-primary transition hover:bg-primary/[0.06]"
            : "flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-[13px] font-semibold text-foreground transition hover:bg-accent active:scale-[0.99]")
        }
      >
        <HandCoins className="h-4 w-4" />
        {label}
      </button>

      <Drawer open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSlug(null); }}>
        <DrawerContent className="mx-auto max-w-md px-4 pb-5 pt-1 sm:p-6">
          <div className="pb-3">
            <DrawerTitle className="font-display text-[20px] font-semibold leading-tight text-foreground">Request this amount</DrawerTitle>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{purpose}</p>
          </div>

          {requested > 0 && (
            <div className="rounded-2xl bg-foreground/[0.04] px-4 py-3.5">
              <p className="text-[13px] font-semibold text-muted-foreground">Amount</p>
              <p className="mt-0.5 font-display text-[28px] font-semibold leading-tight tabular-nums text-foreground">{format(requested)}</p>
            </div>
          )}

          {creating || !slug ? (
            <div className="grid min-h-32 place-items-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="mt-4">
                <p className="mb-1.5 text-[13px] font-semibold text-muted-foreground">Request link</p>
                <p className="break-all rounded-[10px] border border-foreground/15 bg-card px-3 py-2.5 font-mono text-[13px] leading-relaxed text-foreground">
                  {shareUrl}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  Whoever opens this can pay by card without a Zero Club account. The money lands in
                  your wallet, and you come back here to finish paying.
                </p>
              </div>

              {/* Sharing is the point of this drawer; copying is the fallback
                  for when the share sheet is not what somebody wants. Each
                  gets its own line and its full width. */}
              <div className="mt-6 space-y-2.5">
                <ShareMenu
                  url={shareUrl}
                  title="Help me with this on Zero Club"
                  text={requested > 0 ? `${purpose} — ${format(requested)}` : purpose}
                  label="Share"
                  wrapperClassName="w-full"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] px-5 text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
                />
                <button
                  onClick={() => copyToClipboard(shareUrl, "Request link copied")}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-foreground/25 px-5 text-[16px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.04]"
                >
                  <Copy className="h-5 w-5" /> Copy link
                </button>
              </div>

              <p className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
                <Check className="h-4 w-4 text-[#1a7f4b]" /> Also saved under Wallet · Request
              </p>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
