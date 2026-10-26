import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, Loader2, X } from "@/components/icons/glyphs";
import { useUser } from "@/hooks/useUser";
import { uploadMedia } from "@/lib/storage";
import { compressImage } from "@/lib/imageCompression";
import { createGroup } from "@/features/groups/api";
import { GroupAvatar, PeoplePicker } from "@/features/groups/components";

export const Route = createFileRoute("/app/chat/g/new")({
  component: NewGroupPage,
});

/** Two steps, like every chat app: who's in it, then what it's called. */
function NewGroupPage() {
  const navigate = useNavigate();
  const { data: me } = useUser();
  const [step, setStep] = useState<"people" | "details">("people");
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!me?.id || busy) return;
    if (!name.trim()) {
      toast.error("Give the group a name.");
      return;
    }
    setBusy(true);
    try {
      let avatarUrl: string | null = null;
      if (photo) {
        const small = await compressImage(photo.file);
        [avatarUrl] = await uploadMedia([small], me.id);
      }
      const res = await createGroup(name.trim(), selected, description.trim(), avatarUrl);
      if (res.skipped > 0) toast.message(`${res.skipped} ${res.skipped === 1 ? "person" : "people"} couldn't be added — share the group link with them instead.`);
      navigate({ to: "/app/chat/g/$groupId", params: { groupId: res.id }, replace: true });
    } catch (e) {
      toast.error((e as Error).message || "Couldn't create the group.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-card">
      <header className="sticky top-0 z-40 bg-card/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={() => (step === "details" ? setStep("people") : navigate({ to: "/app/chat" }))}
            aria-label="Back"
            className="grid h-11 w-10 place-items-center rounded-full hover:bg-foreground/[0.04]"
          >
            {step === "details" ? <ArrowLeft className="h-[22px] w-[22px]" /> : <X className="h-[22px] w-[22px]" />}
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[18px] font-semibold leading-tight">New group</h1>
            <p className="text-[12px] text-muted-foreground">
              {step === "people" ? (selected.length ? `${selected.length} selected` : "Add people — or skip and share a link") : "Name your group"}
            </p>
          </div>
          {step === "people" ? (
            <button onClick={() => setStep("details")} className="h-9 rounded-full bg-foreground px-4 text-[14px] font-semibold text-background">
              {selected.length ? "Next" : "Skip"}
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy || !name.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,#d22c8b,#a7196b)] px-4 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
            </button>
          )}
        </div>
      </header>

      <main className="zc-page-width mx-auto w-full max-w-[680px] flex-1 pb-16">
        {step === "people" ? (
          <PeoplePicker myId={me?.id || ""} selected={selected} onChange={setSelected} />
        ) : (
          <div className="px-5 pt-6">
            <div className="flex flex-col items-center">
              <button type="button" onClick={() => fileRef.current?.click()} className="relative" aria-label="Group photo">
                {photo ? (
                  <img src={photo.preview} alt="" className="h-24 w-24 rounded-full object-cover" />
                ) : (
                  <GroupAvatar name={name || "New group"} size={96} />
                )}
                <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-foreground text-background ring-4 ring-card">
                  <Camera className="h-4 w-4" />
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPhoto({ file, preview: URL.createObjectURL(file) });
                  e.target.value = "";
                }}
              />
            </div>
            <label className="mt-7 block">
              <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Group name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                autoFocus
                placeholder="e.g. Design squad"
                className="mt-1.5 h-12 w-full rounded-2xl bg-foreground/[0.05] px-4 text-[16px] font-semibold outline-none ring-1 ring-transparent focus:ring-[#c3217e]/40"
              />
            </label>
            <label className="mt-4 block">
              <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Description (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="What's this group for?"
                className="mt-1.5 w-full resize-none rounded-2xl bg-foreground/[0.05] px-4 py-3 text-[15px] outline-none ring-1 ring-transparent focus:ring-[#c3217e]/40"
              />
            </label>
            <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
              {selected.length ? `${selected.length} ${selected.length === 1 ? "person" : "people"} will be added. ` : ""}
              Groups are private. After creating it you can share an invite link, start a group call, run polls and pin messages.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
