export const SPACE_SUPPLIES = [
  { id: "shield", name: "Shield", price: 30, color: "#5cc8ff", symbol: "S", detail: "Block one collision with a doubt drone. Lasts up to 10 seconds." },
  { id: "focus", name: "Focus", price: 25, color: "#b38cff", symbol: "F", detail: "Slow doubt drones to 40% speed for 5 seconds. Find your opening." },
  { id: "magnet", name: "Magnet", price: 25, color: "#ffb547", symbol: "M", detail: "Pull nearby opportunity orbs toward your craft for 6 seconds." },
  { id: "fuel", name: "Fuel Cell", price: 20, color: "#61e6ac", symbol: "+", detail: "Refill your fuel ring instantly. Save it for when you are running low." },
  { id: "enhancer2", name: "Enhancer 2×", price: 40, color: "#8cebd1", symbol: "2×", detail: "Fuel lasts twice as long for the rest of this run. Does not stack with other enhancers." },
  { id: "enhancer3", name: "Enhancer 3×", price: 65, color: "#8cbcff", symbol: "3×", detail: "Fuel lasts three times as long for the rest of this run. Replaces a weaker enhancer." },
  { id: "enhancer5", name: "Enhancer 5×", price: 100, color: "#feaedc", symbol: "5×", detail: "Fuel lasts five times as long for the rest of this run. The strongest fuel enhancer." },
] as const;

export type SpaceSupply = typeof SPACE_SUPPLIES[number]["id"];
export function spaceFuelDrain(seconds: number, orbs: number, enhancer = 1) {
  return seconds * Math.min(1.7, 1 + orbs * 0.012) / enhancer;
}
export type SpaceStock = Record<SpaceSupply, number>;
export type SpaceMarketState = { balance: number; administrator: boolean; inventory: SpaceStock };
export type ZeroSpaceControls = {
  ready: () => boolean;
  pause: (paused: boolean) => void;
  activate: (item: SpaceSupply) => void;
  fuelEnhancement: () => number;
};
