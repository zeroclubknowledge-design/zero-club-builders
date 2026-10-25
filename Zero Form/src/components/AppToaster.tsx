import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import { AlertCircle, Check, Info, Loader2, X } from "@/components/icons/glyphs";

/**
 * Toasts look and move exactly like Zero Club's: the same pop card (.zc-toast in
 * styles.css), top-centre, with the app's mark and a status badge.
 */
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      offset={{ top: "calc(8px + env(safe-area-inset-top))" }}
      mobileOffset={{ top: "calc(8px + env(safe-area-inset-top))", left: "10px", right: "10px" }}
      style={{ "--width": "420px" } as CSSProperties}
      icons={{
        success: <ToastAvatar tone="success" />,
        error: <ToastAvatar tone="error" />,
        info: <ToastAvatar tone="info" />,
        warning: <ToastAvatar tone="warning" />,
        loading: <ToastAvatar tone="loading" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "zc-toast",
          icon: "zc-toast-icon",
          title: "zc-toast-title",
          description: "zc-toast-description",
          actionButton: "zc-toast-action",
          cancelButton: "zc-toast-cancel",
        },
      }}
    />
  );
}

function ToastAvatar({ tone }: { tone: "success" | "error" | "info" | "warning" | "loading" }) {
  const Icon = tone === "success" ? Check : tone === "error" ? X : tone === "loading" ? Loader2 : tone === "warning" ? AlertCircle : Info;
  return (
    <span className="zc-pop-avatar">
      <img src="/brand/zero-form/zero-form-icon-compact.svg" alt="" className="zc-pop-avatar-img" />
      <span className={`zc-pop-badge zc-toast-badge--${tone}`}>
        <Icon className={`h-[11px] w-[11px] ${tone === "loading" ? "animate-spin" : ""}`} strokeWidth={2.8} />
      </span>
    </span>
  );
}
