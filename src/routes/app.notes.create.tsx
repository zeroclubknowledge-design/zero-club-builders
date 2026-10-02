import { getFirstName } from "@/lib/utils";
import { NoteAudiencePicker, saveNoteAudience, type NoteAudienceMode } from "@/features/notes/NoteAudiencePicker";
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus, Image as ImageIcon, Mic, Video, Type, Minus, Loader2, X, StopCircle, Wand2, Crown, Check, Globe, Bold, Italic, List, Palette } from "@/components/icons/glyphs";
import { Highlighter, NOTE_TEXT_COLORS, NOTE_HIGHLIGHTS } from "@/features/notes/editorMarks";
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadNoteMedia } from '@/lib/storage';
import { createNoteAction } from '@/api';
import { toast } from 'sonner';
import { useUser } from '@/hooks/useUser';
import { VideoEditor } from '@/components/VideoEditor';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { readNoteDraft, writeNoteDraft, clearNoteDraft, stripHtml } from '@/lib/noteDraft';
import Placeholder from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const Route = createFileRoute('/app/notes/create')({
  component: NotesCreatePage,
});

type BlockType = 'text' | 'heading' | 'audio' | 'video' | 'image' | 'divider';

interface NoteBlock {
  id: string;
  type: BlockType;
  content: string; 
  file?: File; 
  preview?: string; 
}

const sanitizeEditableNoteHtml = (content = '') => content
  .replace(/&lt;\s*\/?\s*p\s*&gt;/gi, '')
  .replace(/&#0*60;\s*\/?\s*p\s*&#0*62;/gi, '');

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
  handleKeyDown: (e: KeyboardEvent, blockId: string, isEmpty: boolean) => boolean,
  activeMentionBlockId: string | null
}) => {
  const editor = useEditor({
    extensions: [
      /*
       * Headings are nodes again.
       *
       * `heading: false` disabled the heading node entirely, and "heading" was
       * instead a property of a whole block, applied as a CSS class on the
       * editor's root element. That is why selecting one sentence and pressing
       * H1 turned the entire block into a heading: there was nothing wrapping
       * the selection to turn, only a class on everything.
       *
       * With the real node back, a heading is a node around the paragraph the
       * cursor sits in — which is also what gives us three levels rather than
       * one size.
       */
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder: block.type === 'heading' ? 'Heading...' : 'Write your Notes...' }),
      TextStyle,
      Color,
      Highlighter,
    ],
    content: sanitizeEditableNoteHtml(block.content),
    editorProps: {
      attributes: {
        // zc-note-prose carries the heading sizes, the rule styling and the
        // highlight padding — see styles.css. Tailwind's prose defaults are
        // tuned for documentation, not for an article somebody is writing.
        class: `zc-note-prose w-full bg-transparent outline-none resize-none overflow-hidden block ${block.type === 'heading' ? 'text-3xl font-black tracking-tighter pt-6 pb-2 placeholder:text-muted-foreground/30 font-serif' : 'text-lg md:text-xl min-h-[60px] leading-relaxed font-normal text-foreground/90 font-serif'} prose dark:prose-invert max-w-none`,
        spellcheck: "false",
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Backspace' && view.state.selection.empty && view.state.selection.from === 1) {
          const isEmpty = view.state.doc.textContent.trim().length === 0;
          return handleKeyDown(event, block.id, isEmpty);
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

function NotesCreatePage() {
  const navigate = useNavigate();

  /* The header steps aside while you read down the page and comes back the
     moment you head up. The threshold keeps a stray pixel of movement from
     flipping it, and it only ever hides once you are past its own height —
     otherwise it would vanish at the very top, where it is not in the way. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTop = useRef(0);
  const [headerHidden, setHeaderHidden] = useState(false);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const current = element.scrollTop;
    const delta = current - lastScrollTop.current;
    if (Math.abs(delta) < 8) return;
    setHeaderHidden(delta > 0 && current > 72);
    lastScrollTop.current = current;
  };
  const { data: profile } = useUser();
  const keyboardInset = useKeyboardInset();

  /*
   * The draft is restored synchronously in the initial state rather than in an
   * effect. Restoring afterwards would mount the editor with an empty block
   * first, and TipTap would have already taken that empty value as its
   * starting content — the text would come back in state but not on screen.
   */
  const restored = useRef(readNoteDraft());

  const [title, setTitle] = useState(restored.current?.title ?? '');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(restored.current?.isPaid ?? false);
  /* Who the note is for: everyone, or learners of chosen bootcamps. */
  const [noteMode, setNoteMode] = useState<NoteAudienceMode>("free");
  const [noteBootcampIds, setNoteBootcampIds] = useState<string[]>([]);

  const [blocks, setBlocks] = useState<NoteBlock[]>(
    restored.current?.blocks?.length
      ? restored.current.blocks
      : [{ id: Math.random().toString(36).substring(2, 15), type: 'text', content: '' }]
  );

  const [isPublishing, setIsPublishing] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [activeMentionBlockId, setActiveMentionBlockId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showIdlePublish, setShowIdlePublish] = useState(false);
  const [contentRevision, setContentRevision] = useState(0);
  const [customColor, setCustomColor] = useState('#000000');
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(
    restored.current ? restored.current.at : null,
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const blockContentsRef = useRef<Record<string, string>>({});

  const hasDraftContent = title.trim().length > 0 || blocks.some((block) => {
    const content = blockContentsRef.current[block.id] ?? block.content ?? '';
    return content.replace(/<[^>]*>/g, '').trim().length > 0 || Boolean(block.preview || block.file);
  });

  useEffect(() => {
    setShowIdlePublish(false);
    if (!hasDraftContent || isPublishing || showPublishModal) return;

    const idleTimer = window.setTimeout(() => setShowIdlePublish(true), 1200);
    return () => window.clearTimeout(idleTimer);
  }, [title, blocks, contentRevision, hasDraftContent, isPublishing, showPublishModal]);

  /*
   * Autosave the draft.
   *
   * The content is read from blockContentsRef, not from `blocks`. Typing does
   * NOT update block state — updateBlockText writes the ref and bumps
   * contentRevision, deliberately, to avoid re-rendering the editor on every
   * keystroke. Saving `blocks` would therefore have written empty text and the
   * whole feature would have looked like it worked while saving nothing.
   *
   * Debounced, and it also saves on the way out: pagehide and
   * visibilitychange are exactly when the app is backgrounded and Android may
   * decide to reclaim the process.
   *
   * Only text and dividers are stored. Media blocks hold blob: URLs that die
   * with the page, so restoring one would show a broken image.
   */
  useEffect(() => {
    const snapshot = () => {
      const materialised = blocks
        .filter((b) => b.type === 'text' || b.type === 'heading' || b.type === 'divider')
        .map((b) => ({
          id: b.id,
          type: b.type,
          content: blockContentsRef.current[b.id] ?? b.content ?? '',
        }));

      const hasText =
        title.trim().length > 0 ||
        materialised.some((b) => stripHtml(b.content).trim().length > 0);

      if (!hasText) {
        clearNoteDraft();
        setDraftSavedAt(null);
        return;
      }

      writeNoteDraft({ title, isPaid, blocks: materialised, at: Date.now() });
      setDraftSavedAt(Date.now());
    };

    const timer = window.setTimeout(snapshot, 800);
    const onLeave = () => { window.clearTimeout(timer); snapshot(); };

    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onLeave);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onLeave);
    };
  }, [title, blocks, isPaid, contentRevision]);

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

  const handleKeyDown = (e: KeyboardEvent, blockId: string, isEmpty: boolean) => {
    if (!isEmpty) return false;

    const blockIndex = blocks.findIndex(b => b.id === blockId);
    if (blockIndex > 0) {
      const prevBlock = blocks[blockIndex - 1];
      if (prevBlock.type !== 'text' && prevBlock.type !== 'heading') {
        e.preventDefault();
        removeBlock(prevBlock.id);
        return true;
      } else {
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
        return true;
      }
    }

    return false;
  };

  const updateBlockText = (id: string, text: string, textBeforeCursor?: string) => {
    blockContentsRef.current[id] = text; // Fast ref update avoids re-render lag
    setContentRevision((revision) => revision + 1);

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

  /* Applies to what is selected, which is the whole point of the fix. The
     editor is reached the same way the colour picker reaches it. */
  const applyHeading = (level: 1 | 2 | 3) => {
    const editor = (window as any).activeTipTapEditor;
    if (!editor) return;
    editor.chain().focus().toggleHeading({ level }).run();
  };

  /* A break between sections, inserted where the cursor is rather than as a
     whole new block at the end — that was the old divider, and it could only
     ever be appended. */
  const insertSectionBreak = () => {
    const editor = (window as any).activeTipTapEditor;
    if (!editor) { addBlock('divider'); return; }
    editor.chain().focus().setHorizontalRule().run();
  };

  const applyHighlight = (color: string) => {
    const editor = (window as any).activeTipTapEditor;
    if (!editor) return;
    if (!color) editor.chain().focus().unsetHighlight().run();
    else editor.chain().focus().setHighlight(color).run();
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
        content: b.type === 'text' || b.type === 'heading'
          ? sanitizeEditableNoteHtml(blockContentsRef.current[b.id] ?? b.content)
          : (blockContentsRef.current[b.id] ?? b.content)
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

      const noteData = {
        author_id: profile.id,
        title: title.trim(),
        cover_url: finalCoverUrl,
        blocks: finalBlocks,
        is_published: true
      };

      // Inserted with the signed-in session (the server action ran signed out),
      // then the audience is saved by the author.
      const { data: created, error: createError } = await supabase.from('notes').insert([noteData]).select('id').single();
      if (createError) throw new Error(createError.message);
      await saveNoteAudience(created.id, noteMode, noteBootcampIds);

      clearNoteDraft();
      toast.success('Note published successfully!');
      navigate({ to: '/app/notes' });

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to publish note');
    } finally {
      setIsPublishing(false);
    }
  };

  const wordCount = blocks.reduce(
    (total: number, block: any) =>
      total + (block.type === 'text' || block.type === 'heading'
        ? String(block.content || '').replace(/<[^>]*>?/gm, ' ').split(/\s+/).filter(Boolean).length
        : 0),
    0,
  );

  return (
    /* h-full only fills the parent, and the parent here is as tall as its
       content — so below the last block the page simply stopped and whatever
       is behind the app showed through as a band of a different colour. The
       viewport unit fills the screen; the safe-area subtraction accounts for
       the padding the app shell already adds above this page. */
    <div className="relative flex h-[calc(100dvh-env(safe-area-inset-top))] w-full flex-col overflow-hidden bg-card selection:bg-foreground selection:text-background">
      
      {/* Minimal Header */}
      <header
        className={`sticky top-0 z-50 border-b border-border bg-card pt-[env(safe-area-inset-top)] transition-transform duration-300 ease-out ${
          headerHidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[760px] items-center gap-1 px-2">
        <button 
          onClick={() => navigate({ to: '/app/notes' })}
          aria-label="Close"
          className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
        >
          <X className="h-[22px] w-[22px]" />
        </button>
        
        <div className="min-w-0 flex-1">
          {/* Saying it out loud, because a draft nobody knows about is the
              same as no draft — you still close the page carefully. */}
          <p className="truncate text-[13px] text-muted-foreground">
            {draftSavedAt ? "Draft saved" : "New note"} · {wordCount} {wordCount === 1 ? "word" : "words"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Restoring a draft has to be undoable, or someone who wanted a
              blank page has to delete their old note by hand to get one. */}
          {restored.current && draftSavedAt && (
            <button
              onClick={() => {
                clearNoteDraft();
                setDraftSavedAt(null);
                setTitle('');
                setIsPaid(false);
                setBlocks([{ id: Math.random().toString(36).substring(2, 15), type: 'text', content: '' }]);
                restored.current = null;
                setContentRevision((r) => r + 1);
                toast.success('Draft discarded');
              }}
              className="hidden h-9 rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition hover:bg-foreground/[0.04] hover:text-foreground sm:block"
            >
              Discard draft
            </button>
          )}
          <button
            onClick={() => setShowPublishModal(true)}
            disabled={isPublishing}
            className="flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-[15px] font-semibold text-background transition hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            {isPublishing && <Loader2 className="h-4 w-4 animate-spin" />}
            Publish
          </button>
        </div>
        </div>
      </header>

      {/* Clearance below the writing, tracking where the toolbar actually is.
          The padding was a fixed 14rem, but the toolbar lifts itself by the
          keyboard height so it rides above the keys — so the moment the
          keyboard opened, the bar sat hundreds of pixels higher than the
          padding accounted for, and a new line of text carried on behind it.
          Adding the keyboard inset keeps the gap the same whether the keyboard
          is open or closed. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto no-scrollbar"
        style={{ paddingBottom: `calc(14rem + ${keyboardInset}px)` }}
      >
        
        {/* Cover Image Area */}
        <div className="zc-page-width mx-auto max-w-[760px] px-5 pt-4">
          <div className={`group relative w-full overflow-hidden rounded-xl transition-colors ${coverPreview ? "aspect-[16/9] bg-muted md:aspect-[21/9]" : "h-[120px] border-[1.5px] border-dashed border-foreground/25 hover:border-foreground/45"}`}>
            {coverPreview ? (
              <>
                <img src={coverPreview} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
                  <label className="relative cursor-pointer overflow-hidden rounded-lg border border-white/30 bg-black/60 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-black/75">
                    <span className="pointer-events-none drop-shadow-md">Change Cover</span>
                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleCoverUpload} />
                  </label>
                </div>
                <button 
                  onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                  className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-black/60 text-white opacity-0 transition-all duration-300 hover:bg-black/75 group-hover:opacity-100"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </>
            ) : (
              <label className="absolute inset-0 flex cursor-pointer items-center justify-center gap-2 text-[14px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
                <ImageIcon className="pointer-events-none h-5 w-5" />
                <span className="pointer-events-none">Add a cover</span>
                <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleCoverUpload} />
              </label>
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div className="zc-page-width mx-auto max-w-[760px] px-5 pt-6">
          <textarea
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            maxLength={120}
            aria-label="Note title"
            placeholder="Title"
            className="mb-1 w-full resize-none overflow-hidden bg-transparent font-display text-[26px] font-semibold leading-[1.2] outline-none placeholder:text-muted-foreground/40 md:text-[34px]"
            rows={1}
          />
          <div className="mb-6 flex items-center justify-end text-[12px] text-muted-foreground">
            <span className="ml-4 shrink-0 tabular-nums">{title.length}/120</span>
          </div>

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
                        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[250px] overflow-y-auto rounded-lg border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 duration-200">
                          {mentionSuggestions.map((prof) => (
                            <button
                              key={prof.id}
                              onClick={() => insertMention(prof.username)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0"
                            >
                               <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex items-center justify-center font-bold text-[10px] shrink-0">
                                {prof.avatar_url ? <img src={prof.avatar_url} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : prof.username[0].toUpperCase()}
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
                    <div className="group relative my-6 w-full overflow-hidden rounded-lg border border-border bg-muted/20">
                      {block.preview ? (
                        <div className="relative">
                          <img src={block.preview} className="w-full h-auto object-cover" loading="lazy" decoding="async" />
                          <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-black/10" />
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
                    <div className="group relative my-6 w-full overflow-hidden rounded-lg border border-border bg-black">
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
                    <div className="group relative my-6 w-full overflow-hidden rounded-lg border border-border bg-card p-5">
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

      {/* Floating Formatting Toolbar — rides on top of the keyboard.
          `fixed bottom-4` is measured against the layout viewport, which the
          mobile keyboard covers rather than shrinks, so the toolbar sat
          underneath it exactly when you were typing. keyboardInset is the
          height the keyboard is covering, so offsetting by it puts the bar
          directly above the keys. Falls back to the old offsets on desktop,
          where there is no keyboard. */}
      {activeMentionBlockId && (
        <div
          className={`formatting-toolbar fixed inset-x-0 z-50 border-t border-border bg-card animate-in fade-in duration-150 ${keyboardInset > 0 ? '' : showIdlePublish ? 'bottom-[calc(60px+env(safe-area-inset-bottom))]' : 'bottom-0 pb-[env(safe-area-inset-bottom)]'}`}
          style={keyboardInset > 0 ? { bottom: keyboardInset } : undefined}
        >
          <div className="zc-page-width no-scrollbar mx-auto flex max-w-[760px] items-center gap-0.5 overflow-x-auto px-2 py-1.5 text-muted-foreground">
            <button 
              onMouseDown={(e) => { e.preventDefault(); insertFormatting('bold'); }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-90"
              title="Bold"
            >
              <Bold className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <button 
              onMouseDown={(e) => { e.preventDefault(); insertFormatting('italic'); }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-90"
              title="Italic"
            >
              <Italic className="h-4 w-4" strokeWidth={2} />
            </button>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <button 
              onMouseDown={(e) => { e.preventDefault(); insertFormatting('bullet'); }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-90"
              title="Bullet List"
            >
              <List className="h-4 w-4" strokeWidth={2} />
            </button>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            {/* Three levels, each acting on the selection. One button that
                flipped a whole block between "heading" and "text" could not
                express an article's structure, and applied itself to
                everything you had written in that block. */}
            {([1, 2, 3] as const).map((level) => (
              <button
                key={level}
                onMouseDown={(e) => { e.preventDefault(); applyHeading(level); }}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-bold transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-90"
                title={`Heading ${level}`}
              >
                H{level}
              </button>
            ))}
            <button
              onMouseDown={(e) => { e.preventDefault(); insertSectionBreak(); }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-90"
              title="Section break"
            >
              <Minus className="h-4 w-4" strokeWidth={2} />
            </button>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <Popover modal={false}>
              <PopoverTrigger asChild>
                <button 
                  onMouseDown={(e) => { e.preventDefault(); }}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-90"
                  title="Colour and highlight"
                >
                  <Palette className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 rounded-lg border-border bg-background p-3 shadow-xl" align="center" side="top" sideOffset={10} onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-3">
                  {/* Ink, then highlighter. The old grid was the Tailwind 500
                      ramp plus pure white and pure black, which on a page of
                      serif body text reads as marker pen rather than an
                      editorial choice. */}
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Text colour</p>
                  <div className="grid grid-cols-5 gap-2">
                    {NOTE_TEXT_COLORS.map((entry) => (
                      <button
                        key={entry.name}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (!entry.value) {
                            const editor = (window as any).activeTipTapEditor;
                            editor?.chain().focus().unsetColor().run();
                            return;
                          }
                          applyColor(entry.value, false);
                        }}
                        className={`h-8 w-8 rounded-full border border-border/40 transition-transform hover:scale-110 active:scale-95 ${entry.value ? '' : 'grid place-items-center'}`}
                        style={entry.value ? { backgroundColor: entry.value } : undefined}
                        title={entry.name}
                      >
                        {!entry.value && <Type className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    ))}
                  </div>

                  <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Highlight</p>
                  <div className="grid grid-cols-5 gap-2">
                    {NOTE_HIGHLIGHTS.map((entry) => (
                      <button
                        key={entry.name}
                        onMouseDown={(e) => { e.preventDefault(); applyHighlight(entry.value); }}
                        className={`h-8 w-8 rounded-full border border-border/40 transition-transform hover:scale-110 active:scale-95 ${entry.value ? '' : 'grid place-items-center'}`}
                        style={entry.value ? { backgroundColor: entry.value } : undefined}
                        title={entry.name}
                      >
                        {!entry.value && <X className="h-3 w-3 text-muted-foreground" />}
                      </button>
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
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            <button 
              onMouseDown={(e) => { e.preventDefault(); addBlock('divider'); }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-foreground/[0.05] hover:text-foreground active:scale-90"
              title="Add Divider"
            >
              <Minus className="h-4 w-4" strokeWidth={2} />
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  onMouseDown={(e) => { e.preventDefault(); }}
                  className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition hover:opacity-90 active:scale-90"
                  title="Add Media"
                >
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="flex w-48 flex-col gap-1 rounded-lg border-border bg-background p-2 shadow-xl" align="center" side="top" sideOffset={15} onOpenAutoFocus={(e) => e.preventDefault()}>
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

      {showIdlePublish && !showPublishModal && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="zc-page-width mx-auto flex h-[60px] max-w-[760px] items-center gap-3 px-4">
            <p className="min-w-0 flex-1 truncate text-[14px] text-muted-foreground">Your note is ready when you are.</p>
            <button
              onClick={() => setShowPublishModal(true)}
              disabled={isPublishing}
              className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              {isPublishing && <Loader2 className="h-4 w-4 animate-spin" />}
              Publish note
            </button>
          </div>
        </div>
      )}

      {/* Publish Modal */}
      <Drawer open={showPublishModal} onOpenChange={setShowPublishModal}>
        <DrawerContent className="mx-auto max-w-[620px] border border-border bg-background p-0 shadow-xl">
          <div className="mx-auto w-full max-w-md">
            <DrawerHeader className="px-5 pb-3 pt-1 text-left sm:px-5">
              <DrawerTitle className="font-display text-[20px] font-semibold leading-tight">Ready to publish?</DrawerTitle>
              <DrawerDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                Choose how you want to share your story.
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <NoteAudiencePicker
                mode={noteMode}
                onModeChange={(mode) => { setNoteMode(mode); setIsPaid(mode === "premium"); }}
                bootcampIds={noteBootcampIds}
                onBootcampIdsChange={setNoteBootcampIds}
              />

              <DrawerFooter className="px-0 pb-0 pt-5">
                {isPaid ? (
                  <div className="mb-3 flex items-start gap-3 rounded-2xl bg-foreground/[0.05] p-4 animate-in fade-in slide-in-from-bottom-2">
                    <Crown className="mt-0.5 h-5 w-5 shrink-0 text-[#a3186f]" />
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-foreground">Coming soon</p>
                      <p className="mt-0.5 text-[14px] leading-relaxed text-muted-foreground">Paid articles are an upcoming feature for Zero Club builders. For now, please publish as Free!</p>
                    </div>
                  </div>
                ) : null}
                <button
                  onClick={() => {
                    setShowPublishModal(false);
                    executePublish();
                  }}
                  disabled={isPaid || isPublishing || (noteMode === "bootcamps" && noteBootcampIds.length === 0)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
                >
                  {isPublishing ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Publish note'}
                </button>
              </DrawerFooter>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
