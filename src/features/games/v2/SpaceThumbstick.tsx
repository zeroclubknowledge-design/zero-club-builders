import { useCallback, useEffect, useRef, useState, type RefObject, type PointerEvent } from "react";
import type { ZeroSpaceControls } from "./spaceSupplies";

/** A fixed-base analogue pad; pointer capture keeps steering when a finger leaves it. */
export function SpaceThumbstick({ controls, disabled }: { controls: RefObject<ZeroSpaceControls | null>; disabled: boolean }) {
  const pointer = useRef<number | null>(null);
  const [offset, setOffset] = useState({x:0,y:0});
  const stop = useCallback(() => { pointer.current = null; setOffset({x:0,y:0}); controls.current?.steer(0,0); }, [controls]);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);
  useEffect(() => {
    window.addEventListener("blur", stop);
    return () => { window.removeEventListener("blur", stop); controls.current?.steer(0,0); };
  }, [controls, stop]);
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || pointer.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width * 0.32;
    const x = event.clientX - (rect.left + rect.width/2), y = event.clientY - (rect.top + rect.height/2);
    const length = Math.hypot(x,y);
    const scale = length > radius ? radius/length : 1;
    setOffset({x:x*scale,y:y*scale});
    controls.current?.steer(x/radius,y/radius);
  };
  return <button type="button" aria-label="Flight thumbstick. Hold and move to steer; release to stop." disabled={disabled}
    onPointerDown={event => { if (disabled || pointer.current !== null) return; event.preventDefault(); pointer.current=event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); move(event); }}
    onPointerMove={move} onPointerUp={event => { if (pointer.current===event.pointerId) stop(); }} onPointerCancel={event => { if (pointer.current===event.pointerId) stop(); }} onLostPointerCapture={event => { if (pointer.current===event.pointerId) stop(); }}
    className="relative grid h-24 w-24 shrink-0 touch-none select-none place-items-center rounded-full bg-[#fd49b0]/10 shadow-[inset_0_2px_18px_rgba(0,0,0,0.5)] ring-1 ring-white/15 outline-none focus-visible:ring-2 focus-visible:ring-[#fd49b0] disabled:opacity-35 [@media(max-height:500px)]:h-16 [@media(max-height:500px)]:w-16" style={{touchAction:"none"}}>
    <span aria-hidden className="absolute inset-3 rounded-full ring-1 ring-white/10" />
    <span aria-hidden className="absolute h-px w-3/4 bg-white/10" /><span aria-hidden className="absolute h-3/4 w-px bg-white/10" />
    <span aria-hidden className="relative h-11 w-11 rounded-full bg-[radial-gradient(circle_at_35%_25%,#ef85c6,#a7196b_75%)] shadow-[0_5px_16px_rgba(0,0,0,0.5)] ring-1 ring-white/25 [@media(max-height:500px)]:h-8 [@media(max-height:500px)]:w-8" style={{transform:`translate(${offset.x}px,${offset.y}px)`}} />
  </button>;
}
