import { SpaceThumbstick } from "./SpaceThumbstick";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Pause, Play, ShoppingBag, X } from "@/components/icons/glyphs";
import { ZeroSpaceGame } from "./ZeroSpace";
import { SpaceMarketplace, SpaceSupplyTray } from "./SpaceMarketplace";
import type { ZeroSpaceControls } from "./spaceSupplies";

type Props = Omit<ComponentProps<typeof ZeroSpaceGame>, "topInset" | "controls"> & { onLeave: () => void | Promise<void>; cooperative?: boolean };

/** The same bounded arena and supply/pause controls in practice, tournaments and co-op. */
export function SpaceFlight({ onLeave, cooperative = false, ...game }: Props) {
  const controls = useRef<ZeroSpaceControls | null>(null);
  const [paused, setPaused] = useState(false);
  const [shopping, setShopping] = useState(false);
  const [usingSupply, setUsingSupply] = useState(false);
  const pause = (value: boolean) => { controls.current?.pause(value, "player"); setPaused(value); };
  const shop = (value: boolean) => { controls.current?.pause(value, "shop"); setShopping(value); };
  const leave = async () => {
    controls.current?.pause(true, "leave");
    try { await onLeave(); } finally { controls.current?.pause(false, "leave"); }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || shopping || usingSupply || event.isComposing) return;
      event.preventDefault(); pause(!paused);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [paused, shopping, usingSupply]);
  return <div className="relative mx-auto flex min-h-0 w-full max-w-[1100px] flex-1 flex-col px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-white">
    <SpaceSupplyTray controls={controls} embedded onBusyChange={setUsingSupply} onShop={() => shop(true)} />
    <div role="region" aria-label="Zero Space flight arena" className="relative min-h-0 flex-1 overflow-hidden rounded-[28px] bg-[#0b0618] ring-1 ring-[#fd49b0]/35 shadow-[0_16px_50px_-20px_rgba(253,73,176,0.25)]">
      <ZeroSpaceGame {...game} controls={controls} />
      {paused && <div className="absolute inset-0 flex items-center justify-center bg-[#08040f]/55 p-5 backdrop-blur-sm">
        <div className="w-full max-w-xs rounded-[26px] bg-[#140a21]/95 p-5 text-center">
          <h2 className="font-display text-xl font-bold">Flight paused</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/65">Apply supplies from the dock above, or open the marketplace. Your fuel and boosts stay frozen.{cooperative ? " Your wingmate can keep flying." : ""}</p>
          <button type="button" disabled={usingSupply} onClick={() => pause(false)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#fd49b0] px-4 font-semibold disabled:opacity-40"><Play className="h-4 w-4" />Resume flight</button>
          <button type="button" disabled={usingSupply} onClick={() => shop(true)} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm disabled:opacity-40"><ShoppingBag className="h-4 w-4" />Marketplace</button>
        </div>
      </div>}
    </div>
    <div className="flex shrink-0 items-center justify-between gap-3 pt-3">
      <button type="button" disabled={usingSupply} onClick={() => pause(!paused)} aria-pressed={paused} className="flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold disabled:opacity-40">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? "Resume" : "Pause"}</button>
      <div className="flex flex-col items-center gap-1"><SpaceThumbstick controls={controls} disabled={paused || shopping || usingSupply} /><span className="text-center text-[10px] text-white/50">{usingSupply ? "Applying supply…" : "Hold to steer"}</span></div>
      <button type="button" onClick={() => void leave()} aria-label="Leave game" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10"><X className="h-5 w-5" /></button>
    </div>
    {shopping && <SpaceMarketplace onBack={() => shop(false)} />}
  </div>;
}
