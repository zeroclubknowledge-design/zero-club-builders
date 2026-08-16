import { useLoaderData, createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { describeVerifyFailure } from "@/lib/paystack";
import { useUser } from "@/hooks/useUser";
import { 
  ArrowUpRight, Store, Send, QrCode, TrendingUp, 
  History, Star, Users, PenLine, Plus,
  Wallet as WalletIcon, Search, HelpCircle, BarChart3, Gift,
  ChevronLeft, Loader2, ArrowRight, ArrowDownLeft, Copy,
  Bell, EyeOff, Eye, Check, RefreshCw, ChevronDown, Settings, Landmark, X
} from "lucide-react";
import { useState, useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerDescription } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

export const Route = createFileRoute("/app/wallet/")({
  component: WalletPage,
});

const CustomWalletIcon = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={`bg-current ${className}`}
    style={{
      WebkitMaskImage: "url('/wallet_icon.png')",
      WebkitMaskSize: "contain",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      maskImage: "url('/wallet_icon.png')",
      maskSize: "contain",
      maskRepeat: "no-repeat",
      maskPosition: "center",
    }}
    {...props}
  />
);

function WalletPage() {
  const { data: profile, refetch, isFetching } = useUser();

  const handleRefresh = async () => {
    await refetch();
    toast.success("Wallet updated!");
  };
  const [openAction, setOpenAction] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<any | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [sendingFunds, setSendingFunds] = useState(false);
  const [suggestedRecipients, setSuggestedRecipients] = useState<any[]>([]);

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

  useEffect(() => {
    const fetchNetwork = async () => {
      try {
        const [{ data: following, error: err1 }, { data: followers, error: err2 }] = await Promise.all([
          supabase.from("follows").select("following_id, profiles!follows_following_id_fkey(id, username, full_name, avatar_url, xp, coins)").eq("follower_id", profile?.id),
          supabase.from("follows").select("follower_id, profiles!follows_follower_id_fkey(id, username, full_name, avatar_url, xp, coins)").eq("following_id", profile?.id)
        ]);
        
        if (err1) console.error("Error fetching following:", err1);
        if (err2) console.error("Error fetching followers:", err2);

        const networkMap = new Map();
        following?.forEach((f: any) => {
          if (f.profiles) networkMap.set(f.profiles.id, f.profiles);
        });
        followers?.forEach((f: any) => {
          if (f.profiles) networkMap.set(f.profiles.id, f.profiles);
        });
      
      let recipients = Array.from(networkMap.values());
      if (recipients.length === 0) {
        // Fallback to top users if no network
        const { data: topUsers } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, xp, coins")
          .neq("id", profile?.id)
          .order('xp', { ascending: false })
          .limit(10);
        if (topUsers) recipients = topUsers;
      }
      
      setSuggestedRecipients(recipients);
      } catch (err) {
        console.error("Error in fetchNetwork:", err);
      }
    };
    if (profile?.id) fetchNetwork();
  }, [profile?.id]);

  useEffect(() => {
    if (searchQuery.trim().length <= 1) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, xp, coins")
          .or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
          .neq("id", profile?.id)
          .limit(5);
        if (!error && data) {
          setSearchResults(data);
        }
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setSearching(false);
      }
    }, 300); // 300ms debounce
    return () => clearTimeout(delayDebounce);
  }, [searchQuery, profile?.id]);

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

  const handleActionChange = (action: string | null) => {
    setOpenAction(action);
    setAmount("");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedRecipient(null);
    setTransferAmount("");
  };

  const handleSendFunds = async () => {
    if (!profile || !selectedRecipient) return;
    const amountVal = parseInt(transferAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (Number(profile.zp || 0) < amountVal) {
      toast.error("Insufficient ZP balance");
      return;
    }

    setSendingFunds(true);
    try {
      // Atomic server-side transfer (balance check + both updates in one transaction)
      const { error: transferErr } = await supabase.rpc("transfer_zp", {
        recipient: selectedRecipient.id,
        amount: amountVal,
      });

      if (transferErr) throw transferErr;

      // 3. Log sender system notification/activity
      await supabase.from("notifications").insert({
        recipient_id: profile.id,
        actor_id: selectedRecipient.id,
        type: "system",
        content: `Sent ${amountVal} ZP to ${getFirstName(selectedRecipient)}`,
      });

      // 4. Log recipient system notification/activity
      await supabase.from("notifications").insert({
        recipient_id: selectedRecipient.id,
        actor_id: profile.id,
        type: "system",
        content: `Received ${amountVal} ZP from ${getFirstName(profile)}`,
      });

      toast.success(`Sent ${amountVal} ZP to ${getFirstName(selectedRecipient)}!`);
      handleActionChange(null);
      await refetch();
      refetchActivities?.();
    } catch (err: any) {
      console.error("Transfer failed:", err);
      toast.error(err.message || "Failed to process transfer. Please try again.");
    } finally {
      setSendingFunds(false);
    }
  };

  const handleRequestFunds = async () => {
    if (!profile || !selectedRecipient) return;
    const amountVal = parseInt(transferAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setSendingFunds(true);
    try {
      // Log recipient system notification/activity
      await supabase.from("notifications").insert({
        recipient_id: selectedRecipient.id,
        actor_id: profile.id,
        type: "system",
        content: `Requested ${amountVal} ZP from you.`,
      });

      toast.success(`Requested ${amountVal} ZP from ${getFirstName(selectedRecipient)}!`);
      handleActionChange(null);
    } catch (err: any) {
      console.error("Request failed:", err);
      toast.error(err.message || "Failed to process request. Please try again.");
    } finally {
      setSendingFunds(false);
    }
  };

  const handleCopyDetails = () => {
    const link = `${window.location.origin}/app/profile/${profile?.id}`;
    navigator.clipboard.writeText(`My Zero Club Wallet: ${link}`);
    toast.success("Account details copied!");
  };

  // ActionContent has been moved to separate premium pages

  return (
    <div className="min-h-screen bg-[#f8f7f5] pb-20 text-foreground dark:bg-background">
      {/* ── Header ── */}
      <header className="fixed left-1/2 top-0 z-20 flex w-full max-w-md -translate-x-1/2 items-center justify-between border-b border-border/60 bg-background px-5 pb-3 pt-[calc(1.25rem+env(safe-area-inset-top))] md:sticky md:left-0 md:max-w-full md:translate-x-0 md:px-8 md:pt-5">
        <div className="flex items-center gap-3">
          <button onClick={() => window.dispatchEvent(new CustomEvent('open-sidebar'))} className="h-9 w-9 rounded-full overflow-hidden ring-2 ring-border/30 shadow-sm shrink-0 transition-all duration-300 active:scale-95 hover:ring-primary/40 hover:shadow-md cursor-pointer">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-primary flex items-center justify-center font-bold text-white uppercase text-lg">
                {profile?.username?.substring(0, 1) || "U"}
              </div>
            )}
          </button>
          <div className="min-w-0">
            <h1 className="text-[18px] font-semibold leading-tight tracking-tight">Wallet</h1>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <Star className="h-3 w-3 fill-[#eab308] text-[#eab308]" />
              <span className="tabular-nums">{Number(profile?.zp || 0).toLocaleString()} ZP available</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 text-[11px] font-bold text-foreground outline-none transition active:scale-95 hover:bg-accent/70">
              <img src={currentCurrency.iconUrl} alt={currency} className="w-3.5 h-3.5 rounded-full object-cover shadow-sm ring-1 ring-border/50" />
              <span>{currency}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-lg border-border/60 bg-background p-2 shadow-xl">
              <DropdownMenuItem onClick={() => setCurrency("NGN")} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-xs font-bold cursor-pointer transition-colors ${currency ==="NGN" ? "bg-primary/10 text-primary" : "hover:bg-accent/60"}`}>
                <img src="https://flagcdn.com/ng.svg" alt="NGN" className="w-5 h-5 rounded-full object-cover shadow-sm ring-1 ring-border/50" />
                <span>Naira (NGN)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCurrency("USD")} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-xs font-bold cursor-pointer transition-colors ${currency ==="USD" ? "bg-primary/10 text-primary" : "hover:bg-accent/60"}`}>
                <img src="https://flagcdn.com/us.svg" alt="USD" className="w-5 h-5 rounded-full object-cover shadow-sm ring-1 ring-border/50" />
                <span>Dollar (USD)</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCurrency("GHS")} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-xs font-bold cursor-pointer transition-colors ${currency ==="GHS" ? "bg-primary/10 text-primary" : "hover:bg-accent/60"}`}>
                <img src="https://flagcdn.com/gh.svg" alt="GHS" className="w-5 h-5 rounded-full object-cover shadow-sm ring-1 ring-border/50" />
                <span>Cedi (GHS)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link to="/app/wallet/settings" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card transition active:scale-95 hover:bg-accent/60">
            <Settings className="h-4 w-4 text-foreground" />
          </Link>
        </div>
      </header>

      {/* ── Main Content Container ── */}
      <div className="mx-auto w-full md:max-w-[880px] md:px-8 md:pb-16 md:pt-8">
      <div className="md:mx-auto md:w-full md:min-w-0">
      <section className="px-5 pt-[calc(5.5rem+env(safe-area-inset-top))] md:px-0 md:pt-0 flex flex-col w-full">

          {/* One continuous premium surface: light, spacing and dividers carry
              the hierarchy without the old card-inside-a-card treatment. */}
          <div className="relative mb-4 flex min-h-[228px] flex-col overflow-hidden rounded-[26px] bg-gradient-to-br from-[#201924] via-[#151218] to-[#0e0c10] p-5 text-white shadow-[0_28px_65px_-30px_rgba(20,12,19,0.85)] ring-1 ring-black/10 sm:min-h-[252px] sm:p-6 md:p-7">
            {/* The pink hairline along the top and the tilted outlined square
                have gone. Both were decoration pretending to be structure,
                which is what read as cheap. The two soft colour washes stay —
                they give the card depth without drawing a shape on it. */}
            <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[#cc208f]/20 blur-[72px]" />
            <div className="pointer-events-none absolute -bottom-28 -right-16 h-52 w-52 rounded-full bg-[#713bff]/15 blur-[76px]" />

            {/* The same device the Zero Club Gift card uses: thick-bordered
                rings in the current colour at very low opacity. They read as
                embossing on the material rather than as drawn lines, which is
                why they add texture where the old hairline rule looked cheap. */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border-[20px] border-white opacity-[0.045]" />
            <div className="pointer-events-none absolute -bottom-14 right-20 h-28 w-28 rotate-12 border-[16px] border-white opacity-[0.035]" />

            <div className="relative z-10 flex flex-1 flex-col">
              {/* Brand line, as on the gift card. It gives the extra height
                  something to hold rather than just more empty space. */}
              <div className="mb-5 flex items-center gap-2">
                <img src="/logo.png" alt="" className="h-6 w-6 shrink-0 object-contain" />
                <span className="text-[11.5px] font-semibold tracking-tight text-white/85">Zero Wallet</span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-white/45">Available balance</p>
                  <h2 className="mt-2.5 flex items-start text-[40px] font-semibold leading-none tracking-[-0.045em] tabular-nums sm:text-[46px] md:text-[52px]">
                    <span className="mr-2 mt-1 text-[20px] font-medium tracking-normal text-white/55 sm:text-[23px]">{currentCurrency.symbol}</span>
                    <span>{showBalance ? displayBalance : "••••"}</span>
                  </h2>
                </div>

                <button
                  onClick={() => setShowBalance(!showBalance)}
                  aria-label={showBalance ? "Hide wallet balances" : "Show wallet balances"}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.065] text-white/55 ring-1 ring-white/[0.08] transition hover:bg-white/10 hover:text-white tap"
                >
                  {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Withdrawable earnings sits on the bottom line now, where the
                  ZC reference code used to be. That code was a truncated
                  profile id — not an account number anyone could pay into and
                  not something support ever asked for, so copying it achieved
                  nothing. This is the second figure people actually want. */}
              <div className="mt-auto flex items-baseline justify-between gap-4 pt-6">
                <p className="text-[9.5px] font-medium uppercase tracking-[0.15em] text-white/45">
                  Withdrawable earnings
                </p>
                <p className="shrink-0 text-[17px] font-semibold tracking-tight tabular-nums text-white">
                  {showBalance ? (split ? format(withdrawable) : "—") : "••••"}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons (Add Money & Send) */}
          <div className="flex gap-3 w-full mt-2">
            <Link to="/app/wallet/add-money" className="flex flex-1 flex-row items-center justify-center gap-2.5 rounded-lg bg-card px-2 py-4 ring-1 ring-border transition-all tap hover:ring-foreground/15">
              <div className="h-8 w-8 rounded-full bg-primary/8 ring-1 ring-primary/15 flex items-center justify-center">
                <Plus className="h-4 w-4 text-primary" strokeWidth={2.25} />
              </div>
              <span className="text-[13.5px] font-semibold tracking-tight text-foreground">Add money</span>
            </Link>

            <Link to="/app/wallet/send" className="flex flex-1 flex-row items-center justify-center gap-2.5 rounded-lg bg-card px-2 py-4 ring-1 ring-border transition-all tap hover:ring-foreground/15">
              <div className="h-8 w-8 rounded-full bg-primary/8 ring-1 ring-primary/15 flex items-center justify-center">
                <Send className="h-4 w-4 text-primary -ml-0.5" strokeWidth={2} />
              </div>
              <span className="text-[13.5px] font-semibold tracking-tight text-foreground">Send</span>
            </Link>
          </div>
      </section>

      {/* ── Quick Actions Grid (Under Add Money & Send) ── */}
      <section className="px-6 mt-6 md:px-0 md:mt-8">
        {/* One definition for all four, so they cannot drift apart again.
            Withdraw was a masked PNG and Gifts was a filled glyph, while Store
            and Earn were line icons — three different weights in one row. All
            four are now lucide strokes at the same size.

            On the cream theme these tiles used bg-secondary, which sits almost
            on top of the page background, so the row read as four floating
            icons with no container. bg-card with a real ring and a soft shadow
            gives them an actual surface in both themes. */}
        <div className="grid grid-cols-4 gap-2.5 md:gap-3">
          {[
            { to: "/app/store", label: "Store", Icon: Store },
            { to: "/app/quests", label: "Earn", Icon: TrendingUp },
            { to: "/app/wallet/withdraw", label: "Withdraw", Icon: Landmark },
            { to: "/app/gifts", label: "Gifts", Icon: Gift },
          ].map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              className="group flex flex-col items-center gap-2 rounded-lg bg-card px-1.5 py-3 ring-1 ring-border shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_20px_-14px_rgba(0,0,0,0.14)] transition-all active:scale-[0.97] hover:ring-foreground/15 md:flex-row md:justify-start md:gap-3 md:px-4 md:py-3.5"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/[0.08] text-primary ring-1 ring-primary/15 md:h-9 md:w-9 md:rounded-lg">
                <Icon className="h-[18px] w-[18px] md:h-4 md:w-4" strokeWidth={1.9} />
              </span>
              <span className="truncate text-[11px] font-semibold tracking-tight text-foreground md:text-[13.5px]">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      </div>

      {/* ── Transaction History ── */}
      <section id="transactions" className="mt-12 scroll-mt-24 px-6 md:mx-auto md:mt-8 md:w-full md:min-w-0 md:rounded-lg md:bg-card md:px-7 md:py-7 md:ring-1 md:ring-border">
        <div className="flex justify-between items-center mb-8 md:mb-5 md:pb-4 md:border-b md:hairline">
          <h3 className="text-[19px] md:text-[17px] font-semibold text-foreground tracking-tight">History</h3>
          <button className="text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
            View all →
          </button>
        </div>

        {/* Money that has been paid but is still being confirmed.
            Paying by bank transfer means leaving the app, and the checkout page
            is gone when you come back — so there has to be a way to say "I paid,
            check again" rather than only waiting on the webhook. */}
        {pendingTopups.length > 0 && (
          <div className="relative mb-4 rounded-lg bg-amber-500/[0.07] p-3.5 ring-1 ring-amber-500/20">
            {/* Dismiss, not cancel. This hides the card on this device; the
                payment is untouched and the webhook still credits it if the
                money lands. */}
            <button
              onClick={() => dismissPending(pendingTopups.map((t: any) => t.reference))}
              title="Dismiss"
              aria-label="Dismiss this notice"
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-amber-700/60 transition hover:bg-amber-500/10 hover:text-amber-700 tap"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="pr-8 text-[12px] font-semibold text-amber-700">
              {pendingTopups.length === 1 ? "A payment is waiting to be confirmed" : `${pendingTopups.length} payments are waiting to be confirmed`}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              Card payments clear in seconds. A bank transfer can take longer — if you have
              already sent it, check now.
            </p>
            <div className="mt-2.5 space-y-1.5">
              {pendingTopups.map((topup: any) => (
                <div key={topup.reference} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold tabular-nums text-foreground">
                      {format(Number(topup.amount) || 0)}
                    </p>
                    <p className="truncate text-[10.5px] text-muted-foreground">
                      Started {new Date(topup.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => checkPendingPayment(topup.reference)}
                    disabled={checkingReference !== null}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-amber-600 px-3.5 text-[11.5px] font-semibold text-white tap hover:opacity-90 disabled:opacity-50"
                  >
                    {checkingReference === topup.reference ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Check now
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {transactions.length > 0 ? (
          <div className="space-y-5 md:space-y-0 md:divide-y md:divide-border/30">
            {transactions.map((entry) => {
              const credit = entry.direction === "credit";
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 md:py-3.5 md:first:pt-0 md:last:pb-0">
                  <div className="flex min-w-0 items-center gap-4 md:gap-3">
                    <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full md:h-10 md:w-10 ${credit ? "bg-emerald-500/10 text-emerald-600" : "bg-foreground/[0.06] text-foreground"}`}>
                      {credit ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-sm font-medium text-foreground md:text-[13px] md:leading-snug">
                        {entry.description || (credit ? "Money in" : "Money out")}
                      </h5>
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                        {String(entry.source || "").replaceAll("_", " ")} · {new Date(entry.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`whitespace-nowrap text-sm font-bold tabular-nums ${credit ? "text-emerald-500" : "text-foreground"}`}>
                      {credit ? "+" : "-"}{format(Number(entry.amount) || 0)}
                    </p>
                    {entry.balance_after !== null && entry.balance_after !== undefined && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                        Balance {format(Number(entry.balance_after) || 0)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center mt-6">
            <div className="relative mb-10 w-full max-w-[280px]">
              {/* Skeletons to mimic the uploaded UI */}
              <div className="w-[200px] max-w-[71%] h-12 bg-secondary border border-border/40 rounded-xl mx-auto -mb-6 opacity-40 shadow-sm" />
              <div className="w-[240px] max-w-[86%] h-14 bg-secondary border border-border/40 rounded-xl mx-auto -mb-6 opacity-70 shadow-sm" />
              <div className="relative z-10 mx-auto flex w-[280px] max-w-full items-center gap-3 rounded-lg border border-border/40 bg-card p-4 shadow-sm">
                <div className="h-10 w-10 rounded-full bg-primary/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-2.5 w-3/4 rounded-full bg-primary/10" />
                  <div className="h-2 w-1/2 rounded-full bg-primary/10" />
                </div>
              </div>
            </div>
            <h4 className="text-xl font-medium text-foreground mb-2">No Transactions Yet</h4>
            <p className="text-sm text-muted-foreground max-w-[250px] leading-relaxed mx-auto">
              Your wallet activity will appear here once you've made a transaction.
            </p>
          </div>
        ) : (
          <div className="space-y-5 md:space-y-0 md:divide-y md:divide-border/30">
            {activities.map((activity) => {
              const isIncome = activity.content?.includes("Received") || activity.content?.includes("Earned") || activity.content?.includes("Claimed") || activity.content?.includes("reward");
              const amountMatch = activity.content?.match(/(\d[\d,]*)\s*(?:ZP|XP)/i);
              const amount = amountMatch ? amountMatch[1] : null;
              return (
                <div key={activity.id} className="flex items-center justify-between gap-3 md:py-3.5 md:first:pt-0 md:last:pb-0">
                  <div className="flex items-center gap-4 md:gap-3 min-w-0">
                    <div className="h-12 w-12 md:h-10 md:w-10 rounded-full overflow-hidden bg-secondary border border-border/40 shrink-0">
                      {activity.actor?.avatar_url ? (
                        <img src={activity.actor.avatar_url} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground font-bold">
                          {activity.actor?.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-sm font-medium text-foreground md:text-[13px] md:leading-snug md:line-clamp-2">{activity.content}</h5>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(activity.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold tabular-nums whitespace-nowrap ${isIncome ?'text-emerald-500' : 'text-foreground'}`}>
                      {amount ? `${isIncome ? '+' : '-'}${amount} ZP` : '—'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
