import { hasShareSheet, openShareSheet } from "@/components/ShareSheet";
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Search, Edit3, Image as ImageIcon, MoreVertical, Trash2, Share2, X, PenLine } from "@/components/icons/glyphs";
import { useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { deleteNoteAction } from '@/api';
import { zeroNoteUrl } from '@/lib/share';
import { toast } from 'sonner';

export const Route = createFileRoute('/app/notes/')({
  component: NotesIndexPage,
});

/** Reading time from the note's own words, at an ordinary 200 words a minute. */
function readMinutes(note: any): number {
  const text = [note?.title, ...(note?.blocks || []).map((block: any) => block?.content || block?.text || "")]
    .join(" ")
    .replace(/<[^>]*>?/gm, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function NoteDetailsLink({ note, className, children }: { note: any; className: string; children: ReactNode }) {
  if (note.slug) {
    return <Link to="/notes/$slug" params={{ slug: note.slug }} className={className}>{children}</Link>;
  }
  return <Link to="/app/notes/$id" params={{ id: note.id }} className={className}>{children}</Link>;
}

function NotesIndexPage() {
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('For you');
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  
  const { data: fetchedNotes = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['notes'],
    queryFn: async () => {
      let query = supabase
        .from('notes')
        .select('*, profiles(username, full_name, avatar_url)')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error && error.code !== '42P01') console.error(error);
      return data || [];
    }
  });

  const notes = fetchedNotes;

  const filteredNotes = notes.filter((n) => {
    if (activeTab === 'My notes') return n.author_id === profile?.id;
    return true;
  }).filter((n) => {
    if (!searchQuery) return true;
    const searchable = [n.title, n.content, n.profiles?.full_name, n.profiles?.username]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return searchable.includes(searchQuery.trim().toLowerCase());
  });

  const featuredNote = filteredNotes.length > 0 ? filteredNotes[0] : null;
  const recentNotes = filteredNotes.length > 1 ? filteredNotes.slice(1) : [];

  const handleDelete = async () => {
    if (!noteToDelete) return;
    try {
      await deleteNoteAction({ data: { noteId: noteToDelete } });
      toast.success('Note deleted');
      refetch();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete note');
    }
    setNoteToDelete(null);
  };

  const handleShare = async (e: React.MouseEvent, note: any) => {
    e.preventDefault();
    const url = zeroNoteUrl(note);
    if (hasShareSheet()) {
      try {
        await openShareSheet({
          title: note.title || 'ZeroNotes',
          text: 'Check out this note on Zero Club!',
          url: url,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard!');
    }
  };

  const noteMenu = (note: any, onDark = false) => (
    <div onClick={(e) => e.preventDefault()} className="shrink-0">
      {profile?.id === note.author_id ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Note options"
              className={`grid h-8 w-8 place-items-center rounded-full transition ${onDark ? "bg-black/40 text-white hover:bg-black/60" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"}`}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[200] w-48">
            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-3 py-2.5"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate({ to: '/app/notes/$id/edit', params: { id: note.id } });
              }}
            >
              <Edit3 className="h-4 w-4" /> Edit note
            </DropdownMenuItem>
            <DropdownMenuItem className="flex cursor-pointer items-center gap-3 py-2.5" onClick={(e) => handleShare(e, note)}>
              <Share2 className="h-4 w-4" /> Share note
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-3 py-2.5 text-destructive focus:text-destructive"
              onClick={(e) => { e.preventDefault(); setNoteToDelete(note.id); }}
            >
              <Trash2 className="h-4 w-4" /> Delete note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          onClick={(e) => handleShare(e, note)}
          aria-label="Share note"
          className={`grid h-8 w-8 place-items-center rounded-full transition ${onDark ? "bg-black/40 text-white hover:bg-black/60" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"}`}
        >
          <Share2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-canvas selection:bg-foreground selection:text-background">
      <div className="sticky top-0 z-50 bg-card pt-[env(safe-area-inset-top)]">
        <header className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={() => navigate({ to: '/app' })}
            aria-label="Back"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold text-foreground">ZeroNotes</h1>
          <Link to="/app/notes/create" className="flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[14px] font-semibold text-background transition hover:opacity-90">
            <PenLine className="h-4 w-4" /> Write
          </Link>
        </header>
        <div className="zc-page-width mx-auto flex w-full max-w-[680px] gap-6 border-b border-border px-4 text-[14px] font-semibold">
          {['For you', 'My notes'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex h-10 items-center transition-colors ${activeTab === tab ? 'text-foreground shadow-[inset_0_-2px_0_currentColor]' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="zc-page-width mx-auto w-full max-w-[680px] px-3 py-2.5">
          <label className="flex h-[38px] w-full items-center gap-2 rounded-full bg-foreground/[0.06] px-3">
            <Search className="h-[17px] w-[17px] shrink-0 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search titles, ideas or writers"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>
      </div>

      <div className="zc-page-width mx-auto mt-2 flex w-full max-w-[680px] flex-1 flex-col gap-2 md:mb-6">
        {loading ? (
          <div className="flex flex-1 animate-pulse flex-col gap-3 bg-card p-4">
            <div className="h-[150px] w-full rounded-[14px] bg-muted/60" />
            <div className="h-20 w-full rounded-lg bg-muted/60" />
            <div className="h-20 w-full rounded-lg bg-muted/60" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-card px-6 py-20 text-center md:rounded-xl md:border md:border-border">
            <Edit3 className="mb-4 h-8 w-8 text-muted-foreground/60" />
            <h3 className="mb-2 font-display text-[20px] font-semibold">
              {searchQuery ? "No matches found" : activeTab === 'My notes' ? "You haven't written a note yet" : "No notes yet"}
            </h3>
            <p className="mb-6 max-w-[340px] text-[14px] leading-relaxed text-muted-foreground">
              {searchQuery
                ? `Nothing matches "${searchQuery}". Try a different word.`
                : "Share what you learned — a lesson, a cheat sheet, a walkthrough."}
            </p>
            {!searchQuery && (
              <Link to="/app/notes/create" className="flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background hover:opacity-90">
                <PenLine className="h-4 w-4" /> Start writing
              </Link>
            )}
          </div>
        ) : (
          <>
            {featuredNote && (
              <section className="bg-card p-4 md:rounded-xl md:border md:border-border">
                <NoteDetailsLink note={featuredNote} className="group block">
                  <article className="relative flex h-[168px] flex-col overflow-hidden rounded-[14px] bg-[#2a2230] p-4 text-white">
                    {featuredNote.cover_url && (
                      <img src={featuredNote.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-700 group-hover:scale-105" loading="lazy" decoding="async" />
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
                    <div className="relative flex items-start justify-between gap-2">
                      <span className="text-[12px] font-semibold text-white/80">Featured · {readMinutes(featuredNote)} min read</span>
                      {noteMenu(featuredNote, true)}
                    </div>
                    <h2 className="relative mt-auto line-clamp-2 font-display text-[20px] font-semibold leading-tight">{featuredNote.title || "Untitled note"}</h2>
                    <p className="relative mt-1 text-[13px] text-white/80">{featuredNote.profiles?.full_name || featuredNote.profiles?.username}</p>
                  </article>
                </NoteDetailsLink>
              </section>
            )}

            {recentNotes.length > 0 && (
              <section className="flex-1 bg-card md:flex-none md:rounded-xl md:border md:border-border">
                {recentNotes.map((note) => (
                  <NoteDetailsLink key={note.id} note={note} className="group flex gap-3 border-b border-border px-4 py-3.5 last:border-b-0 hover:bg-foreground/[0.02]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-muted-foreground">
                        {note.profiles?.full_name || note.profiles?.username} · {readMinutes(note)} min
                      </p>
                      <h3 className="mt-1 line-clamp-2 text-[16px] font-semibold leading-snug text-foreground">{note.title || "Untitled note"}</h3>
                      <p className="mt-1.5 text-[13px] text-muted-foreground">
                        {note.created_at ? formatDistanceToNow(new Date(note.created_at), { addSuffix: true }) : 'New'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="h-[76px] w-[76px] overflow-hidden rounded-[10px] bg-muted">
                        {note.cover_url ? (
                          <img src={note.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <div className="grid h-full w-full place-items-center"><ImageIcon className="h-6 w-6 text-muted-foreground/40" /></div>
                        )}
                      </div>
                    </div>
                    <div className="-mr-2 -mt-1">{noteMenu(note)}</div>
                  </NoteDetailsLink>
                ))}
              </section>
            )}
            {recentNotes.length === 0 && <div className="flex-1 bg-card md:hidden" />}
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {noteToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm animate-in rounded-2xl bg-card p-6 shadow-2xl ring-1 ring-border duration-200 zoom-in-95">
            <h3 className="mb-2 text-[18px] font-semibold">Delete this note?</h3>
            <p className="mb-6 text-[14px] leading-relaxed text-muted-foreground">
              This can't be undone — the note will be removed for good.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleDelete}
                className="h-11 w-full rounded-full bg-destructive text-[15px] font-semibold text-destructive-foreground tap hover:opacity-90"
              >
                Delete note
              </button>
              <button 
                onClick={() => setNoteToDelete(null)}
                className="h-11 w-full rounded-full border border-foreground/25 text-[15px] font-semibold text-foreground tap hover:bg-foreground/[0.03]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
