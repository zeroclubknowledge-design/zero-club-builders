import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Send, Loader2 } from "@/components/icons/glyphs";
import { MentionField, type MentionPerson } from "@/components/MentionField";
import { isSendKey, useEnterToSend } from "@/lib/chatPrefs";
import { usePersistentDraft } from "@/lib/draftStorage";

/**
 * The composer a club writes in.
 *
 * It lives here rather than in the chat route because more than one club screen
 * writes: a cohort's rooms, and the community's announcements. Those two used
 * to disagree — a rounded pill with a mention field in chat, a bare textarea in
 * the hub — which made the same club feel like two products depending on where
 * you stood. One component, one shape, both places.
 *
 * The caller supplies the controls (attach, voice, poll…) and the avatar,
 * because what can be attached depends on the room.
 */
export function ClubComposer({
  storageKey,
  placeholder,
  hasMedia,
  controls,
  onSend,
  members = [],
  avatar,
  onTyping,
  onStopTyping,
  canTagAll = false,
  peopleLabel = "In this club",
  sendLabel = "Send message",
}: {
  /** Where the unsent draft is remembered, so a half-written message survives a reload. */
  storageKey: string | null;
  placeholder: string;
  /** Media staged by the caller's controls — it counts as something to send. */
  hasMedia: boolean;
  controls: ReactNode;
  /** Resolve true when the message went through; the draft is kept otherwise. */
  onSend: (text: string) => Promise<boolean> | boolean;
  onTyping?: () => void;
  onStopTyping?: () => void;
  members?: any[];
  /** Rendered inside the composer, not beside it. */
  avatar?: ReactNode;
  /** Admins can tag everyone; the server checks the role before notifying. */
  canTagAll?: boolean;
  peopleLabel?: string;
  sendLabel?: string;
}) {
  const [draft, setDraft] = usePersistentDraft(storageKey, "");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [enterToSend] = useEnterToSend();

  /*
   * Tagging someone.
   *
   * The picker inserts the *username*, not the display name, because the
   * renderer turns @username into a link to that profile — a display name with a
   * space in it would highlight only its first word and point at a handle that
   * does not exist.
   */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionPeople = useMemo<MentionPerson[]>(
    () => [
      ...(canTagAll && members.length > 1
        ? [
            {
              id: null,
              username: "everyone",
              full_name: "Everyone in this club",
              avatar_url: null,
              badge: "Tag all",
            },
          ]
        : []),
      ...(members
        .map((member: any) => {
          const person = member.profiles || member;
          return person?.username
            ? {
                id: person.id,
                username: person.username,
                full_name: person.full_name,
                avatar_url: person.avatar_url,
                badge: member.role && member.role !== "Member" ? member.role : null,
              }
            : null;
        })
        .filter(Boolean) as MentionPerson[]),
    ],
    [members, canTagAll],
  );

  // Only the word the caret is sitting in, so an @ earlier in the sentence does
  // not reopen the list while the rest is typed.
  const readMentionQuery = (value: string) => {
    const match = value.match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const applyMention = (username: string) => {
    setDraft((current) =>
      current.replace(/(^|\s)@([^\s@]*)$/, (_m, before: string) => `${before}@${username} `),
    );
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const submit = async () => {
    if ((!draft.trim() && !hasMedia) || sending) return;
    onStopTyping?.();
    const text = draft;
    setMentionQuery(null);
    if (textareaRef.current) textareaRef.current.style.height = "44px";
    setSending(true);
    try {
      const sent = await onSend(text);
      if (sent) setDraft((current) => (current === text ? "" : current));
    } catch {
      if (text.trim()) setDraft((current) => current || text);
      toast.error("Could not send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative flex w-full items-end gap-1.5 rounded-[28px] border border-border bg-card py-2 pl-2.5 pr-2 transition-colors focus-within:border-primary/50">
      {avatar}
      <MentionField
        ref={textareaRef as any}
        value={draft}
        people={mentionPeople}
        peopleLabel={peopleLabel}
        onChange={(event) => {
          setDraft(event.target.value);
          readMentionQuery(event.target.value);
          if (event.target.value.trim()) onTyping?.();
          else onStopTyping?.();
          event.target.style.height = "auto";
          event.target.style.height = `${Math.min(event.target.scrollHeight, 132)}px`;
        }}
        onKeyDown={(event) => {
          // An open tag list handles Enter itself, so Enter here is a real send.
          if (isSendKey(event, enterToSend)) {
            event.preventDefault();
            void submit();
          }
        }}
        enterKeyHint={enterToSend ? "send" : "enter"}
        data-club-composer=""
        placeholder={placeholder}
        className="block w-full flex-1 resize-none bg-transparent py-[11px] text-[16px] leading-[22px] text-foreground outline-none placeholder:text-muted-foreground no-scrollbar"
        rows={1}
        style={{ minHeight: "44px", maxHeight: "132px", height: "44px" }}
      />
      <div className="flex shrink-0 items-center gap-1">
        {controls}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || (!draft.trim() && !hasMedia)}
          aria-label={sendLabel}
          className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-95 ${
            draft.trim() || hasMedia
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground"
          }`}
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
