import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell, BellOff, Camera, Copy, Crown, Link2, Loader2, LogOut, Pencil, Phone, RefreshCw, Share2, ShieldCheck, UserMinus, UserPlus, X,
} from "@/components/icons/glyphs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { uploadMedia } from "@/lib/storage";
import { compressImage } from "@/lib/imageCompression";
import {
  addMembers, displayName, groupInviteUrl, leaveGroup, removeMember, resetInvite, setMuted, setRole, updateGroup,
  type ChatGroup, type GroupMember,
} from "./api";
import { GroupAvatar, PeoplePicker, PersonAvatar } from "./components";

export function GroupInfoSheet({
  open, onOpenChange, group, members, myId, onStartCall,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group: ChatGroup;
  members: GroupMember[];
  myId: string;
  onStartCall: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = members.find((m) => m.profile_id === myId);
  const isAdmin = me?.role === "owner" || me?.role === "admin";
  const isOwner = me?.role === "owner";
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const link = groupInviteUrl(group.invite_code);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["group", group.id] });
    void queryClient.invalidateQueries({ queryKey: ["group-members", group.id] });
    void queryClient.invalidateQueries({ queryKey: ["my-groups"] });
  };
  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
      refresh();
    } catch (e) {
      toast.error((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    const text = `Join "${group.name}" on Zero Club`;
    try {
      if (navigator.share) await navigator.share({ title: group.name, text, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast.success("Invite link copied");
      }
    } catch { /* cancelled */ }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" overlayClassName="z-[90]" className="z-[100] w-[min(94vw,420px)] overflow-y-auto border-l border-border/60 bg-background p-0">
        <SheetHeader className="sr-only"><SheetTitle>Group info</SheetTitle></SheetHeader>

        {/* Identity */}
        <div className="flex flex-col items-center px-6 pb-5 pt-[calc(2rem+env(safe-area-inset-top))] text-center">
          <button type="button" disabled={!isAdmin} onClick={() => fileRef.current?.click()} className="relative" aria-label="Change group photo">
            <GroupAvatar name={group.name} url={group.avatar_url} size={96} />
            {isAdmin && (
              <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-foreground text-background ring-4 ring-background">
                {busy === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void run("photo", async () => {
                const [url] = await uploadMedia([await compressImage(file)], myId);
                await updateGroup(group.id, { avatarUrl: url });
              }, "Group photo updated");
            }}
          />
          {editing ? (
            <div className="mt-4 w-full space-y-2">
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} className="h-11 w-full rounded-xl bg-foreground/[0.05] px-3.5 text-center text-[16px] font-semibold outline-none ring-1 ring-transparent focus:ring-[#cc208f]/40" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} rows={3} placeholder="Group description" className="w-full resize-none rounded-xl bg-foreground/[0.05] px-3.5 py-2.5 text-[14px] outline-none ring-1 ring-transparent focus:ring-[#cc208f]/40" />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setEditing(false); setName(group.name); setDescription(group.description || ""); }} className="h-10 flex-1 rounded-full bg-foreground/[0.06] text-[14px] font-semibold">Cancel</button>
                <button
                  type="button"
                  disabled={busy === "edit"}
                  onClick={() => void run("edit", async () => { await updateGroup(group.id, { name, description }); setEditing(false); }, "Saved")}
                  className="h-10 flex-1 rounded-full bg-foreground text-[14px] font-semibold text-background"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mt-4 flex items-center gap-1.5 text-[21px] font-semibold leading-tight">
                {group.name}
                {isAdmin && (
                  <button type="button" onClick={() => setEditing(true)} aria-label="Edit group" className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06]">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Group · {members.length} {members.length === 1 ? "member" : "members"}</p>
              {group.description && <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-foreground/85">{group.description}</p>}
            </>
          )}

          <div className="mt-5 grid w-full grid-cols-3 gap-2">
            <QuickAction icon={<Phone className="h-5 w-5" />} label="Call" onClick={() => { onOpenChange(false); onStartCall(); }} />
            <QuickAction icon={<Share2 className="h-5 w-5" />} label="Invite" onClick={() => void share()} />
            <QuickAction
              icon={me?.muted ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
              label={me?.muted ? "Unmute" : "Mute"}
              onClick={() => void run("mute", () => setMuted(group.id, !me?.muted), me?.muted ? "Notifications on" : "Group muted")}
            />
          </div>
        </div>

        {/* Invite link */}
        {(isAdmin || group.invite_enabled) && (
          <Section title="Invite link">
            {group.invite_enabled ? (
              <>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#cc208f]/12 text-[#cc208f]"><Link2 className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#cc208f]">{link.replace(/^https?:\/\//, "")}</span>
                  <button type="button" onClick={async () => { await navigator.clipboard.writeText(link); toast.success("Invite link copied"); }} aria-label="Copy link" className="grid h-9 w-9 place-items-center rounded-full hover:bg-foreground/[0.06]">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 px-4 pb-3">
                    <button type="button" disabled={busy === "reset"} onClick={() => { if (confirm("Reset the link? The old one will stop working.")) void run("reset", () => resetInvite(group.id), "New link created"); }} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-foreground/[0.06] text-[13px] font-semibold">
                      <RefreshCw className="h-3.5 w-3.5" /> Reset link
                    </button>
                    <button type="button" disabled={busy === "link"} onClick={() => void run("link", () => updateGroup(group.id, { inviteEnabled: false }), "Invite link turned off")} className="h-9 flex-1 rounded-full bg-foreground/[0.06] text-[13px] font-semibold">
                      Turn off link
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button type="button" onClick={() => void run("link", () => updateGroup(group.id, { inviteEnabled: true }), "Invite link turned on")} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-medium hover:bg-foreground/[0.03]">
                <Link2 className="h-5 w-5 text-muted-foreground" /> Turn on the invite link
              </button>
            )}
          </Section>
        )}

        {/* Members */}
        <Section title={`${members.length} members`}>
          {isAdmin && (
            <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-foreground/[0.03]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#cc208f] text-white"><UserPlus className="h-5 w-5" /></span>
              <span className="text-[14.5px] font-semibold">Add people</span>
            </button>
          )}
          {members.map((m) => {
            const canRemove = isAdmin && m.profile_id !== myId && m.role !== "owner" && !(m.role === "admin" && !isOwner);
            return (
              <div key={m.profile_id} className="flex items-center gap-3 px-4 py-2.5">
                <Link to="/app/profile/$id" params={{ id: m.profile_id }} onClick={() => onOpenChange(false)} className="flex min-w-0 flex-1 items-center gap-3">
                  <PersonAvatar person={m.profile} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold">{m.profile_id === myId ? "You" : displayName(m.profile)}</span>
                    {m.profile?.username && <span className="block truncate text-[12.5px] text-muted-foreground">@{m.profile.username}</span>}
                  </span>
                </Link>
                {m.role !== "member" && (
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.role === "owner" ? "bg-amber-500/12 text-amber-600 dark:text-amber-400" : "bg-[#cc208f]/12 text-[#cc208f]"}`}>
                    {m.role === "owner" ? <Crown className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />} {m.role === "owner" ? "Owner" : "Admin"}
                  </span>
                )}
                {isOwner && m.profile_id !== myId && (
                  <button
                    type="button"
                    disabled={busy === `role-${m.profile_id}`}
                    onClick={() => void run(`role-${m.profile_id}`, () => setRole(group.id, m.profile_id, m.role === "admin" ? "member" : "admin"))}
                    title={m.role === "admin" ? "Remove admin" : "Make admin"}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06]"
                  >
                    <ShieldCheck className="h-4 w-4" />
                  </button>
                )}
                {canRemove && (
                  <button
                    type="button"
                    disabled={busy === `rm-${m.profile_id}`}
                    onClick={() => { if (confirm(`Remove ${displayName(m.profile)} from the group?`)) void run(`rm-${m.profile_id}`, () => removeMember(group.id, m.profile_id)); }}
                    title="Remove"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-rose-500 hover:bg-rose-500/10"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </Section>

        {/* Settings */}
        {isAdmin && (
          <Section title="Group settings">
            <label className="flex items-center justify-between gap-3 px-4 py-3.5">
              <span>
                <span className="block text-[14px] font-medium">Only admins can send messages</span>
                <span className="block text-[12px] text-muted-foreground">Good for announcements</span>
              </span>
              <input
                type="checkbox"
                checked={group.admins_only_send}
                onChange={(e) => void run("send", () => updateGroup(group.id, { adminsOnlySend: e.target.checked }))}
                className="h-5 w-5 shrink-0 accent-[#cc208f]"
              />
            </label>
          </Section>
        )}

        <div className="px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            disabled={busy === "leave"}
            onClick={() => {
              if (!confirm(isOwner && members.length > 1 ? "Leave the group? Ownership passes to the next admin." : "Leave this group?")) return;
              void run("leave", async () => {
                await leaveGroup(group.id);
                onOpenChange(false);
                navigate({ to: "/app/chat", replace: true });
              });
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500/10 py-3.5 text-[14.5px] font-semibold text-rose-600"
          >
            <LogOut className="h-4 w-4" /> Leave group
          </button>
        </div>

        {/* Add people */}
        <Sheet open={adding} onOpenChange={(o) => { setAdding(o); if (!o) setToAdd([]); }}>
          <SheetContent side="bottom" overlayClassName="z-[110]" className="z-[120] flex h-[85dvh] flex-col rounded-t-[28px] border-0 bg-card p-0">
            <div className="flex items-center gap-2 px-4 pb-2 pt-4">
              <button type="button" onClick={() => setAdding(false)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-foreground/[0.05]"><X className="h-5 w-5" /></button>
              <SheetTitle className="flex-1 text-[17px]">Add people</SheetTitle>
              <button
                type="button"
                disabled={!toAdd.length || busy === "add"}
                onClick={() => void run("add", async () => {
                  const res = await addMembers(group.id, toAdd);
                  setAdding(false);
                  setToAdd([]);
                  toast.success(res.added ? `Added ${res.added} ${res.added === 1 ? "person" : "people"}` : "No one new was added");
                })}
                className="h-9 rounded-full bg-foreground px-4 text-[14px] font-semibold text-background disabled:opacity-40"
              >
                Add{toAdd.length ? ` ${toAdd.length}` : ""}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-8">
              <PeoplePicker myId={myId} selected={toAdd} onChange={setToAdd} exclude={members.map((m) => m.profile_id)} />
            </div>
          </SheetContent>
        </Sheet>
      </SheetContent>
    </Sheet>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-2xl bg-foreground/[0.05] py-3 text-[12.5px] font-semibold text-foreground transition active:scale-95">
      <span className="text-[#cc208f]">{icon}</span>
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-4 mb-4 overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06]">
      <h3 className="px-4 pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
