import { useState } from "react";
import { AccountMenu } from "./AccountMenu";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { AuthSheet } from "@/components/auth/AuthSheet";
import { WalletCards } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";
import { zc } from "@/lib/config";
import { useWalletCurrency } from "@/hooks/useWalletCurrency";

/**
 * Your Zero Club wallet balance, always beside your picture, so you can see
 * whether a gift fits before you create it and what's left afterwards.
 * Refreshed after creating or closing a gift (queryKey "wallet-balance"),
 * when you come back to the tab, and every 20 seconds. Tap to add money.
 */
function WalletBalance({ userId, fallback }: { userId: string; fallback: number | null }) {
  const { format } = useWalletCurrency();
  const q = useQuery({
    queryKey: ["wallet-balance", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("coins").eq("id", userId).maybeSingle();
      return Number((data as { coins?: number } | null)?.coins ?? 0);
    },
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
  const coins = q.data ?? fallback;
  if (coins === null || coins === undefined) return null;
  return (
    <a
      href={zc("/app/wallet/add-money")}
      target="_blank"
      rel="noreferrer"
      title="Your Zero Club wallet · tap to add money"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-semibold tabular-nums transition hover:border-foreground/25"
    >
      <WalletCards className="h-4 w-4 text-[#c3217e]" />
      <span className="sr-only">Wallet balance </span>
      {format(Number(coins))}
    </a>
  );
}

/** Avatar when signed in (to your page), "Sign in" otherwise — opens the account sheet in place. */
export function AccountChip({ to = "/me" }: { to?: string }) {
  const { session, profile } = useAuth();
  const [open, setOpen] = useState(false);
  if (session) {
    const letter = (profile?.full_name || profile?.username || "?").charAt(0).toUpperCase();
    return (
      <div className="flex shrink-0 items-center gap-2">
        <WalletBalance userId={session.user.id} fallback={profile?.coins ?? null} />
        <AccountMenu to={to}>
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-[14px] font-bold">{letter}</span>}
        </AccountMenu>
      </div>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 shrink-0 items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition active:scale-[0.98]">
        Sign in
      </button>
      <AuthSheet open={open} initialMode="signin" onClose={() => setOpen(false)} />
    </>
  );
}
