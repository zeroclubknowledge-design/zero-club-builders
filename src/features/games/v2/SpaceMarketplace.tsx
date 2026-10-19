import { useRef, useState, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Shield, ShoppingBag, Target, Zap } from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { getSpaceMarket, spaceMarketError, transactSpaceSupply } from "./spaceMarket";
import { SPACE_SUPPLIES, type SpaceSupply, type ZeroSpaceControls } from "./spaceSupplies";

function SupplyIcon({ item, className }: { item: SpaceSupply; className?: string }) {
  if (item === "shield") return <Shield className={className} />;
  if (item === "focus") return <Target className={className} />;
  if (item === "fuel") return <Zap className={className} />;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><path d="M5 4v9a7 7 0 0 0 14 0V4h-5v9a2 2 0 0 1-4 0V4Z" /><path d="M5 8h5m4 0h5" /></svg>;
}

function useSpaceInventory() {
  const { data: profile, isPending: profilePending } = useUser();
  const client = useQueryClient();
  const key = ["zero-space-market", profile?.id];
  const query = useQuery({ queryKey: key, queryFn: getSpaceMarket, enabled: Boolean(profile?.id), staleTime: 0, retry: 1 });
  const lock = useRef(false);
  const requests = useRef<Record<string, string>>({});
  const [busy, setBusy] = useState<SpaceSupply | null>(null);

  const transact = async (item: SpaceSupply, action: "buy" | "use") => {
    if (lock.current || !profile?.id) return false;
    lock.current = true;
    setBusy(item);
    const requestKey = `${profile.id}:${action}:${item}`;
    // Keep the identifier on failure: retrying a lost response cannot charge twice.
    const request = requests.current[requestKey] ||= crypto.randomUUID();
    try {
      const state = await transactSpaceSupply(item, action, request);
      await client.cancelQueries({ queryKey: key });
      client.setQueryData(key, state);
      delete requests.current[requestKey];
      if (action === "buy") void client.invalidateQueries({ queryKey: ["profile", "current"] });
      return true;
    } catch (error) {
      toast.error(spaceMarketError(error));
      void query.refetch();
      return false;
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };
  return { ...query, busy, transact, signedIn: Boolean(profile?.id), profilePending };
}

export function SpaceMarketplace({ onBack }: { onBack: () => void }) {
  const market = useSpaceInventory();
  const [selected, setSelected] = useState<SpaceSupply | null>(null);
  const [tab, setTab] = useState<"shop" | "inventory">("shop");
  const [purchased, setPurchased] = useState<SpaceSupply | null>(null);
  const purchase = async (item: SpaceSupply) => {
    if (await market.transact(item, "buy")) {
      setSelected(null);
      setPurchased(item);
      toast.success(`${SPACE_SUPPLIES.find(s => s.id === item)!.name} added to your supplies`);
    }
  };

  return (
    <section className="fixed inset-0 z-[65] overflow-y-auto bg-[#0b0618] text-white" aria-label="Zero Space marketplace">
      <div className="mx-auto min-h-full w-full max-w-[880px] px-4 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[calc(env(safe-area-inset-top)+12px)] sm:px-8">
        <header className="flex items-center gap-3">
          <button onClick={onBack} disabled={Boolean(market.busy)} aria-label="Back to Zero Space" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 disabled:opacity-40"><ArrowLeft className="h-5 w-5" /></button>
          <p className="text-sm font-semibold text-white/65">Zero Space</p>
          <div className="ml-auto flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-sm font-bold tabular-nums" aria-label="Zero Points balance"><Zap className="h-4 w-4 text-[#ffb547]" />{market.data ? `${market.data.balance.toLocaleString()} ZP` : "— ZP"}</div>
        </header>
        <div className="py-8 sm:py-10">
          <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#ff4fc3]/15 text-[#ff4fc3]"><ShoppingBag className="h-7 w-7" /></span>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#ff4fc3]">Your next run, equipped</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Space marketplace</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60">Stock up with Zero Points. Activate your supplies when you need them during a practice run. Each activation uses one item.</p>
        </div>
        <div className="mb-5 flex w-fit gap-1 rounded-full bg-white/[0.06] p-1" role="group" aria-label="Marketplace view">
          {(["shop", "inventory"] as const).map(value => <button key={value} onClick={() => { setTab(value); setSelected(null); }} aria-pressed={tab === value} className={`min-h-10 rounded-full px-5 text-sm font-semibold ${tab === value ? "bg-white text-[#140a1c]" : "text-white/65"}`}>{value === "shop" ? "Shop supplies" : "My supplies"}</button>)}
        </div>
        {(market.profilePending || (market.isPending && market.signedIn)) && <p role="status" className="mb-5 flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" />Loading your supplies…</p>}
        {!market.profilePending && (market.isError || !market.signedIn) && <div role="alert" className="mb-5 rounded-2xl bg-white/[0.06] p-4 text-sm text-white/75"><p>{market.signedIn ? spaceMarketError(market.error) : "Sign in to shop and save your supplies."}</p>{market.signedIn && <button onClick={() => void market.refetch()} className="mt-3 font-semibold text-[#ff4fc3]">Try again</button>}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          {SPACE_SUPPLIES.map(item => {
            const owned = market.data?.inventory[item.id] || 0;
            const price = market.data?.administrator ? 0 : item.price;
            const affordable = Boolean(market.data && market.data.balance >= price);
            const confirming = selected === item.id;
            return (
              <article key={item.id} className="flex min-w-0 flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between gap-3"><span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ color: item.color, background: `${item.color}18` }}><SupplyIcon item={item.id} className="h-7 w-7" /></span><span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-white/65">{owned} owned</span></div>
                <h2 className="mt-4 text-lg font-bold">{item.name}</h2>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-white/60">{item.detail}</p>
                {tab === "inventory" ? <p className="mt-5 rounded-xl bg-white/[0.06] p-3 text-sm text-white/70">{owned ? `${owned} ready to use · tap its icon during practice` : "No supplies yet. Get one from the shop."}</p> : <div className="mt-5">
                  {confirming ? <div className="rounded-2xl bg-white/[0.06] p-3"><p className="text-sm">Buy 1 {item.name} for <strong>{price} ZP</strong>?</p><div className="mt-3 flex gap-2"><button onClick={() => void purchase(item.id)} disabled={Boolean(market.busy)} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#ff4fc3] px-3 text-sm font-bold text-[#140a1c] disabled:opacity-50">{market.busy === item.id && <Loader2 className="h-4 w-4 animate-spin" />}Confirm</button><button onClick={() => setSelected(null)} disabled={Boolean(market.busy)} className="min-h-11 rounded-full bg-white/10 px-4 text-sm">Cancel</button></div></div> : <button onClick={() => { setSelected(item.id); setPurchased(null); }} disabled={!affordable || Boolean(market.busy) || owned >= 999} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-bold transition hover:bg-white/15 disabled:opacity-40">{purchased === item.id ? <><Check className="h-4 w-4" /> Buy another · {price} ZP</> : owned >= 999 ? "Fully stocked" : !affordable && market.data ? `Need ${price} ZP` : `Buy · ${price} ZP`}</button>}
                </div>}
              </article>
            );
          })}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-white/45">Supplies stay in your account until used. Pickups remain free in every run. Purchased supplies are for practice; tournaments use the same pickups for everyone.{market.data?.administrator ? " Zero Club admin supplies are complimentary." : ""}</p>
        <button onClick={onBack} disabled={Boolean(market.busy)} className="mt-6 min-h-12 w-full rounded-full bg-[#ff4fc3] px-6 text-sm font-bold text-[#140a1c] disabled:opacity-50">Back to Zero Space</button>
      </div>
    </section>
  );
}

export function SpaceSupplyTray({ controls }: { controls: RefObject<ZeroSpaceControls | null> }) {
  const market = useSpaceInventory();
  const activating = useRef(false);
  const activate = async (item: SpaceSupply) => {
    const engine = controls.current;
    if (activating.current) return;
    if (!engine?.ready()) { toast.message("Supplies can be activated during an active run."); return; }
    activating.current = true;
    // Pause while the server confirms consumption, so a slow connection cannot
    // cost a life or consume an item after the run has ended.
    engine.pause(true);
    try {
      if (await market.transact(item, "use")) engine.activate(item);
    } finally {
      engine.pause(false);
      activating.current = false;
    }
  };
  if (!market.data || !SPACE_SUPPLIES.some(item => market.data.inventory[item.id] > 0)) return null;
  return (
    <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+14px)] left-3 right-16 flex flex-wrap gap-2" role="group" aria-label="Practice supplies">
      {SPACE_SUPPLIES.filter(item => market.data!.inventory[item.id] > 0).map(item => <button key={item.id} onClick={() => void activate(item.id)} disabled={Boolean(market.busy)} aria-label={`Use ${item.name}, ${market.data!.inventory[item.id]} remaining`} title={item.name} className="flex min-h-11 min-w-12 items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-[#140c1d]/95 px-3 font-bold shadow-lg disabled:opacity-40" style={{ color: item.color }}><SupplyIcon item={item.id} className="h-5 w-5" /><span className="text-xs tabular-nums">{market.busy === item.id ? "…" : market.data!.inventory[item.id]}</span></button>)}
      {market.busy && <p role="status" className="w-full text-xs text-white/70">Activating supply · game paused</p>}
    </div>
  );
}
