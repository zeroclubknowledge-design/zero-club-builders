import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, TicketPercent } from "@/components/icons/glyphs";
import { useGoBack } from "@/hooks/useGoBack";
import { ClaimSeatBox, MySeatPacks, PrivateBootcampButton, PrivateRequestsList } from "@/features/bootcamps/BootcampExtras";

/* Group seats you bought or can claim, and private bootcamp requests (sent and received). */
export const Route = createFileRoute("/app/bootcamps/requests")({
  component: SeatsAndRequests,
  head: () => ({ meta: [{ title: "Seats & team requests — Zero Club" }] }),
});

function SeatsAndRequests() {
  const goBack = useGoBack("/app/bootcamps");
  return (
    <div className="mx-auto min-h-screen max-w-[760px] pb-24">
      <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-3 backdrop-blur">
        <button type="button" onClick={goBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full hover:bg-foreground/[0.05]"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="font-display text-[18px] font-semibold">Seats & team requests</h1>
      </div>
      <div className="px-4 pt-5 md:px-6">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold"><TicketPercent className="h-5 w-5 text-[#cc208f]" /> Have a seat code?</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Someone bought you a place. Enter the code to join the bootcamp.</p>
          <div className="mt-3"><ClaimSeatBox /></div>
        </div>
        <MySeatPacks />
        <PrivateRequestsList />
        <div className="mt-4"><PrivateBootcampButton /></div>
      </div>
    </div>
  );
}
