import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Search, Plus, Edit3, Image as ImageIcon, MoreVertical, Trash2, Share2, X } from "@/components/icons/solar";
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { deleteNoteAction } from '@/api';
import { toast } from 'sonner';

export const Route = createFileRoute('/app/notes/')({
  component: NotesIndexPage,
});

function NotesIndexPage() {
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Overview');
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
    if (activeTab === 'My Notes') return n.author_id === profile?.id;
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

  const handleShare = async (e: React.MouseEvent, noteId: string, title?: string) => {
    e.preventDefault();
    const url = `${window.location.origin}/app/notes/${noteId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: title || 'ZeroNotes',
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

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-[#f8f7f5] selection:bg-foreground selection:text-background dark:bg-background">
      {/* Sticky Header and Tabs */}
      <div className="sticky top-0 z-50 flex flex-col border-b border-border/60 bg-background">
        {/* Editorial Header */}
        <header className="mx-auto flex w-full max-w-[1100px] items-center gap-3 px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))] md:px-6">
          <button 
            onClick={() => navigate({ to: '/app' })}
            className="flex h-10 w-10 items-center justify-center gap-2 rounded-lg border border-border/60 bg-card text-foreground transition hover:bg-accent active:scale-95 md:w-auto md:px-4"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
            <span className="hidden text-sm font-semibold md:block">Back</span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[17px] font-semibold text-foreground">ZeroNotes</h1>
            <p className="truncate text-[11px] text-muted-foreground">Ideas, lessons, and work worth keeping</p>
          </div>
          <Link to="/app/notes/create" className="hidden h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-semibold text-background transition hover:opacity-90 sm:flex">
            <Plus className="h-4 w-4" />
            Write
          </Link>
        </header>

        <div className="mx-auto w-full max-w-[1100px] px-4 pb-3 md:px-6">
          <label className="flex h-11 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 transition-colors focus-within:border-primary">
            <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search titles, ideas, or writers"
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
        </div>

        {/* Filter Tabs */}
        <div className="mx-auto grid w-full max-w-[1100px] shrink-0 grid-cols-3 gap-1 px-4 pb-3 md:px-6">
          <div className="col-span-3 grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-card p-1">
          {['Overview', 'My Notes', 'Saved'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex h-10 min-w-0 items-center justify-center rounded-md px-3 text-[12px] font-semibold tracking-tight transition-colors tap ${
                activeTab === tab
                  ? 'bg-primary/[0.09] text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]'
              }`}
            >
              {tab}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-[1100px] flex-1 space-y-10 px-4 py-6 pb-24 md:px-6 md:py-8 md:space-y-12">
        
        {loading ? (
          <div className="flex flex-col gap-8 animate-pulse">
            <div className="aspect-[16/10] w-full rounded-lg bg-muted/50 sm:aspect-[2/1] md:aspect-[24/9]" />
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:gap-5">
              <div className="h-28 w-full rounded-lg bg-muted/50" />
              <div className="h-28 w-full rounded-lg bg-muted/50" />
            </div>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 md:py-32 text-center px-6 mt-4">
            <div className="mb-6 h-14 w-14 rounded-full ring-1 ring-border flex items-center justify-center">
              <Edit3 className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
            </div>
            <h3 className="text-[22px] md:text-[26px] font-semibold tracking-tight mb-2.5 font-serif">
              {searchQuery ? "No matches found" : "Your blank canvas"}
            </h3>
            <p className="text-muted-foreground text-[14px] max-w-[340px] leading-relaxed mb-7">
              {searchQuery
                ? `We couldn't find any notes matching "${searchQuery}". Try a different keyword.`
                : "Share your thoughts, audio insights, or video essays in a beautiful format."}
            </p>
            {!searchQuery && (
              <Link
                to="/app/notes/create"
                className="bg-foreground text-background px-6 py-3 rounded-full font-semibold tracking-tight text-[13.5px] tap hover:opacity-90 flex items-center gap-2"
              >
                <Edit3 className="h-4 w-4" />
                Start writing
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Editorial Hero Note */}
            {featuredNote && (
              <Link to="/app/notes/$id" params={{ id: featuredNote.id }} className="block group">
                <article className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-black shadow-[0_1px_2px_rgba(0,0,0,0.05),0_18px_40px_-20px_rgba(0,0,0,0.35)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_26px_54px_-22px_rgba(0,0,0,0.45)] sm:aspect-[2/1] md:aspect-[24/9]">
                  {featuredNote.cover_url ? (
                    <img 
                      src={featuredNote.cover_url} 
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-1000 ease-[cubic-bezier(0.19,1,0.22,1)]" 
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-neutral-800 to-black opacity-80" />
                  )}
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
                  
                  {/* Content Overlay */}
                  <div className="absolute inset-0 p-6 md:p-12 flex flex-col justify-end pointer-events-none text-white">
                    <div className="mb-4 md:mb-6 flex items-center justify-between">
                      <span className="px-3 py-1.5 text-[10px] font-medium tracking-[0.16em] bg-white/15 ring-1 ring-white/20 backdrop-blur-md rounded-full text-white/90 uppercase">
                        Featured
                      </span>
                      {profile?.id === featuredNote.author_id ? (
                        <div onClick={(e) => e.preventDefault()} className="pointer-events-auto">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-8 w-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition">
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-background/95 backdrop-blur-xl border-border z-[200]">
                              <DropdownMenuItem
                                className="flex items-center gap-3 py-2.5 cursor-pointer text-foreground focus:text-foreground"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  navigate({ to: '/app/notes/$id/edit', params: { id: featuredNote.id } });
                                }}
                              >
                                <Edit3 className="h-4 w-4" />
                                <span className="font-medium">Edit Note</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="flex items-center gap-3 py-2.5 cursor-pointer text-foreground focus:text-foreground"
                                onClick={(e) => handleShare(e, featuredNote.id, featuredNote.title)}
                              >
                                <Share2 className="h-4 w-4" />
                                <span className="font-medium">Share Note</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="flex items-center gap-3 py-2.5 cursor-pointer text-red-500 focus:text-red-500"
                                onClick={(e) => { e.preventDefault(); setNoteToDelete(featuredNote.id); }}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="font-medium">Delete Note</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : (
                        <div onClick={(e) => e.preventDefault()} className="pointer-events-auto">
                          <button 
                            onClick={(e) => handleShare(e, featuredNote.id, featuredNote.title)}
                            className="h-8 w-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition"
                          >
                            <Share2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <h2 className="text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] mb-4 text-white font-serif drop-shadow-sm">
                      {featuredNote.title || "Untitled Note"}
                    </h2>
                    
                    <p className="text-white/80 text-sm md:text-base lg:text-lg leading-relaxed line-clamp-2 md:line-clamp-3 font-medium mb-6 md:mb-8 max-w-2xl drop-shadow">
                      {(featuredNote.blocks?.find((b: any) => b.type === 'text')?.content || "Read the full story inside...").replace(/<[^>]*>?/gm, '')}
                    </p>
                    
                    <div className="flex items-center gap-4 mt-auto">
                      <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-white/20 overflow-hidden border-2 border-white/30 backdrop-blur-sm">
                        {featuredNote.profiles?.avatar_url ? (
                          <img src={featuredNote.profiles.avatar_url} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[14px] font-bold">
                            {featuredNote.profiles?.username?.[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[14px] md:text-[15px] font-semibold text-white tracking-tight">
                          {featuredNote.profiles?.full_name || featuredNote.profiles?.username}
                        </span>
                        <span className="text-[11px] md:text-[12px] text-white/70 font-medium flex items-center gap-2">
                          {featuredNote.created_at ? formatDistanceToNow(new Date(featuredNote.created_at)) : 'New'}
                          <span className="h-1 w-1 rounded-full bg-white/40" />
                          5 min read
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            )}

            {/* List Notes (Magazine Grid) */}
            {recentNotes.length > 0 && (
              <div className="space-y-8 md:space-y-10">
                <div className="flex items-center justify-between border-b border-border/20 pb-4">
                  <h3 className="font-semibold text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                    Latest publications
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:gap-5">
                  {recentNotes.map((note) => (
                    <Link key={note.id} to="/app/notes/$id" params={{ id: note.id }} className="group block relative">
                      {/* Mobile: Horizontal, Desktop: Vertical */}
                      <article className="flex flex-row overflow-hidden rounded-lg border border-border/60 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_26px_-14px_rgba(0,0,0,0.16)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-border group-hover:shadow-[0_2px_5px_rgba(0,0,0,0.05),0_18px_40px_-16px_rgba(0,0,0,0.24)]">
                        {/* Cover Image */}
                        <div className="relative aspect-[4/3] w-[40%] shrink-0 overflow-hidden bg-accent/30 sm:w-[36%]">
                          {note.cover_url ? (
                            <img 
                              src={note.cover_url} 
                              className="w-full h-full object-cover transition-transform duration-1000 ease-out group-hover:scale-105" 
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="h-6 w-6 md:h-10 md:w-10 text-muted-foreground/30" strokeWidth={1.5} />
                            </div>
                          )}
                          {/* Read time badge (desktop only, over image) */}
                          <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[9px] font-medium tracking-[0.12em] text-white/90 backdrop-blur-md md:left-4 md:top-4 md:px-3 md:py-1.5 md:text-[10px]">
                            3 MIN READ
                          </div>

                          {/* 3-dot menu or share */}
                          {profile?.id === note.author_id ? (
                            <div className="absolute top-2 right-2 md:top-4 md:right-4" onClick={(e) => e.preventDefault()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="h-8 w-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition">
                                    <MoreVertical className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 bg-background/95 backdrop-blur-xl border-border z-[200]">
                                  <DropdownMenuItem
                                    className="flex items-center gap-3 py-2.5 cursor-pointer text-foreground focus:text-foreground"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      navigate({ to: '/app/notes/$id/edit', params: { id: note.id } });
                                    }}
                                  >
                                    <Edit3 className="h-4 w-4" />
                                    <span className="font-medium">Edit Note</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="flex items-center gap-3 py-2.5 cursor-pointer text-foreground focus:text-foreground"
                                    onClick={(e) => handleShare(e, note.id, note.title)}
                                  >
                                    <Share2 className="h-4 w-4" />
                                    <span className="font-medium">Share Note</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="flex items-center gap-3 py-2.5 cursor-pointer text-red-500 focus:text-red-500"
                                    onClick={(e) => { e.preventDefault(); setNoteToDelete(note.id); }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="font-medium">Delete Note</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ) : (
                            <div className="absolute top-2 right-2 md:top-4 md:right-4" onClick={(e) => e.preventDefault()}>
                              <button 
                                onClick={(e) => handleShare(e, note.id, note.title)}
                                className="h-8 w-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition"
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex min-w-0 flex-1 flex-col justify-center p-3.5 sm:p-4">
                          <h3 className="font-semibold text-[17px] md:text-[21px] tracking-tight leading-[1.25] text-foreground group-hover:text-primary transition-colors mb-2 md:mb-3 line-clamp-2 md:line-clamp-2 font-serif">
                            {note.title || "Untitled Note"}
                          </h3>
                          <p className="text-muted-foreground text-[14px] md:text-[15px] leading-relaxed line-clamp-2 md:line-clamp-2 mb-3 md:mb-5 hidden sm:block">
                            {(note.blocks?.find((b: any) => b.type === 'text')?.content || "").replace(/<[^>]*>?/gm, '')}
                          </p>
                          
                          <div className="flex items-center gap-2.5 mt-auto min-w-0">
                            <div className="h-6 w-6 md:h-8 md:w-8 rounded-full overflow-hidden bg-muted border border-border/40 shrink-0">
                              {note.profiles?.avatar_url ? (
                                <img src={note.profiles.avatar_url} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-foreground text-background flex items-center justify-center font-bold text-[9px] md:text-[11px]">
                                  {note.profiles?.username?.[0]?.toUpperCase()}
                                </div>
                              )}
                            </div>
                            <span className="text-[13px] md:text-[14px] font-semibold text-foreground truncate tracking-tight shrink">
                              {note.profiles?.full_name || note.profiles?.username}
                            </span>
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                            <span className="text-[12px] md:text-[13px] text-muted-foreground whitespace-nowrap">
                              {note.created_at ? formatDistanceToNow(new Date(note.created_at)) : 'New'}
                            </span>
                          </div>
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Action Button */}
      <Link 
        to="/app/notes/create"
        className="fixed bottom-6 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lift tap hover:opacity-90"
      >
        <Plus className="h-6 w-6" strokeWidth={2} />
      </Link>

      {/* Delete Confirmation Modal */}
      {noteToDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm animate-in rounded-lg bg-background p-6 shadow-lift ring-1 ring-border duration-200 zoom-in-95 md:p-7">
            <h3 className="text-[19px] font-semibold mb-2 tracking-tight">Delete this note?</h3>
            <p className="text-[13.5px] text-muted-foreground mb-7 leading-relaxed">
              Are you sure you want to delete this note? This action cannot be undone and it will be permanently removed.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleDelete}
                className="w-full py-3.5 bg-destructive text-destructive-foreground font-semibold tracking-tight rounded-full tap hover:opacity-90"
              >
                Yes, delete note
              </button>
              <button 
                onClick={() => setNoteToDelete(null)}
                className="w-full py-3.5 ring-1 ring-border text-foreground font-semibold tracking-tight rounded-full tap hover:bg-foreground/[0.03]"
              >
                No, cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
