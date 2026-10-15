import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Lock, Users } from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { joinGroup, PENDING_GROUP_INVITE, previewInvite } from "@/features/groups/api";
import { GroupAvatar } from "@/features/groups/components";

/**
 * Public landing page for a group invite link (zeroclubs.xyz/g/<code>).
 * Server-rendered so the link previews with the group's name, then lets the
 * person join in one tap — after signing in if they need to.
 */
export const Route = createFileRoute("/g/$code")({
  loader: async ({ params }) => {
    try {
      const { data } = await supabase.rpc("chat_group_preview" as any, { p_code: params.code } as any);
      const d = data as any;
      return d?.found ? { name: String(d.name || ""), description: d.description || null, members: Number(d.member_count || 0), avatar: d.avatar_url || null } : null;
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `Join "${loaderData.name}" on Zero Club` : "Group invite · Zero Club";
    const description = loaderData
      ? loaderData.description || `A private group with ${loaderData.members} ${loaderData.members === 1 ? "member" : "members"}. Tap to join the chat.`
      : "This invite link has expired or was reset.";
    const image = loaderData?.avatar || "https://www.zeroclubs.xyz/api/og/default/brand";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Zero Club" },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
    };
  },
  component: GroupInvitePage,
});

function GroupInvitePage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { data: me, isLoading: userLoading } = useUser();
  const [joining, setJoining] = useState(false);
  const { data: preview, isLoading } = useQuery({
    queryKey: ["group-invite", code, me?.id || "anon"],
    queryFn: () => previewInvite(code),
  });

  // Already in it: straight to the chat.
  useEffect(() => {
    if (preview?.found && preview.is_member && preview.id) {
      navigate({ to: "/app/chat/g/$groupId", params: { groupId: preview.id }, replace: true });
    }
  }, [preview, navigate]);

  const join = async () => {
    if (!me) {
      try { localStorage.setItem(PENDING_GROUP_INVITE, code); } catch { /* storage unavailable */ }
      navigate({ to: "/signin" });
      return;
    }
    setJoining(true);
    try {
      const res = await joinGroup(code);
      navigate({ to: "/app/chat/g/$groupId", params: { groupId: res.id }, replace: true });
    } catch (e) {
      toast.error((e as Error).message);
      setJoining(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(120%_70%_at_50%_0%,rgba(204,32,143,0.18),transparent_60%)] bg-background px-5 py-10">
      <div className="w-full max-w-sm rounded-[28px] bg-card p-7 text-center shadow-[0_30px_80px_-40px_rgba(0,0,0,0.55)] ring-1 ring-foreground/[0.06]">
        {isLoading || userLoading ? (
          <div className="grid h-60 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !preview?.found ? (
          <>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-foreground/[0.06]"><Users className="h-7 w-7 text-muted-foreground" /></span>
            <h1 className="mt-5 text-[20px] font-semibold">This invite isn't working</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">The link may have been reset or turned off. Ask someone in the group for a new one.</p>
            <Link to="/app/chat" className="mt-6 inline-flex h-11 items-center rounded-full bg-foreground px-6 text-[14px] font-semibold text-background">Open Messages</Link>
          </>
        ) : (
          <>
            <div className="flex justify-center"><GroupAvatar name={preview.name || "Group"} url={preview.avatar_url} size={88} /></div>
            <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#cc208f]">Group invite</p>
            <h1 className="mt-1.5 text-[22px] font-semibold leading-tight">{preview.name}</h1>
            {preview.description && <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{preview.description}</p>}
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="flex -space-x-2">
                {(preview.faces || []).slice(0, 5).map((f, i) => (
                  <span key={i} className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-foreground/[0.08] text-[11px] font-semibold ring-2 ring-card">
                    {f.avatar_url ? <img src={f.avatar_url} alt="" className="h-full w-full object-cover" /> : (f.name || "?").charAt(0).toUpperCase()}
                  </span>
                ))}
              </div>
              <span className="text-[13px] text-muted-foreground">{preview.member_count} {preview.member_count === 1 ? "member" : "members"}</span>
            </div>
            <button
              type="button"
              onClick={() => void join()}
              disabled={joining}
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#d6309b,#b0187f)] text-[15px] font-semibold text-white shadow-[0_12px_28px_-12px_rgba(204,32,143,0.8)] disabled:opacity-60"
            >
              {joining && <Loader2 className="h-4 w-4 animate-spin" />} {me ? "Join group" : "Sign in to join"}
            </button>
            <p className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"><Lock className="h-3 w-3" /> Private group on Zero Club</p>
          </>
        )}
      </div>
    </div>
  );
}
