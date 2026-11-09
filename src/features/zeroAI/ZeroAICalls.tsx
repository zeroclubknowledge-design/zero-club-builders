import { AIIcon } from "./AIIcons";
import { toast } from "sonner";

export function ZeroAICalls({ userId: _userId }: { userId: string }) {
  return (
    <button
      type="button"
      aria-label="AI phone calls"
      title="AI phone calls"
      onClick={() => toast.info("AI phone calls are coming soon.")}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:brightness-110 active:scale-[0.98]"
    >
      <AIIcon name="voice" className="h-5 w-5" />
    </button>
  );
}
