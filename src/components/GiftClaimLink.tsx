import { Gift } from "@/components/icons/glyphs";
import { Link } from "@tanstack/react-router";

/** Gifts are claimed from their link or browse page, then chosen at checkout. */
export function GiftClaimLink({dark=false}:{dark?:boolean}) {
  return <Link to="/app/gifts" className={`mt-2 flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${dark?"border-white/12 bg-white/[0.045] text-white":"border-border bg-card text-foreground hover:bg-muted/40"}`}>
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${dark?"bg-white/10 text-[#ee64b3]":"bg-[#c3217e]/10 text-[#c3217e]"}`}><Gift className="h-4 w-4"/></span>
    <span className="min-w-0"><span className="block text-[12.5px] font-semibold">My Zero Cards</span><span className={`mt-0.5 block text-[11px] leading-relaxed ${dark?"text-white/55":"text-muted-foreground"}`}>View your gifts and available credit inside Zero Club.</span></span>
  </Link>;
}
