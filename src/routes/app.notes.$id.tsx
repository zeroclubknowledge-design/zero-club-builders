import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Share2, Bookmark, Heart, MoreHorizontal, Mic, Video, Image as ImageIcon, PlayCircle, Edit3, Trash2 } from 'lucide-react';
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
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isNavigatingToEdit, setIsNavigatingToEdit] = useState(false);
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
    setIsFabOpen(false);
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
          <div className="text-lg md:text-xl leading-[1.8] text-foreground/90 whitespace-pre-wrap font-medium tracking-tight">
            <LinkifiedText text={cleanContent} />
          </div>
        );
      case 'heading':
        return (
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-foreground mt-16 mb-6">
            {block.content}
          </h2>
        );
      case 'image':
        return (
          <div className="my-10 -mx-6 md:mx-0 rounded-none md:rounded-[24px] overflow-hidden bg-muted border-y md:border border-border/20">
            <img src={block.content} className="w-full h-auto object-cover hover:scale-[1.02] transition-transform duration-500" />
          </div>
        );
      case 'video':
        return (
          <div className="my-10 -mx-6 md:mx-0 rounded-none md:rounded-[24px] overflow-hidden bg-black border-y md:border border-border/20 shadow-2xl relative group">
            <video src={block.content} controls className="w-full h-auto max-h-[70vh] object-contain" />
          </div>
        );
      case 'audio':
        return (
          <div className="my-8 rounded-3xl bg-card border border-border/50 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-5">
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
    <div className="flex min-h-screen w-full flex-col bg-background overflow-y-auto no-scrollbar relative selection:bg-foreground selection:text-background">
      
      {/* Header: Fixed transparent overlay header with glassmorphic buttons. Fades over cover image */}
      <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] bg-gradient-to-b from-black/60 via-black/30 to-transparent pointer-events-none transition-colors duration-300">
        <button 
          onClick={() => navigate({ to: '/app/notes' })}
          className="grid h-12 w-12 place-items-center rounded-full bg-black/30 backdrop-blur-md text-white hover:bg-black/50 transition active:scale-95 pointer-events-auto border border-white/20 shadow-lg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </header>

      <div className="w-full flex-1 flex flex-col">
        
        {/* Cover Image: Full-width immersive hero with edge-to-edge cover. Gradient overlay transitioning into background color. Title overlaid */}
        {note.cover_url && (
          <div className="w-full h-[50vh] md:h-[60vh] relative z-0 flex flex-col justify-end">
            <img src={note.cover_url} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
            
            <div className="relative z-10 px-6 md:px-12 pb-8 max-w-4xl w-full mx-auto">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter leading-[1.1] text-foreground drop-shadow-xl">
                {note.title}
              </h1>
            </div>
          </div>
        )}

        {/* Article Content */}
        <article className={`max-w-2xl w-full mx-auto px-6 md:px-0 flex-1 flex flex-col ${note.cover_url ? 'pt-8' : 'pt-32'} relative z-10`}>

          {!note.cover_url && (
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter leading-[1.1] mb-12 text-foreground">
              {note.title}
            </h1>
          )}

          {/* Author Section: Larger author avatar with border ring. Name + "Follow" button row. Published date + reading time. Subtle bottom border separator */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10 pb-6 border-b border-border/50">
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
                  <span className="font-bold text-foreground text-base tracking-tight">
                    {note.profiles?.full_name || note.profiles?.username}
                  </span>
                  {profile?.id !== note.author_id && (
                    <button 
                      onClick={handleFollow}
                      disabled={followMutation.isPending}
                      className={`text-xs font-bold px-3 py-1 rounded-full transition-colors disabled:opacity-50 ${isFollowing ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
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
          </div>

          <div className="space-y-6">
            {note.blocks?.map((block: any, i: number) => (
              <div key={block.id || i}>
                {renderBlock(block)}
              </div>
            ))}
          </div>

          {/* Engagement Bar: Like + Share buttons in rounded pill style. Clean bottom border */}
          <div className="mt-16 mb-12 flex items-center gap-4 py-8 border-b border-border/50">
            <button onClick={handleLike} className={`group flex items-center justify-center h-12 px-6 rounded-full transition-all duration-300 gap-2 border shadow-sm ${isLiked ? 'text-primary border-primary bg-primary/10' : 'text-foreground border-border hover:bg-muted'}`}>
              <Heart className={`h-5 w-5 transition-transform duration-300 group-hover:scale-110 ${isLiked ? 'fill-primary' : ''}`} />
              <span className="text-sm font-bold">{isLiked ? 'Liked' : 'Like'}</span>
            </button>
            <button onClick={handleShare} className="group flex items-center justify-center h-12 px-6 rounded-full hover:bg-muted transition-all duration-300 text-foreground gap-2 border border-border shadow-sm">
              <Share2 className="h-5 w-5 transition-transform duration-300 group-hover:-rotate-12" />
              <span className="text-sm font-bold">Share</span>
            </button>
          </div>

          {/* Comments: Inline CommentDrawer at the bottom */}
          {!isNavigatingToEdit && (
            <div className="mt-auto pb-32">
              <CommentDrawer 
                post={note} 
                type="note"
                inline={true}
              />
            </div>
          )}
        </article>
      </div>
      
      {/* Floating Action Button (FAB) Twitter Style */}
      <div className="fixed bottom-24 right-6 md:bottom-28 md:right-10 z-[100] flex flex-col items-center gap-3">
        {/* Expanded Actions */}
        <div className={`flex flex-col gap-3 transition-all duration-300 ease-in-out origin-bottom ${isFabOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-75 opacity-0 translate-y-8 pointer-events-none'}`}>
          {profile?.id === note.author_id && (
            <>
              <button 
                onClick={() => { setIsFabOpen(false); navigate({ to: `/app/notes/${note.id}/edit` }); }}
                className="grid h-10 w-10 md:h-12 md:w-12 place-items-center rounded-full bg-blue-500/90 backdrop-blur-md text-white shadow-lg hover:bg-blue-600 transition-all hover:scale-105 active:scale-95 pointer-events-auto"
                title="Edit Note"
              >
                <Edit3 className="h-4 w-4 md:h-5 md:w-5" />
              </button>
              <button 
                onClick={confirmDelete}
                className="grid h-10 w-10 md:h-12 md:w-12 place-items-center rounded-full bg-red-500/90 backdrop-blur-md text-white shadow-lg hover:bg-red-600 transition-all hover:scale-105 active:scale-95 pointer-events-auto"
                title="Delete Note"
              >
                <Trash2 className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            </>
          )}

          <button 
            onClick={() => { setIsFabOpen(false); handleBookmark(); }} 
            className="grid h-10 w-10 md:h-12 md:w-12 place-items-center rounded-full bg-black/80 backdrop-blur-md text-white dark:bg-white/80 dark:text-black shadow-lg hover:bg-black dark:hover:bg-white transition-all hover:scale-105 active:scale-95"
            title="Save Note"
          >
            <Bookmark className={`h-4 w-4 md:h-5 md:w-5 ${isBookmarked ? 'fill-current text-primary' : ''}`} />
          </button>

          <button 
            onClick={() => { setIsFabOpen(false); handleShare(); }} 
            className="grid h-10 w-10 md:h-12 md:w-12 place-items-center rounded-full bg-black/80 backdrop-blur-md text-white dark:bg-white/80 dark:text-black shadow-lg hover:bg-black dark:hover:bg-white transition-all hover:scale-105 active:scale-95"
            title="Share Note"
          >
            <Share2 className="h-4 w-4 md:h-5 md:w-5" />
          </button>
        </div>

        {/* Main FAB Toggle */}
        <button 
          onClick={() => setIsFabOpen(!isFabOpen)}
          className="grid h-14 w-14 md:h-16 md:w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 z-10"
        >
          <MoreHorizontal className={`h-6 w-6 md:h-7 md:w-7 transition-transform duration-300 ${isFabOpen ? 'rotate-90' : 'rotate-0'}`} />
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-background border border-border/50 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold mb-3 tracking-tight">Delete this note?</h3>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Are you sure you want to delete this note? This action cannot be undone and it will be permanently removed.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleDelete}
                className="w-full py-3.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 active:scale-[0.98] transition-all"
              >
                Yes, delete note
              </button>
              <button 
                onClick={() => setIsDeleteDialogOpen(false)}
                className="w-full py-3.5 bg-muted text-foreground font-bold rounded-xl hover:bg-muted/80 active:scale-[0.98] transition-all"
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
