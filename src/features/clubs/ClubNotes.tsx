import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";
import { BookOpen, ChevronRight, Globe, GraduationCap, Loader2 } from "@/components/icons/glyphs";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { supabase } from "@/lib/supabase";

/**
 * ZeroNotes in a club's General chat.
 *
 * Only club admins can attach a note, and only notes they wrote and
 * published. Attaching records a share, and that share is what lets this
 * club's members open a bootcamp-only note. Members see a card; tapping it
 * opens the note in ZeroNotes.
 */

export const CLUB_NOTE_PREFIX = "::ZEROCLUB_NOTE::";

export type ClubNotePayload = {
  id: string;
  slug?: string | null;
  title: string;
  cover_url?: string | null;
  audience?: "public" | "bootcamps";
};

export const encodeClubNote = (note: ClubNotePayload) => `${CLUB_NOTE_PREFIX}${JSON.stringify(note)}`;

export function parseClubNote(content?: string | null): ClubNotePayload | null {
  if (!content?.startsWith(CLUB_NOTE_PREFIX)) return null;
  try {
    const note = JSON.parse(content.slice(CLUB_NOTE_PREFIX.length));
    return note?.id ? note : null;
  } catch {
    return null;
  }
}

type AttachableNote = {
  id: string;
  slug: string | null;
  title: string;
  cover_url: string | null;
  audience: "public" | "bootcamps";
  bootcamps: string[];
  created_at: string;
};

export function ClubNotePicker({
  open,
  onOpenChange,
  clubId,
  onAttach,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  /** Sends the card into the chat. */
  onAttach: (payload: string) => Promise<unknown> | unknown;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const notes = useQuery({
    queryKey: ["club-attachable-notes", clubId],
    enabled: open && Boolean(clubId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("club_attachable_notes", { p_club: clubId });
      if (error) throw error;
      return (data || []) as AttachableNote[];
    },
  });

  const attach = async (note: AttachableNote) => {
    setBusy(note.id);
    try {
      const { data, error } = await supabase.rpc("share_note_to_club", { p_note: note.id, p_club: clubId });
      if (error) throw error;
      const shared = data as ClubNotePayload;
      await onAttach(encodeClubNote({ id: shared.id, slug: shared.slug, title: shared.title, cover_url: shared.cover_url, audience: shared.audience }));
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't attach that note.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[620px]">
        <div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <DrawerTitle className="font-display text-[20px] font-semibold">Attach a ZeroNote</DrawerTitle>
          <DrawerDescription className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
            Members can open it from the chat — including bootcamp-only notes, which this club's members can then read.
          </DrawerDescription>

          <div className="no-scrollbar mt-4 max-h-[55dvh] space-y-1.5 overflow-y-auto overscroll-contain">
            {notes.isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : notes.error ? (
              <p className="py-6 text-center text-[13.5px] text-muted-foreground">{(notes.error as Error).message}</p>
            ) : (notes.data || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
                <p className="text-[15px] font-semibold">No published notes yet</p>
                <p className="mt-1 text-[13px] text-muted-foreground">Write a note and publish it for your bootcamp learners, then attach it here.</p>
                <button onClick={() => { onOpenChange(false); navigate({ to: "/app/notes/create" } as never); }} className="mt-4 h-10 rounded-full bg-[#cc208f] px-5 text-[13.5px] font-semibold text-white">Write a note</button>
              </div>
            ) : (
              (notes.data || []).map((note) => (
                <button
                  key={note.id}
                  disabled={!!busy}
                  onClick={() => void attach(note)}
                  className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition hover:bg-foreground/[0.04] disabled:opacity-60"
                >
                  {note.cover_url ? (
                    <img src={note.cover_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" loading="lazy" />
                  ) : (
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#cc208f]/10 text-[#cc208f]"><BookOpen className="h-6 w-6" /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-foreground">{note.title}</span>
                    <span className="mt-1 flex items-center gap-1 truncate text-[12px] text-muted-foreground">
                      {note.audience === "bootcamps" ? <GraduationCap className="h-3.5 w-3.5 shrink-0 text-[#cc208f]" /> : <Globe className="h-3.5 w-3.5 shrink-0" />}
                      {note.audience === "bootcamps" ? (note.bootcamps.length ? note.bootcamps.join(", ") : "Bootcamp learners") : "Public"}
                    </span>
                  </span>
                  {busy === note.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              ))
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** The card members see in the chat. */
export function ClubNoteCard({ note, isMe }: { note: ClubNotePayload; isMe: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/app/notes/$id", params: { id: note.id } } as never)}
      className="block w-[min(300px,72vw)] overflow-hidden rounded-xl text-left transition active:scale-[0.99]"
    >
      {note.cover_url ? (
        <img src={note.cover_url} alt="" className="aspect-[16/8] w-full object-cover" loading="lazy" />
      ) : (
        <div className={`flex aspect-[16/7] w-full items-center justify-center ${isMe ? "bg-background/10" : "bg-[#cc208f]/10"}`}>
          <BookOpen className={`h-8 w-8 ${isMe ? "text-background/70" : "text-[#cc208f]"}`} />
        </div>
      )}
      <div className="pt-2.5">
        <p className={`flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide ${isMe ? "text-background/60" : "text-[#cc208f]"}`}>
          <BookOpen className="h-3 w-3" /> ZeroNote{note.audience === "bootcamps" ? " · Bootcamp learners" : ""}
        </p>
        <p className={`mt-1 line-clamp-2 text-[15px] font-semibold leading-snug ${isMe ? "text-background" : "text-foreground"}`}>{note.title}</p>
        <p className={`mt-1.5 flex items-center gap-0.5 text-[12.5px] font-semibold ${isMe ? "text-background/75" : "text-muted-foreground"}`}>
          Read note <ChevronRight className="h-3.5 w-3.5" />
        </p>
      </div>
    </button>
  );
}
