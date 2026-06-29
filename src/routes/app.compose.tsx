import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, X, Image as ImageIcon, FileVideo, MapPin, Lock, Compass, ChevronRight, Loader2, Crop, Scissors, Globe, Wand2 } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/storage";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { ImageCropper } from "@/components/ImageCropper";
import { VideoEditor } from "@/components/VideoEditor";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
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
  validateSearch: (search: Record<string, unknown>) => {
    return {
      quote: (search.quote as string) || undefined,
      draftId: (search.draftId as string) || undefined,
      editId: (search.editId as string) || undefined,
    }
  },
  component: ComposePage,
});

function ComposePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useUser();
  
  // Single Post State
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const bodyTextRef = useRef('');
  const [hasBodyText, setHasBodyText] = useState(false);
  const [images, setImages] = useState<(File | null)[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  
  const [enrolledBootcamps, setEnrolledBootcamps] = useState<any[]>([]);
  const [selectedBootcampId, setSelectedBootcampId] = useState<string | null>(null);
  const [isBuild, setIsBuild] = useState(false);
  const [addLocation, setAddLocation] = useState(false);
  const [locationName, setLocationName] = useState("");
  
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
        setTitle(activeDraft.title || "");
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
        // Extract title if present (using simple bold markdown check)
        const titleMatch = data.content.match(/^\*\*([^*]+)\*\*\n\n/);
        if (titleMatch) {
          setTitle(titleMatch[1]);
          const remainingContent = data.content.replace(/^\*\*([^*]+)\*\*\n\n/, '');
          setBodyText(remainingContent);
          bodyTextRef.current = remainingContent;
          setHasBodyText(!!remainingContent.replace(/<[^>]*>?/gm, '').trim());
        } else {
          setBodyText(data.content || "");
          bodyTextRef.current = data.content || "";
          setHasBodyText(!!(data.content || "").replace(/<[^>]*>?/gm, '').trim());
        }
        
        if (data.media_urls) {
          setPreviews(data.media_urls);
          setImages(data.media_urls.map(() => null));
        }
        
        if (data.is_build_post && data.bootcamp_id) {
          setSelectedBootcampId(data.bootcamp_id);
          setIsBuild(true);
        }
        
        if (data.location) {
          setLocationName(data.location);
          setAddLocation(true);
        }
      }
    }
    fetchEditPost();
  }, [editId]);

  useEffect(() => {
    if (addLocation && !locationName) {
      if ("geolocation" in navigator) {
        toast.loading("Fetching location...", { id: "location-fetch" });
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
              const data = await res.json();
              const city = data.address.city || data.address.town || data.address.village || data.address.county || "";
              const state = data.address.state || data.address.country || "";
              const locationStr = [city, state].filter(Boolean).join(", ");
              setLocationName(locationStr);
              toast.success(`Location added: ${locationStr}`, { id: "location-fetch" });
            } catch (error) {
               toast.error("Failed to get location name", { id: "location-fetch" });
               setAddLocation(false);
               setLocationName("");
            }
          },
          (error) => {
            toast.error("Location access denied or unavailable.", { id: "location-fetch" });
            setAddLocation(false);
            setLocationName("");
          }
        );
      } else {
        toast.error("Geolocation not supported by your browser");
        setAddLocation(false);
      }
    } else if (!addLocation) {
      setLocationName("");
    }
  }, [addLocation, locationName]);

  const saveDraft = () => {
    const newDraft = {
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
      audience,
      title,
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
      StarterKit.configure({ heading: false, codeBlock: false }),
      Placeholder.configure({ placeholder: 'Body Text (Optional)' }),
      MentionMark
    ],
    content: bodyText,
    editorProps: {
      attributes: {
        class: 'w-full min-h-[150px] bg-transparent outline-none resize-none overflow-hidden block text-lg text-foreground prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0',
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
    onBlur: () => setTimeout(() => setIsEditorFocused(false), 200),
  });

  const insertFormatting = (format: 'bold' | 'italic' | 'bullet') => {
    if (!editor) return;
    if (format === 'bold') editor.chain().focus().toggleBold().run();
    if (format === 'italic') editor.chain().focus().toggleItalic().run();
    if (format === 'bullet') editor.chain().focus().toggleBulletList().run();
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

      const finalContent = title.trim() ? `**${title.trim()}**\n\n${bodyTextRef.current}` : bodyTextRef.current;

      const isBuild = !!selectedBootcampId;

      const postData: any = {
        author_id: user.id,
        content: finalContent,
        media_urls,
        is_build_post: isBuild
      };

      if (locationName) {
        postData.location = locationName;
      }

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

  const canPost = (title.trim().length > 0 || hasBodyText || images.length > 0) && !uploading;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-muted/20">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 relative z-50">
        <button 
          onClick={() => navigate({ to: "/app" })}
          className="h-10 w-10 bg-card rounded-full grid place-items-center shadow-sm border border-border/50 transition hover:bg-accent active:scale-95"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <span className="font-bold absolute left-1/2 -translate-x-1/2 text-foreground">
          Create Post
        </span>
        <div className="w-10" /> {/* Spacer */}
      </header>

      {/* Main Form Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-56 no-scrollbar">
        {/* Post Card */}
        <div className="bg-card rounded-[32px] p-6 shadow-sm border border-border/50 flex flex-col relative">
          <textarea 
            placeholder="Title" 
            value={title}
            rows={1}
            onChange={e => {
              setTitle(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            className="text-2xl font-bold bg-transparent outline-none placeholder:text-muted-foreground/40 mb-3 text-foreground resize-none overflow-hidden"
          />
          <div className="h-px w-full bg-border/40 mb-4" />
          <div className="relative min-h-[150px] w-full text-lg">
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
                     className="relative overflow-hidden border border-border bg-black/5 rounded-[24px"
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
                       className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition active:scale-90 border border-white/10 shadow-sm z-10 hover:bg-black/70"
                     >
                       <X className="h-4 w-4" />
                     </button>
                     {!isVideo && (
                       <button 
                         onClick={() => setCroppingInfo(i)}
                         className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition active:scale-90 border border-white/10 shadow-sm z-10 hover:bg-black/70"
                       >
                         <Crop className="h-4 w-4" />
                       </button>
                     )}
                     {isVideo && (
                       <button 
                         onClick={() => setTrimmingInfo(i)}
                         className="absolute bottom-3 right-3 flex items-center justify-center gap-1.5 px-3.5 h-8 rounded-full bg-black/60 text-white backdrop-blur-md transition active:scale-90 border border-white/20 shadow-sm z-10 hover:bg-black/80 text-[10px]"
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
          {/* Floating Formatting Toolbar */}
      {isEditorFocused && (
        <div className="fixed bottom-[110px] left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div className="flex items-center gap-1 p-1.5 bg-background/95 backdrop-blur-xl rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-border/50">
            <button 
              onMouseDown={(e) => { e.preventDefault(); insertFormatting('bold'); }}
              className="h-9 w-9 flex items-center justify-center rounded-full text-foreground hover:bg-accent transition active:scale-90"
              title="Bold"
            >
              <Bold className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <button 
              onMouseDown={(e) => { e.preventDefault(); insertFormatting('italic'); }}
              className="h-9 w-9 flex items-center justify-center rounded-full text-foreground hover:bg-accent transition active:scale-90"
              title="Italic"
            >
              <Italic className="h-4 w-4" strokeWidth={2} />
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <button 
              onMouseDown={(e) => { e.preventDefault(); insertFormatting('bullet'); }}
              className="h-9 w-9 flex items-center justify-center rounded-full text-foreground hover:bg-accent transition active:scale-90"
              title="Bullet List"
            >
              <List className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {showMentions && mentionSuggestions.length > 0 && (
            <div className="absolute z-50 left-6 right-6 top-16 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[250px] overflow-y-auto">
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
                    <p className="text-sm font-bold text-foreground">{prof.full_name || prof.username}</p>
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
              className={`text-xs font-bold px-5 py-1.5 rounded-full border transition active:scale-95 ${
                isBuild ?"border-primary text-primary bg-primary/10 shadow-[0_0_10px_rgba(204,32,143,0.2)]" : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              Build
            </button>
          </div>
        </div>

        {/* Bootcamps Modal/Dropdown equivalent */}
        {isBuild && enrolledBootcamps.length > 0 && (
          <div className="mt-4 bg-card rounded-[24px] p-4 shadow-sm border border-border/50 animate-in fade-in slide-in-from-top-2">
            <h4 className="text-xs text-muted-foreground mb-3 px-2">Select a Bootcamp to tag</h4>
            <div className="flex flex-wrap gap-2">
              {enrolledBootcamps.map(bc => (
                <button 
                  key={bc.id}
                  onClick={() => setSelectedBootcampId(bc.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${selectedBootcampId === bc.id ?"bg-primary text-primary-foreground border-primary shadow-glow" : "bg-card border-border hover:border-foreground/50"}`}
                >
                  {bc.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quoted Post */}
        {quotedPost && (
          <div className="mt-4 bg-card rounded-[24px] p-4 shadow-sm border border-border/50 relative">
            <button onClick={() => setQuotedPost(null)} className="absolute top-3 right-3 p-1 rounded-full bg-accent text-foreground transition hover:bg-muted"><X className="h-4 w-4" /></button>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-6 rounded-full overflow-hidden bg-muted">
                {quotedPost.profiles?.avatar_url && <img src={quotedPost.profiles.avatar_url} className="h-full w-full object-cover" />}
              </div>
              <span className="text-sm font-bold">{quotedPost.profiles?.full_name || quotedPost.profiles?.username}</span>
              <span className="text-xs text-muted-foreground">{getFirstName(quotedPost.profiles)}</span>
            </div>
            <div className="text-sm line-clamp-3 text-foreground/80">
              <LinkifiedText text={quotedPost.content} />
            </div>
          </div>
        )}

        {/* Settings List */}
        <div className="mt-4 bg-card rounded-[32px] p-2 shadow-sm border border-border/50 flex flex-col divide-y divide-border/50">
          <button 
            onClick={() => setAddLocation(!addLocation)}
            className="flex items-center justify-between px-4 py-4 transition hover:bg-accent/50 rounded-t-[24px] active:scale-[0.98"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col text-left">
                  <span className="font-bold text-sm text-foreground">Add Location</span>
                  {locationName && <span className="text-[10px] text-muted-foreground max-w-[120px] truncate">{locationName}</span>}
                </div>
              </div>
              <Switch checked={addLocation} onCheckedChange={setAddLocation} />
            </div>
          </button>
          
          <button 
            onClick={() => setAudience(audience === "Everyone" ? "Followers Only" : "Everyone")}
            className="flex items-center justify-between px-4 py-4 transition hover:bg-accent/50 active:scale-[0.98"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full border border-border/50 bg-background grid place-items-center">
                {audience === "Everyone" ? <Globe className="h-4 w-4 text-foreground" /> : <Lock className="h-4 w-4 text-foreground" />}
              </div>
              <span className="font-bold text-sm text-foreground">
                {audience === "Everyone" ? "Share with Everyone" : "Share with Followers"}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          
          <Link 
            to="/app/boost"
            className="flex items-center justify-between px-4 py-4 transition hover:bg-accent/50 rounded-b-[24px] active:scale-[0.98"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full border border-border/50 bg-background grid place-items-center">
                <Compass className="h-4 w-4 text-foreground" />
              </div>
              <span className="font-bold text-sm text-foreground">Boost Post</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>

      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-6 flex gap-4 bg-background border-t border-border/50 pb-8 z-50">
        <button 
          onClick={saveDraft}
          className="flex-1 py-4 bg-card border border-border rounded-[20px] font-bold text-foreground shadow-sm transition active:scale-95 hover:bg-accent"
        >
          Save as Draft
        </button>
        <button 
          onClick={handlePost}
          disabled={!canPost}
          className="flex-1 py-4 bg-foreground text-background rounded-[20px] font-bold shadow-xl transition active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none hover:bg-foreground/90"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin mx-auto text-background" /> : "Post"}
        </button>
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
