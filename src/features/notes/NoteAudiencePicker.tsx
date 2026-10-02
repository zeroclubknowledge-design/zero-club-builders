import { useQuery } from "@tanstack/react-query";
import { Check, Crown, Globe, GraduationCap } from "@/components/icons/glyphs";
import { supabase } from "@/lib/supabase";

export type NoteAudienceMode = "free" | "bootcamps" | "premium";

/** Bootcamps the signed-in person owns or manages — the only ones they can publish for. */
export function useMyNoteBootcamps(enabled = true) {
  return useQuery({
    queryKey: ["my-note-bootcamps"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_note_bootcamps");
      if (error) throw error;
      return (data || []) as { id: string; title: string; status: string }[];
    },
  });
}

/** Saves who a note is for. Called after the note row exists. */
export async function saveNoteAudience(noteId: string, mode: NoteAudienceMode, bootcampIds: string[]) {
  const { error } = await supabase.rpc("set_note_audience", {
    p_note: noteId,
    p_audience: mode === "bootcamps" ? "bootcamps" : "public",
    p_bootcamps: mode === "bootcamps" ? bootcampIds : [],
  });
  if (error) throw error;
}

/**
 * The "Access" choice in the publish sheet: everyone, learners of chosen
 * bootcamps, or (soon) paid. Bootcamp notes are also what club admins can
 * attach in their club's General chat.
 */
export function NoteAudiencePicker({
  mode,
  onModeChange,
  bootcampIds,
  onBootcampIdsChange,
}: {
  mode: NoteAudienceMode;
  onModeChange: (mode: NoteAudienceMode) => void;
  bootcampIds: string[];
  onBootcampIdsChange: (ids: string[]) => void;
}) {
  const bootcamps = useMyNoteBootcamps();
  const options: { key: NoteAudienceMode; Icon: typeof Globe; title: string; meta: string }[] = [
    { key: "free", Icon: Globe, title: "Free", meta: "Available to all" },
    { key: "bootcamps", Icon: GraduationCap, title: "Bootcamp learners", meta: "Only learners of the bootcamps you choose" },
    { key: "premium", Icon: Crown, title: "Premium", meta: "Monetize content" },
  ];
  const toggle = (id: string) =>
    onBootcampIdsChange(bootcampIds.includes(id) ? bootcampIds.filter((x) => x !== id) : [...bootcampIds, id]);

  return (
    <div>
      <p className="mb-2 mt-2 text-[13px] font-semibold text-muted-foreground">Access</p>
      <div className="space-y-2.5">
        {options.map((opt) => {
          const selected = mode === opt.key;
          return (
            <div key={opt.key}>
              <button
                type="button"
                onClick={() => onModeChange(opt.key)}
                className={`flex w-full items-center gap-3.5 rounded-2xl border-[1.5px] p-4 text-left transition-colors ${selected ? "border-[#cc208f] bg-[#cc208f]/[0.06]" : "border-foreground/12 hover:bg-foreground/[0.03]"}`}
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${selected ? "bg-[#cc208f]/10 text-[#a3186f]" : "bg-foreground/[0.05] text-muted-foreground"}`}>
                  <opt.Icon className="h-[22px] w-[22px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-foreground">{opt.title}</span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{opt.meta}</span>
                </span>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${selected ? "bg-[#cc208f]" : "border-[1.5px] border-foreground/20"}`}>
                  {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
              </button>

              {opt.key === "bootcamps" && selected && (
                <div className="mt-2 rounded-2xl border border-border p-3">
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    Learners enrolled in these bootcamps and members of their clubs can read it. You can also attach it in any club you run — that club's members can then open it too.
                  </p>
                  {bootcamps.isLoading ? (
                    <p className="mt-3 text-[13px] text-muted-foreground">Loading your bootcamps…</p>
                  ) : (bootcamps.data || []).length === 0 ? (
                    <p className="mt-3 text-[13px] font-medium text-foreground">You don't own or manage any bootcamps yet.</p>
                  ) : (
                    <div className="mt-2 max-h-56 space-y-1 overflow-y-auto overscroll-contain">
                      {(bootcamps.data || []).map((b) => {
                        const on = bootcampIds.includes(b.id);
                        return (
                          <button key={b.id} type="button" onClick={() => toggle(b.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-[#cc208f]/[0.07]" : "hover:bg-foreground/[0.04]"}`}>
                            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${on ? "bg-[#cc208f] text-white" : "border-[1.5px] border-foreground/25"}`}>
                              {on && <Check className="h-3 w-3" strokeWidth={3} />}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">{b.title}</span>
                            {b.status !== "active" && <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">{b.status}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
