import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { EyeOff } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";

/**
 * Shadow ban, from the restricted person's side. The database already hides
 * their posts and comments from everyone else; this just tells them, plainly,
 * and points them to Support to appeal.
 */
export type ShadowBan = { banned: boolean; since: string | null; support_id: string | null };

export async function fetchShadowBan(): Promise<ShadowBan | null> {
  const { data, error } = await supabase.rpc("my_shadow_ban" as never);
  if (error || !data) return null;
  return data as unknown as ShadowBan;
}

export function useShadowBan() {
  return useQuery({ queryKey: ["my-shadow-ban"], queryFn: fetchShadowBan, staleTime: 60_000 });
}

/** Call right after a post goes out. Shows the notice when the account is restricted. */
export async function noticeIfShadowBanned(navigate?: (to: string) => void) {
  const ban = await fetchShadowBan();
  if (!ban?.banned) return false;
  toast.error("Your account has been shadow banned", {
    description: "Only you can see this post. To have the restriction lifted, chat with Zero Club Support.",
    duration: 12_000,
    action: ban.support_id && navigate ? { label: "Chat with Support", onClick: () => navigate(`/app/chat/${ban.support_id}`) } : undefined,
  });
  return true;
}

/** A banner for places where the person writes posts. */
export function ShadowBanNotice({ className = "" }: { className?: string }) {
  const { data } = useShadowBan();
  if (!data?.banned) return null;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/[0.07] p-3.5 ${className}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-600"><EyeOff className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground">Your account has been shadow banned</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
          Anything you post or comment is visible only to you. To have the restriction lifted, chat with Zero Club Support.
        </p>
        {data.support_id && (
          <Link to="/app/chat/$id" params={{ id: data.support_id }} className="mt-2 inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-[12.5px] font-semibold text-background">
            Chat with Support
          </Link>
        )}
      </div>
    </div>
  );
}
