import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "@/components/icons/solar";

/**
 * A small rich text editor for descriptions.
 *
 * Deliberately limited to bold, italic, headings, bullet and numbered lists,
 * and quotes - enough to organise a description without turning it into a
 * document editor. Stores HTML, which renders anywhere with `prose` styles.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write a clear description...",
  minHeight = 200,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: toEditorContent(value),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none " +
          "prose-headings:font-semibold prose-headings:tracking-tight " +
          "prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 " +
          "prose-strong:font-semibold",
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // An empty editor still reports "<p></p>"; treat that as blank.
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Keep in step when the parent loads existing content (editing a bootcamp).
  useEffect(() => {
    if (!editor) return;
    const incoming = toEditorContent(value);
    if (incoming !== editor.getHTML()) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return <div className="rounded-lg border border-border bg-background" style={{ minHeight: minHeight + 44 }} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary/50">
      <Toolbar editor={editor} />
      <div className="px-3.5 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const Button = ({
    onClick,
    active,
    label,
    children,
    disabled,
  }: {
    onClick: () => void;
    active?: boolean;
    label: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={!!active}
      disabled={disabled}
      // Keep focus in the editor so the formatting applies to the selection.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-35 ${
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-2 py-1.5">
      <Button label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" strokeWidth={2.5} />
      </Button>
      <Button label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" strokeWidth={2.5} />
      </Button>

      <span className="mx-1 h-5 w-px bg-border" />

      <Button label="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-3.5 w-3.5" />
      </Button>
      <Button label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </Button>
      <Button label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-3.5 w-3.5" />
      </Button>
      <Button label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-3.5 w-3.5" />
      </Button>

      <span className="mx-1 h-5 w-px bg-border" />

      <Button label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      <span className="ml-auto pr-1 text-[10px] text-muted-foreground">Bold, lists and headings</span>
    </div>
  );
}

/** Plain text saved before this editor existed is converted to paragraphs. */
function toEditorContent(value: string) {
  const text = value || "";
  if (!text.trim()) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return text;

  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char),
  );
