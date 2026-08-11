import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, X, Image as ImageIcon, FileVideo, Loader2, Crop, Wand2, Heading1 } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/storage";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { ImageCropper } from "@/components/ImageCropper";
import { VideoEditor } from "@/components/VideoEditor";
import { useQueryClient } from "@tanstack/react-query";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Bold, Italic, List } from "lucide-react";
import { Mark, mergeAttributes } from '@tiptap/core';
import { LinkifiedText } from "@/components/LinkifiedText";
import { getFirstName } from "@/lib/utils";

const MentionMark = Mark.create({
  name: 'mentionMark',
  parseHTML() {
    return [{ tag: 'span[data-mention]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'text-primary font-bold', 'data-mention': 'true' }), 0]
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

  // Settings State
  const [audience, setAudience] = useState("Everyone");

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
        
        if (data.is_build_post && data.bootcamp_id) {
          setSelectedBootcampId(data.bootcamp_id);
          setIsBuild(true);
        }
        
      }
    }
    fetchEditPost();
  }, [editId]);

  const saveDraft = () => {
    const newDraft = {
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
      audience,
      bodyText: bodyTextRef.current,
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
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1] }, codeBlock: false }),
      Placeholder.configure({ placeholder: 'Body Text (Optional)' }),
      TextStyle,
      Color,
      MentionMark
    ],
    content: bodyText,
    editorProps: {
      attributes: {
        class: 'w-full min-h-[320px] sm:min-h-[380px] bg-transparent outline-none resize-none overflow-hidden block text-lg text-foreground prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-h1:text-2xl prose-h1:font-semibold prose-h1:tracking-normal',
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
    
    const croppedFile = new File([croppedBlob], `cropped-${Date.now()}.jpg`, { type: 'image/jpeg' });
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
        is_build_post: isBuild
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

      const mentions = finalContent.match(/@(\w+)/g);
      if (mentions && newPost) {
        const usernames = mentions.map(m => m.slice(1));
        const { data: mentionedProfiles } = await supabase
          .from('profiles')
          .select('id')
          .in('username', usernames);
        
        if (mentionedProfiles && mentionedProfiles.length > 0) {
          const mentionNotifications = mentionedProfiles
            .filter(p => p.id !== user.id)
            .map(p => ({
              recipient_id: p.id,
              actor_id: user.id,
              type: 'mention',
              content: `mentioned you in a post`,
              entity_id: newPost.id
            }));
          
          if (mentionNotifications.length > 0) {
            await supabase.from('notifications').insert(mentionNotifications);
          }
        }
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

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#f8f7f5] dark:bg-background md:relative md:inset-auto md:z-0 md:min-h-screen">
      {/* Header */}
      <header className="relative z-50 flex w-full items-center justify-between border-b border-border bg-background px-4 py-3 sm:px-6 md:sticky md:top-0">
        <div className="mx-auto flex w-full max-w-[860px] items-center justify-between">
        <button 
          onClick={() => navigate({ to: "/app" })}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card transition hover:bg-accent active:scale-95"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-foreground">
          Create Post
        </span>
        <div className="w-10" /> {/* Spacer */}
        </div>
      </header>

      {/* Main Form Area */}
      <div className="no-scrollbar mx-auto w-full max-w-[860px] flex-1 overflow-y-auto px-4 pb-32 pt-4 sm:px-6 sm:pt-6">
        {/* Post Card */}
        <div className="relative flex min-h-[calc(100dvh-10.5rem)] flex-col rounded-lg border border-border bg-card p-4 sm:p-6">
          <div className="relative min-h-[320px] w-full flex-1 text-lg sm:min-h-[380px]">
            <EditorContent editor={editor} className="w-full relative z-10 prose dark:prose-invert max-w-none prose-p:my-3 prose-p:leading-relaxed whitespace-pre-wrap" />
          </div>

          {/* Previews */}
          {previews.length > 0 && (
            <div className="mt-3 flex flex-col gap-3">
               {previews.map((src, i) => {
                 const isVideo = images[i] ? images[i]?.type.startsWith('video/') : (src.includes('.mp4') || src.includes('.mov') || src.includes('.webm'));
                 
                 return (
                   <div 
                     key={i} 
                     className="relative overflow-hidden rounded-lg border border-border bg-black/5"
                   >
                     {isVideo ? (
                       <video src={src} className="w-full h-auto max-h-[600px] object-contain" muted playsInline controls />
                     ) : (
                       <img src={src} className="w-full h-auto max-h-[600px] object-contain" alt="" />
                     )}
                     
                     <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                     <button 
                       onClick={() => {
                         setImages(prev => prev.filter((_, idx) => idx !== i));
                         setPreviews(prev => prev.filter((_, idx) => idx !== i));
                       }}
                       className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition active:scale-90 ring-1 ring-white/15 z-10 hover:bg-black/70"
                     >
                       <X className="h-4 w-4" />
                     </button>
                     {!isVideo && (
                       <button 
                         onClick={() => setCroppingInfo(i)}
                         className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition active:scale-90 ring-1 ring-white/15 z-10 hover:bg-black/70"
                       >
                         <Crop className="h-4 w-4" />
                       </button>
                     )}
                     {isVideo && (
                       <button 
                         onClick={() => setTrimmingInfo(i)}
                         className="absolute bottom-3 right-3 flex items-center justify-center gap-1.5 px-3.5 h-8 rounded-full bg-black/60 text-white backdrop-blur-md transition active:scale-90 ring-1 ring-white/20 z-10 hover:bg-black/80 text-[10px]"
                       >
                         <Wand2 className="h-3.5 w-3.5" /> Edit
                       </button>
                     )}
                   </div>
                 );
               })}
            </div>
          )}

          {/* Mention Suggestions */}
      {showMentions && mentionSuggestions.length > 0 && (
            <div className="absolute left-4 right-4 top-16 z-50 max-h-[250px] overflow-y-auto rounded-lg border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 duration-200 sm:left-6 sm:right-6">
              {mentionSuggestions.map((prof) => (
                <button
                  key={prof.id}
                  onClick={() => insertMention(prof.username)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
                >
                  <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex items-center justify-center font-bold text-[10px]">
                    {prof.avatar_url ? <img src={prof.avatar_url} className="h-full w-full object-cover" /> : prof.username[0].toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold tracking-tight text-foreground">{prof.full_name || prof.username}</p>
                    <p className="text-xs text-muted-foreground">{getFirstName(prof)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center gap-4">
              <label className="relative cursor-pointer transition active:scale-95 group">
                <div className="h-8 w-8 rounded-full flex items-center justify-center border border-border bg-card group-hover:bg-accent pointer-events-none">
                  <ImageIcon className="h-4 w-4 text-foreground/70 group-hover:text-foreground" />
                </div>
                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*" multiple onChange={handleMediaUpload} disabled={uploading} />
              </label>
              <label className="relative cursor-pointer transition active:scale-95 group">
                <div className="h-8 w-8 rounded-full flex items-center justify-center border border-border bg-card group-hover:bg-accent pointer-events-none">
                  <FileVideo className="h-4 w-4 text-foreground/70 group-hover:text-foreground" />
                </div>
                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="video/*" multiple onChange={handleMediaUpload} disabled={uploading} />
              </label>
            </div>
            
            <button 
              onClick={() => {
                const newState = !isBuild;
                setIsBuild(newState);
                if (newState && enrolledBootcamps.length > 0) {
                  setSelectedBootcampId(enrolledBootcamps[0].id);
                } else {
                  setSelectedBootcampId(null);
                }
              }}
              className={`text-[12px] font-semibold tracking-tight px-4 py-1.5 rounded-full border tap ${
                isBuild ? "border-primary/40 text-primary bg-primary/8" : "border-border text-muted-foreground hover:bg-foreground/[0.03]"
              }`}
            >
              Build
            </button>
          </div>

          {/* Keep formatting visible inside the writing surface, including with the mobile keyboard open. */}
          <div className="formatting-toolbar sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 mt-3 flex justify-center">
            <div className={`flex items-center justify-center gap-1 rounded-lg border bg-background/95 p-2 backdrop-blur-md transition-shadow ${isEditorFocused ? 'border-foreground/20 shadow-lg' : 'border-border shadow-sm'}`}>
              <button
                type="button"
                onMouseDown={(event) => { event.preventDefault(); insertFormatting('bold'); }}
                className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${editor?.isActive('bold') ? 'bg-foreground text-background' : 'text-foreground hover:bg-accent'}`}
                title="Bold"
                aria-label="Bold"
              >
                <Bold className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onMouseDown={(event) => { event.preventDefault(); insertFormatting('italic'); }}
                className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${editor?.isActive('italic') ? 'bg-foreground text-background' : 'text-foreground hover:bg-accent'}`}
                title="Italic"
                aria-label="Italic"
              >
                <Italic className="h-4 w-4" strokeWidth={2} />
              </button>
              <div className="mx-1 h-5 w-px bg-border" />
              <button
                type="button"
                onMouseDown={(event) => { event.preventDefault(); insertFormatting('bullet'); }}
                className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${editor?.isActive('bulletList') ? 'bg-foreground text-background' : 'text-foreground hover:bg-accent'}`}
                title="Bullet list"
                aria-label="Bullet list"
              >
                <List className="h-4 w-4" strokeWidth={2} />
              </button>
              <div className="mx-1 h-5 w-px bg-border" />
              <button
                type="button"
                onMouseDown={(event) => { event.preventDefault(); insertFormatting('heading'); }}
                className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${editor?.isActive('heading', { level: 1 }) ? 'bg-foreground text-background' : 'text-foreground hover:bg-accent'}`}
                title="Heading"
                aria-label="Heading"
              >
                <Heading1 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bootcamps Modal/Dropdown equivalent */}
        {isBuild && enrolledBootcamps.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-card p-4 animate-in fade-in slide-in-from-top-2">
            <h4 className="text-xs text-muted-foreground mb-3 px-2">Select a Bootcamp to tag</h4>
            <div className="flex flex-wrap gap-2">
              {enrolledBootcamps.map(bc => (
                <button 
                  key={bc.id}
                  onClick={() => setSelectedBootcampId(bc.id)}
                  className={`rounded-lg border px-4 py-2 text-[13px] font-semibold tap transition ${selectedBootcampId === bc.id ? "border-transparent bg-foreground text-background" : "border-border bg-card hover:border-foreground/30"}`}
                >
                  {bc.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quoted Post */}
        {quotedPost && (
          <div className="relative mt-4 rounded-lg border border-border bg-card p-4">
            <button onClick={() => setQuotedPost(null)} className="absolute top-3 right-3 p-1 rounded-full bg-accent text-foreground transition hover:bg-muted"><X className="h-4 w-4" /></button>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-full overflow-hidden bg-muted">
                {quotedPost.profiles?.avatar_url && <img src={quotedPost.profiles.avatar_url} className="h-full w-full object-cover" />}
              </div>
              <span className="text-sm font-semibold tracking-tight">{quotedPost.profiles?.full_name || quotedPost.profiles?.username}</span>
              <span className="text-xs text-muted-foreground">{getFirstName(quotedPost.profiles)}</span>
            </div>
            <div className="text-sm line-clamp-3 text-foreground/80">
              <LinkifiedText text={quotedPost.content} />
            </div>
          </div>
        )}

      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 md:sticky md:left-auto md:right-auto md:w-full">
        <div className="mx-auto flex w-full max-w-[860px] gap-3 px-4 sm:px-6">
        <button 
          onClick={saveDraft}
          className="flex-1 rounded-lg border border-border bg-card py-3 text-[14px] font-semibold text-foreground tap hover:bg-accent"
        >
          Save as Draft
        </button>
        <button 
          onClick={handlePost}
          disabled={!canPost}
          className="flex-1 rounded-lg bg-foreground py-3 text-[14px] font-semibold text-background tap disabled:opacity-40 hover:opacity-90"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin mx-auto text-background" /> : "Post"}
        </button>
        </div>
      </div>

      {croppingInfo !== null && (
        <ImageCropper 
          image={previews[croppingInfo] || ""} 
          aspect={1} 
          onCropComplete={handleCropComplete} 
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
