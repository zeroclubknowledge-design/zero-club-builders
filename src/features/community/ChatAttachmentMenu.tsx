import type { ReactNode } from "react";
import { Image, Film, File, BarChart3, Paperclip } from "@/components/icons/glyphs";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** The same attachment picker for club discussion and announcement composers. */
export function ChatAttachmentMenu({ onPictures, onVideo, onFile, onPoll, children }: {
  onPictures: () => void; onVideo: () => void; onFile: () => void;
  onPoll?: () => void; children?: ReactNode;
}) {
  const options = [
    { label: "Pictures", Icon: Image, action: onPictures },
    { label: "Video", Icon: Film, action: onVideo },
    { label: "File", Icon: File, action: onFile },
    ...(onPoll ? [{ label: "Poll", Icon: BarChart3, action: onPoll }] : []),
  ];
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" title="Add attachment" aria-label="Attachment options" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-95">
        <Paperclip className="h-[22px] w-[22px]" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" side="top" className="z-[100] w-52 rounded-2xl border-0 bg-card p-1.5 shadow-lift">
      {options.map(({ label, Icon, action }) => <DropdownMenuItem key={label} onSelect={action} className="gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5 fill-current" /></span>{label}
      </DropdownMenuItem>)}
      {children}
    </DropdownMenuContent>
  </DropdownMenu>;
}
