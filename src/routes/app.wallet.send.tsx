import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, Loader2, Send, ArrowRight, Copy } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { getFirstName } from "@/lib/utils";

export const Route = createFileRoute("/app/wallet/send")({
  component: SendMoneyPage,
});

function SendMoneyPage() {
  const navigate = useNavigate();
  const { data: profile, refetch } = useUser();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<any | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [sendingFunds, setSendingFunds] = useState(false);
  const [suggestedRecipients, setSuggestedRecipients] = useState<any[]>([]);

  useEffect(() => {
    const fetchNetwork = async () => {
      try {
        const [{ data: following }, { data: followers }] = await Promise.all([
          supabase.from("follows").select("following_id, profiles!follows_following_id_fkey(id, username, full_name, avatar_url, xp, coins)").eq("follower_id", profile?.id),
          supabase.from("follows").select("follower_id, profiles!follows_follower_id_fkey(id, username, full_name, avatar_url, xp, coins)").eq("following_id", profile?.id)
        ]);

        const networkMap = new Map();
        following?.forEach((f: any) => {
          if (f.profiles) networkMap.set(f.profiles.id, f.profiles);
        });
        followers?.forEach((f: any) => {
          if (f.profiles) networkMap.set(f.profiles.id, f.profiles);
        });
      
        let recipients = Array.from(networkMap.values());
        if (recipients.length === 0) {
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
        console.error("Error fetching network:", err);
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
        const cleanSearch = searchQuery.trim().replace(/^@/, '').replace(/[,"]/g, '');
        if (!cleanSearch) {
          setSearchResults([]);
          setSearching(false);
          return;
        }

        let query = supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, xp, coins")
          .or(`username.ilike."%${cleanSearch}%",full_name.ilike."%${cleanSearch}%"`)
          .limit(5);

        if (profile?.id) {
          query = query.neq("id", profile.id);
        }

        const { data, error } = await query;
        if (!error && data) {
          setSearchResults(data);
        }
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery, profile?.id]);

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
      const { error: senderErr } = await supabase
        .from("profiles")
        .update({ xp: profile.xp - amountVal })
        .eq("id", profile.id);
      if (senderErr) throw senderErr;

      const { error: recipientErr } = await supabase
        .from("profiles")
        .update({ xp: (selectedRecipient.xp || 0) + amountVal })
        .eq("id", selectedRecipient.id);
      if (recipientErr) throw recipientErr;

      await supabase.from("notifications").insert({
        profile_id: profile.id,
        actor_id: selectedRecipient.id,
        type: "system",
        content: `Sent ${amountVal} XP to ${getFirstName(selectedRecipient)}`,
      });

      await supabase.from("notifications").insert({
        profile_id: selectedRecipient.id,
        actor_id: profile.id,
        type: "system",
        content: `Received ${amountVal} XP from ${getFirstName(profile)}`,
      });

      toast.success(`Sent ${amountVal} XP to ${getFirstName(selectedRecipient)}!`);
      await refetch();
      navigate({ to: "/app/wallet" });
    } catch (err: any) {
      console.error("Transfer failed:", err);
      toast.error(err.message || "Failed to process transfer. Please try again.");
    } finally {
      setSendingFunds(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 transition-colors duration-300 px-6">
      <header className="flex items-center gap-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-6">
        <button 
          onClick={() => {
            if (selectedRecipient) {
              setSelectedRecipient(null);
              setTransferAmount("");
            } else {
              navigate({ to: "/app/wallet" });
            }
          }}
          className="h-10 w-10 rounded-full bg-accent/20 border border-border/40 flex items-center justify-center transition-transform active:scale-95 shadow-sm shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-2xl font-black tracking-tight text-foreground truncate">
          {selectedRecipient ? `Send to ${selectedRecipient.username}` : "Send Funds"}
        </h1>
      </header>

      <div className="flex flex-col gap-6 pt-2 text-foreground max-w-md mx-auto">
        {selectedRecipient ? (
          <>
            <div className="flex items-center gap-4 p-5 rounded-3xl bg-accent/10 border border-border/30 shadow-sm backdrop-blur-md">
              <div className="h-16 w-16 rounded-full bg-muted overflow-hidden shrink-0 border-2 border-border/30 shadow-sm">
                {selectedRecipient.avatar_url ? (
                  <img src={selectedRecipient.avatar_url} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary font-black text-xl">
                    {selectedRecipient.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <h4 className="font-black text-foreground text-base tracking-tight">{selectedRecipient.full_name || selectedRecipient.username}</h4>
                <p className="text-sm text-muted-foreground mt-0.5">{getFirstName(selectedRecipient)}</p>
              </div>
            </div>

            <div className="space-y-3 mt-4">
              <div className="flex justify-between items-center px-1">
                <label className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">Amount of XP</label>
                <span className="text-[11px] font-medium text-muted-foreground">Balance: <strong className="text-foreground font-black">{profile?.xp || 0} XP</strong></span>
              </div>
              
              <div className="relative">
                <input 
                  type="number" 
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0" 
                  className="w-full rounded-3xl bg-accent/10 p-6 pr-20 text-5xl font-black tracking-tight outline-none ring-primary transition-all duration-300 focus:ring-2 text-foreground border border-border/30 focus:border-primary/50 shadow-sm"
                  autoFocus
                  min="1"
                  max={profile?.xp || 0}
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xl font-black text-primary/70">XP</span>
              </div>

              {parseInt(transferAmount) > 0 && (
                <p className="text-xs font-bold text-emerald-500 flex items-center gap-1.5 pl-2 mt-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>₦{parseInt(transferAmount).toLocaleString()} cash equivalent</span>
                </p>
              )}
            </div>

            <button 
              onClick={handleSendFunds}
              disabled={sendingFunds || !transferAmount || parseInt(transferAmount) <= 0 || parseInt(transferAmount) > (profile?.xp || 0)}
              className="mt-6 w-full rounded-full bg-foreground py-4 font-bold text-background shadow-[0_2px_20px_-4px_rgba(0,0,0,0.15)] transition-all duration-300 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2.5 text-base"
            >
              {sendingFunds ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</>
              ) : (
                <><Send className="h-5 w-5" /> Send XP Now</>
              )}
            </button>
          </>
        ) : (
          <>
            <div className="relative group w-full">
              <div className="absolute inset-0 bg-primary/5 rounded-3xl blur-xl opacity-0 group-focus-within:opacity-100 transition-all duration-500" />
              <div className="relative flex items-center">
                <Search className="absolute left-5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-300" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by username or name..."
                  className="w-full rounded-3xl bg-accent/10 border border-border/30 py-5 pl-14 pr-14 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/50 focus:bg-background transition-all duration-300 shadow-sm"
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-5">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 mt-2 max-h-[60vh] overflow-y-auto no-scrollbar pb-10">
              {searchQuery.trim().length > 1 ? (
                <div>
                  <h4 className="text-[11px] text-muted-foreground mb-4 uppercase font-bold tracking-wider px-2">Search Results</h4>
                  {searchResults.length > 0 ? (
                    <div className="space-y-3">
                      {searchResults.map((user) => (
                        <div 
                          key={user.id}
                          onClick={() => setSelectedRecipient(user)}
                          className="flex items-center justify-between p-4 rounded-3xl bg-card border border-border/40 hover:border-primary/40 cursor-pointer transition-all duration-300 active:scale-[0.98] shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="h-12 w-12 rounded-full bg-muted overflow-hidden shrink-0 border border-border/30">
                              {user.avatar_url ? (
                                <img src={user.avatar_url} className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                  {user.username?.[0]?.toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="text-left">
                              <h5 className="text-sm font-bold text-foreground tracking-tight">{user.full_name || user.username}</h5>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{getFirstName(user)}</p>
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground/40" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    !searching && (
                      <p className="text-sm text-muted-foreground italic py-6 px-2 text-center border border-dashed border-border/30 rounded-3xl bg-accent/5">No users found matching "{searchQuery}"</p>
                    )
                  )}
                </div>
              ) : (
                suggestedRecipients.length > 0 && (
                  <div>
                    <h4 className="text-[11px] text-muted-foreground mb-4 uppercase font-bold tracking-wider px-2">Suggested Recipients</h4>
                    <div className="space-y-3">
                      {suggestedRecipients.map((user) => (
                        <div 
                          key={user.id}
                          onClick={() => setSelectedRecipient(user)}
                          className="flex items-center justify-between p-4 rounded-3xl bg-card border border-border/40 hover:border-primary/40 cursor-pointer transition-all duration-300 active:scale-[0.98] shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="h-12 w-12 rounded-full bg-muted overflow-hidden shrink-0 border border-border/30">
                              {user.avatar_url ? (
                                <img src={user.avatar_url} className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                  {user.username?.[0]?.toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="text-left">
                              <h5 className="text-sm font-bold text-foreground tracking-tight">{user.full_name || user.username}</h5>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{getFirstName(user)}</p>
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground/40" />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
