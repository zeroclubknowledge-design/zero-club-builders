import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { VIEWER_PREF_KEY } from "./avatarMotion";

/* Calls to the avatar-motion edge function. The provider key never leaves the server. */

export type MotionStatus = {
  configured: boolean;
  enabled: boolean;
  status: "none" | "pending" | "processing" | "ready" | "failed";
  ready: boolean;
  supported: boolean;
  canRegenerate: boolean;
  regenerateBlockedReason: string | null;
  retryAfter: string | null;
};

export async function requestAvatarMotion(kind: "auto" | "regenerate" = "auto") {
  const { data, error } = await supabase.functions.invoke("avatar-motion", {
    body: { action: "request", kind },
  });
  if (error) throw error;
  return data as { ok: boolean; status?: string; reason?: string; retryAfter?: string };
}

export async function fetchAvatarMotionStatus() {
  const { data, error } = await supabase.functions.invoke("avatar-motion", {
    body: { action: "status" },
  });
  if (error) throw error;
  return data as MotionStatus;
}

/** The member's own animation state; checks every 15s while one is being made. */
export function useMyAvatarMotion(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["avatar-motion-status"],
    enabled,
    queryFn: fetchAvatarMotionStatus,
    refetchInterval: (q) => {
      const s = (q.state.data as MotionStatus | undefined)?.status;
      return s === "pending" || s === "processing" ? 15000 : false;
    },
  });
  // When it finishes, refresh the profile so every screen picks up the animation.
  const status = query.data?.status;
  useEffect(() => {
    if (status === "ready" || status === "failed")
      void queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
  }, [status, queryClient]);
  return query;
}

/* The viewer's own choice: play animated profile pictures or not. */
const EVENT = "zc:animated-avatars";
function readPref(): "on" | "off" | null {
  try {
    const v = window.localStorage.getItem(VIEWER_PREF_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}
export function setAnimatedAvatarsPref(value: "on" | "off") {
  try {
    window.localStorage.setItem(VIEWER_PREF_KEY, value);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}
export function useAnimatedAvatarsPref() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    readPref,
    () => null,
  );
}
