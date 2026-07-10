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

  const RecipientRow = ({ user }: { user: any }) => (
    <button
      onClick={() => setSelectedRecipient(user)}
      className="group flex w-full items-center justify-between px-1 py-3 tap hover:bg-foreground/[0.02] rounded-xl text-left"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="h-11 w-11 rounded-full bg-muted overflow-hidden shrink-0 ring-1 ring-border">
          {user.avatar_url ? (
            <img src={user.avatar_url} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
              {user.username?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h5 className="text-[14px] font-semibold text-foreground tracking-tight truncate">{user.full_name || user.username}</h5>
          <p className="text-[12px] text-muted-foreground mt-0.5 truncate">@{user.username}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
    </button>
  );

  const numericAmount = parseInt(transferAmount) || 0;

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <header className="flex items-center gap-3 px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-4">
        <button
          onClick={() => {
            if (selectedRecipient) {
              setSelectedRecipient(null);
              setTransferAmount("");
            } else {
              navigate({ to: "/app/wallet" });
            }
          }}
          className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-border tap hover:bg-foreground/[0.04] shrink-0"
        >
          <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight text-foreground truncate">
          {selectedRecipient ? "Send XP" : "Send funds"}
        </h1>
      </header>

      <div className="flex flex-col px-6 pt-2 text-foreground max-w-md mx-auto">
        {selectedRecipient ? (
          <>
            {/* Recipient — centered, calm */}
            <div className="mt-6 flex flex-col items-center text-center">
              <div className="h-16 w-16 rounded-full bg-muted overflow-hidden ring-1 ring-border shadow-soft">
                {selectedRecipient.avatar_url ? (
                  <img src={selectedRecipient.avatar_url} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xl">
                    {selectedRecipient.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <h4 className="mt-3 text-[16px] font-semibold tracking-tight text-foreground">{selectedRecipient.full_name || selectedRecipient.username}</h4>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">@{selectedRecipient.username}</p>
            </div>

            {/* Amount — editorial display type */}
            <div className="mt-10 text-center">
              <div className="flex items-center justify-between px-1">
                <label className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Amount</label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  Balance · <span className="font-semibold text-foreground">{(profile?.xp || 0).toLocaleString()} XP</span>
                </span>
              </div>
              <div className="mt-4 flex items-baseline justify-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0"
                  autoFocus
                  min="1"
                  max={profile?.xp || 0}
                  className="w-auto min-w-[60px] max-w-[220px] bg-transparent text-center text-[56px] font-semibold tracking-tight tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{ width: `${Math.max(1, transferAmount.length)}ch` }}
                />
                <span className="text-[20px] font-medium text-muted-foreground">XP</span>
              </div>
              <div className={`mx-auto mt-2 h-[2px] w-16 rounded-full ${numericAmount > (profile?.xp || 0) ? "bg-destructive/60" : "bg-primary/60"}`} />
              {numericAmount > 0 && numericAmount <= (profile?.xp || 0) && (
                <p className="mt-3 text-[12px] text-muted-foreground tabular-nums">
                  ≈ ₦{numericAmount.toLocaleString()} cash equivalent
                </p>
              )}
              {numericAmount > (profile?.xp || 0) && (
                <p className="mt-3 text-[12px] font-medium text-destructive">Exceeds available balance</p>
              )}
            </div>

            <button
              onClick={handleSendFunds}
              disabled={sendingFunds || numericAmount <= 0 || numericAmount > (profile?.xp || 0)}
              className="mt-10 flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-4 text-[15px] font-semibold tracking-tight text-background tap shadow-lift disabled:opacity-40"
            >
              {sendingFunds ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processing</>
              ) : (
                <><Send className="h-4 w-4" /> {numericAmount > 0 ? `Send ${numericAmount.toLocaleString()} XP` : "Send XP"}</>
              )}
            </button>
          </>
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or username"
                className="w-full rounded-full bg-foreground/[0.04] ring-1 ring-transparent py-3 pl-11 pr-11 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-primary/40 focus:bg-background transition-all"
                autoFocus
              />
              {searching && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
              )}
            </div>

            <div className="mt-6 max-h-[62vh] overflow-y-auto no-scrollbar pb-10">
              {searchQuery.trim().length > 1 ? (
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2 px-1">Results</h4>
                  {searchResults.length > 0 ? (
                    <div className="divide-y divide-hairline">
                      {searchResults.map((user) => <RecipientRow key={user.id} user={user} />)}
                    </div>
                  ) : (
                    !searching && (
                      <p className="py-10 text-center text-[13.5px] text-muted-foreground">
                        No builders matching <span className="font-medium text-foreground/80">"{searchQuery}"</span>
                      </p>
                    )
                  )}
                </div>
              ) : (
                suggestedRecipients.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2 px-1">Your network</h4>
                    <div className="divide-y divide-hairline">
                      {suggestedRecipients.map((user) => <RecipientRow key={user.id} user={user} />)}
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
