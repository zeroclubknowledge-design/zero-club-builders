import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { X, Image as ImageIcon, FileVideo, Loader2, Crop, Wand2, Heading1, Globe, GraduationCap, Users, Check, ChevronDown } from "@/components/icons/glyphs";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/storage";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { MediaCropper } from "@/components/MediaCropper";
import { VideoEditor } from "@/components/VideoEditor";
import { useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Bold, Italic, List } from "@/components/icons/glyphs";
import { Mark, mergeAttributes } from '@tiptap/core';
import { LinkifiedText } from "@/components/LinkifiedText";
import { getFirstName } from "@/lib/utils";
import { notifyMentionedUsers } from "@/lib/mentions";
import { toPlainText } from "@/lib/contentPreview";

const MentionMark = Mark.create({
  name: 'mentionMark',
  parseHTML() {
    return [{ tag: 'span[data-mention]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'text-[#cc208f] font-semibold', 'data-mention': 'true' }), 0]
  },
});

export const Route = createFileRoute("/app/compose")({
  validateSearch: (search: Record<string, unknown>): { quote?: string; draftId?: string; editId?: string } => {
    const next: { quote?: string; draftId?: string; editId?: string } = {};
    if (typeof search.quote === "string" && search.quote) next.quote = search.quote;
    if (typeof search.draftId === "string" && search.draftId) next.draftId = search.draftId;
    if (typeof search.editId === "string" && search.editId) next.editId = search.editId;
    return next;
  },
  component: ComposePage,
});

function ComposePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useUser();
  
  // Single Post State
  const [bodyText, setBodyText] = useState("");
  const bodyTextRef = useRef('');
  const [hasBodyText, setHasBodyText] = useState(false);
  const [images, setImages] = useState<(File | null)[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  
  const [uploading, setUploading] = useState(false);
  const [enrolledBootcamps, setEnrolledBootcamps] = useState<any[]>([]);
  const [selectedBootcampId, setSelectedBootcampId] = useState<string | null>(null);
  const [isBuild, setIsBuild] = useState(false);
  
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  
  const [croppingInfo, setCroppingInfo] = useState<number | null>(null);
  const [trimmingInfo, setTrimmingInfo] = useState<number | null>(null);
  
  const { quote: quoteId, draftId, editId } = Route.useSearch();
  const [quotedPost, setQuotedPost] = useState<any>(null);

  // Who can see the post: "Everyone", or the id of one club whose members can.
  const [audience, setAudience] = useState("Everyone");
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [myClubs, setMyClubs] = useState<{ id: string; name: string; logo_url: string | null }[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    void Promise.all([
      supabase.from('clubs').select('id, name, logo_url').eq('creator_id', profile.id),
      supabase.from('club_members').select('clubs(id, name, logo_url)').eq('profile_id', profile.id),
    ]).then(([owned, joined]) => {
      const byId = new Map<string, { id: string; name: string; logo_url: string | null }>();
      (owned.data || []).forEach((c: any) => byId.set(c.id, c));
      (joined.data || []).forEach((m: any) => m.clubs && byId.set(m.clubs.id, m.clubs));
      setMyClubs([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [profile?.id]);
  const audienceClub = audience !== "Everyone" ? myClubs.find((c) => c.id === audience) : null;

  useEffect(() => {
    if (draftId) {
      const activeDraft = JSON.parse(localStorage.getItem('zero_club_active_draft') || 'null');
      if (activeDraft && activeDraft.id === draftId) {
        setBodyText(activeDraft.bodyText || "");
        bodyTextRef.current = activeDraft.bodyText || "";
        setHasBodyText(!!(activeDraft.bodyText || "").replace(/<[^>]*>?/gm, '').trim());
        setAudience(activeDraft.audience || "Everyone");
      }
    }
  }, [draftId]);

  useEffect(() => {
    async function fetchEditPost() {
      if (!editId) return;
      const { data } = await supabase
        .from('posts')
        .select('*')
        .eq('id', editId)
        .single();
      
      if (data) {
        setBodyText(data.content || "");
        bodyTextRef.current = data.content || "";
        setHasBodyText(!!(data.content || "").replace(/<[^>]*>?/gm, '').trim());
        
        if (data.media_urls) {
          setPreviews(data.media_urls);
          setImages(data.media_urls.map(() => null));
        }
        
        setAudience(data.audience === 'club' && data.audience_club_id ? data.audience_club_id : "Everyone");

        if (data.is_build_post && data.bootcamp_id) {
          setSelectedBootcampId(data.bootcamp_id);
          setIsBuild(true);
        }
        
      }
    }
    fetchEditPost();
  }, [editId]);

  const saveDraft = () => {
    /* A draft names itself from its first line.
       The list was reading draft.blocks[0].text — the shape ZeroNotes saves —
       while this page has only ever written bodyText, so every post draft
       matched nothing and rendered as "Empty draft". Storing the title at save
       time means the list does not have to know how a draft was produced. */
    const plain = toPlainText(bodyTextRef.current);
    const firstLine = plain.split("\n")[0].trim();

    const newDraft = {
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
      audience,
      bodyText: bodyTextRef.current,
      title: firstLine.length > 80 ? `${firstLine.slice(0, 80).trimEnd()}…` : firstLine,
      preview: plain.slice(0, 220),
    };
    const drafts = JSON.parse(localStorage.getItem('zero_club_drafts') || '[]');
    const newDrafts = [newDraft, ...drafts];
    localStorage.setItem('zero_club_drafts', JSON.stringify(newDrafts));
    toast.success("Draft saved successfully!");
    navigate({ to: "/app/drafts" });
  };

  const updateBodyText = (html: string, textBeforeCursor?: string) => {
    bodyTextRef.current = html;
    
    const textOnly = html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
    if ((textOnly.length > 0) !== hasBodyText) {
      setHasBodyText(textOnly.length > 0);
    }
    
    if (textBeforeCursor !== undefined) {
      const match = textBeforeCursor.match(/@(\w*)$/);
      if (match) {
        setMentionSearch(match[1]);
        setShowMentions(true);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const [isEditorFocused, setIsEditorFocused] = useState(false);

  /* Pin the formatting bar above the keyboard while writing. Both conditions
     matter: the inset alone would leave it floating after the editor is
     blurred, and focus alone would pin it to the bottom of the screen on
     desktop where there is no keyboard at all. */
  const keyboardInset = useKeyboardInset();
  const toolbarPinned = isEditorFocused && keyboardInset > 0;


  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1] }, codeBlock: false }),
      Placeholder.configure({ placeholder: 'What did you build, learn or ship today?' }),
      TextStyle,
      Color,
      MentionMark
    ],
    content: bodyText,
    editorProps: {
      attributes: {
        // 120px, not 380px. This minimum is what pushed an attachment most of
        // a screen down the page when nothing had been typed yet: the editor
        // was holding open a blank area the size of a phone, and the media had
        // to start below it. It still needs enough height to be an obvious
        // place to tap; the spacer under the previews takes the rest.
        class: 'w-full min-h-[120px] bg-transparent outline-none resize-none overflow-hidden block text-lg text-foreground prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-h1:text-2xl prose-h1:font-semibold prose-h1:tracking-normal',
        spellcheck: 'false',
      }
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const { state } = editor;
      const { $from } = state.selection;
      const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset);
      updateBodyText(html, textBeforeCursor);
    },
    onFocus: () => setIsEditorFocused(true),
    onBlur: ({ event }) => {
      const relatedTarget = event.relatedTarget as HTMLElement | null;
      if (relatedTarget?.closest('.formatting-toolbar') || relatedTarget?.closest('[data-radix-popper-content-wrapper]')) return;
      window.setTimeout(() => setIsEditorFocused(false), 200);
    },
  });

  useEffect(() => {
    if (!editor || editor.getHTML() === bodyText) return;

    editor.commands.setContent(bodyText || "", { emitUpdate: false });
  }, [editor, bodyText]);

  const insertFormatting = (format: 'bold' | 'italic' | 'bullet' | 'heading') => {
    if (!editor) return;
    if (format === 'bold') editor.chain().focus().toggleBold().run();
    if (format === 'italic') editor.chain().focus().toggleItalic().run();
    if (format === 'bullet') editor.chain().focus().toggleBulletList().run();
    if (format === 'heading') editor.chain().focus().toggleHeading({ level: 1 }).run();
  };

  useEffect(() => {
    if (showMentions && mentionSearch) {
      const searchProfiles = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .ilike('username', `${mentionSearch}%`)
          .limit(5);
        setMentionSuggestions(data || []);
      };
      searchProfiles();
    }
  }, [mentionSearch, showMentions]);

  const insertMention = (username: string) => {
    if (!editor) return;
    
    editor
      .chain()
      .focus()
      .deleteRange({ from: editor.state.selection.from - mentionSearch.length - 1, to: editor.state.selection.from })
      .insertContent(`<span data-mention="true">@${username}</span> `)
      .run();
      
    setShowMentions(false);
  };

  const handleCropComplete = useCallback((croppedBlob: Blob) => {
    if (croppingInfo === null) return;
    
    // Name and type follow the blob. The cropper emits WebP where the browser
    // supports it, and a .jpg holding WebP confuses anything reading the
    // extension — including our own upload path.
    const ext = croppedBlob.type === 'image/webp' ? 'webp' : 'jpg';
    const croppedFile = new File([croppedBlob], `cropped-${Date.now()}.${ext}`, { type: croppedBlob.type || 'image/jpeg' });
    const reader = new FileReader();
    reader.onload = () => {
      const nextImages = [...images];
      const nextPreviews = [...previews];
      nextImages[croppingInfo] = croppedFile;
      nextPreviews[croppingInfo] = reader.result as string;
      setImages(nextImages);
      setPreviews(nextPreviews);
      setCroppingInfo(null);
      toast.success("Photo cropped! ️");
    };
    reader.readAsDataURL(croppedFile);
  }, [croppingInfo, images, previews]);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newFiles = Array.from(files);
    const nextImages = [...images, ...newFiles];
    setImages(nextImages);
    
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setPreviews(prev => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  useEffect(() => {
    async function fetchEnrolledBootcamps() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const { data } = await supabase
        .from('enrollments')
        .select('*, bootcamps(*)')
        .eq('profile_id', session.user.id);
      
      if (data) {
        const bootcamps = data.map((e: any) => e.bootcamps).filter(Boolean);
        setEnrolledBootcamps(bootcamps);
      }
    }
    fetchEnrolledBootcamps();
  }, []);

  useEffect(() => {
    async function fetchQuotedPost() {
      if (!quoteId) return;
      const { data } = await supabase
        .from('posts')
        .select('*, profiles(username, full_name, avatar_url)')
        .eq('id', quoteId)
        .single();
      
      if (data) setQuotedPost(data);
    }
    fetchQuotedPost();
  }, [quoteId]);

  const handlePost = async () => {
    try {
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to post");
        return;
      }

      let media_urls: string[] = [];
      const newFiles = images.filter(img => img !== null) as File[];
      if (newFiles.length > 0) {
        const uploadedUrls = await uploadMedia(newFiles, user.id);
        media_urls = [...uploadedUrls];
      }
      
      const keptExistingUrls = previews.filter(p => p.startsWith('http'));
      media_urls = [...keptExistingUrls, ...media_urls];

      const finalContent = bodyTextRef.current;

      const isBuild = !!selectedBootcampId;

      const postData: any = {
        author_id: user.id,
        content: finalContent,
        media_urls,
        is_build_post: isBuild,
        audience: audience === "Everyone" ? 'everyone' : 'club',
        audience_club_id: audience === "Everyone" ? null : audience,
      };

      if (isBuild && selectedBootcampId) {
        postData.bootcamp_id = selectedBootcampId;
      }

      if (quotedPost) {
        postData.quoted_post_id = quotedPost.id;
      }

      let newPost;
      if (editId) {
        const { data, error: postError } = await supabase
          .from('posts')
          .update(postData)
          .eq('id', editId)
          .select()
          .single();
        if (postError) throw postError;
        newPost = data;
      } else {
        const { data, error: postError } = await supabase
          .from('posts')
          .insert([postData])
          .select()
          .single();
        if (postError) throw postError;
        newPost = data;
      }

      if (isBuild && selectedBootcampId && newPost) {
        const bootcamp = enrolledBootcamps.find(b => b.id === selectedBootcampId);
        if (bootcamp && bootcamp.creator_id) {
          await supabase
            .from('notifications')
            .insert([{
              recipient_id: bootcamp.creator_id,
              actor_id: user.id,
              type: 'build_tagged',
              content: `tagged their build in ${bootcamp.title}. Click to verify!`,
              entity_id: newPost.id
            }]);
        }
      }

      if (newPost) {
        void notifyMentionedUsers({
          content: finalContent,
          actorId: user.id,
          entityId: newPost.id,
          type: 'post',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      queryClient.invalidateQueries({ queryKey: ['my_profile'] });
      
      toast.success("Post created successfully!");
      navigate({ to: "/app" });
    } catch (error: any) {
      console.error("Post creation error:", error);
      if (error.message === 'Failed to fetch') {
        toast.error("Network error: If you're uploading a large video, it may exceed the server limit. Otherwise, an adblocker or poor connection might be blocking the request.");
      } else {
        toast.error(error.message || "Failed to create post");
      }
    } finally {
      setUploading(false);
    }
  };

  const canPost = (hasBodyText || images.length > 0) && !uploading;

  const selectedBootcamp = enrolledBootcamps.find((bc) => bc.id === selectedBootcampId);
  const authorName = profile?.full_name || profile?.username || "You";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-card md:relative md:inset-auto md:z-0 md:min-h-screen">
      <header className="relative z-50 w-full shrink-0 border-b border-border bg-card pt-[env(safe-area-inset-top)] md:sticky md:top-0">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={() => navigate({ to: "/app" })}
            aria-label="Close"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <X className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold text-foreground">
            {editId ? "Edit post" : "Create post"}
          </h1>
          {/* Reaching drafts used to require saving the post you were writing
              first, which is a strange price to pay for looking at a list. */}
          <Link
            to="/app/drafts"
            className="flex h-9 items-center rounded-full px-3 text-[14px] font-semibold text-muted-foreground tap hover:bg-foreground/[0.04] hover:text-foreground"
          >
            Drafts
          </Link>
          <button
            onClick={handlePost}
            disabled={!canPost}
            className="flex h-9 min-w-[72px] items-center justify-center rounded-full bg-foreground px-4 text-[15px] font-semibold text-background tap hover:opacity-90 disabled:opacity-40"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : editId ? "Save" : "Post"}
          </button>
        </div>
      </header>

      {/* The gap above the format bar has to follow the bar. It pins itself to
          the top of the keyboard while you type, so a fixed padding stopped
          being enough the moment the keyboard opened — the next line of text
          was written behind the toolbar. */}
      <div
        className="zc-page-width no-scrollbar mx-auto w-full max-w-[680px] flex-1 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: `calc(5.5rem + ${toolbarPinned ? keyboardInset : 0}px)` }}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-[14px] font-semibold text-muted-foreground">
                {authorName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-foreground">{authorName}</p>
            <button
              type="button"
              onClick={() => setAudienceOpen(true)}
              className={`mt-0.5 inline-flex h-[24px] max-w-[220px] items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold transition active:scale-95 ${
                audienceClub ? "border-[#cc208f]/50 bg-[#cc208f]/[0.06] text-[#cc208f]" : "border-foreground/25 text-muted-foreground"
              }`}
            >
              {audienceClub ? <Users className="h-3 w-3 shrink-0" /> : <Globe className="h-3 w-3 shrink-0" />}
              <span className="truncate">{audienceClub ? `${audienceClub.name} members` : "Everyone"}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
          </div>
        </div>

        <Drawer open={audienceOpen} onOpenChange={setAudienceOpen}>
          {/* The compose page is a full-screen layer at z-[100] on phones, so the
              sheet has to sit above it — at the default z-50 it opened unseen
              behind the page and the audience never changed. */}
          <DrawerContent overlayClassName="z-[110]" className="z-[110] border-t border-border/40 bg-background/95 backdrop-blur-xl">
            <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1 sm:pt-4">
              <DrawerTitle className="font-display text-[20px] font-semibold leading-tight text-foreground">Who can see this post?</DrawerTitle>
              <DrawerDescription className="mt-1 text-[14px] text-muted-foreground">Share it with everyone, or keep it for the members of one of your clubs.</DrawerDescription>

              <div className="mt-4 max-h-[55dvh] space-y-1 overflow-y-auto overscroll-contain">
                {[{ id: "Everyone", name: "Everyone", logo_url: null as string | null }, ...myClubs].map((c) => {
                  const active = audience === c.id;
                  const everyone = c.id === "Everyone";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setAudience(c.id); setAudienceOpen(false); }}
                      className={`flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition active:scale-[0.99] ${active ? "bg-[#cc208f]/[0.08]" : "hover:bg-foreground/[0.04]"}`}
                    >
                      {everyone ? (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-foreground"><Globe className="h-5 w-5" /></span>
                      ) : c.logo_url ? (
                        <img src={c.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground">{c.name.charAt(0).toUpperCase()}</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15.5px] font-semibold text-foreground">{everyone ? "Everyone" : `${c.name} members`}</span>
                        <span className="block truncate text-[13px] text-muted-foreground">{everyone ? "Anyone on or off Zero Club" : "Only people in this club can see it"}</span>
                      </span>
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${active ? "bg-[#cc208f] text-white" : "border-[1.5px] border-foreground/20"}`}>
                        {active && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
                {myClubs.length === 0 && (
                  <p className="px-3 py-3 text-[13px] text-muted-foreground">Join or create a club to share posts with its members only.</p>
                )}
              </div>
            </div>
          </DrawerContent>
        </Drawer>

        <div className="relative mt-4 flex min-h-[calc(100dvh-14rem)] flex-col">
          {/* The writing area grows with what is written, rather than always
              reserving a screen's height and pushing the media far down the
              page. With no text at all, an attachment sits at the top where
              it was just added. */}
          <div className="relative w-full shrink-0 text-[19px]">
            <EditorContent editor={editor} className="w-full relative z-10 prose dark:prose-invert max-w-none prose-p:my-3 prose-p:leading-relaxed whitespace-pre-wrap" />
          </div>

          {previews.length > 0 && (() => {
            /* Grouped like X: one image full width, two side by side, three as
               one tall + two stacked, four as a 2×2 grid. More than four keeps
               the grid and simply adds rows. It used to stack every image in a
               single long column. */
            const count = previews.length;
            const single = count === 1;
            const gridClass = single
              ? ""
              : count === 2
                ? "grid grid-cols-2 h-[220px] sm:h-[300px]"
                : count === 3
                  ? "grid grid-cols-2 grid-rows-2 h-[280px] sm:h-[360px]"
                  : count === 4
                    ? "grid grid-cols-2 grid-rows-2 h-[280px] sm:h-[360px]"
                    : "grid grid-cols-2 auto-rows-[140px] sm:auto-rows-[180px]";

            return (
              <div className={`mt-3 overflow-hidden rounded-2xl ${single ? "" : `${gridClass} gap-0.5`}`}>
                {previews.map((src, i) => {
                  const isVideo = images[i] ? images[i]?.type.startsWith('video/') : (src.includes('.mp4') || src.includes('.mov') || src.includes('.webm'));
                  const tall = count === 3 && i === 0;

                  return (
                    <div
                      key={i}
                      className={`relative min-h-0 min-w-0 overflow-hidden bg-foreground/[0.04] ${tall ? "row-span-2" : ""}`}
                    >
                      {isVideo ? (
                        <video
                          src={src}
                          className={single ? "h-auto max-h-[600px] w-full object-contain" : "h-full w-full object-cover"}
                          muted
                          playsInline
                          controls={single}
                        />
                      ) : (
                        <img
                          src={src}
                          className={single ? "h-auto max-h-[600px] w-full object-contain" : "h-full w-full object-cover"}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      )}

                      <button
                        onClick={() => {
                          setImages(prev => prev.filter((_, idx) => idx !== i));
                          setPreviews(prev => prev.filter((_, idx) => idx !== i));
                        }}
                        aria-label="Remove"
                        className={`absolute right-2 top-2 z-10 grid place-items-center rounded-full bg-black/60 text-white transition active:scale-90 hover:bg-black/75 ${single ? "h-8 w-8" : "h-7 w-7"}`}
                      >
                        <X className={single ? "h-4 w-4" : "h-3.5 w-3.5"} />
                      </button>
                      <button
                        onClick={() => (isVideo ? setTrimmingInfo(i) : setCroppingInfo(i))}
                        aria-label={isVideo ? "Edit video" : "Crop image"}
                        className={`absolute bottom-2 left-2 z-10 flex h-8 items-center gap-1.5 rounded-full bg-black/60 text-white transition active:scale-90 hover:bg-black/75 ${single ? "px-3 text-[12px] font-semibold" : "w-8 justify-center"}`}
                      >
                        {isVideo ? <Wand2 className="h-3.5 w-3.5" /> : <Crop className="h-3.5 w-3.5" />}
                        {/* Words only when there is room; the grid tiles show the icon alone. */}
                        {single && (isVideo ? "Edit" : "Crop")}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Tagging a bootcamp makes this a build post the tutor can verify.
              The picker existed but nothing on the page ever opened it. */}
          {enrolledBootcamps.length > 0 && (
            <div className="mt-4">
              {selectedBootcamp ? (
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#cc208f]/10 pl-3 pr-1.5 text-[13px] font-semibold text-[#a3186f]">
                  <GraduationCap className="h-4 w-4" /> {selectedBootcamp.title}
                  <button
                    type="button"
                    aria-label="Remove bootcamp tag"
                    onClick={() => { setSelectedBootcampId(null); setIsBuild(false); }}
                    className="grid h-6 w-6 place-items-center rounded-full hover:bg-[#cc208f]/15"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsBuild((open) => !open)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-foreground/35 px-3 text-[13px] font-semibold text-muted-foreground tap hover:text-foreground"
                >
                  <GraduationCap className="h-4 w-4" /> Tag a bootcamp
                </button>
              )}
              {isBuild && !selectedBootcamp && (
                <div className="mt-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1">
                  {enrolledBootcamps.map(bc => (
                    <button
                      key={bc.id}
                      onClick={() => setSelectedBootcampId(bc.id)}
                      className="h-8 rounded-full border border-foreground/25 px-3 text-[13px] font-semibold text-foreground tap hover:border-foreground/50"
                    >
                      {bc.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {quotedPost && (
            <div className="relative mt-4 rounded-xl border border-border p-4">
              <button onClick={() => setQuotedPost(null)} aria-label="Remove quote" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/[0.05]"><X className="h-4 w-4" /></button>
              <div className="mb-2 flex items-center gap-2">
                <div className="h-6 w-6 overflow-hidden rounded-full bg-muted">
                  {quotedPost.profiles?.avatar_url && <img src={quotedPost.profiles.avatar_url} className="h-full w-full object-cover" loading="lazy" decoding="async" />}
                </div>
                <span className="text-sm font-semibold">{quotedPost.profiles?.full_name || quotedPost.profiles?.username}</span>
                <span className="text-xs text-muted-foreground">{getFirstName(quotedPost.profiles)}</span>
              </div>
              <div className="line-clamp-3 text-sm text-foreground/80">
                <LinkifiedText text={quotedPost.content} />
              </div>
            </div>
          )}

          {/* Room to keep writing, and a way back to the caret: a tap anywhere
              in the empty space below hands focus back to the text. */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Continue writing"
            onClick={() => editor?.commands.focus('end')}
            className="min-h-[140px] w-full flex-1 cursor-text"
          />

          {showMentions && mentionSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-12 z-50 max-h-[250px] overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 duration-200">
              {mentionSuggestions.map((prof) => (
                <button
                  key={prof.id}
                  onClick={() => insertMention(prof.username)}
                  className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3 transition-colors last:border-0 hover:bg-foreground/[0.04]"
                >
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold">
                    {prof.avatar_url ? <img src={prof.avatar_url} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : prof.username[0].toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">{prof.full_name || prof.username}</p>
                    <p className="text-xs text-muted-foreground">{getFirstName(prof)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The toolbar sits along the bottom edge, where a writing app keeps
          its controls. While the keyboard is open it detaches and pins itself
          just above it: `sticky` is measured against the layout viewport,
          which the keyboard covers rather than shrinks. */}
      <div
        className={
          toolbarPinned
            ? "formatting-toolbar fixed inset-x-0 z-50 border-t border-border bg-card"
            : "formatting-toolbar fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card pb-[max(env(safe-area-inset-bottom),0.75rem)] md:sticky"
        }
        style={toolbarPinned ? { bottom: keyboardInset } : undefined}
      >
        <div className="zc-page-width mx-auto flex w-full max-w-[680px] items-center gap-0.5 px-2 pt-1.5 text-muted-foreground">
          <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-full transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-90" title="Add a photo">
            <ImageIcon className="h-[22px] w-[22px]" />
            <input type="file" className="hidden" accept="image/*" multiple onChange={handleMediaUpload} disabled={uploading} />
          </label>
          <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-full transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-90" title="Add a video">
            <FileVideo className="h-[22px] w-[22px]" />
            <input type="file" className="hidden" accept="video/*" multiple onChange={handleMediaUpload} disabled={uploading} />
          </label>
          <span className="mx-1 h-[22px] w-px bg-border" />
          {([
            ["bold", "Bold", <Bold key="b" className="h-5 w-5" />, "bold"],
            ["italic", "Italic", <Italic key="i" className="h-5 w-5" />, "italic"],
            ["heading", "Heading", <Heading1 key="h" className="h-5 w-5" />, "heading"],
            ["bullet", "Bullet list", <List key="l" className="h-5 w-5" />, "bulletList"],
          ] as const).map(([format, label, icon, mark]) => {
            const active = mark === "heading" ? editor?.isActive("heading", { level: 1 }) : editor?.isActive(mark);
            return (
              <button
                key={format}
                type="button"
                onMouseDown={(event) => { event.preventDefault(); insertFormatting(format); }}
                className={`grid h-10 w-10 place-items-center rounded-full transition active:scale-90 ${active ? "bg-foreground text-background" : "hover:bg-foreground/[0.05] hover:text-foreground"}`}
                title={label}
                aria-label={label}
              >
                {icon}
              </button>
            );
          })}
          <button
            type="button"
            onClick={saveDraft}
            className="ml-auto h-10 rounded-full px-3 text-[13px] font-semibold text-muted-foreground tap hover:bg-foreground/[0.05] hover:text-foreground"
          >
            Save draft
          </button>
        </div>
      </div>

      {croppingInfo !== null && (
        <MediaCropper
          src={previews[croppingInfo] || ""}
          // No fixed aspect here. A post image was forced to a square, which
          // cut the top and bottom off every screenshot and portrait photo
          // people wanted to share. The presets let them choose, and Original
          // leaves the picture as they took it.
          title="Crop photo"
          onDone={(result) => {
            if (result.kind === 'image') handleCropComplete(result.blob);
          }}
          onCancel={() => setCroppingInfo(null)}
        />
      )}

      {trimmingInfo !== null && (
        <VideoEditor 
          videoSrc={previews[trimmingInfo] || ""} 
          onCancel={() => setTrimmingInfo(null)}
          onSave={(blob) => {
            const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
            const file = new File([blob], `edited-video-${Date.now()}.${ext}`, { type: blob.type });
            const nextImages = [...images];
            nextImages[trimmingInfo] = file;
            setImages(nextImages);
            
            const nextPreviews = [...previews];
            nextPreviews[trimmingInfo] = URL.createObjectURL(blob);
            setPreviews(nextPreviews);
            setTrimmingInfo(null);
            toast.success("Video edited successfully! ✨");
          }}
        />
      )}
    </div>
  );
}
