import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "@/components/icons/glyphs";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { motionStatusText } from "./avatarMotion";
import { requestAvatarMotion, useMyAvatarMotion } from "./avatarMotionApi";

/*
 * "Animated profile picture" — the member's switch, progress and regenerate.
 * Lives in Edit profile under the photo. Turning it off keeps the animation
 * (it just isn't shown); turning it back on shows it again.
 */
export function AvatarMotionSettings({
  profileId,
  enabled: initialEnabled,
}: {
  profileId: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const status = useMyAvatarMotion(Boolean(profileId));
  const s = status.data;

  // Nothing to show until the server side is configured (no provider key yet).
  if (s && !s.configured) return null;

  const toggle = async (next: boolean) => {
    setEnabled(next);
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_motion_enabled: next })
      .eq("id", profileId);
    setSaving(false);
    if (error) {
      setEnabled(!next);
      toast.error("Couldn't save that. Please try again.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
    await queryClient.invalidateQueries({ queryKey: ["avatar-motion-status"] });
    // Switching on for a photo that was never animated starts it now.
    if (next && s && !s.ready && s.supported && s.status === "none") {
      const result = await requestAvatarMotion("auto").catch(() => null);
      if (result?.ok) void queryClient.invalidateQueries({ queryKey: ["avatar-motion-status"] });
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const result = await requestAvatarMotion("regenerate");
      if (result.ok)
        toast("Creating a new animation…", {
          description: "Your current photo stays up until it's ready.",
        });
      else if (result.reason === "cooldown") toast.info("You can try again tomorrow.");
      else if (result.reason === "monthly_limit")
        toast.info("You've reached this month's limit for new animations.");
      else toast.info("A new animation can't be made right now.");
      await queryClient.invalidateQueries({ queryKey: ["avatar-motion-status"] });
    } catch {
      toast.error("Couldn't start a new animation. Please try again.");
    } finally {
      setRegenerating(false);
    }
  };

  const busy = s?.status === "pending" || s?.status === "processing";
  const text = enabled
    ? motionStatusText(s?.status, s && !s.supported ? "unsupported_photo" : null)
    : null;

  return (
    <div className="rounded-xl border border-border bg-background/60 p-3.5">
      <label className="flex cursor-pointer items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold text-foreground">
            Animated profile picture
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
            Bring your profile picture to life with subtle movement.
          </span>
        </span>
        <Switch
          checked={enabled}
          disabled={saving}
          onCheckedChange={(v) => void toggle(v)}
          aria-label="Animated profile picture"
        />
      </label>

      {text && (
        <p
          role="status"
          className={`mt-2.5 flex items-center gap-2 text-[13px] ${s?.status === "failed" ? "text-muted-foreground" : s?.status === "ready" ? "text-emerald-600" : "text-foreground/80"}`}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#cc208f]" />}
          {s?.status === "ready" && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          )}
          {text}
        </p>
      )}

      {enabled && s && (s.status === "ready" || s.status === "failed") && (
        <button
          type="button"
          onClick={() => void regenerate()}
          disabled={!s.canRegenerate || regenerating}
          className="mt-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-[#cc208f] disabled:text-muted-foreground"
        >
          {regenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          {s.status === "failed" ? "Try again" : "Make a new animation"}
          {!s.canRegenerate && s.regenerateBlockedReason === "cooldown" && (
            <span className="font-normal"> · available tomorrow</span>
          )}
          {!s.canRegenerate && s.regenerateBlockedReason === "monthly_limit" && (
            <span className="font-normal"> · monthly limit reached</span>
          )}
        </button>
      )}
    </div>
  );
}
