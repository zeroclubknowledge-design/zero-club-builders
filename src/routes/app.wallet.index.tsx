import { useLoaderData, createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { 
  ArrowUpRight, Store, Send, QrCode, TrendingUp, 
  History, Star, Users, PenLine, Box, Plus, 
  Wallet as WalletIcon, Search, HelpCircle, BarChart3, Gift,
  ChevronLeft, Loader2, ArrowRight, ArrowDownLeft, Copy,
  Bell, EyeOff, Eye, Check, RefreshCw, ChevronDown, Settings
} from "lucide-react";
import { useState, useEffect } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerDescription } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getFirstName } from "@/lib/utils";

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

  const [currency, setCurrency] = useState<"NGN" | "GHS" | "USD">(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem("wallet_currency") as "NGN" | "GHS" | "USD") || "NGN";
    }
    return "NGN";
  });
  const [showBalance, setShowBalance] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    localStorage.setItem("wallet_currency", currency);
  }, [currency]);

  const getCurrencyDetails = () => {
    switch (currency) {
      case "USD": return { flag: "$", symbol: "$", label: "USD Wallet", rate: 1500, iconUrl: "https://flagcdn.com/us.svg" };
      case "GHS": return { flag: "GH₵", symbol: "GH₵", label: "GHS Wallet", rate: 100, iconUrl: "https://flagcdn.com/gh.svg" };
      case "NGN":
      default: return { flag: "₦", symbol: "₦", label: "NGN Wallet", rate: 1, iconUrl: "https://flagcdn.com/ng.svg" };
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning,";
    if (hour < 18) return "Good afternoon,";
    return "Good evening,";
  };

  const currentCurrency = getCurrencyDetails();
  const displayBalance = ((profile?.coins || 0) / currentCurrency.rate).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const { data: activitiesData, refetch: refetchActivities } = useQuery({
    queryKey: ["wallet-activities", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*, actor:profiles!actor_id(username, full_name, avatar_url)")
        .eq("type", "system")
        .order("created_at", { ascending: false });
        
      if (error) {
        console.error("Error fetching activities:", error);
        return [];
      }
      return data || [];
    }
  });

  const activities = activitiesData || [];

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
              toast.success("Referral reward of 200 XP claimed!");
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
              toast.success("Referral reward of 200 XP claimed!");
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
    if (profile.xp < amountVal) {
      toast.error("Insufficient XP balance");
      return;
    }

    setSendingFunds(true);
    try {
      // 1. Deduct XP from sender
      const { error: senderErr } = await supabase
        .from("profiles")
        .update({ xp: profile.xp - amountVal })
        .eq("id", profile.id);

      if (senderErr) throw senderErr;

      // 2. Add XP to recipient
      const { error: recipientErr } = await supabase
        .from("profiles")
        .update({ xp: (selectedRecipient.xp || 0) + amountVal })
        .eq("id", selectedRecipient.id);

      if (recipientErr) throw recipientErr;

      // 3. Log sender system notification/activity
      await supabase.from("notifications").insert({
        profile_id: profile.id,
        actor_id: selectedRecipient.id,
        type: "system",
        content: `Sent ${amountVal} XP to ${getFirstName(selectedRecipient)}`,
      });

      // 4. Log recipient system notification/activity
      await supabase.from("notifications").insert({
        profile_id: selectedRecipient.id,
        actor_id: profile.id,
        type: "system",
        content: `Received ${amountVal} XP from ${getFirstName(profile)}`,
      });

      toast.success(`Sent ${amountVal} XP to ${getFirstName(selectedRecipient)}!`);
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
        profile_id: selectedRecipient.id,
        actor_id: profile.id,
        type: "system",
        content: `Requested ${amountVal} XP from you.`,
      });

      toast.success(`Requested ${amountVal} XP from ${getFirstName(selectedRecipient)}!`);
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
    <div className="min-h-screen bg-background text-foreground pb-24 transition-colors duration-300">
      {/* ── Header ── */}
      <header className={`fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md md:sticky md:left-0 md:translate-x-0 md:max-w-full z-20 bg-background/70 backdrop-blur-2xl px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] md:pt-[1.5rem] pb-3 transition-all duration-300 flex items-center justify-between ${isScrolled ? "border-b border-border/40" : ""}`}>
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
          <div className="flex items-center gap-1.5 bg-accent/30 px-2.5 py-1 rounded-full border border-border/40">
            <Star className="h-3.5 w-3.5 text-[#ffcf00] fill-[#ffcf00]" />
            <span className="text-[12px] font-bold tracking-wide">{profile?.xp || 0} XP</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full bg-accent/50 px-2.5 h-8 text-[11px] font-bold text-foreground transition active:scale-95 outline-none border border-border/40 hover:bg-accent/70">
              <img src={currentCurrency.iconUrl} alt={currency} className="w-3.5 h-3.5 rounded-full object-cover shadow-sm ring-1 ring-border/50" />
              <span>{currency}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl border-border/40 bg-background/95 backdrop-blur-xl p-2 shadow-xl">
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

          <Link to="/app/wallet/settings" className="h-9 w-9 rounded-full bg-card shadow-sm border border-border/40 flex items-center justify-center transition-transform active:scale-95">
            <Settings className="h-4 w-4 text-foreground" />
          </Link>
        </div>
      </header>

      {/* ── Main Content Container ── */}
      <section className="px-5 pt-[calc(5.5rem+env(safe-area-inset-top))] flex flex-col w-full">

          {/* Red Balance Card (3D Design) */}
          <div 
            className="relative overflow-hidden rounded-[32px] bg-primary p-10 text-center text-primary-foreground mb-4 shadow-[0_20px_40px_-15px_rgba(var(--primary),0.5)] transition-all duration-300 transform perspective-[1000px] hover:rotate-x-[2deg] hover:rotate-y-[-2deg]"
          >
            <div className="absolute inset-0 opacity-[0.15] pointer-events-none" style={{ backgroundImage: "url('/logo.png')", backgroundSize: '50px 50px', backgroundPosition: 'center', transform: 'rotate(-10deg) scale(1.5)' }} />

            <div className="relative z-10 flex flex-col items-center justify-center">
              <h2 className="text-5xl font-medium tracking-tight mb-2 flex items-center justify-center drop-shadow-md">
                <span className="text-4xl mr-1 font-normal opacity-90">{currentCurrency.symbol}</span>
                {showBalance ? displayBalance : "••••"}
              </h2>
              <p className="text-sm font-medium text-primary-foreground/90">Balance</p>
              <div className="flex items-center gap-1.5 mt-4 bg-black/20 dark:bg-white/10 px-4 py-2 rounded-full border border-primary-foreground/20 backdrop-blur-md shadow-inner">
                <span className="text-[11px] font-bold text-primary-foreground tracking-widest">
                  ZC - {profile?.id?.slice(0, 10).toUpperCase() || "9710478080"}
                </span>
                <button onClick={handleCopyDetails} className="active:scale-90 transition-transform hover:opacity-70 ml-1">
                  <Copy className="h-3.5 w-3.5 text-primary-foreground" />
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons (Add Money & Send) */}
          <div className="flex gap-3 w-full mt-2">
            <Link to="/app/wallet/add-money" className="flex-1 flex flex-row items-center justify-center gap-2.5 rounded-[24px] bg-card py-4 px-2 shadow-sm border border-border/50 transition-all hover:shadow-md active:scale-[0.98]">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Plus className="h-4 w-4 text-primary" strokeWidth={3} />
              </div>
              <span className="text-[14px] font-bold text-foreground">Add Money</span>
            </Link>

            <Link to="/app/wallet/send" className="flex-1 flex flex-row items-center justify-center gap-2.5 rounded-[24px] bg-card py-4 px-2 shadow-sm border border-border/50 transition-all hover:shadow-md active:scale-[0.98]">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Send className="h-4 w-4 text-primary -ml-0.5" strokeWidth={2.5} />
              </div>
              <span className="text-[14px] font-bold text-foreground">Send</span>
            </Link>
          </div>
      </section>

      {/* ── Quick Actions Grid (Under Add Money & Send) ── */}
      <section className="px-6 mt-6">
        <div className="grid grid-cols-4 gap-3">
          <Link to="/app/store" className="flex flex-col items-center gap-2 group transition-transform active:scale-95">
            <div className="h-[52px] w-[52px] rounded-full bg-secondary flex items-center justify-center shadow-sm border border-border/40">
              <Store className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">Store</span>
          </Link>
          
          <Link to="/app/quests" className="flex flex-col items-center gap-2 group transition-transform active:scale-95">
            <div className="h-[52px] w-[52px] rounded-full bg-secondary flex items-center justify-center shadow-sm border border-border/40">
              <TrendingUp className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">Earn</span>
          </Link>

          <Link to="/app/wallet/withdraw" className="flex flex-col items-center gap-2 group transition-transform active:scale-95">
            <div className="h-[52px] w-[52px] rounded-full bg-secondary flex items-center justify-center shadow-sm border border-border/40">
              <CustomWalletIcon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">Withdraw</span>
          </Link>

          <button className="flex flex-col items-center gap-2 group transition-transform active:scale-95">
            <div className="h-[52px] w-[52px] rounded-full bg-secondary flex items-center justify-center shadow-sm border border-border/40">
              <Box className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">More</span>
          </button>
        </div>
      </section>

      {/* ── Transaction History ── */}
      <section id="transactions" className="px-6 mt-12 scroll-mt-24">
        <div className="flex justify-between items-center mb-10">
          <h3 className="text-[22px] font-black text-foreground tracking-tight">History</h3>
          <button className="text-sm font-medium text-primary">
            View All
          </button>
        </div>

        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center mt-6">
            <div className="relative mb-10">
              {/* Skeletons to mimic the uploaded UI */}
              <div className="w-[200px] h-12 bg-secondary border border-border/40 rounded-xl mx-auto -mb-6 opacity-40 shadow-sm" />
              <div className="w-[240px] h-14 bg-secondary border border-border/40 rounded-xl mx-auto -mb-6 opacity-70 shadow-sm" />
              <div className="w-[280px] bg-card border border-border/40 rounded-2xl p-4 shadow-sm flex items-center gap-3 relative z-10">
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
          <div className="space-y-5">
            {activities.map((activity) => {
              const isIncome = activity.content?.includes("Received") || activity.content?.includes("Claimed") || activity.content?.includes("reward");
              return (
                <div key={activity.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full overflow-hidden bg-secondary border border-border/40 shrink-0">
                      {activity.actor?.avatar_url ? (
                        <img src={activity.actor.avatar_url} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground font-bold">
                          {activity.actor?.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <h5 className="text-sm font-medium text-foreground">{activity.content}</h5>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(activity.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${isIncome ?'text-emerald-500' : 'text-foreground'}`}>
                      {isIncome ? '+' : '-'} XP
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
