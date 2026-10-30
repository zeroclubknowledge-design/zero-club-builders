import { useState } from "react";
import { AccountMenu } from "./AccountMenu";
import { useAuth } from "@/lib/auth";
import { AuthSheet } from "@/components/auth/AuthSheet";

/** The header avatar opens the same account-switching drawer as Zero Gifts. */
export function AccountChip({ to = "/me" }: { to?: string }) {
  const { session, profile } = useAuth();
  const [open, setOpen] = useState(false);
  if (session) {
    const letter = (profile?.full_name || profile?.username || "?").charAt(0).toUpperCase();
    return (
      <AccountMenu to={to}>
        {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-[14px] font-bold">{letter}</span>}
      </AccountMenu>
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
