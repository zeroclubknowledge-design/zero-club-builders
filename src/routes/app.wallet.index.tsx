import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { describeVerifyFailure } from "@/lib/paystack";
import { useUser } from "@/hooks/useUser";
import { ArrowUpRight, Store, HandCoins, TrendingUp, History, Plus, Gift, Loader2, ArrowDownLeft, EyeOff, Eye, Check, RefreshCw, ChevronDown, Landmark, X, ArrowLeft, SlidersHorizontal, Receipt } from "@/components/icons/glyphs";
import { useState, useEffect } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";
import { useGoBack } from "@/hooks/useGoBack";

export const Route = createFileRoute("/app/wallet/")({
  component: WalletPage,
});

function WalletPage() {
  const { data: profile, refetch, isFetching } = useUser();
  const goBack = useGoBack("/app");

  const handleRefresh = async () => {
    await refetch();
    toast.success("Wallet updated!");
  };

  const { currency, setCurrency, details: currentCurrency, fromBaseAmount, format } = useWalletCurrency();
  const [showBalance, setShowBalance] = useState(true);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning,";
    if (hour < 18) return "Good afternoon,";
    return "Good evening,";
  };

  const displayBalance = fromBaseAmount(profile?.coins || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  // Real ledger: every credit and debit, with the balance after each one.
  // Falls back to the older notification feed if the ledger is not installed yet.
  const { data: walletHistory, refetch: refetchActivities } = useQuery({
    queryKey: ["wallet-history", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_wallet_history", { limit_count: 60 });
      if (error) {
        const { data: legacy } = await supabase
          .from("notifications")
          .select("*, actor:profiles!actor_id(username, full_name, avatar_url)")
          .eq("type", "system")
          .order("created_at", { ascending: false });
        return { transactions: [], pending_topups: [], legacy: legacy || [] } as any;
      }
      return data as any;
    },
  });

  const transactions = (walletHistory?.transactions || []) as any[];
  const allPendingTopups = (walletHistory?.pending_topups || []) as any[];

  /* How much of this balance came from work, as opposed to being topped up.
     Only earnings can be withdrawn, so the two numbers have to be visible
     side by side or the Withdraw button is a trap. Fails soft: if the
     function is not installed yet, the split simply is not shown. */
  const { data: split } = useQuery({
    queryKey: ["withdrawable", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_withdrawable_balance");
      if (error) return null;
      return data as { balance: number; earned: number; withdrawable: number } | null;
    },
  });

  const withdrawable = Number(split?.withdrawable ?? 0);

  /* Dismissing hides the card on this device and nothing more. It does not
     cancel the payment and cannot: if the money does arrive, Paystack's
     webhook still credits the wallet. Kept in localStorage and keyed by
     reference so a genuinely new payment reappears. */
  const DISMISSED_KEY = "zc_dismissed_topups";
  const [dismissedRefs, setDismissedRefs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const dismissPending = (references: string[]) => {
    setDismissedRefs((prev) => {
      const next = Array.from(new Set([...prev, ...references])).slice(-50);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — it just will not persist */
      }
      return next;
    });
  };

  const pendingTopups = allPendingTopups.filter(
    (t: any) => !dismissedRefs.includes(t.reference),
  );

  /* Re-ask Paystack about one unconfirmed payment. The browser never decides
     the outcome — paystack-verify asks Paystack and credits only if the money
     really arrived, and crediting twice is impossible. */
  const [checkingReference, setCheckingReference] = useState<string | null>(null);

  const checkPendingPayment = async (reference: string) => {
    setCheckingReference(reference);
    try {
      const { data, error } = await supabase.functions.invoke("paystack-verify", {
        body: { reference },
      });
      if (error) throw new Error(error.message || "We could not check that payment");
      if ((data as any)?.error) throw new Error((data as any).error);

      await refetch?.();
      await refetchActivities();

      toast.success(
        (data as any)?.credited === false
          ? "That payment was already added to your wallet"
          : "Payment confirmed — your wallet has been updated",
      );
    } catch (error: any) {
      // Covers both "the transfer has not landed" and "the checker itself is
      // unreachable", which are very different problems and used to read the
      // same alarming way.
      const { message, description } = describeVerifyFailure(error);
      toast.error(message, { description });
    } finally {
      setCheckingReference(null);
    }
  };
  const legacyActivities = (walletHistory?.legacy || []) as any[];
  const activities = legacyActivities;

  // Robust, fail-safe programmatic referral auto-claim and follow resolver
  useEffect(() => {
    if (profile && profile.referred_by && !profile.referral_reward_claimed) {
      const claimReferralReward = async () => {
        try {
          console.log("Auto-claiming referral reward... Referee:", profile.id, "Referrer:", profile.referred_by);
          
          // Check if already following referrer
          const { data: existingFollow } = await supabase
            .from("follows")
            .select("*")
            .eq("follower_id", profile.id)
            .eq("following_id", profile.referred_by)
            .maybeSingle();
            
          if (!existingFollow) {
            // Programmatically follow the referrer to fire the database trigger
            const { error: followError } = await supabase
              .from("follows")
              .insert({
                follower_id: profile.id,
                following_id: profile.referred_by
              });
              
            if (followError) {
              console.error("Error programmatically following referrer:", followError);
            } else {
              console.log("Programmatically followed referrer! Triggering reward trigger...");
              toast.success("Referral reward of 200 ZP claimed!");
              await refetch();
              refetchActivities?.();
            }
          } else {
            // If follow relation already existed but trigger didn't fire, re-trigger it
            await supabase
              .from("follows")
              .delete()
              .eq("follower_id", profile.id)
              .eq("following_id", profile.referred_by);
              
            const { error: reFollowError } = await supabase
              .from("follows")
              .insert({
                follower_id: profile.id,
                following_id: profile.referred_by
              });
              
            if (!reFollowError) {
              console.log("Re-triggered follow relation to activate DB trigger!");
              toast.success("Referral reward of 200 ZP claimed!");
              await refetch();
              refetchActivities?.();
            }
          }
        } catch (err) {
          console.error("Failed to auto-claim referral reward:", err);
        }
      };
      
      claimReferralReward();
    }
  }, [profile, refetch, refetchActivities]);

  const dayHeading = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      <header className="sticky top-0 z-20 bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 max-w-[680px] items-center gap-1 px-2">
          <button onClick={goBack} aria-label="Back" className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Wallet</h1>
          <Link to="/app/wallet/settings" aria-label="Wallet settings" className="grid h-11 w-10 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]">
            <SlidersHorizontal className="h-[22px] w-[22px]" />
          </Link>
        </div>
      </header>

      <div className="zc-page-width mx-auto w-full max-w-[680px]">
        <section className="bg-card px-4 pb-5 pt-1 md:rounded-b-xl">
          {/* The Zero Wallet card as it was designed: dark gradient base, soft
              pink and violet washes for depth, and thick low-opacity rings that
              read as embossing on the material. Currency and ZP now live on it
              too, since the header above no longer carries them. */}
          <div className="relative flex min-h-[228px] flex-col overflow-hidden rounded-[26px] bg-gradient-to-br from-[#201924] via-[#151218] to-[#0e0c10] p-5 text-white shadow-[0_28px_65px_-30px_rgba(20,12,19,0.85)] ring-1 ring-black/10 sm:min-h-[252px] sm:p-6">
            <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[#cc208f]/20 blur-[72px]" />
            <div className="pointer-events-none absolute -bottom-28 -right-16 h-52 w-52 rounded-full bg-[#713bff]/15 blur-[76px]" />
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border-[20px] border-white opacity-[0.045]" />
            <div className="pointer-events-none absolute -bottom-14 right-20 h-28 w-28 rotate-12 border-[16px] border-white opacity-[0.035]" />

            <div className="relative z-10 flex flex-1 flex-col">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <img src="/logo.png" alt="" className="h-6 w-6 shrink-0 object-contain" loading="lazy" decoding="async" />
                  <span className="text-[13px] font-semibold text-white/85">Zero Wallet</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 text-[13px] font-semibold text-white outline-none ring-1 ring-white/10 hover:bg-white/[0.12]">
                    <img src={currentCurrency.iconUrl} alt="" className="h-4 w-4 rounded-full object-cover" loading="lazy" decoding="async" />
                    {currency}
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {[
                      { code: "NGN", label: "Naira (NGN)", flag: "https://flagcdn.com/ng.svg" },
                      { code: "USD", label: "Dollar (USD)", flag: "https://flagcdn.com/us.svg" },
                      { code: "GHS", label: "Cedi (GHS)", flag: "https://flagcdn.com/gh.svg" },
                    ].map((option) => (
                      <DropdownMenuItem key={option.code} onClick={() => setCurrency(option.code as any)} className="flex cursor-pointer items-center gap-3 py-2.5">
                        <img src={option.flag} alt="" className="h-5 w-5 rounded-full object-cover" loading="lazy" decoding="async" />
                        <span className="flex-1 text-sm font-medium">{option.label}</span>
                        {currency === option.code && <Check className="h-4 w-4" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-white/50">Available balance</p>
                  <h2 className="mt-2.5 flex items-start text-[40px] font-semibold leading-none tracking-[-0.045em] tabular-nums sm:text-[46px]">
                    <span className="mr-2 mt-1 text-[20px] font-medium tracking-normal text-white/55 sm:text-[23px]">{currentCurrency.symbol}</span>
                    <span>{showBalance ? displayBalance : "••••"}</span>
                  </h2>
                </div>
                <button
                  onClick={() => setShowBalance(!showBalance)}
                  aria-label={showBalance ? "Hide wallet balances" : "Show wallet balances"}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.065] text-white/60 ring-1 ring-white/[0.08] transition hover:bg-white/10 hover:text-white tap"
                >
                  {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="mt-auto space-y-1.5 pt-6">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/50">Withdrawable earnings</p>
                  <p className="shrink-0 text-[17px] font-semibold tracking-tight tabular-nums text-white">
                    {showBalance ? (split ? format(withdrawable) : "—") : "••••"}
                  </p>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/50">Zero Points</p>
                  <p className="shrink-0 text-[15px] font-semibold tabular-nums text-white/90">{Number(profile?.zp || 0).toLocaleString()} ZP</p>
                </div>
              </div>
            </div>
          </div>

          {/* The two things people come to a wallet to do come first. */}
          <div className="mt-5 grid grid-cols-4 text-center">
            {[
              { to: "/app/wallet/add-money", label: "Add money", Icon: Plus, primary: true },
              { to: "/app/wallet/withdraw", label: "Withdraw", Icon: Landmark },
              { to: "/app/wallet/request", label: "Request", Icon: HandCoins },
              { to: "/app/gifts", label: "Gifts", Icon: Gift },
            ].map(({ to, label, Icon, primary }) => (
              <Link key={to} to={to} className="group flex flex-col items-center gap-1.5 tap">
                <span className={`grid h-[52px] w-[52px] place-items-center rounded-full transition-colors ${primary ? "bg-accent text-accent-foreground" : "bg-foreground/[0.06] text-foreground group-hover:bg-foreground/[0.09]"}`}>
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span className="text-[12px] font-semibold text-foreground">{label}</span>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Link to="/app/store" className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-foreground/20 text-[14px] font-semibold text-foreground tap hover:bg-foreground/[0.04]">
              <Store className="h-[18px] w-[18px]" /> Zero Store
            </Link>
            <Link to="/app/quests" className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-foreground/20 text-[14px] font-semibold text-foreground tap hover:bg-foreground/[0.04]">
              <TrendingUp className="h-[18px] w-[18px]" /> Earn
            </Link>
          </div>
        </section>

        <section id="transactions" className="mt-2 scroll-mt-24 bg-card pb-3 pt-4 md:rounded-xl md:border md:border-border">
          <h2 className="px-4 font-display text-[18px] font-semibold text-foreground">History</h2>

          {/* Money that has been paid but is still being confirmed.
              Paying by bank transfer means leaving the app, and the checkout page
              is gone when you come back — so there has to be a way to say "I paid,
              check again" rather than only waiting on the webhook. */}
          {pendingTopups.length > 0 && (
            <div className="relative mx-4 mt-3 rounded-xl bg-warning/[0.08] p-3.5">
              {/* Dismiss, not cancel. This hides the card on this device; the
                  payment is untouched and the webhook still credits it if the
                  money lands. */}
              <button
                onClick={() => dismissPending(pendingTopups.map((t: any) => t.reference))}
                title="Dismiss"
                aria-label="Dismiss this notice"
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="pr-8 text-[14px] font-semibold text-foreground">
                {pendingTopups.length === 1 ? "A payment is waiting to be confirmed" : `${pendingTopups.length} payments are waiting to be confirmed`}
              </p>
              <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">
                Card payments clear in seconds. A bank transfer can take longer — if you have already sent it, check now.
              </p>
              <div className="mt-2.5 space-y-2">
                {pendingTopups.map((topup: any) => (
                  <div key={topup.reference} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold tabular-nums text-foreground">{format(Number(topup.amount) || 0)}</p>
                      <p className="truncate text-[12px] text-muted-foreground">Started {new Date(topup.created_at).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => checkPendingPayment(topup.reference)}
                      disabled={checkingReference !== null}
                      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[14px] font-semibold text-background tap hover:opacity-90 disabled:opacity-50"
                    >
                      {checkingReference === topup.reference ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Check now
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {transactions.length > 0 ? (
            <div className="mt-1">
              {transactions.map((entry, index) => {
                const credit = entry.direction === "credit";
                const heading = dayHeading(entry.created_at);
                const showHeading = index === 0 || dayHeading(transactions[index - 1].created_at) !== heading;
                return (
                  <div key={entry.id}>
                    {showHeading && <p className="px-4 pb-1 pt-3 text-[12px] font-semibold text-muted-foreground">{heading}</p>}
                    <Link
                      to="/app/wallet/transaction/$id"
                      params={{ id: entry.id }}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-foreground/[0.02]"
                    >
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${credit ? "bg-success/10 text-success" : "bg-foreground/[0.06] text-foreground"}`}>
                        {credit ? <ArrowDownLeft className="h-[18px] w-[18px]" /> : <ArrowUpRight className="h-[18px] w-[18px]" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-foreground">
                          {entry.description || (credit ? "Money in" : "Money out")}
                        </span>
                        <span className="block truncate text-[12px] capitalize text-muted-foreground">
                          {new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {entry.source ? ` · ${String(entry.source).replaceAll("_", " ")}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block whitespace-nowrap text-[15px] font-semibold tabular-nums ${credit ? "text-success" : "text-foreground"}`}>
                          {credit ? "+" : "−"}{format(Number(entry.amount) || 0)}
                        </span>
                        {entry.balance_after !== null && entry.balance_after !== undefined && (
                          <span className="block text-[12px] tabular-nums text-muted-foreground">Balance {format(Number(entry.balance_after) || 0)}</span>
                        )}
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center px-8 py-12 text-center">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-foreground/[0.05]">
                <Receipt className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-[17px] font-semibold text-foreground">No transactions yet</h3>
              <p className="mt-1 max-w-[250px] text-[14px] leading-relaxed text-muted-foreground">Your wallet activity will appear here once you've made a transaction.</p>
            </div>
          ) : (
            <div className="mt-1">
              {activities.map((activity) => {
                const isIncome = activity.content?.includes("Received") || activity.content?.includes("Earned") || activity.content?.includes("Claimed") || activity.content?.includes("reward");
                const amountMatch = activity.content?.match(/(\d[\d,]*)\s*(?:ZP|XP)/i);
                const amount = amountMatch ? amountMatch[1] : null;
                return (
                  <div key={activity.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[14px] font-semibold text-muted-foreground">
                      {activity.actor?.avatar_url ? (
                        <img src={activity.actor.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        activity.actor?.username?.[0]?.toUpperCase()
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-[14px] text-foreground">{activity.content}</span>
                      <span className="block text-[12px] text-muted-foreground">{new Date(activity.created_at).toLocaleDateString()}</span>
                    </span>
                    <span className={`shrink-0 whitespace-nowrap text-[15px] font-semibold tabular-nums ${isIncome ? "text-success" : "text-foreground"}`}>
                      {amount ? `${isIncome ? "+" : "−"}${amount} ZP` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
      {/* The last card runs to the bottom of the screen, so the page never
          ends in a strip of bare background under the tab bar. */}
      <div aria-hidden className="min-h-24 flex-1 bg-card md:bg-transparent" />
    </div>
  );
}
