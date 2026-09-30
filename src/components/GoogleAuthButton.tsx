import { useEffect, useState } from "react";
import { Loader2 } from "@/components/icons/glyphs";
import { isGoogleSignInEnabled } from "@/lib/googleAuth";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.3Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.5L15.4 17c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.5H3.2a10 10 0 0 0 0 9.1L6.5 14Z" />
      <path
        fill="#EA4335"
        d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.2 7.5l3.3 2.6A5.8 5.8 0 0 1 12 6.1Z"
      />
    </svg>
  );
}

/**
 * "Continue with Google" plus its "or use email" divider. Renders nothing
 * while Google sign-in is switched off for the project.
 */
export function GoogleAuthButton({
  label,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    void isGoogleSignInEnabled().then((on) => alive && setEnabled(on));
    return () => {
      alive = false;
    };
  }, []);
  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-black/10 bg-white text-sm font-medium text-[#241f23] shadow-sm transition hover:bg-[#fafafa] active:scale-[0.99] disabled:opacity-60 dark:border-white/12 dark:bg-[#0f0d12] dark:text-white dark:hover:bg-[#19151c]"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
        {loading ? "Opening Google" : label}
      </button>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/12" />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#8c8187] dark:text-white/40">or use email</span>
        <span className="h-px flex-1 bg-black/10 dark:bg-white/12" />
      </div>
    </>
  );
}
