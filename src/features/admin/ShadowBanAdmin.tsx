import { useState } from "react";
import { UsernamePicker } from "@/components/UsernamePicker";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EyeOff, Loader2, Search } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";

/**
 * Shadow bans: the account keeps using Zero Club, but its posts and comments
 * are seen only by itself (and admins). Each time it posts it's told so and
 * pointed to Support, which is where a ban is appealed and lifted.
 * Every rule here is enforced in the database, not by this screen.
 */
type Banned = { id: string; username: string; full_name: string | null; avatar_url: string | null; since: string; reason: string | null; by: string | null; posts_since: number };

export function ShadowBanAdmin() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const list = useQuery({
    queryKey: ["admin-shadow-bans"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_shadow_bans" as never);
      if (error) throw error;
      return (data || []) as Banned[];
    },
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin-shadow-bans"] });

  const ban = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_shadow_ban" as never, { p_username: username, p_reason: reason || null } as never);
      if (error) throw error;
      return data as any;
    },
    onSuccess: (d) => {
      toast.success(`@${d?.username || username.replace(/^@/, "")} is shadow banned`, { description: "Their posts and comments are now visible only to them." });
      setUsername("");
      setReason("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Could not shadow ban"),
  });
  const lift = useMutation({
    mutationFn: async (u: string) => {
      const { error } = await supabase.rpc("admin_lift_shadow_ban" as never, { p_username: u } as never);
      if (error) throw error;
      return u;
    },
    onSuccess: (u) => {
      toast.success(`Restriction lifted for @${u}`, { description: "They've been told, and their posts are public again." });
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Could not lift the ban"),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600"><EyeOff className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">Shadow bans</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            The account's posts and comments become visible only to itself. Each time it posts, it's told it has been shadow banned and to chat with Support to appeal.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!username.trim()) return;
          if (!confirm(`Shadow ban @${username.trim().replace(/^@/, "")}? Their posts will be hidden from everyone else.`)) return;
          ban.mutate();
        }}
        className="mt-4 grid gap-2 md:grid-cols-[1fr_1.4fr_auto]"
      >
        <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <UsernamePicker value={username} onChange={setUsername} wrapperClassName="relative min-w-0 flex-1" placeholder="@username" className="w-full bg-transparent text-[14px] outline-none" />
        </label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reason (for admins only, optional)" className="h-11 rounded-xl border border-border bg-background px-3 text-[14px] outline-none" />
        <button type="submit" disabled={!username.trim() || ban.isPending} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 text-[14px] font-semibold text-white disabled:opacity-50">
          {ban.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />} Shadow ban
        </button>
      </form>

      <div className="mt-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Currently shadow banned{list.data ? ` · ${list.data.length}` : ""}
        </p>
        {list.isLoading ? (
          <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />
        ) : !list.data?.length ? (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">No accounts are shadow banned.</p>
        ) : (
          <div className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {list.data.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-3 py-3">
                <Link to="/app/profile/$id" params={{ id: b.username || b.id }} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]">
                  {b.avatar_url ? <img src={b.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-[14px] font-semibold text-muted-foreground">{(b.full_name || b.username || "?").charAt(0).toUpperCase()}</span>}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{b.full_name || b.username} <span className="font-normal text-muted-foreground">@{b.username}</span></p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    Since {new Date(b.since).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
                    {b.by ? ` · by ${b.by}` : ""} · {b.posts_since} hidden {b.posts_since === 1 ? "post" : "posts"}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={lift.isPending}
                  onClick={() => confirm(`Lift the shadow ban on @${b.username}?`) && lift.mutate(b.username)}
                  className="h-9 shrink-0 rounded-full border border-border px-3.5 text-[13px] font-semibold hover:bg-foreground/[0.04] disabled:opacity-50"
                >
                  Unban
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
