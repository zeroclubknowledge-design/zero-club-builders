import type { ButtonHTMLAttributes } from "react";
import { useGoBack } from "@/hooks/useGoBack";

/** Return through history; replace with the parent when opened directly. */
export function BackButton({ fallback = "/app", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { fallback?: string }) {
  const goBack = useGoBack(fallback);
  return <button type="button" aria-label="Back" {...props} onClick={goBack}>{children}</button>;
}
