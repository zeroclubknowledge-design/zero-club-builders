import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Share2, Bookmark, Heart, Mic, Edit3, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/hooks/useUser';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { LinkifiedText } from '@/components/LinkifiedText';
import { CommentDrawer } from '@/components/CommentDrawer';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { followUserAction, unfollowUserAction, deleteNoteAction } from '@/api';

export const Route = createFileRoute('/app/notes/$id')({
  loader: async ({ params: { id } }) => {
    const { data: note, error } = await supabase
      .from('notes')
      .select('*, profiles(username, full_name, avatar_url)')
      .eq('id', id)
      .maybeSingle();

    if (error) console.error("Error loading note:", error);

    return { note };
  },
  head: ({ loaderData }) => {
    const note = loaderData?.note;
    if (!note) return {};

    const title = note.title || "Note on Zero Club";
    
    // Extract first text block for description
    const firstTextBlock = note.blocks?.find((b: any) => b.type === 'text' && b.content && b.content !== '<p></p>');
    let description = "Read this note on Zero Club";
    if (firstTextBlock) {
      const stripped = firstTextBlock.content.replace(/(<([^>]+)>)/gi, "");
      description = stripped.substring(0, 160) + (stripped.length > 160 ? '...' : '');
    }

    const image = note.cover_url || "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4215c30d-ff7b-4508-a899-c922d00e5475/id-preview-fa4e9537--ee5d9983-4748-4793-a658-4041e1470658.lovable.app-1778475055046.png";

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:type", content: "article" },
        // Use summary if there is no specific cover_url, else summary_large_image
        { name: "twitter:card", content: note.cover_url ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ]
    };
  },
  component: NoteReaderPage,
});

function NoteReaderPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: profile } = useUser();
  const queryClient = useQueryClient();
  const { note: loaderNote } = Route.useLoaderData();
  const { data: note, isLoading: loading } = useQuery({
    queryKey: ['note', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*, profiles(username, full_name, avatar_url)')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    initialData: () => loaderNote || undefined
  });

  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { data: followData, refetch: refetchFollow } = useQuery({
    queryKey: ['follows', profile?.id, note?.author_id],
    queryFn: async () => {
      if (!profile?.id || !note?.author_id) return false;
      const { data } = await supabase
        .from('follows')
        .select('*')
        .eq('follower_id', profile.id)
        .eq('following_id', note.author_id)
        .single();
      return !!data;
    },
    enabled: !!profile?.id && !!note?.author_id
  });

  const isFollowing = !!followData;

  const followMutation = useMutation({
    mutationFn: async (follow: boolean) => {
      if (!profile?.id || !note?.author_id) throw new Error("Missing IDs");
      if (follow) {
        await followUserAction({ data: { followerId: profile.id, followingId: note.author_id }});
      } else {
        await unfollowUserAction({ data: { followerId: profile.id, followingId: note.author_id }});
      }
    },
    onSuccess: (_, variables) => {
      refetchFollow();
      toast.success(variables ? "Following author!" : "Unfollowed author");
    },
    onError: (error) => {
      toast.error(error.message || "An error occurred");
    }
  });

  const handleLike = () => {
    setIsLiked(!isLiked);
    toast.success(isLiked ? "Removed from liked notes" : "Added to your liked notes!");
  };

  const handleBookmark = () => {
    setIsBookmarked(!isBookmarked);
    toast.success(isBookmarked ? "Removed from bookmarks" : "Saved to bookmarks!");
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: note?.title || 'Check out this note on ZeroNotes!',
          url: url,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    }
  };

  const confirmDelete = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    try {
      await deleteNoteAction({ data: { noteId: note.id } });
      toast.success('Note deleted');
      navigate({ to: '/app/notes' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete note');
    }
    setIsDeleteDialogOpen(false);
  };

  const handleFollow = () => {
    if (!profile) {
      toast.error("Please sign in to follow users");
      return;
    }
    followMutation.mutate(!isFollowing);
  };

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col bg-background overflow-hidden relative items-center justify-center">
        <div className="w-10 h-10 border-4 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex h-full w-full flex-col bg-background overflow-hidden relative items-center justify-center p-6 text-center">
        <h2 className="text-3xl font-black tracking-tight mb-3">Story not found</h2>
        <p className="text-muted-foreground/70 mb-8 max-w-[250px] leading-relaxed">The article you are looking for has been removed or is unavailable.</p>
        <button 
          onClick={() => navigate({ to: '/app/notes' })}
          className="bg-foreground text-background px-8 py-3.5 rounded-full font-bold shadow-lg hover:bg-foreground/90 transition-colors"
        >
          Return Home
        </button>
      </div>
    );
  }

  const renderBlock = (block: any) => {
    switch (block.type) {
      case 'text':
        if (!block.content || block.content.trim() === '') return null;
        const cleanContent = block.content.replace(/<p><\/p>|<p><br><\/p>|<p>&nbsp;<\/p>/g, '').trim();
        if (!cleanContent) return null;
        return (
          <div className="whitespace-pre-wrap text-[17px] leading-[1.8] text-foreground/90 md:text-lg">
            <LinkifiedText text={cleanContent} />
          </div>
        );
      case 'heading':
        return (
          <h2 className="mb-5 mt-12 text-2xl font-semibold text-foreground md:text-3xl">
            {block.content}
          </h2>
        );
      case 'image':
        return (
          <div className="my-8 overflow-hidden rounded-lg border border-border bg-muted">
            <img src={block.content} className="w-full h-auto object-cover hover:scale-[1.02] transition-transform duration-500" />
          </div>
        );
      case 'video':
        return (
          <div className="group relative my-8 overflow-hidden rounded-lg border border-border bg-black">
            <video src={block.content} controls className="w-full h-auto max-h-[70vh] object-contain" />
          </div>
        );
      case 'audio':
        return (
          <div className="my-8 flex flex-col gap-5 rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Mic className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg tracking-tight">Audio Insight</span>
                <span className="text-sm text-muted-foreground font-medium">Press play to listen</span>
              </div>
            </div>
            <audio src={block.content} controls preload="metadata" className="w-full outline-none" />
          </div>
        );
      case 'divider':
        return (
          <div className="py-14 flex justify-center">
            <div className="w-16 h-1 bg-border rounded-full" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-y-auto bg-[#f8f7f5] selection:bg-foreground selection:text-background dark:bg-background">
      
      <header className="sticky top-0 z-50 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 w-full max-w-[920px] items-center gap-3 px-4 sm:px-6">
        <button 
          onClick={() => navigate({ to: '/app/notes' })}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card text-foreground transition hover:bg-accent active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">ZeroNotes</p>
          <p className="truncate text-sm font-semibold">{note.title}</p>
        </div>
        <button onClick={handleBookmark} className={`grid h-10 w-10 place-items-center rounded-lg border bg-card transition hover:bg-accent ${isBookmarked ? 'border-primary text-primary' : 'border-border text-foreground'}`} aria-label="Save note">
          <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
        </button>
        <button onClick={handleShare} className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card text-foreground transition hover:bg-accent" aria-label="Share note">
          <Share2 className="h-4 w-4" />
        </button>
        </div>
      </header>

      <div className="w-full flex-1 flex flex-col">
        
        {/* Cover Image */}
        {note.cover_url && (
          <div className="mx-auto w-full max-w-[1100px] px-4 pt-5 sm:px-6 sm:pt-7">
            <div className="aspect-[16/9] overflow-hidden rounded-lg border border-border bg-muted md:aspect-[21/9]">
              <img src={note.cover_url} className="h-full w-full object-cover" />
            </div>
          </div>
        )}

        {/* Article Content */}
        <article className="relative z-10 mx-auto flex w-full max-w-[760px] flex-1 flex-col px-4 pb-10 pt-8 sm:px-6 sm:pt-10">

          <h1 className="mb-7 text-3xl font-semibold leading-tight text-foreground sm:text-4xl md:text-[44px]">
            {note.title}
          </h1>

          {/* Author Section: Larger author avatar with border ring. Name + "Follow" button row. Published date + reading time. Subtle bottom border separator */}
          <div className="mb-10 flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3.5">
              <div className="h-10 w-10 md:h-12 md:w-12 rounded-full overflow-hidden bg-muted border border-primary/20 shadow-sm shrink-0">
                {note.profiles?.avatar_url ? (
                  <img src={note.profiles.avatar_url} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-foreground text-background flex items-center justify-center font-bold text-lg">
                    {note.profiles?.username?.[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-semibold text-foreground">
                    {note.profiles?.full_name || note.profiles?.username}
                  </span>
                  {profile?.id !== note.author_id && (
                    <button 
                      onClick={handleFollow}
                      disabled={followMutation.isPending}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${isFollowing ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mt-0.5">
                  <span>{note.created_at ? formatDistanceToNow(new Date(note.created_at), { addSuffix: true }) : 'Just now'}</span>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>{Math.max(1, Math.ceil(note.blocks?.filter((b: any) => b.type === 'text').reduce((acc: number, b: any) => acc + (b.content?.split(' ').length || 0), 0) / 200))} min read</span>
                </div>
              </div>
            </div>
            {profile?.id === note.author_id && (
              <div className="flex items-center gap-2">
                <button onClick={() => navigate({ to: '/app/notes/$id/edit', params: { id: note.id } })} className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-accent">
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </button>
                <button onClick={confirmDelete} className="grid h-9 w-9 place-items-center rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10" aria-label="Delete note">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {note.blocks?.map((block: any, i: number) => (
              <div key={block.id || i}>
                {renderBlock(block)}
              </div>
            ))}
          </div>

          <div className="mb-10 mt-14 flex flex-wrap items-center gap-3 border-y border-border py-5">
            <button onClick={handleLike} className={`group flex h-10 items-center justify-center gap-2 rounded-lg border px-4 transition-colors ${isLiked ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-accent'}`}>
              <Heart className={`h-5 w-5 transition-transform duration-300 group-hover:scale-110 ${isLiked ? 'fill-current' : ''}`} />
              <span className="text-sm font-semibold">{isLiked ? 'Liked' : 'Like'}</span>
            </button>
            <button onClick={handleBookmark} className={`group flex h-10 items-center justify-center gap-2 rounded-lg border px-4 transition-colors ${isBookmarked ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground hover:bg-accent'}`}>
              <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
              <span className="text-sm font-semibold">{isBookmarked ? 'Saved' : 'Save'}</span>
            </button>
            <button onClick={handleShare} className="group flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-foreground transition-colors hover:bg-accent">
              <Share2 className="h-5 w-5 transition-transform duration-300 group-hover:-rotate-12" />
              <span className="text-sm font-semibold">Share</span>
            </button>
          </div>

          {/* Comments: Inline CommentDrawer at the bottom */}
          <div className="mt-auto pb-24">
            <CommentDrawer post={note} type="note" inline={true} />
          </div>
        </article>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-xl animate-in zoom-in-95 duration-200 md:p-8">
            <h3 className="mb-3 text-xl font-semibold">Delete this note?</h3>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Are you sure you want to delete this note? This action cannot be undone and it will be permanently removed.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleDelete}
                className="w-full rounded-lg bg-red-500 py-3.5 font-semibold text-white transition-colors hover:bg-red-600 active:scale-[0.98]"
              >
                Yes, delete note
              </button>
              <button 
                onClick={() => setIsDeleteDialogOpen(false)}
                className="w-full rounded-lg bg-muted py-3.5 font-semibold text-foreground transition-colors hover:bg-muted/80 active:scale-[0.98]"
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
