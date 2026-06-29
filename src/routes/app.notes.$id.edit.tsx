import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { ArrowLeft, Plus, Image as ImageIcon, Mic, Video, Type, Minus, Loader2, X, Trash2, Heading1, StopCircle, Wand2, Crown, Globe, Bold, Italic, List, Palette, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadNoteMedia } from '@/lib/storage';
import { createNoteAction, updateNoteAction } from '@/api';
import { toast } from 'sonner';
import { useUser } from '@/hooks/useUser';
import { VideoEditor } from '@/components/VideoEditor';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const Route = createFileRoute('/app/notes/$id/edit')({
  component: NotesEditPage,
});

type BlockType = 'text' | 'heading' | 'audio' | 'video' | 'image' | 'divider';

interface NoteBlock {
  id: string;
  type: BlockType;
  content: string; 
  file?: File; 
  preview?: string; 
}

const TipTapBlock = ({ 
  block, 
  updateBlockText, 
  setActiveMentionBlockId, 
  handleKeyDown,
  activeMentionBlockId
}: { 
  block: NoteBlock, 
  updateBlockText: (id: string, text: string, textBeforeCursor?: string) => void, 
  setActiveMentionBlockId: React.Dispatch<React.SetStateAction<string | null>>, 
  handleKeyDown: (e: any, blockId: string) => void,
  activeMentionBlockId: string | null
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // We use custom heading block
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder: block.type === 'heading' ? 'Heading...' : 'Write your Notes...' }),
      TextStyle,
      Color,
    ],
    content: block.content,
    editorProps: {
      attributes: {
        class: `w-full bg-transparent outline-none resize-none overflow-hidden block ${block.type === 'heading' ? 'text-3xl font-black tracking-tighter pt-6 pb-2 placeholder:text-muted-foreground/30 font-serif' : 'text-lg md:text-xl min-h-[60px] leading-relaxed font-normal text-foreground/90 font-serif'} prose dark:prose-invert max-w-none`,
        spellcheck: "false",
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Backspace' && view.state.selection.empty && view.state.selection.from === 1) {
          handleKeyDown(event, block.id);
          return true;
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const { state } = editor;
      const { $from } = state.selection;
      const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset);
      updateBlockText(block.id, html, textBeforeCursor);
    },
    onFocus: () => {
      setActiveMentionBlockId(block.id);
    },
    onBlur: ({ event }) => {
      const relatedTarget = event.relatedTarget as HTMLElement;
      if (relatedTarget && (relatedTarget.closest('.formatting-toolbar') || relatedTarget.closest('[data-radix-popper-content-wrapper]'))) {
        return;
      }
      setTimeout(() => {
        setActiveMentionBlockId((prev) => prev === block.id ? null : prev);
      }, 200);
    }
  });

  useEffect(() => {
    if (editor && activeMentionBlockId === block.id) {
      (window as any).activeTipTapEditor = editor;
    }
  }, [editor, activeMentionBlockId]);

  return <EditorContent editor={editor} className="w-full relative z-10" />;
};

import { useQuery } from '@tanstack/react-query';
import { getFirstName } from "@/lib/utils";

function NotesEditPage() {
  const navigate = useNavigate();
  const { id: noteId } = Route.useParams();
  const { data: profile } = useUser();
  const [title, setTitle] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [isNoteLoaded, setIsNoteLoaded] = useState(false);

  const { data: noteData } = useQuery({
    queryKey: ['note', noteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', noteId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!noteId && !isNoteLoaded
  });

  // Effect to load note data into state once
  useEffect(() => {
    if (noteData && !isNoteLoaded) {
      setTitle(noteData.title || '');
      setCoverPreview(noteData.cover_url || null);
      if (noteData.blocks && noteData.blocks.length > 0) {
        setBlocks(noteData.blocks);
      } else {
        setBlocks([{ id: Math.random().toString(36).substring(2, 15), type: 'text', content: '' }]);
      }
      setIsNoteLoaded(true);
    }
  }, [noteData, isNoteLoaded]);
  
  const [isPublishing, setIsPublishing] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [activeMentionBlockId, setActiveMentionBlockId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [customColor, setCustomColor] = useState('#000000');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const blockContentsRef = useRef<Record<string, string>>({});

  // Automatically scroll to bottom when adding a new block
  const endOfBlocksRef = useRef<HTMLDivElement>(null);
  
  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setCoverPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const addBlock = (type: BlockType) => {
    let targetIndex = blocks.length;
    let newBlocks: NoteBlock[] = [...blocks];
    let htmlAfter = '';
    let didSplit = false;

    if (activeMentionBlockId) {
      const activeIndex = blocks.findIndex(b => b.id === activeMentionBlockId);
      if (activeIndex !== -1) {
        targetIndex = activeIndex + 1;
        
        const editor = (window as any).activeTipTapEditor;
        if (editor) {
          const marker = `__SPLIT_MARKER_${Date.now()}__`;
          editor.commands.insertContent(marker);
          const fullHtml = editor.getHTML();
          const splitParts = fullHtml.split(marker);
          
          if (splitParts.length === 2) {
            const htmlBefore = splitParts[0];
            htmlAfter = splitParts[1];
            didSplit = true;
            
            editor.commands.setContent(htmlBefore);
            newBlocks[activeIndex] = { ...newBlocks[activeIndex], content: htmlBefore };
          } else {
            editor.commands.undo();
          }
        }
      }
    }

    const mediaBlock: NoteBlock = { id: Math.random().toString(36).substring(2, 15), type, content: '' };
    
    // Insert media block
    newBlocks.splice(targetIndex, 0, mediaBlock);
    
    // Automatically add an empty text block after media blocks so users can keep typing seamlessly
    if (type !== 'text' && type !== 'heading' && type !== 'divider') {
      newBlocks.splice(targetIndex + 1, 0, { id: Math.random().toString(36).substring(2, 15), type: 'text', content: didSplit ? htmlAfter : '' });
    } else if (didSplit && htmlAfter) {
      newBlocks.splice(targetIndex + 1, 0, { id: Math.random().toString(36).substring(2, 15), type: 'text', content: htmlAfter });
    }
    
    setBlocks(newBlocks);
    
    // Only scroll to bottom if we added to the end and didn't split a block
    if (!didSplit && targetIndex >= blocks.length) {
      setTimeout(() => {
        endOfBlocksRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleKeyDown = (e: any, blockId: string) => {
    const blockIndex = blocks.findIndex(b => b.id === blockId);
    if (blockIndex > 0) {
      const prevBlock = blocks[blockIndex - 1];
      if (prevBlock.type !== 'text' && prevBlock.type !== 'heading') {
        e.preventDefault();
        removeBlock(prevBlock.id);
      } else if (!blocks[blockIndex].content || blocks[blockIndex].content === '<p></p>') {
        e.preventDefault();
        removeBlock(blockId);
        setTimeout(() => {
          const editors = document.querySelectorAll('.ProseMirror');
          if (editors[blockIndex - 1]) {
            const el = editors[blockIndex - 1] as HTMLElement;
            el.focus();
            
            // Try to move cursor to the end
            const range = document.createRange();
            const sel = window.getSelection();
            if (sel) {
              range.selectNodeContents(el);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }, 50);
      }
    }
  };

  const updateBlockText = (id: string, text: string, textBeforeCursor?: string) => {
    blockContentsRef.current[id] = text; // Fast ref update avoids re-render lag

    if (textBeforeCursor !== undefined) {
      const match = textBeforeCursor.match(/@(\w*)$/);
      if (match) {
        setMentionSearch(match[1]);
        if (!showMentions) setShowMentions(true);
        if (activeMentionBlockId !== id) setActiveMentionBlockId(id);
      } else {
        if (showMentions) setShowMentions(false);
      }
    } else {
      if (showMentions) setShowMentions(false);
    }
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
    if (!activeMentionBlockId) return;
    const editor = (window as any).activeTipTapEditor;
    if (!editor) return;

    editor
      .chain()
      .focus()
      .deleteRange({ from: editor.state.selection.from - mentionSearch.length - 1, to: editor.state.selection.from })
      .insertContent(`<strong class="text-primary font-bold">@${username}</strong> `)
      .run();
      
    setShowMentions(false);
  };

  const insertFormatting = (format: 'bold' | 'italic' | 'bullet') => {
    if (!activeMentionBlockId) return;
    const editor = (window as any).activeTipTapEditor;
    if (!editor) return;

    if (format === 'bold') editor.chain().focus().toggleBold().run();
    if (format === 'italic') editor.chain().focus().toggleItalic().run();
    if (format === 'bullet') editor.chain().focus().toggleBulletList().run();
  };

  const toggleBlockType = () => {
    if (!activeMentionBlockId) return;
    setBlocks(prev => prev.map(b => {
      if (b.id === activeMentionBlockId) {
        return { ...b, type: b.type === 'heading' ? 'text' : 'heading' };
      }
      return b;
    }));
  };

  const applyColor = (color: string, shouldFocus = true) => {
    if (!activeMentionBlockId) return;
    const editor = (window as any).activeTipTapEditor;
    if (!editor) return;
    if (shouldFocus) {
      editor.chain().focus().setColor(color).run();
    } else {
      editor.chain().setColor(color).run();
    }
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const handleBlockMediaUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'audio') => {
    const file = e.target.files?.[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setBlocks(blocks.map(b => b.id === id ? { 
        ...b, 
        file, 
        preview: previewUrl
      } : b));
    }
  };

  const startRecording = async (id: string) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Microphone API not available. Ensure you are using a secure connection (HTTPS or localhost).');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const file = new File([audioBlob], `recording-${Date.now()}.${ext}`, { type: mimeType });
        const previewUrl = URL.createObjectURL(audioBlob);
        
        setBlocks(prev => prev.map(b => b.id === id ? { ...b, file, preview: previewUrl } : b));
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecordingId(id);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        toast.error('Microphone access denied. Please check browser permissions.');
      } else if (err.name === 'NotFoundError') {
        toast.error('No microphone found on this device.');
      } else {
        toast.error(`Could not access microphone: ${err.message || 'Unknown error'}`);
      }
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setRecordingId(null);
    }
  };

  const executePublish = async () => {
    if (!title.trim()) {
      toast.error('Please add a title for your note.');
      return;
    }
    
    if (!profile) {
      toast.error('You must be signed in to publish.');
      return;
    }

    try {
      setIsPublishing(true);
      
      let finalCoverUrl = '';
      if (coverFile) {
        const [uploadedUrl] = await uploadNoteMedia([coverFile], profile.id);
        finalCoverUrl = uploadedUrl;
      }

      // Apply fast ref content updates to the final blocks array before publishing
      const finalBlocks = blocks.map(b => ({
        ...b,
        content: blockContentsRef.current[b.id] ?? b.content
      }));
      
      for (let i = 0; i < finalBlocks.length; i++) {
        const block = finalBlocks[i];
        if (block.file) {
          const [uploadedUrl] = await uploadNoteMedia([block.file], profile.id);
          finalBlocks[i] = {
            id: block.id,
            type: block.type,
            content: uploadedUrl
          };
        }
      }

      finalBlocks.forEach(b => {
        delete b.file;
        delete b.preview;
      });

      const updateData = {
        id: noteId,
        updates: {
          title: title.trim(),
          cover_url: finalCoverUrl || coverPreview || '', // keep old cover if not replaced
          blocks: finalBlocks,
          is_published: true
        }
      };

      await updateNoteAction({ data: updateData });

      toast.success(isPublishing ? "Note published successfully!" : "Note saved successfully!");
      window.location.href = `/app/notes/${noteId}`;
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to publish note');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-background overflow-hidden relative selection:bg-foreground selection:text-background">
      
      {/* Minimal Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] bg-background/60 backdrop-blur-3xl transition-all border-b border-white/5">
        <a href={`/app/notes/${noteId}`} className="grid h-10 w-10 place-items-center rounded-full bg-foreground/5 hover:bg-foreground/10 transition active:scale-95 text-foreground/80 pointer-events-auto">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
        </a>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowPublishModal(true)}
            disabled={isPublishing}
            className="px-6 py-2.5 rounded-full bg-foreground text-background text-sm font-bold shadow-xl shadow-foreground/10 transition active:scale-95 hover:opacity-90 disabled:opacity-50 flex items-center gap-2 tracking-wide"
          >
            {isPublishing && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-56">
        
        {/* Cover Image Area */}
        <div className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto pt-8">
          <div className="relative w-full aspect-[16/9] md:aspect-[21/9] bg-muted/30 group overflow-hidden rounded-3xl border-2 border-dashed border-border/50 hover:border-border/80 hover:bg-muted/50 transition-all shadow-sm">
            {coverPreview ? (
              <>
                <img src={coverPreview} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
                  <label className="relative bg-white/20 backdrop-blur-xl text-white px-8 py-3.5 rounded-full font-bold text-sm cursor-pointer border border-white/30 shadow-2xl hover:bg-white/30 hover:scale-105 transition-all overflow-hidden">
                    <span className="pointer-events-none drop-shadow-md">Change Cover</span>
                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleCoverUpload} />
                  </label>
                </div>
                <button 
                  onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                  className="absolute top-6 right-6 h-12 w-12 rounded-full bg-black/40 backdrop-blur-xl text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-black/60 hover:scale-110 border border-white/20 shadow-xl"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </>
            ) : (
              <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
                <div className="h-16 w-16 rounded-2xl bg-background border border-border shadow-sm flex items-center justify-center mb-5 pointer-events-none group-hover:shadow-md transition-all">
                  <ImageIcon className="h-7 w-7 text-muted-foreground/60 pointer-events-none group-hover:text-foreground/80 transition-colors" strokeWidth={1.5} />
                </div>
                <span className="text-base font-medium text-muted-foreground/80 pointer-events-none group-hover:text-foreground/90 transition-colors">Add Cover Image</span>
                <span className="text-xs text-muted-foreground/50 mt-2 pointer-events-none">Drag and drop or click to browse</span>
                <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleCoverUpload} />
              </label>
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div className="px-6 md:px-12 lg:px-24 max-w-4xl mx-auto pt-16">
          <textarea
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            placeholder="Tell your story..."
            className="w-full bg-transparent text-4xl md:text-5xl font-black tracking-tighter outline-none placeholder:text-muted-foreground/30 resize-none overflow-hidden leading-[1.1] mb-12 font-serif"
            rows={1}
          />

          {/* Blocks */}
          <div className="space-y-4">
            {blocks.map((block) => (
              <div key={block.id} className="group relative flex gap-4">
                <div className="flex-1 w-full min-w-0 relative">

                  {(block.type === 'heading' || block.type === 'text') && (
                    <div className="relative w-full">
                      <TipTapBlock 
                        key={`${block.id}-${block.type}`}
                        block={block} 
                        updateBlockText={updateBlockText} 
                        setActiveMentionBlockId={setActiveMentionBlockId} 
                        handleKeyDown={handleKeyDown as any}
                        activeMentionBlockId={activeMentionBlockId}
                      />
                      
                      {showMentions && activeMentionBlockId === block.id && mentionSuggestions.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-2 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[250px] overflow-y-auto">
                          {mentionSuggestions.map((prof) => (
                            <button
                              key={prof.id}
                              onClick={() => insertMention(prof.username)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
                            >
                               <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex items-center justify-center font-bold text-[10px] shrink-0">
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
                    </div>
                  )}

                  {block.type === 'divider' && (
                    <div className="py-12 flex items-center justify-center">
                      <div className="flex gap-3">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                      </div>
                    </div>
                  )}

                  {block.type === 'image' && (
                    <div className="relative w-full rounded-3xl overflow-hidden bg-muted/20 border border-border/30 my-6 group">
                      {block.preview ? (
                        <div className="relative">
                          <img src={block.preview} className="w-full h-auto object-cover" />
                          <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-3xl pointer-events-none" />
                        </div>
                      ) : (
                        <label className="relative flex flex-col items-center justify-center py-24 cursor-pointer hover:bg-muted/40 transition overflow-hidden">
                          <div className="h-14 w-14 rounded-full bg-background border border-border/40 flex items-center justify-center mb-4 shadow-sm pointer-events-none group-hover:scale-110 transition-transform">
                            <ImageIcon className="h-6 w-6 text-muted-foreground/70 pointer-events-none" strokeWidth={1.5} />
                          </div>
                          <span className="text-sm font-medium text-muted-foreground/80 pointer-events-none">Upload an image</span>
                          <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleBlockMediaUpload(block.id, e, 'image')} />
                        </label>
                      )}
                    </div>
                  )}

                  {block.type === 'video' && (
                    <div className="relative w-full rounded-3xl overflow-hidden bg-black border border-border/20 my-6 group">
                      {block.preview ? (
                        <>
                          <video src={block.preview} controls className="w-full h-auto max-h-[70vh] object-contain" />
                          <button 
                            onClick={() => setEditingVideoId(block.id)}
                            className="absolute top-4 right-4 flex items-center justify-center gap-2 px-4 h-10 rounded-full bg-black/50 text-white backdrop-blur-xl transition-all active:scale-95 border border-white/20 shadow-xl z-10 hover:bg-black/70 text-sm font-medium opacity-0 group-hover:opacity-100 translate-y-[-10px] group-hover:translate-y-0"
                          >
                            <Wand2 className="h-4 w-4" /> Edit Video
                          </button>
                        </>
                      ) : (
                        <label className="relative flex flex-col items-center justify-center py-24 cursor-pointer hover:bg-white/5 transition overflow-hidden">
                          <div className="h-14 w-14 rounded-full bg-white/10 border border-white/10 flex items-center justify-center mb-4 shadow-sm pointer-events-none group-hover:scale-110 transition-transform">
                            <Video className="h-6 w-6 text-white/70 pointer-events-none" strokeWidth={1.5} />
                          </div>
                          <span className="text-sm font-medium text-white/80 pointer-events-none">Upload a cinematic video</span>
                          <input type="file" accept="video/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleBlockMediaUpload(block.id, e, 'video')} />
                        </label>
                      )}
                    </div>
                  )}

                  {block.type === 'audio' && (
                    <div className="w-full rounded-[24px] bg-gradient-to-br from-card to-card/50 border border-border/60 p-6 shadow-sm my-6 relative overflow-hidden group">
                      <div className="absolute -right-12 -top-12 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                      {block.preview ? (
                        <div className="relative z-10 flex flex-col gap-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                               <Mic className="h-4 w-4 text-primary" strokeWidth={2} />
                            </div>
                            <span className="font-bold text-sm">Audio Recording</span>
                          </div>
                          <audio src={block.preview} controls preload="metadata" className="w-full outline-none h-10 rounded-full" />
                        </div>
                      ) : recordingId === block.id ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
                          <div className="flex items-center gap-4">
                            <div className="h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center shrink-0 relative">
                              <div className="absolute inset-0 rounded-full border-2 border-red-500/30 animate-ping" />
                              <div className="h-6 w-6 rounded-sm bg-red-500 animate-pulse" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-black text-lg tracking-tight text-red-500 flex items-center gap-2">
                                Recording...
                                <div className="flex items-center gap-1 h-4">
                                  <div className="w-1 bg-red-500/80 rounded-full animate-[pulse_1s_ease-in-out_infinite] h-full" />
                                  <div className="w-1 bg-red-500 rounded-full animate-[pulse_1s_ease-in-out_infinite_0.2s] h-1/2" />
                                  <div className="w-1 bg-red-500/60 rounded-full animate-[pulse_1s_ease-in-out_infinite_0.4s] h-3/4" />
                                  <div className="w-1 bg-red-500/80 rounded-full animate-[pulse_1s_ease-in-out_infinite_0.1s] h-full" />
                                  <div className="w-1 bg-red-500 rounded-full animate-[pulse_1s_ease-in-out_infinite_0.3s] h-1/2" />
                                </div>
                              </span>
                              <span className="text-sm text-muted-foreground font-medium">Capturing your thoughts</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center w-full sm:w-auto">
                            <button 
                              onClick={stopRecording}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 bg-red-500 text-white rounded-full font-bold text-sm shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:bg-red-600 hover:shadow-[0_0_25px_rgba(239,68,68,0.4)] transition-all active:scale-95"
                            >
                              <StopCircle className="h-4 w-4 fill-white text-red-500" /> Stop Recording
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
                          <div className="flex items-center gap-4">
                            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                              <Mic className="h-6 w-6 text-primary" strokeWidth={1.5} />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-lg tracking-tight text-foreground">Audio Note</span>
                              <span className="text-sm text-muted-foreground font-medium">Record a voice memo or upload an audio file</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 w-full sm:w-auto">
                            <button 
                              onClick={() => startRecording(block.id)} 
                              className="flex-1 sm:flex-none px-6 py-3 bg-foreground text-background rounded-full font-bold text-sm shadow-md hover:bg-foreground/90 transition-all active:scale-95 text-center whitespace-nowrap"
                            >
                              Start Recording
                            </button>
                            <label className="relative flex-1 sm:flex-none px-6 py-3 bg-secondary text-secondary-foreground rounded-full font-bold text-sm cursor-pointer hover:bg-secondary/80 transition-all active:scale-95 text-center whitespace-nowrap overflow-hidden shadow-sm">
                              <span className="pointer-events-none">Upload File</span>
                              <input type="file" accept="audio/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleBlockMediaUpload(block.id, e, 'audio')} />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={endOfBlocksRef} className="h-4" />
          </div>
        </div>
      </div>

      {/* Floating Formatting Toolbar (Appears when typing) */}
      {activeMentionBlockId && (
        <div className="formatting-toolbar fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-8 fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-1.5 p-2 bg-background/80 backdrop-blur-2xl rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-border/40">
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
            <div className="w-px h-5 bg-border mx-1" />
            <button 
              onMouseDown={(e) => { e.preventDefault(); toggleBlockType(); }}
              className="h-9 w-9 flex items-center justify-center rounded-full text-foreground hover:bg-accent transition active:scale-90"
              title="Toggle Heading/Text"
            >
              {blocks.find(b => b.id === activeMentionBlockId)?.type === 'heading' ? <Type className="h-4 w-4" /> : <Heading1 className="h-4 w-4" />}
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <Popover modal={false}>
              <PopoverTrigger asChild>
                <button 
                  onMouseDown={(e) => { e.preventDefault(); }}
                  className="h-9 w-9 flex items-center justify-center rounded-full text-foreground hover:bg-accent transition active:scale-90"
                  title="Text Color"
                >
                  <Palette className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 bg-background/95 backdrop-blur-xl border-border/50 rounded-2xl shadow-xl" align="center" side="top" sideOffset={10} onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    {['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ffffff', '#000000'].map(color => (
                      <button
                        key={color}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyColor(color, false);
                        }}
                        className="h-8 w-8 rounded-full border border-border/30 hover:scale-110 transition-transform active:scale-95"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                    <input 
                      type="color" 
                      value={customColor}
                      onChange={(e) => {
                        setCustomColor(e.target.value);
                        applyColor(e.target.value, false);
                      }}
                      className="h-8 w-8 rounded overflow-hidden cursor-pointer shrink-0 border-0 p-0"
                    />
                    <div className="flex-1 flex items-center px-2 py-1 bg-accent/50 rounded-md border border-border/30">
                      <span className="text-xs text-muted-foreground mr-1">Hex</span>
                      <input 
                        type="text" 
                        value={customColor}
                        onChange={(e) => {
                          setCustomColor(e.target.value);
                          if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                            applyColor(e.target.value, false);
                          }
                        }}
                        className="w-full bg-transparent text-sm font-medium outline-none"
                        placeholder="#000000"
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <div className="w-px h-5 bg-border mx-1" />
            <button 
              onMouseDown={(e) => { e.preventDefault(); addBlock('divider'); }}
              className="h-9 w-9 flex items-center justify-center rounded-full text-foreground hover:bg-accent transition active:scale-90"
              title="Add Divider"
            >
              <Minus className="h-4 w-4" strokeWidth={2} />
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  onMouseDown={(e) => { e.preventDefault(); }}
                  className="h-9 w-9 flex items-center justify-center rounded-full bg-[#22c55e] text-white shadow-md hover:bg-[#16a34a] transition active:scale-90 ml-1"
                  title="Add Media"
                >
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2 bg-background/95 backdrop-blur-xl border-border/50 rounded-2xl shadow-2xl flex flex-col gap-1" align="center" side="top" sideOffset={15} onOpenAutoFocus={(e) => e.preventDefault()}>
                <button 
                  onClick={() => addBlock('image')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors text-sm font-bold text-foreground"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <ImageIcon className="h-4 w-4" strokeWidth={2} />
                  </div>
                  Add Image
                </button>
                <button 
                  onClick={() => addBlock('video')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors text-sm font-bold text-foreground"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Video className="h-4 w-4" strokeWidth={2} />
                  </div>
                  Add Video
                </button>
                <button 
                  onClick={() => addBlock('audio')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors text-sm font-bold text-foreground"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Mic className="h-4 w-4" strokeWidth={2} />
                  </div>
                  Add Audio
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {/* Video Editor Modal */}
      {editingVideoId && (
        <VideoEditor 
          videoSrc={blocks.find(b => b.id === editingVideoId)?.preview || ""}
          onCancel={() => setEditingVideoId(null)}
          onSave={(blob) => {
            const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
            const file = new File([blob], `edited-video-${Date.now()}.${ext}`, { type: blob.type });
            const previewUrl = URL.createObjectURL(blob);
            
            setBlocks(prev => prev.map(b => b.id === editingVideoId ? { ...b, file, preview: previewUrl } : b));
            setEditingVideoId(null);
            toast.success("Video edited successfully! ✨");
          }}
        />
      )}

      {/* Publish Modal */}
      <Drawer open={showPublishModal} onOpenChange={setShowPublishModal}>
        <DrawerContent className="border-none bg-background/95 backdrop-blur-3xl p-0">
          <div className="max-w-md w-full mx-auto p-6 pt-8">
            <DrawerHeader className="px-0 pt-0 text-center mb-4">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Wand2 className="h-6 w-6 text-primary" />
              </div>
              <DrawerTitle className="text-3xl font-black tracking-tight">Ready to publish?</DrawerTitle>
              <DrawerDescription className="text-base text-muted-foreground mt-2">
                Choose how you want to share your story.
              </DrawerDescription>
            </DrawerHeader>
            
            <div className="grid grid-cols-2 gap-4 py-4">
              <button
                onClick={() => setIsPaid(false)}
                className={`group flex flex-col items-center justify-center gap-4 py-8 px-4 rounded-3xl border-2 transition-all duration-300 ${!isPaid ?'border-primary bg-primary/5 shadow-lg shadow-primary/5 scale-[1.02]' : 'border-border/40 hover:border-border/80 bg-card hover:bg-accent/30'}`}
              >
                <div className={`p-3 rounded-2xl transition-colors ${!isPaid ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground group-hover:text-foreground'}`}>
                  <Globe className="h-7 w-7" strokeWidth={2} />
                </div>
                <div className="text-center">
                  <span className="block font-black text-lg text-foreground">Free</span>
                  <span className="text-xs text-muted-foreground mt-1 font-medium">Available to all</span>
                </div>
              </button>

              <button
                onClick={() => setIsPaid(true)}
                className={`group flex flex-col items-center justify-center gap-4 py-8 px-4 rounded-3xl border-2 transition-all duration-300 ${isPaid ?'border-[#ffcf00] bg-[#ffcf00]/10 shadow-lg shadow-[#ffcf00]/10 scale-[1.02]' : 'border-border/40 hover:border-border/80 bg-card hover:bg-accent/30'}`}
              >
                <div className={`p-3 rounded-2xl transition-colors ${isPaid ? 'bg-[#ffcf00] text-black' : 'bg-muted text-muted-foreground group-hover:text-foreground'}`}>
                  <Crown className="h-7 w-7" strokeWidth={2} />
                </div>
                <div className="text-center">
                  <span className="block font-black text-lg text-foreground">Premium</span>
                  <span className="text-xs text-muted-foreground mt-1 font-medium">Monetize content</span>
                </div>
              </button>
            </div>

            <DrawerFooter className="px-0 pb-8 pt-4">
              {isPaid ? (
                <div className="bg-[#ffcf00]/10 border border-[#ffcf00]/20 p-5 rounded-3xl flex flex-col gap-2 mb-6 animate-in fade-in slide-in-from-bottom-2">
                  <span className="font-black flex items-center gap-2 text-[#ffcf00] text-lg">
                    <Crown className="h-5 w-5" /> Coming soon!
                  </span>
                  <span className="text-sm font-medium leading-relaxed text-[#ffcf00]/80">Paid articles are an upcoming feature for Zero Club builders. For now, please publish as Free!</span>
                </div>
              ) : null}
              <button
                onClick={() => {
                  setShowPublishModal(false);
                  executePublish();
                }}
                disabled={isPaid || isPublishing}
                className="w-full h-14 rounded-full bg-foreground text-background font-black text-lg shadow-xl shadow-foreground/10 transition-all active:scale-95 disabled:opacity-50 hover:bg-foreground/90 flex items-center justify-center gap-2"
              >
                {isPublishing ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Publish Note'}
              </button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
