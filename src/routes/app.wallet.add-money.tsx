import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, ShieldCheck, ArrowRight, ChevronRight, Loader2,
  Link2 as LinkIcon, Share2, Copy, Search, Send, Check, X,
} from "@/components/icons/glyphs";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { RequestFundsButton } from "@/components/RequestFundsButton";
import { openPaystackCheckout, buildReference, paystackKeyProblem, describeVerifyFailure } from "@/lib/paystack";
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

  const balance = Number(profile?.coins || 0);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="sticky top-0 z-40 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button onClick={() => navigate({ to: "/app/wallet" })} aria-label="Back to wallet" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Add money</h1>
        </div>
      </header>

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 pt-2 md:pb-6">
        {/* A payment already in flight. Shown for real rather than only
            auto-checked in the background, so that if the transfer lands late
            there is something on screen to press. */}
        {pending && (
          <section className="bg-amber-500/[0.08] px-4 py-3.5 ring-1 ring-amber-500/25 md:rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-amber-800 dark:text-amber-400">{format(pending.amount)} waiting to be confirmed</p>
                <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">Sent the transfer? This checks with Paystack and adds it to your wallet.</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => confirmPending(pending)}
                  disabled={checking}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-amber-600 px-3.5 text-[13px] font-semibold text-white tap hover:opacity-90 disabled:opacity-50"
                >
                  {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  Confirm payment
                </button>
                <button
                  onClick={() => { writePending(null); setPending(null); }}
                  aria-label="Dismiss"
                  className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground tap hover:bg-foreground/[0.05]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="bg-card px-4 pb-5 pt-6 text-center md:rounded-xl md:border md:border-border">
          <label htmlFor="topup-amount" className="text-[13px] font-semibold text-muted-foreground">Amount</label>
          <div className="mt-1.5 flex items-baseline justify-center gap-1">
            <span className="font-display text-[30px] font-semibold text-muted-foreground">{details.symbol}</span>
            <input
              id="topup-amount"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={busy}
              placeholder="0"
              autoFocus
              className="min-w-[70px] max-w-[260px] bg-transparent text-center font-display text-[44px] font-semibold tracking-[-0.02em] tabular-nums outline-none placeholder:text-muted-foreground/35 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              style={{ width: `${Math.max(1, amount.length)}ch` }}
            />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {numericAmount > 0 ? `Balance after: ${format(balance + numericAmount)}` : `Balance: ${format(balance)}`}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {QUICK_AMOUNTS.map((quick) => (
              <button
                key={quick}
                disabled={busy}
                onClick={() => setAmount(String(fromBaseAmount(quick)))}
                className={`h-9 rounded-full px-3.5 text-[14px] font-semibold tabular-nums transition disabled:opacity-50 ${
                  numericAmount === quick ? "bg-foreground text-background" : "border border-foreground/20 text-muted-foreground hover:border-foreground/40"
                }`}
              >
                {format(quick)}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-card md:overflow-hidden md:rounded-xl md:border md:border-border">
          <h2 className="px-4 pb-2 pt-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Pay with</h2>

          <div className="border-t border-border/60 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#0ba4db] text-[15px] font-bold text-white">P</span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Paystack</p>
                <p className="text-[13px] text-muted-foreground">Card, bank transfer or USSD</p>
              </div>
            </div>
            <button
              onClick={handlePay}
              disabled={numericAmount <= 0 || busy}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background transition hover:opacity-90 disabled:opacity-40"
            >
              {status === "verifying" ? (<><Loader2 className="h-4 w-4 animate-spin" />Confirming payment</>)
                : status === "paying" ? (<><Loader2 className="h-4 w-4 animate-spin" />Waiting for Paystack</>)
                : (<>{numericAmount > 0 ? `Pay ${format(numericAmount)}` : "Enter an amount"}{numericAmount > 0 && <ArrowRight className="h-4 w-4" />}</>)}
            </button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Secured by Paystack. Successful payments arrive instantly.
            </p>
            {paystackKeyProblem() && (
              <p className="mt-2 rounded-lg bg-amber-500/[0.08] px-3 py-2.5 text-[12px] leading-relaxed text-amber-700 ring-1 ring-amber-500/20">
                {paystackKeyProblem()}
              </p>
            )}
          </div>

          {/* ── Points you already have ── */}
          {zpBalance >= ZP_PER_NAIRA && (
            <div className="border-t border-border/60 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#cc208f]/10 text-[13px] font-bold text-[#cc208f]">ZP</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">Convert Zero Points</p>
                  <p className="text-[13px] text-muted-foreground">
                    You have {zpBalance.toLocaleString()} ZP · worth {format(Math.floor(zpBalance / ZP_PER_NAIRA))}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={zpAmount}
                  onChange={(event) => setZpAmount(event.target.value.replace(/\D/g, ""))}
                  placeholder="ZP to convert"
                  disabled={converting}
                  className="h-10 min-w-0 flex-1 rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] font-semibold tabular-nums outline-none focus:border-foreground/40 disabled:opacity-50"
                />
                <button
                  onClick={() => setZpAmount(String(Math.floor(zpBalance / ZP_PER_NAIRA) * ZP_PER_NAIRA))}
                  disabled={converting}
                  className="h-10 rounded-full px-3 text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Max
                </button>
                <button
                  onClick={handleConvertZp}
                  disabled={converting || zpCredit < 1}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-foreground px-3.5 text-[14px] font-semibold disabled:opacity-40"
                >
                  {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Convert{zpCredit >= 1 ? ` to ${format(zpCredit)}` : ""}</>}
                </button>
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {ZP_PER_NAIRA * 100} ZP = {format(100)}. Converted points can be spent anywhere on Zero Club, but can't be withdrawn to a bank.
              </p>
            </div>
          )}

          {/* ── Have someone else pay ── */}
          <button
            onClick={() => setLinkOpen(true)}
            disabled={busy}
            className="flex w-full items-center gap-3 border-t border-border/60 px-4 py-3.5 text-left hover:bg-foreground/[0.02] disabled:opacity-40"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-foreground/[0.06]"><LinkIcon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">Ask someone to fund you</span>
              <span className="block text-[13px] text-muted-foreground">Share a link anyone can pay, by wallet or card</span>
            </span>
            <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          </button>
        </section>

        {/* The amount typed above, asked for rather than paid. */}
        <section className="flex-1 bg-card px-4 pb-28 pt-3.5 md:flex-none md:rounded-xl md:border md:border-border md:pb-4">
          {numericAmount > 0 ? (
            <RequestFundsButton amount={numericAmount} purpose="Top up my Zero Club wallet" label={`Ask someone for ${format(numericAmount)}`} />
          ) : (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Use your balance for memberships, bootcamps, products and payments to other builders.
            </p>
          )}
        </section>
      </main>

      {/* ── Fund link drawer ── */}
      <Drawer open={linkOpen} onOpenChange={(open) => !open && !creating && resetLinkFlow()}>
        <DrawerContent
          desktopVariant="panel"
          className="border-none bg-background p-0 focus:ring-0 max-w-lg mx-auto max-h-[92dvh] flex flex-col"
        >
          <div className="shrink-0 px-5 pb-3 pt-1">
            <DrawerTitle className="font-display text-[20px] font-semibold leading-tight sm:text-[20px]">
              {createdSlug ? "Your fund link is ready" : "Generate a fund link"}
            </DrawerTitle>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
              {createdSlug
                ? "Share it anywhere. Whoever pays, the money lands in your wallet."
                : "Leave the amount blank to let the payer decide."}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2 no-scrollbar">
            {!createdSlug ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="fund-link-amount" className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                    Fixed amount (optional)
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-muted-foreground">
                      {details.symbol}
                    </span>
                    <input
                      id="fund-link-amount"
                      type="number"
                      min="1"
                      inputMode="decimal"
                      value={linkAmount}
                      onChange={(e) => setLinkAmount(e.target.value)}
                      placeholder="Any amount"
                      className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card pl-8 pr-3 text-[15px] font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground focus:border-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="fund-link-note" className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">
                    What is it for? (optional)
                  </label>
                  <input
                    id="fund-link-note"
                    value={linkNote}
                    onChange={(e) => setLinkNote(e.target.value)}
                    placeholder="e.g. Bootcamp fee"
                    maxLength={120}
                    className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                  />
                </div>

                <div className="flex items-start gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-3.5">
                  <ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#1a7f4b]" />
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Anyone with the link can add money to your wallet, but nobody can take money
                    out or see your balance.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="rounded-2xl bg-foreground/[0.04] px-4 py-3.5">
                    <p className="break-all text-[13px] font-medium leading-relaxed text-foreground/80">{shareUrl}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => copyToClipboard(shareUrl, "Fund link copied")}
                      className="flex h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-foreground/25 text-[15px] font-semibold text-foreground tap hover:bg-foreground/[0.04]"
                    >
                      <Copy className="h-[18px] w-[18px]" /> Copy
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
                      className="flex h-11 items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background tap hover:opacity-90"
                    >
                      <Share2 className="h-[18px] w-[18px]" /> Share
                    </button>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[13px] font-semibold text-muted-foreground">
                    Or send it to a Zero Club member
                  </p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={recipientQuery}
                      onChange={(e) => setRecipientQuery(e.target.value)}
                      placeholder="Search by name or @username"
                      className="h-11 w-full rounded-[10px] border border-foreground/15 bg-card pl-10 pr-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                    />
                  </div>

                  {recipients.length > 0 && (
                    <div className="mt-1">
                      {recipients.map((person) => {
                        const sent = sentTo.includes(person.id);
                        return (
                          <div key={person.id} className="flex items-center gap-3 py-3">
                            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground">
                              {person.avatar_url ? (
                                <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                              ) : (
                                (person.full_name || person.username || "?").charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold text-foreground">
                                {person.full_name || person.username}
                              </p>
                              <p className="truncate text-[13px] text-muted-foreground">@{person.username}</p>
                            </div>
                            <button
                              onClick={() => sendToMember(person)}
                              disabled={sent}
                              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold tap ${
                                sent
                                  ? "bg-[#1a7f4b]/10 text-[#1a7f4b]"
                                  : "bg-foreground text-background hover:opacity-90"
                              }`}
                            >
                              {sent ? <><Check className="h-4 w-4" /> Sent</> : <><Send className="h-4 w-4" /> Send</>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {!createdSlug ? (
              <div className="flex gap-2.5">
                <button
                  onClick={resetLinkFlow}
                  disabled={creating}
                  className="h-12 flex-1 rounded-full border-[1.5px] border-foreground/25 text-[16px] font-semibold text-foreground tap hover:bg-foreground/[0.04] disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateLink}
                  disabled={creating}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[16px] font-semibold text-white tap hover:opacity-90 disabled:opacity-40"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create link
                </button>
              </div>
            ) : (
              <button
                onClick={resetLinkFlow}
                className="h-12 w-full rounded-full bg-foreground text-[16px] font-semibold text-background tap hover:opacity-90"
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
