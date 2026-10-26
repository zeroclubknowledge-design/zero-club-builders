import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Clock, Compass, Loader2, Search, Users, X } from "@/components/icons/glyphs";
import { AppShell, PageHead } from "@/components/AppShell";
import { Brand } from "@/components/Brand";
import { GiftCardVisual, giftServices } from "@/components/GiftCardVisual";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { NAV } from "./nav";

type BrowseGift = {
  id: string; code: string; amount: number; service: string; template_id: string;
  message: string | null; custom_purpose: string | null; quantity: number; claims_remaining: number;
  expires_at: string | null; created_at: string;
  creator: { id: string; name: string | null; username: string | null; avatar_url: string | null } | null;
  clubs: string[]; bootcamps: string[]; mine: boolean; claimed: boolean;
};

function timeLeft(iso: string | null) {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min left`;
  if (h < 48) return `${h} h left`;
  return `${Math.floor(h / 24)} days left`;
}

/**
 * Browse: every gift on Zero Club that its creator listed publicly and that
 * still has claims left. Anyone can open one and claim it (one per account).
 * Gifts are link-only unless the creator switches on "Show on Browse".
 */
export function BrowseGifts() {
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [service, setService] = useState<string | null>(null);
  useEffect(() => { const t = window.setTimeout(() => setTerm(search.trim()), 250); return () => window.clearTimeout(t); }, [search]);

  const q = useQuery({
    queryKey: ["browse-gifts", term, service, session?.user.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("browse_gift_cards" as never, { p_service: service, p_search: term || null } as never);
      if (error) throw error;
      return (data || []) as unknown as BrowseGift[];
    },
    staleTime: 30_000,
  });
  const list = q.data || [];
  const filtered = !!(term || service);

  return (
    <AppShell brand={<Brand />} nav={NAV}>
      <PageHead
        eyebrow="Open to claim"
        title="Browse gifts"
        sub="Zero Cards people have shared with everyone on Zero Club. Claim one before it runs out; each account can claim a gift once."
      />

      <label className="relative block max-w-[640px]">
        <span className="sr-only">Search gifts</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by message or who sent it"
          className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-11 text-[15px] outline-none transition placeholder:text-muted-foreground/70 focus:border-[#c3217e]/50 focus:ring-4 focus:ring-[#c3217e]/10"
        />
        {search && (
          <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06]">
            <X className="h-4 w-4" />
          </button>
        )}
      </label>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
        {[{ id: null as string | null, label: "All gifts" }, ...giftServices.map((s) => ({ id: s.id as string | null, label: s.label }))].map((s) => (
          <button
            key={s.label}
            type="button"
            aria-pressed={service === s.id}
            onClick={() => setService(service === s.id ? null : s.id)}
            className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold transition ${service === s.id ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {q.isLoading ? (
          <div className="grid place-items-center rounded-[22px] border border-border bg-card py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : q.error ? (
          <div className="rounded-[22px] border border-border bg-card p-6 text-center text-[14px] text-muted-foreground">
            Couldn't load gifts. <button type="button" onClick={() => void q.refetch()} className="font-semibold text-foreground underline">Try again</button>
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-border bg-card px-6 py-14 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#c3217e]/10 text-[#c3217e]"><Compass className="h-6 w-6" /></span>
            <h3 className="mt-3 text-[16px] font-bold">{filtered ? "No gifts match" : "No open gifts right now"}</h3>
            <p className="mx-auto mt-1 max-w-[360px] text-[13.5px] text-muted-foreground">
              {filtered ? "Try another search or type." : "When someone shares a gift with everyone, it shows up here. You can be the first."}
            </p>
            <Link to="/create" className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-[13.5px] font-semibold text-background">
              Create a gift <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((g) => <GiftTile key={g.id} gift={g} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function GiftTile({ gift }: { gift: BrowseGift }) {
  const label = giftServices.find((s) => s.id === gift.service)?.label || gift.service;
  const limits = [...gift.clubs.map((c) => `bootcamps in ${c}`), ...gift.bootcamps].slice(0, 2);
  const left = timeLeft(gift.expires_at);
  return (
    <article className="flex min-w-0 flex-col">
      <Link to="/gift/$code" params={{ code: gift.code }} className="block transition hover:-translate-y-0.5">
        <GiftCardVisual amount={gift.amount} service={gift.service} templateId={gift.template_id} code={gift.code} message={gift.message} />
      </Link>
      <div className="mt-3 flex flex-1 flex-col rounded-2xl border border-border bg-card p-3.5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.07] text-[11px] font-bold">
            {gift.creator?.avatar_url ? <img src={gift.creator.avatar_url} alt="" className="h-full w-full object-cover" /> : (gift.creator?.name || "?").charAt(0).toUpperCase()}
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            {gift.mine ? "Your gift" : `From ${gift.creator?.name || "a Zero Club member"}`}
          </p>
          <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{gift.service === "custom" && gift.custom_purpose ? gift.custom_purpose : label}</span>
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {gift.claims_remaining} of {gift.quantity} left</span>
          {left && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {left}</span>}
        </p>
        {limits.length > 0 && <p className="mt-1 truncate text-[12px] text-muted-foreground">Only for {limits.join(", ")}</p>}
        <div className="mt-auto pt-3">
          {gift.claimed ? (
            <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-emerald-500/12 px-4 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /> You claimed this</span>
          ) : gift.mine ? (
            <Link to="/me" search={{ tab: "sent" }} className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[13px] font-semibold">Manage in My gifts</Link>
          ) : (
            <Link to="/gift/$code" params={{ code: gift.code }} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#c3217e] px-5 text-[13.5px] font-semibold text-white shadow-[0_12px_26px_-14px_rgba(195,33,126,0.9)]">
              Claim gift <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
