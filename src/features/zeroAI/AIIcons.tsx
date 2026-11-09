import type { SVGProps } from "react";

/** Rounded outline controls, sized consistently for the AI workspace. */
export function AIIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: "chats" | "compose" | "mic" | "voice" | "send" }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {name === "chats" && <><path d="M4 8h9M4 16h14" /><circle cx="18" cy="8" r="2" fill="currentColor" stroke="none" /></>}
    {name === "compose" && <><path d="M13 5H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-7" /><path d="m10 14 1-4L19 2a2.1 2.1 0 0 1 3 3l-8 8-4 1Z" /></>}
    {name === "mic" && <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6" /></>}
    {name === "voice" && <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />}
    {name === "send" && <path d="M12 20V4m-6 6 6-6 6 6" />}
  </svg>;
}
