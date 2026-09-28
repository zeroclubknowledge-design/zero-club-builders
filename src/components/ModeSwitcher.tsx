import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "@/components/icons/glyphs";
import { MODES, MODE_ORDER, isApprovedTutor, modeOf, switchMode, type Mode } from "@/lib/modes";

/**
 * Learner · Tutor · Creator, one tap apart. Renders nothing for institutions,
 * which are organisations and keep a single workspace.
 */
export function ModeSwitcher({ profile, className = "", onSwitched }: { profile: any; className?: string; onSwitched?: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Mode | null>(null);
  const current = modeOf(profile);
  if (!profile || !current) return null;

  const choose = async (mode: Mode) => {
    if (mode === current || pending) return;
    // Tutor mode is for vetted tutors: everyone else goes to the application.
    if (mode === "tutor" && !isApprovedTutor(profile)) {
      onSwitched?.();
      navigate({ to: "/app/tutor-apply" });
      return;
    }
    setPending(mode);
    // Show the new mode straight away; the realtime profile update confirms it.
    queryClient.setQueryData(["profile", "current"], (old: any) =>
      old ? { ...old, active_mode: mode, account_type: mode === "tutor" ? "Tutor" : "Learner" } : old,
    );
    try {
      await switchMode(profile.id, mode);
      toast.success(`You're in ${MODES[mode].label} mode`);
      onSwitched?.();
      navigate({ to: MODES[mode].home });
    } catch (error: any) {
      queryClient.setQueryData(["profile", "current"], (old: any) =>
        old ? { ...old, active_mode: profile.active_mode, account_type: profile.account_type } : old,
      );
      toast.error(error?.message || "Could not switch mode");
    } finally {
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
    }
  };

  return (
    <div role="radiogroup" aria-label="Mode" className={`grid grid-cols-3 gap-1 rounded-full bg-foreground/[0.06] p-1 ${className}`}>
      {MODE_ORDER.map((mode) => {
        const active = mode === current;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={(event) => {
              // The sidebar closes itself on link taps; this is not a link.
              event.stopPropagation();
              void choose(mode);
            }}
            className={`flex h-8 items-center justify-center gap-1 rounded-full text-[13px] font-semibold transition ${
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {pending === mode && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {MODES[mode].label}
          </button>
        );
      })}
    </div>
  );
}
