import { Link } from "@tanstack/react-router";
import { AppShell, PageHead } from "@/components/AppShell";
import { Brand } from "@/components/Brand";
import { NAV } from "./nav";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, Copy, Gift, Loader2, Minus, Plus } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { GiftCardVisual, giftServices } from "@/components/GiftCardVisual";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { refreshGiftClaims } from "@/lib/giftClaimRefresh";
import { copyToClipboard, giftLinkUrl } from "@/lib/share";
import { ShareMenu } from "@/components/ShareMenu";
import { toast } from "sonner";

import { confirmCard } from "@/components/ConfirmCard";
import { GiftEditSheet } from "@/features/membership/GiftEditSheet";
import { Pencil } from "@/components/icons/glyphs";
/**
 * The gifts you created: the ones still collecting claims, and everything that
 * has finished one way or another.
 *
 * This page exists because creating a gift debits the wallet immediately while
 * the code was shown exactly once, on the screen straight after creation.
 * Closing that screen stranded real money with no way to reach anyone.
 *
 * Sold-out gifts live under "Past" rather than disappearing, because the most
 * common next wish is to add more places to a card people are already sharing.
 */
type GiftCard = {
  id: string;
  code: string;
  amount: number;
  service: string;
  template_id: string;
  message: string | null;
  custom_purpose: string | null;
  created_at: string;
  quantity: number;
  claimed_count: number;
  expires_at: string | null;
  funding_source: string;
  status: "active" | "claimed" | "cancelled";
  refunded_at: string | null;
  bootcamp_ids: string[] | null;
  club_ids?: string[] | null;
  is_public?: boolean;
};

export function SentGifts({ embedded = false }: { embedded?: boolean }) {
  const client = useQueryClient();
  const { format } = useWalletCurrency();
  const [tab, setTab] = useState<"collecting" | "past">("collecting");
  const [editing, setEditing] = useState<GiftCard | null>(null);

  const { data: gifts, isLoading } = useQuery({
    queryKey: ["unclaimed-gifts"],
    refetchInterval: 10_000,
    queryFn: async () => {
      await refreshGiftClaims();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return [];
      const { data, error } = await supabase
        .from("gift_cards")
        .select(
          "id, code, amount, service, template_id, message, custom_purpose, created_at,quantity,claimed_count,expires_at,funding_source,status,refunded_at,bootcamp_ids,club_ids,is_public",
        )
        .eq("creator_id", session.user.id)
        .is("parent_gift_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as GiftCard[];
    },
  });

  const giftUrl = (code: string) => giftLinkUrl(code);
  const now = Date.now();
  const expired = (card: GiftCard) => !!card.expires_at && Date.parse(card.expires_at) <= now;
  const openGifts = (gifts || []).filter((card) => card.status === "active" && !expired(card));
  const pastGifts = (gifts || []).filter((card) => !(card.status === "active" && !expired(card)));

  const total = openGifts.reduce(
    (sum, card) =>
      sum + Number(card.amount || 0) * Math.max(0, (card.quantity || 1) - (card.claimed_count || 0)),
    0,
  );

  const close = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("close_gift_campaign", { p_gift: id });
      if (error) throw error;
      return data;
    },
    onSuccess: (value) => {
      toast.success(
        Number(value) > 0
          ? `${format(Number(value))} returned to your wallet`
          : "Remaining gift claims closed",
      );
      for (const key of ["unclaimed-gifts", "unclaimed-gift-count", "profile", "gift-card-profile", "wallet-balance"])
        void client.invalidateQueries({ queryKey: [key] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusOf = (card: GiftCard) => {
    if (card.status === "cancelled") return { label: "Closed", tone: "muted" as const, detail: "Remaining claims returned to your wallet." };
    if (expired(card)) return { label: "Expired", tone: "muted" as const, detail: "The deadline for claiming and spending has passed." };
    if (card.status === "claimed") return { label: "Sold out", tone: "muted" as const, detail: "Every claim has been taken. Add more to reopen it." };
    return { label: "Collecting", tone: "open" as const, detail: "Still accepting claims." };
  };

  const renderCard = (card: GiftCard, isPast: boolean) => {
    const label = giftServices.find((item) => item.id === card.service)?.label || card.service;
    const left = Math.max(0, (card.quantity || 1) - (card.claimed_count || 0));
    const status = statusOf(card);
    // Anything not closed can be edited; an expired one can be given a new date.
    const canEdit = card.status !== "cancelled" && !card.refunded_at;
    return (
      <div key={card.id} className="min-w-0">
        <GiftCardVisual
          amount={card.amount}
          service={card.service}
          templateId={card.template_id}
          code={card.code}
          message={card.message}
        />

        <div className="mt-3 w-full max-w-[520px]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {card.claimed_count || 0} of {card.quantity || 1} claimed · {format(Number(card.amount))} each
            </p>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
                status.tone === "open"
                  ? "bg-[#1a7f4b]/10 text-[#1a7f4b]"
                  : "bg-foreground/[0.06] text-muted-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${status.tone === "open" ? "bg-[#1a7f4b]" : "bg-muted-foreground/60"}`}
              />
              {status.label}
            </span>
          </div>
          {canEdit && !expired(card) && (card.claimed_count || 0) < (card.quantity || 1) && (
            <button
              type="button"
              role="switch"
              aria-checked={!!card.is_public}
              onClick={async () => {
                const next = !card.is_public;
                const { error } = await supabase.rpc("set_gift_public" as never, { p_gift: card.id, p_public: next } as never);
                if (error) { toast.error(error.message); return; }
                toast.success(next ? "Listed on Browse" : "Removed from Browse");
                void client.invalidateQueries({ queryKey: ["unclaimed-gifts"] });
                void client.invalidateQueries({ queryKey: ["browse-gifts"] });
              }}
              className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <span className={`relative h-5 w-9 rounded-full transition-colors ${card.is_public ? "bg-[#c3217e]" : "bg-foreground/15"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${card.is_public ? "left-[18px]" : "left-0.5"}`} />
              </span>
              {card.is_public ? "On Browse · anyone can claim" : "Not on Browse · link only"}
            </button>
          )}
          {card.expires_at && (
            <p className="mb-3 text-xs text-muted-foreground">
              {expired(card) ? "Expired" : "Claim by"} · {new Date(card.expires_at).toLocaleString()}
            </p>
          )}

          {isPast && (
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{status.detail}</p>
          )}

          {status.tone === "open" && (
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
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(card)}
              className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-foreground/25 active:scale-[0.99]"
            >
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold">Edit gift</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {expired(card)
                    ? "Give it a new date to reopen it, or change anything else"
                    : left === 0
                      ? "Sold out — add claims, raise the amount or change the details"
                      : "Change the design, message, purpose or date · raise the amount or claims"}
                </span>
              </span>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#c3217e]/10 text-[#c3217e]">
                <Pencil className="h-4 w-4" />
              </span>
            </button>
          )}

          {card.status === "active" && !expired(card) && (
            <button
              type="button"
              disabled={close.isPending}
              onClick={async () => {
                if (
                  (await confirmCard(
                    card.funding_source === "platform"
                      ? "Close remaining claims? Claimed gifts keep their original expiry. Sponsored value is not refunded to your wallet."
                      : "Close remaining claims and return their value to your wallet? Claimed gifts keep their original expiry.",
                  ))
                )
                  close.mutate(card.id);
              }}
              className="mt-3 min-h-10 text-xs font-semibold text-muted-foreground underline"
            >
              {card.funding_source === "platform"
                ? "Close remaining claims"
                : "Close and return unclaimed value"}
            </button>
          )}
        </div>
      </div>
    );
  };

  const list = tab === "collecting" ? openGifts : pastGifts;

  return (
    <Frame embedded={embedded}>
      <Head
        embedded={embedded}
        eyebrow="Zero Cards"
        title="Gifts you've sent"
        sub="Every gift is funded when you create it. Share links, add claims, change details or close a gift to return what's left."
        action={total > 0 ? (
          <div className="rounded-2xl border border-border bg-card px-4 py-2.5 text-right">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Value waiting</p>
            <p className="font-display text-[18px] font-bold tabular-nums">{format(total)}</p>
          </div>
        ) : undefined}
      />
        <div className="mb-5 flex max-w-[520px] gap-1 rounded-full bg-foreground/[0.06] p-1">
          {(
            [
              ["collecting", `Collecting${openGifts.length ? ` · ${openGifts.length}` : ""}`],
              ["past", `Past${pastGifts.length ? ` · ${pastGifts.length}` : ""}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={`min-h-9 flex-1 rounded-full px-4 text-[12.5px] font-semibold transition ${
                tab === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      <div>
        {isLoading ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-border bg-card px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full ring-1 ring-border">
              <Gift className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
            </span>
            <h2 className="mt-5 text-[17px] font-semibold tracking-tight">
              {tab === "collecting" ? "Nothing waiting" : "No past gifts"}
            </h2>
            <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
              {tab === "collecting"
                ? pastGifts.length > 0
                  ? "Every gift you have created has been claimed. Sold-out cards are under Past, where you can add more claims."
                  : "Every gift you have created has been claimed."
                : "Gifts appear here once they sell out, expire or are closed."}
            </p>
            <Link
              to="/create"
              className="mt-7 rounded-full bg-foreground px-6 py-2.5 text-[13px] font-semibold text-background transition hover:opacity-90"
            >
              Create a gift
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-5 max-w-[520px] text-[13px] leading-relaxed text-muted-foreground">
              {tab === "collecting"
                ? "Each gift is already funded. Share its link before expiry, or close remaining claims to recover their value."
                : "Finished gifts. A sold-out card can be reopened by adding claims — the extra places are funded from your wallet."}
            </p>
            <div className="grid gap-8 lg:grid-cols-2">
              {list.map((card) => renderCard(card, tab === "past"))}
            </div>
          </>
        )}
      </div>

      {editing && (
        <GiftEditSheet card={editing} open={!!editing} onSaved={(saved) => setTab(saved.status === "active" ? "collecting" : "past")} onOpenChange={(open) => { if (!open) setEditing(null); }} />
      )}
    </Frame>
  );
}

/** Full page on its own, or just the content inside My Gifts. */
export function Frame({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  return embedded ? <>{children}</> : <AppShell brand={<Brand />} nav={NAV}>{children}</AppShell>;
}
export function Head({ embedded, sub, action, ...rest }: { embedded: boolean; eyebrow: string; title: string; sub: string; action?: React.ReactNode }) {
  if (!embedded) return <PageHead {...rest} sub={sub} action={action} />;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-[560px] text-[13.5px] leading-relaxed text-muted-foreground">{sub}</p>
      {action}
    </div>
  );
}
