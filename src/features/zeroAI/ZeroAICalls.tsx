import { Phone } from "@/components/icons/glyphs";
import { toast } from "sonner";

export function ZeroAICalls({ userId: _userId }: { userId: string }) {
  return (
    <button
      type="button"
      aria-label="AI phone calls"
      title="AI phone calls"
      onClick={() => toast.info("AI phone calls are coming soon.")}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground transition hover:bg-foreground/5 active:scale-[0.98]"
    >
      <Phone className="h-4 w-4" />
    </button>
  );
}
