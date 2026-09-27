import { useEffect, useRef, useState } from "react";

/**
 * The six-digit code, as six boxes.
 *
 * One wide text field with letter-spacing looked like a form from 2012 and
 * was easy to mistype. Six boxes show progress at a glance, move focus on
 * their own, accept a pasted code in one go, and let the phone offer the code
 * straight from the email/SMS (autocomplete="one-time-code").
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  autoFocus = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const digits = Array.from({ length }, (_, i) => value[i] || "");

  useEffect(() => {
    if (autoFocus) refs.current[Math.min(value.length, length - 1)]?.focus();
    // Only on mount: refocusing on every change would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const setAt = (index: number, raw: string) => {
    const incoming = raw.replace(/\D/g, "");
    if (!incoming) return;
    // Several digits at once: a paste or the phone's code suggestion.
    const next = (value.slice(0, index) + incoming).slice(0, length);
    const clean = commit(next);
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2 sm:gap-2.5" role="group" aria-label="Confirmation code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { refs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={length}
          aria-label={`Digit ${index + 1}`}
          disabled={disabled}
          value={digit}
          onFocus={(e) => { setFocused(index); e.target.select(); }}
          onBlur={() => setFocused((current) => (current === index ? null : current))}
          onChange={(e) => setAt(index, e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            setAt(0, e.clipboardData.getData("text"));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (digit) commit(value.slice(0, index) + value.slice(index + 1));
              else if (index > 0) {
                commit(value.slice(0, index - 1) + value.slice(index));
                refs.current[index - 1]?.focus();
              }
            } else if (e.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
            else if (e.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
          }}
          className={`h-14 w-full min-w-0 rounded-xl border bg-[#fbfaf7] text-center font-display text-[22px] font-medium tabular-nums text-[#171417] outline-none transition-all duration-150 dark:bg-white/[0.04] dark:text-white disabled:opacity-60 ${
            focused === index
              ? "border-[#cc208f]/60 bg-white shadow-[0_0_0_4px_rgba(204,32,143,0.12)] dark:bg-white/[0.07]"
              : digit
                ? "border-[#cc208f]/30 dark:border-[#cc208f]/40"
                : "border-black/10 dark:border-white/12"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * "Resend code" with a cooldown, and "use a different email" as a quiet link.
 * A resend button with no wait invites repeated taps, each of which sends
 * another email and invalidates the previous code.
 */
export function ResendRow({
  onResend,
  onChangeEmail,
  changeLabel = "Use a different email",
  disabled,
  cooldownSeconds = 30,
}: {
  onResend: () => void | Promise<void>;
  onChangeEmail: () => void;
  changeLabel?: string;
  disabled?: boolean;
  cooldownSeconds?: number;
}) {
  const [remaining, setRemaining] = useState(cooldownSeconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <button
        type="button"
        disabled={disabled || remaining > 0}
        onClick={async () => { await onResend(); setRemaining(cooldownSeconds); }}
        className="font-medium text-[#9d176d] transition hover:text-[#cc208f] disabled:text-[#8c8187] dark:text-[#f2a8dc] dark:disabled:text-white/40"
      >
        {remaining > 0 ? `Resend code in 0:${String(remaining).padStart(2, "0")}` : "Resend code"}
      </button>
      <button
        type="button"
        onClick={onChangeEmail}
        className="font-medium text-[#6d6269] underline-offset-4 transition hover:text-[#241f23] hover:underline dark:text-white/55 dark:hover:text-white"
      >
        {changeLabel}
      </button>
    </div>
  );
}
