import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, ShieldCheck, ArrowRight, WalletCards, Loader2,
  Link2 as LinkIcon, Share2, Copy, Search, Send, Check, X, Coins,
} from "@/components/icons/solar";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { RequestFundsButton } from "@/components/RequestFundsButton";
import { openPaystackCheckout, buildReference, paystackPublicKey, paystackKeyProblem, describeVerifyFailure } from "@/lib/paystack";
import { fundLinkUrl, copyToClipboard, shareOrCopy } from "@/lib/share";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

export const Route = createFileRoute("/app/wallet/add-money")({ component: AddMoneyPage });

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

/** 1000 ZP = ₦100. Kept in step with zp_per_naira() in the database. */
const ZP_PER_NAIRA = 10;

/*
 * Paying by bank transfer means leaving Zero Club for a banking app. The
 * service worker no longer reloads on return, but Android can still kill the
 * process outright to reclaim memory, and no amount of front-end code prevents
 * that. So rather than betting on the page surviving, the reference is written
 * to storage before checkout opens and picked back up when the page returns —
 * whether it was still running or started fresh.
 */
const PENDING_KEY = "zc_pending_topup";
const PENDING_MAX_AGE = 24 * 60 * 60 * 1000;

type PendingTopup = { reference: string; amount: number; at: number };

function readPending(): PendingTopup | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingTopup;
    if (!parsed?.reference || Date.now() - parsed.at > PENDING_MAX_AGE) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePending(value: PendingTopup | null) {
  try {
    if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage disabled — the webhook is still the backstop */
  }
}

function AddMoneyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currency, details, format, toBaseAmount, fromBaseAmount } = useWalletCurrency();
  const { data: profile } = useUser();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "paying" | "verifying">("idle");
  const numericAmount = toBaseAmount(Number(amount) || 0);
  const busy = status !== "idle";

  /* ── ZP ──
     The rate is mirrored here only to show the person what they will get.
     redeem_zp_to_wallet does the arithmetic that counts, server-side, so a
     stale client can never convert at a rate of its own choosing. */
  const [zpAmount, setZpAmount] = useState("");
  const [converting, setConverting] = useState(false);
  const zpBalance = Math.max(0, Number(profile?.zp) || 0);
  const zpCredit = Math.floor((Number(zpAmount) || 0) / ZP_PER_NAIRA);

  const handleConvertZp = async () => {
    const points = Number(zpAmount) || 0;
    if (points < ZP_PER_NAIRA) {
      toast.error(`Convert at least ${ZP_PER_NAIRA} ZP`);
      return;
    }
    if (points > zpBalance) {
      toast.error("That is more ZP than you have");
      return;
    }

    setConverting(true);
    try {
      const { data, error } = await supabase.rpc("redeem_zp_to_wallet", { p_zp: points });
      if (error) throw error;
      const result = data as any;
      toast.success(`${Number(result?.zp_used || points).toLocaleString()} ZP converted to ${format(Number(result?.credited) || 0)}`);
      setZpAmount("");
      queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-history"] });
    } catch (error: any) {
      toast.error(error?.message || "Could not convert your ZP");
    } finally {
      setConverting(false);
    }
  };

  /* ── Fund link ── */
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkAmount, setLinkAmount] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipients, setRecipients] = useState<any[]>([]);
  const [sentTo, setSentTo] = useState<string[]>([]);

  const shareUrl = createdSlug ? fundLinkUrl(createdSlug) : "";

  const resetLinkFlow = () => {
    setLinkOpen(false);
    setLinkAmount("");
    setLinkNote("");
    setCreatedSlug(null);
    setRecipientQuery("");
    setRecipients([]);
    setSentTo([]);
  };

  // Search only runs once a link exists, so the drawer's first screen stays
  // about the link itself.
  useEffect(() => {
    if (!createdSlug) return;
    const q = recipientQuery.trim();
    if (q.length < 2) {
      setRecipients([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
        .neq("id", profile?.id || "")
        .limit(6);
      if (!cancelled) setRecipients(data || []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [recipientQuery, createdSlug, profile?.id]);

  const handleCreateLink = async () => {
    setCreating(true);
    try {
      const fixed = Number(linkAmount) > 0 ? toBaseAmount(Number(linkAmount)) : null;
      const { data, error } = await supabase.rpc("create_fund_link", {
        p_amount: fixed,
        p_note: linkNote.trim() || null,
        p_expires_days: null,
      });
      if (error) throw error;
      setCreatedSlug((data as any)?.slug);
    } catch (error: any) {
      toast.error(error?.message || "Could not create the fund link");
    } finally {
      setCreating(false);
    }
  };

  // Delivered as a chat message so it lands in their inbox, using the same
  // prefixed-content convention as tutor invites.
  const sendToMember = async (person: any) => {
    if (!profile?.id || !createdSlug) return;
    const label = profile.full_name || profile.username || "A Zero Club member";
    const { error } = await supabase.from("messages").insert({
      sender_id: profile.id,
      receiver_id: person.id,
      content: `FUND_LINK:${createdSlug}:${label}`,
    });
    if (error) {
      toast.error("Could not send that");
      return;
    }
    setSentTo((prev) => [...prev, person.id]);
    toast.success(`Sent to @${person.username}`);
  };

  /* ── Surviving the trip to a banking app ── */
  const [pending, setPending] = useState<PendingTopup | null>(null);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  const confirmPending = async (record: PendingTopup, silent = false) => {
    // A guard rather than just the state flag: visibilitychange and focus can
    // both fire for one return to the app, and two verifies racing produces a
    // confusing double toast.
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("paystack-verify", {
        body: { reference: record.reference },
      });
      if (error) throw new Error(error.message || "Could not confirm the payment");
      if ((data as any)?.error) throw new Error((data as any).error);

      writePending(null);
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["wallet-history"] });
      toast.success(
        (data as any)?.credited === false
          ? "That payment was already in your wallet"
          : "Payment confirmed — wallet updated",
      );
    } catch (err: any) {
      const message = err?.message || "Could not confirm the payment";
      // "not successful" means Paystack has no money against this reference
      // yet. For a transfer that usually means it simply has not landed, so
      // the record is kept and the card stays on screen to try again.
      if (!silent) {
        const described = describeVerifyFailure(err);
        toast.error(described.message, { description: described.description });
      }
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  // On arrival, and every time the app comes back to the foreground.
  useEffect(() => {
    const attempt = () => {
      if (document.visibilityState !== "visible") return;
      const record = readPending();
      setPending(record);
      // Silent: coming back from a banking app should either quietly credit
      // you or say nothing, never greet you with an error.
      if (record) confirmPending(record, true);
    };

    attempt();
    document.addEventListener("visibilitychange", attempt);
    window.addEventListener("focus", attempt);
    return () => {
      document.removeEventListener("visibilitychange", attempt);
      window.removeEventListener("focus", attempt);
    };
  }, []);

  const handlePay = async () => {
    if (numericAmount <= 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (!session || !email) {
      toast.error("Please sign in again to add money");
      return;
    }
    const keyProblem = paystackKeyProblem();
    if (keyProblem) {
      toast.error("Payments are not set up correctly", { description: keyProblem });
      return;
    }

    const reference = buildReference(session.user.id);
    // Charge in the currency the member is viewing; the wallet is credited
    // from Paystack's own record of the transaction.
    const chargeAmount = Number(amount);

    try {
      setStatus("paying");

      // Record who this payment belongs to *before* checkout. If the browser
      // never comes back, the Paystack webhook still knows which wallet to
      // credit, so money is never lost.
      await supabase.rpc("start_wallet_topup", { reference, amount: numericAmount });

      // Locally too, so this device can pick the payment back up on return
      // even if the page was destroyed while you were in your banking app.
      const record = { reference, amount: numericAmount, at: Date.now() };
      writePending(record);
      setPending(record);

      await openPaystackCheckout({
        email,
        amount: chargeAmount,
        currency,
        reference,
        profileId: session.user.id,
        displayName: profile?.full_name || profile?.username,
      });

      setStatus("verifying");
      const { data, error } = await supabase.functions.invoke("paystack-verify", {
        body: { reference },
      });

      if (error) throw new Error(error.message || "We could not confirm your payment");
      if ((data as any)?.error) throw new Error((data as any).error);

      writePending(null);
      setPending(null);

      await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["wallet-activities"] });

      toast.success(
        (data as any)?.credited === false
          ? "This payment was already added to your wallet"
          : "Wallet funded successfully",
      );
      navigate({ to: "/app/wallet" });
    } catch (error: any) {
      const message = error?.message || "Payment could not be completed";
      if (message === "Payment cancelled") {
        // Cancelling means no money moved, so the pending record would only
        // nag on every return. A transfer left open is a different thing and
        // keeps its record.
        writePending(null);
        setPending(null);
        toast("Payment cancelled");
      } else {
        // The card may still have been charged. Paystack's webhook credits the
        // wallet independently, so reassure rather than alarm, and refresh in
        // case the money has already landed.
        toast.error(message, {
          description: "If your card was charged, the money will appear in your wallet automatically.",
        });
        queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      }
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <header className="sticky top-0 z-40 border-b hairline bg-background/95 px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] backdrop-blur-xl md:px-7">
        <div className="mx-auto flex max-w-[760px] items-center gap-3">
          <button onClick={() => navigate({ to: "/app/wallet" })} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"><ArrowLeft className="h-[18px] w-[18px]" /></button>
          <div><p className="text-[10px] font-medium uppercase text-muted-foreground">Zero Wallet</p><h1 className="text-[18px] font-semibold tracking-tight">Add money</h1></div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[760px] gap-5 px-4 py-6 md:grid-cols-[minmax(0,1fr)_250px] md:px-7 md:py-8">
        {/* A payment already in flight. Shown for real rather than only
            auto-checked in the background, so that if the transfer lands late
            there is something on screen to press. */}
        {pending && (
          <div className="rounded-lg bg-amber-500/[0.08] p-4 ring-1 ring-amber-500/25 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-amber-700">
                  {format(pending.amount)} waiting to be confirmed
                </p>
                <p className="mt-0.5 text-[11.5px] leading-5 text-muted-foreground">
                  Sent the transfer? This checks with Paystack and adds it to your wallet.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => confirmPending(pending)}
                  disabled={checking}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 text-[12px] font-semibold text-white tap hover:opacity-90 disabled:opacity-50"
                >
                  {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Confirm payment
                </button>
                <button
                  onClick={() => { writePending(null); setPending(null); }}
                  title="Dismiss"
                  aria-label="Dismiss"
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground tap hover:bg-foreground/[0.05]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="rounded-lg border border-border bg-card p-5 sm:p-7">
          <div className="text-center">
            <label className="text-[11px] font-medium uppercase text-muted-foreground">Amount to add</label>
            <div className="mt-4 flex items-baseline justify-center gap-1">
              <span className="text-[26px] text-muted-foreground">{details.symbol}</span>
              <input type="number" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} placeholder="0" autoFocus className="w-auto min-w-[80px] max-w-[240px] bg-transparent text-center text-[48px] font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:text-[56px]" style={{ width: `${Math.max(1, amount.length)}ch` }} />
            </div>
            <div className="mx-auto mt-2 h-[2px] w-16 rounded-full bg-primary/60" />
          </div>

          <div className="mt-9 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_AMOUNTS.map((quick) => <button key={quick} disabled={busy} onClick={() => setAmount(String(fromBaseAmount(quick)))} className={`rounded-lg py-2.5 text-[12px] font-semibold tabular-nums disabled:opacity-50 ${numericAmount === quick ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}>{format(quick)}</button>)}
          </div>

          <button onClick={handlePay} disabled={numericAmount <= 0 || busy} className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-40">
            {status === "verifying" ? (<><Loader2 className="h-4 w-4 animate-spin" />Confirming payment</>)
              : status === "paying" ? (<><Loader2 className="h-4 w-4 animate-spin" />Waiting for Paystack</>)
              : (<>{numericAmount > 0 ? `Pay ${format(numericAmount)} with Paystack` : "Pay with Paystack"}<ArrowRight className="h-4 w-4" /></>)}
          </button>

          {/* The amount typed above, asked for rather than paid. */}
          {numericAmount > 0 && (
            <div className="mt-2.5">
              <RequestFundsButton
                amount={numericAmount}
                purpose="Top up my Zero Club wallet"
                label={`Ask someone for ${format(numericAmount)}`}
              />
            </div>
          )}

          {paystackKeyProblem() && (
            <p className="mt-3 rounded-lg bg-amber-500/[0.08] px-3 py-2.5 text-[11px] leading-relaxed text-amber-700 ring-1 ring-amber-500/20">
              {paystackKeyProblem()}
            </p>
          )}

          {/* ── Second way in: have someone else pay ── */}
          <div className="mt-7 border-t hairline pt-6">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary ring-1 ring-primary/15">
                <LinkIcon className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[14.5px] font-semibold tracking-tight">Ask someone to fund you</h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  Generate a link anyone can pay — Zero Club members pay from their wallet, everyone
                  else pays by card. The money arrives in your wallet either way.
                </p>
                <button
                  onClick={() => setLinkOpen(true)}
                  disabled={busy}
                  className="mt-3.5 flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold ring-1 ring-border tap hover:bg-foreground/[0.04] disabled:opacity-40"
                >
                  <LinkIcon className="h-4 w-4" /> Generate a fund link
                </button>
              </div>
            </div>
          </div>

          {/* ── Third way in: points you already have ── */}
          {zpBalance >= ZP_PER_NAIRA && (
            <div className="mt-7 border-t hairline pt-6">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary ring-1 ring-primary/15">
                  <Coins className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[14.5px] font-semibold tracking-tight">Top up with your ZP</h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    {ZP_PER_NAIRA * 100} ZP is worth {format(100)}. Convert what you need to cover a
                    payment — converted points can be spent anywhere on Zero Club, but are not
                    withdrawable to a bank.
                  </p>

                  <p className="mt-3 text-[12px] text-muted-foreground">
                    You have <strong className="font-semibold tabular-nums text-foreground">{zpBalance.toLocaleString()} ZP</strong>
                    {" "}· worth <strong className="font-semibold tabular-nums text-foreground">{format(Math.floor(zpBalance / ZP_PER_NAIRA))}</strong>
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      inputMode="numeric"
                      value={zpAmount}
                      onChange={(event) => setZpAmount(event.target.value.replace(/\D/g, ""))}
                      placeholder="ZP to convert"
                      disabled={converting}
                      className="h-11 w-[150px] rounded-lg border border-border bg-background px-3 text-[14px] font-semibold tabular-nums outline-none transition focus:border-primary/50 disabled:opacity-50"
                    />
                    <button
                      onClick={() => setZpAmount(String(Math.floor(zpBalance / ZP_PER_NAIRA) * ZP_PER_NAIRA))}
                      disabled={converting}
                      className="h-11 rounded-lg px-3 text-[12px] font-semibold text-muted-foreground ring-1 ring-border tap hover:bg-foreground/[0.04] disabled:opacity-50"
                    >
                      Max
                    </button>
                    <button
                      onClick={handleConvertZp}
                      disabled={converting || zpCredit < 1}
                      className="flex h-11 items-center gap-2 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background tap disabled:opacity-40"
                    >
                      {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Convert{zpCredit >= 1 ? ` to ${format(zpCredit)}` : ""}</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg bg-[#171218] p-5 text-white"><WalletCards className="h-5 w-5 text-[#f06ac3]" /><h2 className="mt-4 text-[16px] font-semibold">Fund your wallet</h2><p className="mt-1.5 text-[12px] leading-relaxed text-white/60">Use your balance for memberships, bootcamps, products, and builder transactions.</p></div>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"><ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" /><p className="text-[12px] leading-relaxed text-muted-foreground">Processed securely by Paystack. Successful payments arrive instantly.</p></div>
        </aside>
      </main>

      {/* ── Fund link drawer ── */}
      <Drawer open={linkOpen} onOpenChange={(open) => !open && !creating && resetLinkFlow()}>
        <DrawerContent
          desktopVariant="panel"
          className="border-none bg-background p-0 focus:ring-0 max-w-lg mx-auto max-h-[92dvh] flex flex-col"
        >
          <div className="shrink-0 border-b px-6 pb-4 pt-5 hairline">
            <DrawerTitle className="text-[19px] font-semibold tracking-tight">
              {createdSlug ? "Your fund link is ready" : "Generate a fund link"}
            </DrawerTitle>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {createdSlug
                ? "Share it anywhere. Whoever pays, the money lands in your wallet."
                : "Leave the amount blank to let the payer decide."}
            </p>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 no-scrollbar">
            {!createdSlug ? (
              <>
                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Fixed amount (optional)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-muted-foreground">
                      {details.symbol}
                    </span>
                    <input
                      type="number"
                      min="1"
                      inputMode="decimal"
                      value={linkAmount}
                      onChange={(e) => setLinkAmount(e.target.value)}
                      placeholder="Any amount"
                      className="h-13 w-full rounded-xl bg-background py-3.5 pl-10 pr-4 text-[16px] font-semibold tabular-nums outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="ml-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    What is it for? (optional)
                  </label>
                  <input
                    value={linkNote}
                    onChange={(e) => setLinkNote(e.target.value)}
                    placeholder="e.g. Bootcamp fee"
                    maxLength={120}
                    className="h-12 w-full rounded-xl bg-background px-4 text-[14px] outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="flex items-start gap-2.5 rounded-xl bg-card px-4 py-3.5 ring-1 ring-border">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    Anyone with the link can add money to your wallet, but nobody can take money
                    out or see your balance.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl bg-card px-4 py-3.5 ring-1 ring-border">
                  <p className="break-all text-[12.5px] font-medium text-muted-foreground">{shareUrl}</p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => copyToClipboard(shareUrl, "Fund link copied")}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl text-[13px] font-semibold ring-1 ring-border tap hover:bg-foreground/[0.04]"
                  >
                    <Copy className="h-4 w-4" /> Copy
                  </button>
                  <button
                    onClick={() =>
                      shareOrCopy({
                        title: "Fund my Zero Club wallet",
                        text: linkNote.trim() || "You can add money to my Zero Club wallet here",
                        url: shareUrl,
                        copiedMessage: "Fund link copied",
                      })
                    }
                    className="flex h-12 items-center justify-center gap-2 rounded-xl bg-foreground text-[13px] font-semibold text-background tap hover:opacity-90"
                  >
                    <Share2 className="h-4 w-4" /> Share
                  </button>
                </div>

                <div className="space-y-2.5 border-t hairline pt-5">
                  <p className="ml-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Or send it to a Zero Club member
                  </p>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={recipientQuery}
                      onChange={(e) => setRecipientQuery(e.target.value)}
                      placeholder="Search by name or @username"
                      className="h-12 w-full rounded-xl bg-background pl-11 pr-4 text-[14px] outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  {recipients.map((person) => {
                    const sent = sentTo.includes(person.id);
                    return (
                      <div
                        key={person.id}
                        className="flex items-center gap-3 rounded-xl bg-card px-3.5 py-2.5 ring-1 ring-border"
                      >
                        <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[12px] font-semibold text-muted-foreground">
                          {person.avatar_url ? (
                            <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                          ) : (
                            (person.full_name || person.username || "?").charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold tracking-tight">
                            {person.full_name || person.username}
                          </p>
                          <p className="truncate text-[11.5px] text-muted-foreground">@{person.username}</p>
                        </div>
                        <button
                          onClick={() => sendToMember(person)}
                          disabled={sent}
                          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold tap ${
                            sent
                              ? "text-success ring-1 ring-success/30"
                              : "bg-foreground text-background hover:opacity-90"
                          }`}
                        >
                          {sent ? <><Check className="h-3.5 w-3.5" /> Sent</> : <><Send className="h-3.5 w-3.5" /> Send</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="shrink-0 border-t hairline px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {!createdSlug ? (
              <div className="flex gap-3">
                <button
                  onClick={resetLinkFlow}
                  disabled={creating}
                  className="flex-1 rounded-full py-3 text-[13.5px] font-semibold ring-1 ring-border tap hover:bg-foreground/[0.03] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateLink}
                  disabled={creating}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-[13.5px] font-semibold text-primary-foreground tap hover:opacity-90 disabled:opacity-40"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create link
                </button>
              </div>
            ) : (
              <button
                onClick={resetLinkFlow}
                className="w-full rounded-full bg-foreground py-3 text-[13.5px] font-semibold text-background tap hover:opacity-90"
              >
                Done
              </button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
