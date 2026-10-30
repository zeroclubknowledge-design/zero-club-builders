import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Keep the heading choices out of the main toolbar without losing the selection. */
export function NoteHeadingPicker({ onSelect }: { onSelect: (level: 1 | 2 | 3) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Headings"
          aria-label="Choose heading level"
          onMouseDown={event => event.preventDefault()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-bold transition hover:bg-foreground/[0.05] hover:text-foreground data-[state=open]:bg-foreground/[0.08] data-[state=open]:text-foreground active:scale-90"
        >
          H
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={10}
        aria-label="Heading levels"
        className="flex w-auto max-w-[calc(100vw-24px)] flex-row gap-1 rounded-2xl border-border bg-card p-1.5 text-foreground shadow-xl"
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => {
          // Return to the text selection rather than focusing the toolbar button.
          event.preventDefault();
          (window as any).activeTipTapEditor?.commands.focus();
        }}
      >
        {([1, 2, 3] as const).map(level => (
          <button
            key={level}
            type="button"
            title={`Heading ${level}`}
            aria-label={`Heading ${level}`}
            onMouseDown={event => event.preventDefault()}
            onClick={() => {
              onSelect(level);
              setOpen(false);
            }}
            className="grid h-11 w-12 place-items-center rounded-xl text-[14px] font-bold transition hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
          >
            H{level}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
