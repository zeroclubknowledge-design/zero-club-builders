import { useRef, useState, type CSSProperties, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  Shield,
  ShoppingBag,
  Sparkles,
  Target,
  X,
  Zap,
} from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { getSpaceMarket, spaceMarketError, transactSpaceSupply } from "./spaceMarket";
import { SPACE_SUPPLIES, type SpaceSupply, type ZeroSpaceControls } from "./spaceSupplies";

/* ── shared ─────────────────────────────────────────────────────────────── */

type SupplyInfo = (typeof SPACE_SUPPLIES)[number];

const TIER: Partial<Record<SpaceSupply, { label: string; color: string }>> = {
  enhancer2: { label: "Rare", color: "#8cebd1" },
  enhancer3: { label: "Epic", color: "#8cbcff" },
  enhancer5: { label: "Legendary", color: "#ffca75" },
};
const POWER_UPS = SPACE_SUPPLIES.filter((s) => !s.id.startsWith("enhancer"));
const ENHANCERS = SPACE_SUPPLIES.filter((s) => s.id.startsWith("enhancer"));

function SupplyIcon({ item, className }: { item: SpaceSupply; className?: string }) {
  if (item.startsWith("enhancer"))
    return <span className="font-display text-[15px] font-black leading-none tracking-tight">{item.slice(-1)}×</span>;
  if (item === "shield") return <Shield className={className} />;
  if (item === "focus") return <Target className={className} />;
  if (item === "fuel") return <Zap className={className} />;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M5 4v9a7 7 0 0 0 14 0V4h-5v9a2 2 0 0 1-4 0V4Z" />
      <path d="M5 8h5m4 0h5" />
    </svg>
  );
}

/** A glowing orb holding the supply's icon, tinted with its colour. */
function SupplyOrb({ item, size = 56 }: { item: SupplyInfo; size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-2xl"
      style={{
        width: size,
        height: size,
        color: item.color,
        background: `radial-gradient(120% 120% at 30% 20%, ${item.color}40, ${item.color}10 55%, transparent 80%)`,
        boxShadow: `inset 0 0 0 1px ${item.color}40, 0 12px 30px -14px ${item.color}`,
      }}
    >
      <SupplyIcon item={item.id} className="h-[45%] w-[45%]" />
    </span>
  );
}

function ZpPill({ amount, className = "", style }: { amount: string; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[#ffca75]/12 px-2.5 py-1 text-[12.5px] font-bold tabular-nums text-[#ffd99a] ring-1 ring-[#ffca75]/25 ${className}`}
      style={style}
    >
      <Zap className="h-3.5 w-3.5 text-[#ffca75]" />
      {amount}
    </span>
  );
}

function useSpaceInventory() {
  const { data: profile, isPending: profilePending } = useUser();
  const client = useQueryClient();
  const key = ["zero-space-market", profile?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: getSpaceMarket,
    enabled: Boolean(profile?.id),
    staleTime: 0,
    retry: 1,
  });
  const lock = useRef(false);
  const requests = useRef<Record<string, string>>({});
  const [busy, setBusy] = useState<SpaceSupply | null>(null);

  const transact = async (item: SpaceSupply, action: "buy" | "use") => {
    if (lock.current || !profile?.id) return false;
    lock.current = true;
    setBusy(item);
    const requestKey = `${profile.id}:${action}:${item}`;
    // Keep the identifier on failure: retrying a lost response cannot charge twice.
    const request = (requests.current[requestKey] ||= crypto.randomUUID());
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

const STARS = Array.from({ length: 46 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 61) % 100, s: 1 + (i % 3) * 0.6, o: 0.15 + (i % 5) * 0.1 }));

/* ── marketplace ────────────────────────────────────────────────────────── */

export function SpaceMarketplace({ onBack }: { onBack: () => void }) {
  const market = useSpaceInventory();
  const [tab, setTab] = useState<"shop" | "inventory">("shop");
  const [selected, setSelected] = useState<SupplyInfo | null>(null);
  const [bought, setBought] = useState(false);
  const balance = market.data?.balance;
  const owned = (id: SpaceSupply) => market.data?.inventory[id] || 0;
  const totalOwned = SPACE_SUPPLIES.reduce((sum, s) => sum + owned(s.id), 0);
  const priceOf = (item: SupplyInfo) => (market.data?.administrator ? 0 : item.price);

  const open = (item: SupplyInfo) => {
    setBought(false);
    setSelected(item);
  };
  const purchase = async () => {
    if (!selected) return;
    if (await market.transact(selected.id, "buy")) setBought(true);
  };

  const card = (item: SupplyInfo) => {
    const price = priceOf(item);
    const have = owned(item.id);
    const affordable = Boolean(market.data && market.data.balance >= price);
    const tier = TIER[item.id];
    return (
      <article
        key={item.id}
        className="group relative flex min-w-0 flex-col overflow-hidden rounded-[26px] p-[1px] transition duration-300 hover:-translate-y-0.5"
        style={{ background: `linear-gradient(150deg, ${item.color}55, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.03))` }}
      >
        <div className="relative flex h-full flex-col overflow-hidden rounded-[25px] bg-[#120a1f] p-5">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full opacity-40 blur-2xl transition duration-500 group-hover:opacity-70"
            style={{ background: item.color }}
          />
          <div className="relative flex items-start justify-between gap-3">
            <SupplyOrb item={item} />
            <div className="flex flex-col items-end gap-1.5">
              {tier && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em]"
                  style={{ color: tier.color, background: `${tier.color}1c`, boxShadow: `inset 0 0 0 1px ${tier.color}40` }}
                >
                  {tier.label}
                </span>
              )}
              <span className="text-[11.5px] font-medium text-white/50">{have > 0 ? `${have} in hangar` : "None yet"}</span>
            </div>
          </div>
          <h3 className="relative mt-4 font-display text-[17px] font-bold tracking-tight">{item.name}</h3>
          <p className="relative mt-1 flex-1 text-[13px] leading-relaxed text-white/55">{item.detail}</p>
          <div className="relative mt-5 flex items-center justify-between gap-3">
            <ZpPill amount={price === 0 ? "Free" : `${price}`} />
            <button
              type="button"
              onClick={() => open(item)}
              disabled={!market.data || Boolean(market.busy) || have >= 999}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition active:scale-95 disabled:opacity-40 ${
                affordable ? "bg-white text-[#140a1c] hover:bg-white/90" : "bg-white/[0.07] text-white/60 ring-1 ring-white/10"
              }`}
            >
              {have >= 999 ? "Fully stocked" : affordable || !market.data ? (<><Plus className="h-4 w-4" /> Get</>) : `Need ${price - (balance || 0)} more`}
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <section className="fixed inset-0 z-[65] overflow-y-auto bg-[#08040f] text-white" aria-label="Zero Space marketplace">
      {/* Backdrop: nebula + stars */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#fd49b0]/20 blur-[120px]" />
        <div className="absolute -right-40 top-40 h-[480px] w-[480px] rounded-full bg-[#6a4cff]/20 blur-[120px]" />
        {STARS.map((s, i) => (
          <span key={i} className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o }} />
        ))}
      </div>

      {/* Glass top bar */}
      <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#08040f]/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[960px] items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] sm:px-8">
          <button
            onClick={onBack}
            disabled={Boolean(market.busy)}
            aria-label="Back to Zero Space"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/[0.08] ring-1 ring-white/10 transition hover:bg-white/[0.12] disabled:opacity-40"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#fe94d1]">Zero Space</p>
            <p className="truncate font-display text-[15px] font-bold">Supply Hangar</p>
          </div>
          <div
            className="ml-auto flex items-center gap-2 rounded-full p-[1px]"
            style={{ background: "linear-gradient(135deg,#ffca75,#fd49b0)" }}
            aria-label="Zero Points balance"
          >
            <span className="flex items-center gap-1.5 rounded-full bg-[#140a1c] px-3.5 py-2 text-[13.5px] font-bold tabular-nums">
              <Zap className="h-4 w-4 text-[#ffca75]" />
              {balance !== undefined ? balance.toLocaleString() : "—"}
              <span className="text-white/45">ZP</span>
            </span>
          </div>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-[960px] px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] sm:px-8">
        {/* Hero */}
        <div className="pb-7 pt-9 sm:pt-12">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#fe94d1] ring-1 ring-white/10">
            <Sparkles className="h-3.5 w-3.5" /> Your next run, equipped
          </p>
          <h1 className="mt-4 font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[46px]">
            Gear up.{" "}
            <span className="bg-gradient-to-r from-[#fd85ca] via-[#ffca75] to-[#8cbcff] bg-clip-text text-transparent">Fly further.</span>
          </h1>
          <p className="mt-3 max-w-[520px] text-[14.5px] leading-relaxed text-white/55">
            Spend Zero Points on supplies, then fire them from your dock mid-run. Each use takes one from your hangar.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Stat label="In your hangar" value={market.data ? totalOwned.toLocaleString() : "—"} />
            <Stat label="Supply types" value={String(SPACE_SUPPLIES.length)} />
            {market.data?.administrator && <Stat label="Admin" value="Complimentary" />}
          </div>
        </div>

        {/* Segmented control */}
        <div className="sticky top-[calc(env(safe-area-inset-top)+72px)] z-[5] -mx-1 mb-6 w-fit rounded-full bg-[#140a1c]/90 p-1 ring-1 ring-white/10 backdrop-blur-xl" role="tablist" aria-label="Marketplace view">
          {(["shop", "inventory"] as const).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full px-5 text-[13.5px] font-semibold transition ${
                tab === value ? "bg-white text-[#140a1c] shadow-[0_8px_20px_-10px_rgba(255,255,255,0.6)]" : "text-white/60 hover:text-white"
              }`}
            >
              {value === "shop" ? <ShoppingBag className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
              {value === "shop" ? "Shop" : "My hangar"}
              {value === "inventory" && totalOwned > 0 && (
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === value ? "bg-[#140a1c]/10" : "bg-white/10"}`}>{totalOwned}</span>
              )}
            </button>
          ))}
        </div>

        {(market.profilePending || (market.isPending && market.signedIn)) && (
          <p role="status" className="mb-5 flex items-center gap-2 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your hangar…
          </p>
        )}
        {!market.profilePending && (market.isError || !market.signedIn) && (
          <div role="alert" className="mb-6 rounded-2xl bg-white/[0.05] p-4 text-sm text-white/75 ring-1 ring-white/10">
            <p>{market.signedIn ? spaceMarketError(market.error) : "Sign in to shop and save your supplies."}</p>
            {market.signedIn && (
              <button onClick={() => void market.refetch()} className="mt-3 font-semibold text-[#fd85ca]">Try again</button>
            )}
          </div>
        )}

        {tab === "shop" ? (
          <>
            <SectionTitle title="Power-ups" note="Instant effects for tight moments" />
            <div className="grid gap-3.5 sm:grid-cols-2">{POWER_UPS.map(card)}</div>
            <SectionTitle title="Fuel enhancers" note="Last the whole run · the strongest one wins" />
            <div className="grid gap-3.5 sm:grid-cols-3">{ENHANCERS.map(card)}</div>
          </>
        ) : totalOwned === 0 && market.data ? (
          <div className="rounded-[28px] border border-dashed border-white/12 px-6 py-14 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06] text-white/60"><ShoppingBag className="h-6 w-6" /></span>
            <p className="mt-4 font-display text-lg font-bold">Your hangar is empty</p>
            <p className="mx-auto mt-1 max-w-[320px] text-sm text-white/50">Pick up a Shield or Fuel Cell before your next run. They wait here until you use them.</p>
            <button onClick={() => setTab("shop")} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#140a1c]">
              <Plus className="h-4 w-4" /> Browse supplies
            </button>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {SPACE_SUPPLIES.filter((s) => owned(s.id) > 0).map((item) => (
              <div key={item.id} className="flex items-center gap-4 rounded-[22px] bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
                <SupplyOrb item={item} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-[12.5px] text-white/50">Ready · tap it in your dock during a run</p>
                </div>
                <span className="font-display text-[26px] font-extrabold tabular-nums" style={{ color: item.color }}>×{owned(item.id)}</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[12px] leading-relaxed text-white/40">
          Supplies stay in your hangar until used. Pickups in space are always free. Supplies work in practice and tournament runs.
        </p>
        <button
          onClick={onBack}
          disabled={Boolean(market.busy)}
          className="mx-auto mt-5 flex min-h-12 w-full max-w-[420px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#fd49b0,#ac2673)] px-6 text-sm font-bold text-white shadow-[0_16px_40px_-16px_rgba(253,73,176,0.9)] transition active:scale-[0.98] disabled:opacity-50"
        >
          Back to Zero Space
        </button>
      </div>

      {selected && (
        <PurchaseSheet
          item={selected}
          price={priceOf(selected)}
          balance={balance ?? 0}
          owned={owned(selected.id)}
          busy={market.busy === selected.id}
          bought={bought}
          onBuy={() => void purchase()}
          onAgain={() => setBought(false)}
          onClose={() => !market.busy && setSelected(null)}
        />
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] px-4 py-2.5 ring-1 ring-white/[0.08]">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p className="font-display text-[17px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

function SectionTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-3.5 mt-9">
      <h2 className="font-display text-[19px] font-bold tracking-tight">{title}</h2>
      <p className="mt-0.5 text-[12.5px] text-white/40">{note}</p>
    </div>
  );
}

/** Zero Club's own purchase card: a sheet on phones, a centred card on desktop. */
function PurchaseSheet({
  item, price, balance, owned, busy, bought, onBuy, onAgain, onClose,
}: {
  item: SupplyInfo; price: number; balance: number; owned: number; busy: boolean; bought: boolean;
  onBuy: () => void; onAgain: () => void; onClose: () => void;
}) {
  const after = balance - price;
  const short = after < 0;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose} style={{ pointerEvents: "auto" }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Buy ${item.name}`}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full overflow-hidden rounded-t-[30px] bg-[#130a1f] p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] ring-1 ring-white/10 sm:max-w-[420px] sm:rounded-[30px] sm:pb-6"
        style={{ animation: "zsm-up .32s cubic-bezier(.2,.8,.2,1)" }}
      >
        <style>{`@keyframes zsm-up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}`}</style>
        <span aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full opacity-50 blur-3xl" style={{ background: item.color }} />
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/[0.07] text-white/70 hover:bg-white/[0.12]">
          <X className="h-4 w-4" />
        </button>
        <div className="relative flex flex-col items-center text-center">
          {bought ? (
            <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[#61e6ac]/15 text-[#61e6ac] ring-1 ring-[#61e6ac]/40">
              <Check className="h-8 w-8" />
            </span>
          ) : (
            <SupplyOrb item={item} size={72} />
          )}
          <h3 className="mt-4 font-display text-[22px] font-extrabold tracking-tight">{bought ? `${item.name} added` : item.name}</h3>
          <p className="mt-1.5 max-w-[300px] text-[13.5px] leading-relaxed text-white/55">
            {bought ? `You now have ${owned} in your hangar. Tap it in your dock during a run.` : item.detail}
          </p>
        </div>

        {!bought && (
          <dl className="relative mt-6 space-y-2.5 rounded-2xl bg-white/[0.04] p-4 text-[13.5px] ring-1 ring-white/[0.08]">
            <div className="flex justify-between"><dt className="text-white/50">Price</dt><dd className="font-bold tabular-nums">{price === 0 ? "Free" : `${price} ZP`}</dd></div>
            <div className="flex justify-between"><dt className="text-white/50">Your balance</dt><dd className="tabular-nums">{balance.toLocaleString()} ZP</dd></div>
            <div className="flex justify-between border-t border-white/[0.07] pt-2.5">
              <dt className="text-white/50">After purchase</dt>
              <dd className={`font-bold tabular-nums ${short ? "text-[#ff6b8a]" : "text-[#ffd99a]"}`}>{short ? `${-after} ZP short` : `${after.toLocaleString()} ZP`}</dd>
            </div>
          </dl>
        )}

        <div className="relative mt-5 flex flex-col gap-2.5">
          {bought ? (
            <>
              <button
                onClick={onAgain}
                disabled={balance < price}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white text-[14.5px] font-bold text-[#140a1c] transition active:scale-[0.98] disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Buy another · {price} ZP
              </button>
              <button onClick={onClose} className="min-h-12 rounded-full bg-white/[0.07] text-[14px] font-semibold">Done</button>
            </>
          ) : (
            <>
              <button
                onClick={onBuy}
                disabled={busy || short}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full text-[14.5px] font-bold text-[#140a1c] transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, #ffffff, ${item.color})`, boxShadow: `0 16px 36px -18px ${item.color}` }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {short ? "Not enough ZP" : price === 0 ? "Add to hangar" : `Buy for ${price} ZP`}
              </button>
              <button onClick={onClose} disabled={busy} className="min-h-12 rounded-full bg-white/[0.07] text-[14px] font-semibold disabled:opacity-40">Not now</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── in-run dock ────────────────────────────────────────────────────────── */

export function SpaceSupplyTray({ controls, onShop }: { controls: RefObject<ZeroSpaceControls | null>; onShop: () => void }) {
  const market = useSpaceInventory();
  const activating = useRef(false);
  const activate = async (item: SpaceSupply) => {
    const engine = controls.current;
    if (activating.current) return;
    if (!engine?.ready()) {
      toast.message("Supplies can be activated during an active run.");
      return;
    }
    if (item.startsWith("enhancer") && Number(item.slice(-1)) <= engine.fuelEnhancement()) {
      toast.message("An equal or stronger fuel enhancer is already active.");
      return;
    }
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
  return (
    <div className="absolute left-2 right-2 top-[calc(env(safe-area-inset-top)+8px)] mx-auto max-w-[720px]" role="group" aria-label="Space tools">
      <div className="grid gap-1 rounded-[22px] bg-[#0f0819]/75 p-1.5 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10 backdrop-blur-xl" style={{ gridTemplateColumns: `repeat(${SPACE_SUPPLIES.length + 1}, minmax(0, 1fr))` }}>
        {SPACE_SUPPLIES.map((item) => {
          const owned = market.data?.inventory[item.id] || 0;
          return (
            <button
              key={item.id}
              onClick={() => (owned ? void activate(item.id) : onShop())}
              disabled={Boolean(market.busy)}
              aria-label={owned ? `Use ${item.name}, ${owned} remaining` : `Buy ${item.name}`}
              title={item.name}
              className={`relative flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl transition active:scale-95 disabled:opacity-40 ${owned ? "bg-white/[0.05] hover:bg-white/[0.09]" : "opacity-55 hover:opacity-80"}`}
              style={{ color: item.color }}
            >
              <span
                className="grid h-7 w-7 place-items-center rounded-full"
                style={{ background: `${item.color}22`, boxShadow: owned ? `0 0 14px -2px ${item.color}aa, inset 0 0 0 1px ${item.color}55` : `inset 0 0 0 1px ${item.color}30` }}
              >
                {market.busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SupplyIcon item={item.id} className="h-3.5 w-3.5" />}
              </span>
              <span className="max-w-full truncate px-0.5 text-[9px] font-semibold text-white/70">
                {item.id.startsWith("enhancer") ? "Boost" : item.name.replace(" Cell", "")}
              </span>
              <span
                className={`absolute right-1 top-1 grid min-w-[17px] place-items-center rounded-full px-1 text-[9.5px] font-extrabold tabular-nums leading-[17px] ${owned ? "bg-white text-[#140a1c]" : "bg-[#ffca75]/20 text-[#ffca75]"}`}
              >
                {owned ? owned : "+"}
              </span>
            </button>
          );
        })}
        <button
          onClick={onShop}
          disabled={Boolean(market.busy)}
          aria-label="Open Space marketplace"
          className="flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl bg-[linear-gradient(160deg,rgba(253,73,176,0.35),rgba(253,73,176,0.12))] text-white ring-1 ring-[#fd49b0]/40 transition active:scale-95"
        >
          <ShoppingBag className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-bold">Shop</span>
        </button>
      </div>
      {market.busy && (
        <p role="status" className="mt-1.5 text-center text-[11px] font-medium text-white/70">
          Activating supply · game paused
        </p>
      )}
    </div>
  );
}
