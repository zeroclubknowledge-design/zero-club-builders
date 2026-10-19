export const SPACE_SUPPLIES = [
  { id: "shield", name: "Shield", price: 30, color: "#5cc8ff", symbol: "S", detail: "Block one collision with a doubt drone. Lasts up to 10 seconds." },
  { id: "focus", name: "Focus", price: 25, color: "#b38cff", symbol: "F", detail: "Slow doubt drones to 40% speed for 5 seconds. Find your opening." },
  { id: "magnet", name: "Magnet", price: 25, color: "#ffb547", symbol: "M", detail: "Pull nearby opportunity orbs toward your craft for 6 seconds." },
  { id: "fuel", name: "Fuel Cell", price: 20, color: "#61e6ac", symbol: "+", detail: "Refill your fuel ring instantly. Save it for when you are running low." },
] as const;

export type SpaceSupply = typeof SPACE_SUPPLIES[number]["id"];
export type SpaceStock = Record<SpaceSupply, number>;
export type SpaceMarketState = { balance: number; administrator: boolean; inventory: SpaceStock };
export type ZeroSpaceControls = {
  ready: () => boolean;
  pause: (paused: boolean) => void;
  activate: (item: SpaceSupply) => void;
};
