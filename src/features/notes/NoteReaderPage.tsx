/**
 * The note reader, lifted out of routes/app.notes.$id.tsx.
 *
 * The public /notes/$slug route imported this component out of that route
 * file. A route file that exports anything besides `Route` cannot be code
 * split — the generated route tree imports every route module statically — so
 * the reader and everything it pulls in, including the comment drawer, were
 * landing in the entry chunk that every visitor downloads before first paint.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Share2,
  Bookmark,
  ThumbsUp,
  Mic,
  Edit3,
  Trash2,
  Bell,
  Check,
} from "@/components/icons/glyphs";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { LinkifiedText } from "@/components/LinkifiedText";
import { CommentDrawer } from "@/components/CommentDrawer";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { deleteNoteAction } from "@/api";
import { zeroNotePreviewImageUrl, zeroNoteUrl } from "@/lib/share";

export function NoteReaderPage({ noteId, initialNote }: { noteId: string; initialNote?: any }) {
  const id = noteId;
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTop = useRef(0);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const { data: profile } = useUser();
  const queryClient = useQueryClient();
  const { data: note, isLoading: loading } = useQuery({
    queryKey: ["note", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*, profiles(username, full_name, avatar_url)")
        .eq("id", id)
        .eq("is_published", true)
        .single();

      if (error) throw error;
      return data;
    },
    initialData: () => initialNote || undefined,
    enabled: Boolean(id),
  });

  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleReaderScroll = () => {
    const element = scrollRef.current;
    if (!element) return;

    const current = element.scrollTop;
    const scrollable = element.scrollHeight - element.clientHeight;
    setReadProgress(scrollable > 0 ? Math.min(1, current / scrollable) : 0);
    const delta = current - lastScrollTop.current;
    if (current <= 16) {
      setHeaderHidden(false);
      lastScrollTop.current = current;
      return;
    }
    if (Math.abs(delta) < 8) return;

    // A finger swipe upward moves the article down and hides the header;
    // reversing direction brings the controls back immediately.
    setHeaderHidden(delta > 0 && current > 72);
    lastScrollTop.current = current;
  };
  /*
   * Subscribing, not following.
   *
   * Following a builder is about their feed. Subscribing is about their
   * writing, and people want one without the other — you can enjoy someone's
   * posts without wanting every long-form note, and want somebody's notes
   * without following them at all. Separate table, separate switch.
   */
  const { data: subscribedData, refetch: refetchSubscription } = useQuery({
    queryKey: ["note-subscription", profile?.id, note?.author_id],
    queryFn: async () => {
      if (!profile?.id || !note?.author_id) return false;
      const { data } = await supabase
        .from("note_subscriptions")
        .select("id")
        .eq("subscriber_id", profile.id)
        .eq("author_id", note.author_id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!profile?.id && !!note?.author_id,
  });

  const isSubscribed = !!subscribedData;

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !note?.author_id) throw new Error("Missing IDs");
      // One call decides insert or delete, so a double tap cannot leave the
      // button and the database disagreeing.
      const { data, error } = await supabase.rpc("toggle_note_subscription", {
        p_author_id: note.author_id,
      });
      if (error) throw error;
      return !!(data as any)?.subscribed;
    },
    onSuccess: (subscribed) => {
      refetchSubscription();
      toast.success(
        subscribed ? "Subscribed — you'll get their new notes" : "Unsubscribed from their notes",
      );
    },
    onError: (error) => {
      toast.error(error.message || "An error occurred");
    },
  });

  const handleLike = () => {
    if (!profile?.id) {
      toast("Sign in to like this note");
      return;
    }
    setIsLiked(!isLiked);
    toast.success(isLiked ? "Removed from liked notes" : "Added to your liked notes!");
  };

  const handleBookmark = () => {
    if (!profile?.id) {
      toast("Sign in to save this note");
      return;
    }
    setIsBookmarked(!isBookmarked);
    toast.success(isBookmarked ? "Removed from bookmarks" : "Saved to bookmarks!");
  };

  const handleShare = async () => {
    const url = zeroNoteUrl({ id: note?.id || id, slug: note?.slug });
    if (navigator.share) {
      try {
        await navigator.share({
          title: note?.title || "Check out this note on ZeroNotes!",
          url: url,
        });
      } catch (err) {
        console.log("Error sharing:", err);
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
      toast.success("Note deleted");
      navigate({ to: "/app/notes" });
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete note");
    }
    setIsDeleteDialogOpen(false);
  };

  const handleSubscribe = () => {
    if (!profile) {
      toast.error("Please sign in to subscribe");
      return;
    }
    subscribeMutation.mutate();
  };

  if (loading) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-card">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-foreground/15 border-t-foreground" />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-card p-6 text-center">
        <h2 className="mb-2 font-display text-[22px] font-semibold">Note not found</h2>
        <p className="mb-6 max-w-[280px] text-[14px] leading-relaxed text-muted-foreground">
          The article you are looking for has been removed or is unavailable.
        </p>
        <button
          onClick={() => navigate({ to: profile?.id ? "/app/notes" : "/" })}
          className="flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background transition hover:opacity-90"
        >
          Back to ZeroNotes
        </button>
      </div>
    );
  }

  const renderBlock = (block: any) => {
    switch (block.type) {
      case "text":
        if (!block.content || block.content.trim() === "") return null;
        const cleanContent = block.content
          .replace(/<p><\/p>|<p><br><\/p>|<p>&nbsp;<\/p>/g, "")
          .trim();
        if (!cleanContent) return null;
        return (
          /* zc-note-prose so a published article gets the same heading sizes,
             section breaks and highlight treatment it had while being written.
             Without it the reader rendered the tags with prose defaults, and a
             writer's H1 and H3 came out nearly the same size. */
          <div className="zc-note-prose whitespace-pre-wrap text-[17px] leading-[1.65] text-foreground/90 md:text-lg">
            <LinkifiedText text={cleanContent} className="zc-note-prose" />
          </div>
        );
      case "heading":
        return (
          <h2 className="mb-2 mt-8 font-display text-[21px] font-semibold text-foreground md:text-[26px]">
            {block.content}
          </h2>
        );
      case "image":
        return (
          <div className="my-6 overflow-hidden rounded-xl bg-muted">
            <img
              src={block.content}
              className="h-auto w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        );
      case "video":
        return (
          <div className="group relative my-6 overflow-hidden rounded-xl bg-black">
            <video
              src={block.content}
              controls
              className="w-full h-auto max-h-[70vh] object-contain"
            />
          </div>
        );
      case "audio":
        return (
          <div className="my-6 flex flex-col gap-4 rounded-xl bg-foreground/[0.04] p-4">
            <div className="flex items-center gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#cc208f]/10 text-[#cc208f]">
                <Mic className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[15px] font-semibold">Audio</span>
                <span className="text-sm text-muted-foreground font-medium">
                  Press play to listen
                </span>
              </div>
            </div>
            <audio
              src={block.content}
              controls
              preload="metadata"
              className="w-full outline-none"
            />
          </div>
        );
      case "divider":
        return (
          <div className="py-14 flex justify-center">
            <div className="w-16 h-1 bg-border rounded-full" />
          </div>
        );
      default:
        return null;
    }
  };

  const readMinutes = Math.max(
    1,
    Math.ceil(
      (note.blocks
        ?.filter((b: any) => b.type === "text")
        .reduce((acc: number, b: any) => acc + (String(b.content || "").replace(/<[^>]*>?/gm, " ").split(/\s+/).filter(Boolean).length || 0), 0) || 0) / 200,
    ),
  );
  const authorName = note.profiles?.full_name || note.profiles?.username || "ZeroNotes writer";
  const isOwner = profile?.id === note.author_id;

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-card selection:bg-foreground selection:text-background">
      <header
        className={`absolute inset-x-0 top-0 z-50 bg-card pt-[env(safe-area-inset-top)] transition-transform duration-300 ease-out ${
          headerHidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="mx-auto flex h-14 w-full max-w-[760px] items-center gap-1 px-2">
          <button
            onClick={() => navigate({ to: profile?.id ? "/app/notes" : "/" })}
            aria-label={profile?.id ? "Back to ZeroNotes" : "Back to Zero Club"}
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <ArrowLeft className="h-[22px] w-[22px]" />
          </button>
          <span className="flex-1" />
          <button
            onClick={handleBookmark}
            className="grid h-11 w-11 place-items-center rounded-full text-foreground transition hover:bg-foreground/[0.04]"
            aria-label={isBookmarked ? "Remove from saved" : "Save note"}
            aria-pressed={isBookmarked}
          >
            <Bookmark className={`h-[21px] w-[21px] ${isBookmarked ? "fill-current" : ""}`} />
          </button>
          <button
            onClick={handleShare}
            className="grid h-11 w-11 place-items-center rounded-full text-foreground transition hover:bg-foreground/[0.04]"
            aria-label="Share note"
          >
            <Share2 className="h-5 w-5" />
          </button>
        </div>
        <div className="h-[3px] bg-foreground/[0.06]">
          <div className="h-full bg-[#cc208f] transition-[width] duration-150" style={{ width: `${Math.round(readProgress * 100)}%` }} />
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleReaderScroll}
        className="flex h-full w-full flex-1 flex-col overflow-y-auto pt-[calc(3.6rem+env(safe-area-inset-top))]"
      >
        <article className="relative z-10 mx-auto flex w-full max-w-[680px] flex-1 flex-col px-5 pb-10 pt-6">
          <span className="text-[12px] font-semibold text-[#a3186f]">ZeroNotes · {readMinutes} min read</span>
          <h1 className="mt-1.5 font-display text-[28px] font-semibold leading-[1.15] text-foreground md:text-[36px]">
            {note.title}
          </h1>

          <div className="mt-4 flex items-center gap-2.5">
            <Link
              to="/app/profile/$id"
              params={{ id: note.profiles?.username || note.author_id }}
              className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted"
            >
              {note.profiles?.avatar_url ? (
                <img src={note.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <span className="grid h-full w-full place-items-center text-[13px] font-semibold text-muted-foreground">
                  {authorName.charAt(0).toUpperCase()}
                </span>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-foreground">{authorName}</p>
              <p className="text-[12px] text-muted-foreground">
                {note.created_at ? formatDistanceToNow(new Date(note.created_at), { addSuffix: true }) : "Just now"}
              </p>
            </div>
            {/* Never on your own notes — subscribing to yourself is
                meaningless, and the database rejects it too. */}
            {profile?.id && !isOwner && (
              <button
                onClick={handleSubscribe}
                disabled={subscribeMutation.isPending}
                title={isSubscribed ? "Stop getting their new notes" : "Get their new notes"}
                className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition disabled:opacity-50 ${isSubscribed ? "border border-foreground/25 text-muted-foreground" : "border-[1.5px] border-foreground text-foreground"}`}
              >
                {isSubscribed ? <Check className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                {isSubscribed ? "Subscribed" : "Subscribe"}
              </button>
            )}
            {isOwner && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => navigate({ to: "/app/notes/$id/edit", params: { id: note.id } })}
                  className="flex h-[30px] items-center gap-1.5 rounded-full border-[1.5px] border-foreground px-3 text-[13px] font-semibold"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={confirmDelete}
                  className="grid h-[30px] w-[30px] place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {note.cover_url && (
            <div className="mt-5 overflow-hidden rounded-xl bg-muted">
              <img src={note.cover_url} alt="" className="aspect-[16/9] h-full w-full object-cover" loading="lazy" decoding="async" />
            </div>
          )}

          <div className="mt-6 space-y-6">
            {note.blocks?.map((block: any, i: number) => (
              <div key={block.id || i}>{renderBlock(block)}</div>
            ))}
          </div>

          {/* Guests can read the complete note without an account. Account
              actions remain optional and are offered only after the article. */}
          <div className="mt-12 border-t border-border pt-6">
            {profile?.id ? (
              <CommentDrawer post={note} type="note" inline={true} />
            ) : (
              <div className="rounded-xl bg-foreground/[0.04] p-5 text-center">
                <p className="text-[16px] font-semibold text-foreground">Enjoyed this ZeroNote?</p>
                <p className="mx-auto mt-2 max-w-md text-[14px] leading-6 text-muted-foreground">
                  Reading is open to everyone. Sign in only if you want to save, react, comment or
                  publish your own note.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Link to="/signin" search={{ ref: "", club: "" }} className="flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-semibold text-background">
                    Sign in
                  </Link>
                  <Link to="/signup" search={{ ref: "", club: "" }} className="flex h-10 items-center rounded-full border border-foreground/25 px-5 text-[14px] font-semibold text-foreground">
                    Create account
                  </Link>
                </div>
              </div>
            )}
          </div>
        </article>
      </div>

      <footer className="shrink-0 border-t border-border bg-card pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2">
        <div className="mx-auto flex w-full max-w-[680px] items-center gap-1 px-3 text-[14px] font-semibold text-muted-foreground">
          <button
            onClick={handleLike}
            aria-pressed={isLiked}
            className={`flex h-10 items-center gap-1.5 rounded-full px-3 transition hover:bg-foreground/[0.04] ${isLiked ? "text-[#cc208f]" : ""}`}
          >
            <ThumbsUp className={`h-5 w-5 ${isLiked ? "fill-current" : ""}`} /> {isLiked ? "Liked" : "Like"}
          </button>
          <button
            onClick={handleBookmark}
            aria-pressed={isBookmarked}
            className={`flex h-10 items-center gap-1.5 rounded-full px-3 transition hover:bg-foreground/[0.04] ${isBookmarked ? "text-foreground" : ""}`}
          >
            <Bookmark className={`h-5 w-5 ${isBookmarked ? "fill-current" : ""}`} /> {isBookmarked ? "Saved" : "Save"}
          </button>
          <button
            onClick={handleShare}
            className="ml-auto flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-background transition hover:opacity-90"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
      </footer>

      {/* Delete Confirmation Modal */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl ring-1 ring-border animate-in zoom-in-95 duration-200">
            <h3 className="mb-2 text-[18px] font-semibold">Delete this note?</h3>
            <p className="mb-6 text-[14px] leading-relaxed text-muted-foreground">
              This can't be undone — the note will be removed for good.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleDelete}
                className="h-11 w-full rounded-full bg-destructive text-[15px] font-semibold text-destructive-foreground transition hover:opacity-90 active:scale-[0.98]"
              >
                Delete note
              </button>
              <button
                onClick={() => setIsDeleteDialogOpen(false)}
                className="h-11 w-full rounded-full border border-foreground/25 text-[15px] font-semibold text-foreground transition hover:bg-foreground/[0.03] active:scale-[0.98]"
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
