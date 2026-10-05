import { ZERO_MARK_PATH } from "@/components/ZeroLoader";
import type { ZeroIconProps } from "@/components/icons/nav";

/**
 * Zero AI's icon is the Zero Club mark itself — Zero AI is Zero Club's own
 * assistant, not a separate brand. Same props as the other nav icons: the
 * mark in the text colour when idle, in Zero Club pink when the page is open.
 */
export function IconZeroAI({ className, active }: ZeroIconProps) {
  return (
    <svg viewBox="0 0 100 100" className={className ? `zc-icon ${className}` : "zc-icon"} aria-hidden="true">
      <path d={ZERO_MARK_PATH} fillRule="evenodd" fill={active ? "#cc208f" : "currentColor"} />
    </svg>
  );
}
