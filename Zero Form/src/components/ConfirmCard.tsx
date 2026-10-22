import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, HelpCircle, Trash2 } from "@/components/icons/glyphs";
import { ZERO_MARK_PATH } from "@/components/ZeroLoader";

/**
 * Zero Club's own confirm and prompt cards, used everywhere instead of the
 * browser's window.confirm / window.prompt ("www.zeroclubs.xyz says…").
 *
 *   if (!(await confirmCard("Delete this post?"))) return;
 *   const reason = await promptCard({ title: "Why?", placeholder: "Reason" });
 *
 * Mounted once at the root (<ConfirmCardHost />). Phones get a bottom sheet;
 * larger screens a centred card. Destructive questions (delete, remove,
 * leave…) are styled in red automatically, and the confirm button is named
 * after the action ("Delete", "Leave") unless a label is given.
 */

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Defaults to "danger" for delete/remove/leave-type questions. */
  tone?: "danger" | "default";
};

export type PromptOptions = Omit<ConfirmOptions, "tone"> & {
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  /** Allow confirming with an empty answer. */
  allowEmpty?: boolean;
  maxLength?: number;
};

type Request =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (value: string | null) => void };

const queue: Request[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const VERBS = [
  "delete", "remove", "leave", "end", "cancel", "clear", "report", "withdraw", "archive", "stop",
  "reset", "suspend", "reactivate", "reject", "approve", "activate", "grant", "send", "acquire",
  "lift", "shadow ban", "ban", "discard", "exit", "unfollow", "block", "publish", "submit", "claim",
];
const DANGER = /\b(delete|remove|leave|end|cancel|clear|report|withdraw|archive|stop|reset|suspend|reject|ban|discard|exit|block|unfollow|revoke)\b/i;

function splitText(text: string) {
  // "Question?\n\nDetail" → title + message.
  const [first, ...rest] = text.split(/\n\s*\n/);
  return { title: first.trim(), message: rest.join("\n\n").trim() || undefined };
}

function actionLabel(title: string) {
  const t = title.toLowerCase();
  let best: { at: number; verb: string } | null = null;
  for (const verb of VERBS) {
    const m = new RegExp(`\\b${verb}\\b`).exec(t);
    if (m && (!best || m.index < best.at)) best = { at: m.index, verb };
  }
  if (!best) return "Continue";
  return best.verb.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function normalise(input: string | ConfirmOptions): ConfirmOptions {
  return typeof input === "string" ? splitText(input) : input;
}

/** Ask a yes/no question in a Zero Club card. Resolves true when confirmed. */
export function confirmCard(input: string | ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    queue.push({ kind: "confirm", opts: normalise(input), resolve });
    notify();
  });
}

/** Ask for a line of text in a Zero Club card. Resolves null when cancelled. */
export function promptCard(input: string | PromptOptions): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const opts = typeof input === "string" ? { title: input } : input;
  return new Promise((resolve) => {
    queue.push({ kind: "prompt", opts, resolve });
    notify();
  });
}

function useIsPhone() {
  const [phone, setPhone] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return phone;
}

/** Mounted once at the root. */
export function ConfirmCardHost() {
  const [current, setCurrent] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const phone = useIsPhone();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const settled = useRef(false);
  const showing = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const pull = () => {
      if (showing.current || !queue.length) return;
      const next = queue.shift()!;
      showing.current = true;
      settled.current = false;
      setValue(next.kind === "prompt" ? next.opts.defaultValue || "" : "");
      setCurrent(next);
    };
    listeners.add(pull);
    pull();
    return () => {
      listeners.delete(pull);
    };
  }, []);

  const finish = (ok: boolean) => {
    if (!current || settled.current) return;
    settled.current = true;
    if (current.kind === "confirm") current.resolve(ok);
    else current.resolve(ok ? value : null);
    setCurrent(null);
    // Show the next queued question once this one has slid away.
    setTimeout(() => {
      showing.current = false;
      notify();
    }, 200);
  };

  useEffect(() => {
    if (!current) return;
    // Ready for Enter/Escape, without drawing a focus ring on a card the person just opened.
    const t = setTimeout(
      () => (current.kind === "prompt" ? inputRef.current : confirmRef.current)?.focus({ preventScroll: true, focusVisible: false } as FocusOptions),
      60,
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!mounted) return null;

  const opts = current?.opts;
  const isPrompt = current?.kind === "prompt";
  const danger =
    !isPrompt && ((current?.opts as ConfirmOptions | undefined)?.tone ?? (DANGER.test(opts?.title || "") ? "danger" : "default")) === "danger";
  const confirmLabel = opts?.confirmLabel || (isPrompt ? "Done" : actionLabel(opts?.title || ""));
  const promptOpts = isPrompt ? (opts as PromptOptions) : null;
  const canConfirm = !isPrompt || promptOpts?.allowEmpty || value.trim().length > 0;
  const Icon = danger ? (/delete|remove|clear/i.test(opts?.title || "") ? Trash2 : AlertCircle) : HelpCircle;

  const card = current && opts && (
    <div className="fixed inset-0 z-[10200] flex items-end justify-center sm:items-center sm:p-6" key="zc-confirm">
      <motion.button
        type="button"
        aria-label="Cancel"
        tabIndex={-1}
        onClick={() => finish(false)}
        className="absolute inset-0 bg-black/50 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="zc-confirm-title"
        aria-describedby={opts.message ? "zc-confirm-message" : undefined}
        initial={phone ? { y: 40, opacity: 0 } : { y: 12, scale: 0.96, opacity: 0 }}
        animate={phone ? { y: 0, opacity: 1 } : { y: 0, scale: 1, opacity: 1 }}
        exit={phone ? { y: 40, opacity: 0 } : { y: 8, scale: 0.97, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full overflow-hidden rounded-t-[28px] border border-border/40 bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-foreground shadow-[0_-20px_50px_-15px_rgba(0,0,0,0.5)] sm:max-w-[400px] sm:rounded-[26px] sm:pb-5 sm:pt-5 sm:shadow-[0_30px_80px_-24px_rgba(0,0,0,0.55)]"
      >
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-10 h-48 w-48 text-[#cc208f] opacity-[0.06]"
        >
          <path d={ZERO_MARK_PATH} fillRule="evenodd" fill="currentColor" />
        </svg>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-foreground/15 sm:hidden" />
        <div className="relative flex items-start gap-3.5">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
              danger ? "bg-rose-500/12 text-rose-600" : "bg-[#cc208f]/12 text-[#cc208f]"
            }`}
          >
            <Icon className="h-[22px] w-[22px]" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="zc-confirm-title" className="text-[16.5px] font-semibold leading-snug tracking-[-0.01em]">
              {opts.title}
            </h2>
            {opts.message && (
              <p id="zc-confirm-message" className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-muted-foreground">
                {opts.message}
              </p>
            )}
          </div>
        </div>

        {isPrompt && (
          <form
            className="relative mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canConfirm) finish(true);
            }}
          >
            {promptOpts?.multiline ? (
              <textarea
                ref={inputRef}
                value={value}
                rows={3}
                maxLength={promptOpts?.maxLength}
                onChange={(e) => setValue(e.target.value)}
                placeholder={promptOpts?.placeholder}
                className="w-full resize-none rounded-2xl border border-border bg-background px-3.5 py-3 text-[16px] leading-relaxed outline-none transition focus:border-foreground/40"
              />
            ) : (
              <input
                ref={inputRef}
                value={value}
                maxLength={promptOpts?.maxLength}
                onChange={(e) => setValue(e.target.value)}
                placeholder={promptOpts?.placeholder}
                className="h-12 w-full rounded-2xl border border-border bg-background px-3.5 text-[16px] outline-none transition focus:border-foreground/40"
              />
            )}
          </form>
        )}

        <div className="relative mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => finish(false)}
            className="h-12 rounded-full bg-foreground/[0.06] px-5 text-[14.5px] font-semibold text-foreground transition hover:bg-foreground/[0.1] active:scale-[0.98] sm:h-11"
          >
            {opts.cancelLabel || "Cancel"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={!canConfirm}
            onClick={() => finish(true)}
            className={`h-12 rounded-full px-6 text-[14.5px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40 sm:h-11 ${
              danger
                ? "bg-rose-600 shadow-[0_10px_24px_-12px_rgb(225_29_72)] hover:bg-rose-500"
                : "bg-[#cc208f] shadow-[0_10px_24px_-12px_#cc208f] hover:brightness-110"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(<AnimatePresence>{card}</AnimatePresence>, document.body);
}
