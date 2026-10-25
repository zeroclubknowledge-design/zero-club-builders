import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Gift, Loader2, WalletCards } from "@/components/icons/glyphs";
import { AppShell, PageHead } from "@/components/AppShell";
import { Brand } from "@/components/Brand";
import { useAuth } from "@/lib/auth";
import { SentGifts } from "./Sent";
import { ReceivedGifts } from "./Received";
import { NAV } from "./nav";

export type MyGiftsTab = "sent" | "received";

/** My Gifts: the gifts you've sent and the gifts sent to you, in one place. */
export function MyGifts({ tab }: { tab: MyGiftsTab }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !session) void navigate({ to: "/signin" }); }, [loading, session, navigate]);
  const go = (next: MyGiftsTab) => void navigate({ to: "/me", search: { tab: next }, replace: true });

  return (
    <AppShell brand={<Brand />} nav={NAV}>
      <PageHead eyebrow="Zero Cards" title="My gifts" />
      <div role="tablist" className="mb-6 flex max-w-[420px] gap-1 rounded-full bg-foreground/[0.06] p-1">
        {([
          ["sent", "Sent", Gift],
          ["received", "Received", WalletCards],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => go(value)}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[13.5px] font-semibold transition ${tab === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {loading || !session ? (
        <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tab === "sent" ? (
        <SentGifts embedded />
      ) : (
        <ReceivedGifts embedded />
      )}
    </AppShell>
  );
}
