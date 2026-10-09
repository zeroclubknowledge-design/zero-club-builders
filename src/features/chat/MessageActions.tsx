import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Pencil,
  Reply,
  Search,
  Send,
  Star,
  type ZeroIconProps,
} from "@/components/icons/glyphs";
import { decodeChatMedia } from "@/hooks/useVoiceRecorder";
import { downloadMedia } from "@/components/ImageLightbox";
import { getConversations, sendMessageAction } from "@/api";
import { copyToClipboard } from "@/lib/share";

/** Forward: the Reply arrow, pointing the other way. */
export function Forward({ className = "", ...props }: ZeroIconProps) {
  return <Reply {...props} className={`-scale-x-100 ${className}`} />;
}

const REACTIONS = ["❤️", "😂", "👍", "🔥", "😮", "🙏"];
const MARKER = "$$MEDIA$$";

function messageText(content: string) {
  return (content || "").split(MARKER)[0].trim();
}

function messageMedia(content: string) {
  const raw = (content || "").split(MARKER)[1];
  return raw ? raw.split(",").map((token) => decodeChatMedia(token)) : [];
}

/**
 * Long-press (or ⋯ on desktop) on a message: react, reply, copy, forward,
 * highlight, download its photo or file, and edit your own recent messages.
 */
export function MessageActionsSheet({
  open,
  onOpenChange,
  message,
  isMe,
  highlighted,
  onReact,
  onReply,
  onEdit,
  onForward,
  onToggleHighlight,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: { id: string; content: string; created_at: string };
  isMe: boolean;
  highlighted: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onForward: () => void;
  onToggleHighlight: () => void;
}) {
  const text = messageText(message.content);
  const media = messageMedia(message.content);
  const canEdit =
    isMe &&
    Boolean(text) &&
    media.length === 0 &&
    Date.now() - new Date(message.created_at).getTime() < 30 * 60 * 1000;
  const run = (fn: () => void) => () => {
    // Clipboard and downloads must run inside the original click gesture.
    fn();
    onOpenChange(false);
  };

  const rows: {
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    show: boolean;
  }[] = [
    {
      key: "reply",
      label: "Reply",
      icon: <Reply className="h-[21px] w-[21px]" />,
      onClick: run(onReply),
      show: true,
    },
    {
      key: "copy",
      label: "Copy",
      icon: <Copy className="h-[21px] w-[21px]" />,
      onClick: run(
        () =>
          void copyToClipboard(
            text || media.map((m) => m.url).join("\n"),
            text ? "Message copied" : "Link copied",
          ),
      ),
      show: Boolean(text) || media.length > 0,
    },
    {
      key: "forward",
      label: "Forward",
      icon: <Forward className="h-[21px] w-[21px]" />,
      onClick: run(onForward),
      show: true,
    },
    {
      key: "highlight",
      label: highlighted ? "Remove highlight" : "Highlight",
      icon: (
        <Star
          className={`h-[21px] w-[21px] ${highlighted ? "fill-[#cc208f] text-[#cc208f]" : ""}`}
        />
      ),
      onClick: run(onToggleHighlight),
      show: true,
    },
    {
      key: "download",
      label: media.length > 1 ? `Download ${media.length} files` : "Download",
      icon: <Download className="h-[21px] w-[21px]" />,
      onClick: run(() => media.forEach((m) => void downloadMedia(m.url))),
      show: media.length > 0,
    },
    {
      key: "edit",
      label: "Edit",
      icon: <Pencil className="h-[21px] w-[21px]" />,
      onClick: run(onEdit),
      show: canEdit,
    },
  ];

  return (
    // Content clicks must not become drag-dismiss gestures in centered dialogs.
    <Drawer handleOnly open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-zc-message-actions="menu" overlayClassName="z-[200]" className="z-[210] mx-auto max-h-[90dvh] w-full max-w-[520px] overflow-y-auto border-border bg-background px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <DrawerTitle className="sr-only">Message options</DrawerTitle>
        {/* Quick reactions first, like every chat app. */}
        <div className="flex items-center justify-between rounded-full bg-foreground/[0.05] px-2 py-1.5">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={run(() => onReact(emoji))}
              className="grid h-11 w-11 place-items-center rounded-full text-[24px] transition active:scale-90 hover:bg-foreground/[0.06]"
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        {text && (
          <p className="mx-1 mt-3 line-clamp-2 text-[13.5px] text-muted-foreground">“{text}”</p>
        )}
        <div className="mt-2 flex flex-col">
          {rows
            .filter((row) => row.show)
            .map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={row.onClick}
                className="flex items-center gap-4 rounded-xl px-3 py-3.5 text-left text-[16px] font-medium text-foreground transition hover:bg-foreground/[0.04] active:bg-foreground/[0.06]"
              >
                <span className="text-muted-foreground">{row.icon}</span>
                {row.label}
              </button>
            ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

type Conversation = {
  id: string;
  user?: {
    id: string;
    full_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  isSupport?: boolean;
};

/** Pick one or more chats and send the message to each, marked "Forwarded". */
export function ForwardSheet({
  message,
  onClose,
  excludeId,
}: {
  message: { content: string } | null;
  onClose: () => void;
  excludeId?: string;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => { setQuery(""); setPicked([]); }, [message]);
  const { data: conversations = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["conversations"],
    queryFn: getConversations,
    enabled: Boolean(message),
  });

  const list = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (conversations as Conversation[])
      .filter((c) => c.user?.id && c.user.id !== excludeId)
      .filter(
        (c) =>
          !term ||
          `${c.user?.full_name || ""} ${c.user?.username || ""}`.toLowerCase().includes(term),
      );
  }, [conversations, query, excludeId]);

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const send = async () => {
    if (!message || picked.length === 0) return;
    setSending(true);
    try {
      const results = await Promise.allSettled(
        picked.map((receiverId) =>
          sendMessageAction({ receiverId, content: message.content, forwarded: true }),
        ),
      );
      const failed = picked.filter((_, index) => results[index].status === "rejected");
      const succeeded = picked.length - failed.length;
      picked.forEach((id, index) => { if (results[index].status === "fulfilled") void queryClient.invalidateQueries({ queryKey: ["messages", id] }); });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (failed.length) {
        // Retry only unsuccessful recipients; don't duplicate successful sends.
        setPicked(failed);
        toast.error(succeeded ? `Forwarded to ${succeeded} chats. Retry the ${failed.length} remaining.` : "Could not forward. Please try again.");
        return;
      }
      toast.success(
        picked.length === 1 ? "Message forwarded" : `Forwarded to ${picked.length} chats`,
      );
      setPicked([]);
      onClose();
    } catch (error) {
      toast.error((error as Error)?.message || "Could not forward");
    } finally {
      setSending(false);
    }
  };

  return (
    <Drawer handleOnly open={Boolean(message)} dismissible={!sending} onOpenChange={(open) => !open && !sending && onClose()}>
      <DrawerContent data-zc-message-actions="forward" hideClose={sending} overlayClassName="z-[200]" className="z-[210] mx-auto flex max-h-[85dvh] w-full max-w-[520px] flex-col border-border bg-background">
        <div className="px-4 pb-2 pt-1">
          <DrawerTitle className="font-display text-[19px] font-semibold">Forward to…</DrawerTitle>
          <label className="mt-3 flex h-10 items-center gap-2 rounded-full bg-foreground/[0.05] px-3.5">
            <Search className="h-[18px] w-[18px] text-muted-foreground" />
            <input
              value={query}
              disabled={sending}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          {isLoading ? (
            <div className="grid min-h-24 place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div role="alert" className="px-3 py-8 text-center text-sm">Couldn't load chats. <button type="button" onClick={() => void refetch()} className="font-semibold text-[#cc208f] underline">Try again</button></div>
          ) : list.length === 0 ? (
            <p className="px-3 py-8 text-center text-[14px] text-muted-foreground">
              No chats to forward to yet.
            </p>
          ) : (
            list.map((c) => {
              const name = c.isSupport
                ? "Zero Club Support"
                : c.user?.full_name || c.user?.username || "Member";
              const on = picked.includes(c.user!.id);
              return (
                <button
                  key={c.user!.id}
                  type="button"
                  disabled={sending}
                  aria-pressed={on}
                  onClick={() => toggle(c.user!.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-foreground/[0.04]"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.06] text-[15px] font-semibold text-muted-foreground">
                    {c.user?.avatar_url ? (
                      <img src={c.user.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{name}</span>
                    {c.user?.username && (
                      <span className="block truncate text-[13px] text-muted-foreground">
                        @{c.user.username}
                      </span>
                    )}
                  </span>
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${on ? "border-[#cc208f] bg-[#cc208f] text-white" : "border-foreground/25"}`}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-border/60 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={send}
            disabled={picked.length === 0 || sending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#cc208f] text-[15.5px] font-semibold text-white disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {picked.length > 1 ? `Forward to ${picked.length} chats` : "Forward"}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
