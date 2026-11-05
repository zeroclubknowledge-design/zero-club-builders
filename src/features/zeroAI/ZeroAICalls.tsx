import { Phone } from "@/components/icons/glyphs";

export function ZeroAICalls({ userId: _userId }: { userId: string }) {
  return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-4 w-4" /> AI phone calls · Coming soon</div>;
}
