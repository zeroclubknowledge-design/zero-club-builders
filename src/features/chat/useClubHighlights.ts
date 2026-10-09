import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/** Club highlights stay private to this account on this device. */
export function useClubHighlights(profileId?: string) {
  const client = useQueryClient();
  const key = ["club-message-highlights", profileId];
  const storageKey = `zc:club-highlights:${profileId}`;
  const { data: ids = new Set<string>() } = useQuery({
    queryKey: key,
    enabled: !!profileId,
    staleTime: Infinity,
    queryFn: () => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
        return new Set<string>(Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : []);
      } catch { return new Set<string>(); }
    },
  });
  function toggle(id: string) {
    if (!profileId) return;
    const next = new Set(client.getQueryData<Set<string>>(key) || ids);
    const remove = next.has(id);
    if (remove) next.delete(id); else next.add(id);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      client.setQueryData(key, next);
      toast.success(remove ? "Highlight removed" : "Message highlighted");
    } catch { toast.error("Could not save this highlight on your device."); }
  }
  return { ids, toggle };
}
